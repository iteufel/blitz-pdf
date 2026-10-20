import { createAssetLoader } from "./assets.js";
import type { RenderOptions } from "./render.js";
import type { AssetResolver } from "./types.js";
import type { HostMessage, WorkerMessage } from "./worker-protocol.js";

export interface WorkerEvents {
  message(message: WorkerMessage): void;
  /** Crashes, unreadable messages, or an exit before the render settled. */
  error(error: unknown): void;
}

export interface WorkerHandle {
  post(message: HostMessage, transfer: ArrayBuffer[]): void;
  terminate(): void;
}

export type SpawnWorker = (events: WorkerEvents) => WorkerHandle;

/** Renders in a fresh worker that instantiates the precompiled module, then terminates it. */
export function renderInWorker(spawn: SpawnWorker, module: WebAssembly.Module, html: string,
  options: RenderOptions, resolver: AssetResolver | undefined): Promise<Uint8Array> {
  return new Promise<Uint8Array>((resolve, reject) => {
    const load = resolver && createAssetLoader(resolver);
    let settled = false;
    const settle = (callback: () => void) => {
      if (settled) return;
      settled = true;
      worker.terminate();
      callback();
    };
    const worker: WorkerHandle = spawn({
      message(message) {
        if (message.type === "done") settle(() => resolve(message.pdf));
        else if (message.type === "error") settle(() => reject(message.error));
        else if (!load) settle(() => reject(new Error("Render worker requested assets without a resolver")));
        else load(message.urls).then(
          data => { if (!settled) worker.post({ type: "assets", data }, data.map(bytes => bytes.buffer as ArrayBuffer)); },
          (error: unknown) => settle(() => reject(error)),
        );
      },
      error(error) { settle(() => reject(error)); },
    });
    worker.post({ type: "render", module, html, options, external: load !== undefined }, []);
  });
}
