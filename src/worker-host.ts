import { createAssetLoader } from "./assets.js";
import type { RenderOptions } from "./render.js";
import type { AssetResolver, PdfWorkerPoolOptions } from "./types.js";
import type { HostMessage, WorkerMessage } from "./worker-protocol.js";

export interface WorkerEvents {
  message(message: WorkerMessage): void;
  /** Crashes, unreadable messages, or an unexpected exit, including while idle. */
  error(error: unknown): void;
}

export interface WorkerHandle {
  post(message: HostMessage, transfer: ArrayBuffer[]): void;
  terminate(): void | Promise<void>;
  ref?(): void;
  unref?(): void;
}

export type SpawnWorker = (events: WorkerEvents) => WorkerHandle;

/** One engine per document; wait for termination before releasing the caller's slot. */
export function renderInWorker(spawn: SpawnWorker, module: WebAssembly.Module, html: string,
  options: RenderOptions, resolver?: AssetResolver): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const load = resolver && createAssetLoader(resolver);
    let worker: WorkerHandle | undefined;
    let settled = false;
    function finish(callback: () => void) {
      if (settled) return;
      settled = true;
      void Promise.resolve().then(() => worker?.terminate()).then(callback, reject);
    }
    const fail = (error: unknown) => finish(() => reject(error));
    try {
      worker = spawn({
        message(message) {
          if (settled || message.id !== 1) return;
          if (message.type === "done") finish(() => resolve(message.pdf));
          else if (message.type === "error") fail(message.error);
          else if (!load) fail(new Error("Render worker requested assets without a resolver"));
          else void load(message.urls).then(data => {
            if (settled) return;
            try {
              worker!.post({ type: "assets", id: 1, data }, data.map(bytes => bytes.buffer as ArrayBuffer));
            } catch (error) { fail(error); }
          }, fail);
        },
        error: fail,
      });
      if (!settled) worker.post({ type: "render", id: 1, module, html, options, external: load !== undefined }, []);
    } catch (error) { fail(error); }
  });
}

interface Job {
  id: number;
  message: Extract<HostMessage, { type: "render" }>;
  load: ReturnType<typeof createAssetLoader> | undefined;
  resolve(pdf: Uint8Array): void;
  reject(error: unknown): void;
}

interface Slot {
  worker?: WorkerHandle;
  job?: Job;
  timer?: ReturnType<typeof setTimeout>;
  completed: number;
  retired: boolean;
}

function integer(value: number, min: number, max: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new RangeError(`${name} must be an integer from ${min} to ${max}`);
  }
  return value;
}

/** Jobs have their own resolver and document; only the initialized engine survives. */
export function createWorkerPool(spawn: SpawnWorker, options: PdfWorkerPoolOptions = {}) {
  const maxWorkers = integer(options.maxWorkers ?? 4, 1, Number.MAX_SAFE_INTEGER, "maxWorkers");
  const idleTimeoutMs = integer(options.idleTimeoutMs ?? 30_000, 0, 2_147_483_647, "idleTimeoutMs");
  const maxJobs = integer(options.maxJobsPerWorker ?? 100, 1, Number.MAX_SAFE_INTEGER, "maxJobsPerWorker");
  const slots = new Set<Slot>();
  const queue: Job[] = [];
  const terminating = new Set<Promise<void>>();
  let nextId = 0;
  let closing: Promise<void> | undefined;
  let resolveClosed: (() => void) | undefined;
  let pumping = false;

  function checkClosed() {
    if (closing && queue.length === 0 && slots.size === 0 && terminating.size === 0) resolveClosed?.();
  }

  function retire(slot: Slot) {
    if (slot.retired) return;
    slot.retired = true;
    clearTimeout(slot.timer);
    slots.delete(slot);
    // Observe asynchronous termination before close resolves; late exit events are ignored.
    const done = Promise.resolve().then(() => slot.worker?.terminate()).then(() => {}, () => {});
    terminating.add(done);
    void done.then(() => { terminating.delete(done); checkClosed(); });
  }

  function fail(slot: Slot, error: unknown) {
    if (slot.retired) return;
    const job = slot.job;
    delete slot.job;
    retire(slot);
    job?.reject(error);
    pump();
  }

  function release(slot: Slot) {
    slot.completed++;
    if (slot.completed >= maxJobs || idleTimeoutMs === 0 || (closing && queue.length === 0)) {
      retire(slot);
    } else if (queue.length === 0) {
      slot.worker?.unref?.();
      slot.timer = setTimeout(() => { retire(slot); checkClosed(); }, idleTimeoutMs);
      // A warm worker and its eviction timer must not keep a CLI alive.
      slot.timer.unref?.();
    }
    pump();
  }

  function message(slot: Slot, value: WorkerMessage) {
    const job = slot.job;
    if (slot.retired || !job || value.id !== job.id) return;
    if (value.type === "done") {
      delete slot.job;
      release(slot);
      job.resolve(value.pdf);
    } else if (value.type === "error") {
      fail(slot, value.error);
    } else if (!job.load) {
      fail(slot, new Error("Render worker requested assets without a resolver"));
    } else {
      void job.load(value.urls).then(data => {
        // Resolver promises can finish after a crash or retirement. Never send them to another job.
        if (slot.retired || slot.job !== job) return;
        try {
          slot.worker!.post({ type: "assets", id: job.id, data }, data.map(bytes => bytes.buffer as ArrayBuffer));
        } catch (error) { fail(slot, error); }
      }, error => { if (!slot.retired && slot.job === job) fail(slot, error); });
    }
  }

  function pump() {
    if (pumping) return;
    pumping = true;
    try {
      while (queue.length > 0) {
        let slot = [...slots].find(candidate => !candidate.job);
        if (!slot && slots.size >= maxWorkers) break;
        const job = queue.shift()!;
        if (!slot) {
          slot = { completed: 0, retired: false, job };
          slots.add(slot);
          const created = slot;
          try {
            created.worker = spawn({ message: value => message(created, value), error: error => fail(created, error) });
          } catch (error) { fail(created, error); continue; }
        } else {
          clearTimeout(slot.timer);
          delete slot.timer;
          slot.job = job;
        }
        try {
          slot.worker!.ref?.();
          slot.worker!.post(job.message, []);
        } catch (error) { fail(slot, error); }
      }
      if (closing && queue.length === 0) for (const slot of slots) if (!slot.job) retire(slot);
    } finally { pumping = false; }
    checkClosed();
  }

  return {
    render(module: WebAssembly.Module, html: string, options: RenderOptions, resolver?: AssetResolver): Promise<Uint8Array> {
      if (closing) return Promise.reject(new Error("PDF worker pool is closed"));
      return new Promise((resolve, reject) => {
        const id = ++nextId;
        queue.push({ id, message: { type: "render", id, module, html, options, external: resolver !== undefined },
          load: resolver ? createAssetLoader(resolver) : undefined, resolve, reject });
        pump();
      });
    },
    close(): Promise<void> {
      if (!closing) {
        closing = new Promise(resolve => { resolveClosed = resolve; });
        pump();
      }
      return closing;
    },
  };
}
