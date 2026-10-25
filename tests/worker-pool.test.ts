import { describe, expect, test } from "bun:test";
import { createWorkerPool, type WorkerEvents, type WorkerHandle } from "../src/worker-host";

const module = new WebAssembly.Module(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]));
const options = {} as any;
function setup(config = {}) {
  const workers: Array<{ events: WorkerEvents; messages: any[]; terminated: number; refs: number }> = [];
  const pool = createWorkerPool(events => {
    const worker = { events, messages: [] as any[], terminated: 0, refs: 1 };
    workers.push(worker);
    return {
      post: message => worker.messages.push(message),
      terminate: () => { worker.terminated++; },
      ref: () => { worker.refs = 1; }, unref: () => { worker.refs = 0; },
    } satisfies WorkerHandle;
  }, { maxWorkers: 1, ...config });
  const render = (html = "report", resolver?: any) => pool.render(module, html, options, resolver);
  const done = (index = 0) => {
    const worker = workers[index]!;
    const request = worker.messages.findLast(message => message.type === "render");
    worker.events.message({ type: "done", id: request.id, pdf: new Uint8Array([37, 80, 68, 70]) });
  };
  return { pool, render, workers, done };
}
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

describe("worker pool lifecycle", () => {
  test("reuses an idle engine instead of rebuilding the font cache", async () => {
    const h = setup();
    const first = h.render(); h.done(); await first;
    expect(h.workers[0]!.terminated).toBe(0);
    expect(h.workers[0]!.refs).toBe(0);
    const second = h.render();
    expect(h.workers).toHaveLength(1);
    expect(h.workers[0]!.refs).toBe(1);
    h.done(); await second; await h.pool.close();
    expect(h.workers[0]!.terminated).toBe(1);
  });

  test("limits active workers and serves queued documents in order", async () => {
    const h = setup({ maxWorkers: 2 });
    const all = Promise.all([h.render("one"), h.render("two"), h.render("three"), h.render("four")]);
    expect(h.workers).toHaveLength(2);
    h.done(0); await tick();
    expect(h.workers[0]!.messages.at(-1).html).toBe("three");
    h.done(1); await tick();
    expect(h.workers[1]!.messages.at(-1).html).toBe("four");
    h.done(0); h.done(1); await all; await h.pool.close();
  });

  test("drains accepted documents on close and rejects later submissions", async () => {
    const h = setup();
    const all = Promise.all([h.render(), h.render()]);
    let closed = false;
    const closing = h.pool.close().then(() => { closed = true; });
    await expect(h.render()).rejects.toThrow("closed");
    expect(closed).toBe(false);
    h.done(); await tick(); h.done(); await all; await closing;
    await h.pool.close();
    expect(h.workers).toHaveLength(1);
    expect(h.workers[0]!.terminated).toBe(1);
  });

  test("retires failed workers and ignores late asset resolver completions", async () => {
    const h = setup();
    const late = Promise.withResolvers<string>();
    const first = h.render("first", () => late.promise);
    const firstResult = first.catch(error => error);
    const worker = h.workers[0]!;
    const id = worker.messages[0].id;
    worker.events.message({ type: "assets", id, urls: ["https://example.test/style.css"] });
    await tick();
    worker.events.error(new Error("worker crashed"));
    expect((await firstResult).message).toBe("worker crashed");
    const next = h.render("next");
    late.resolve("p{color:red}"); await tick();
    expect(worker.messages).toHaveLength(1);
    worker.events.message({ type: "done", id, pdf: new Uint8Array() });
    h.done(1); await next; await h.pool.close();
  });

  test("ignores stale messages from a completed job on a reused worker", async () => {
    const h = setup();
    const first = h.render(); const id = h.workers[0]!.messages[0].id;
    h.done(); await first;
    const second = h.render();
    h.workers[0]!.events.message({ type: "error", id, error: new Error("old job") });
    h.done(); await second; await h.pool.close();
  });

  test("discards a worker when its asset resolver fails", async () => {
    const h = setup();
    const result = h.render("first", () => { throw new Error("offline"); }).catch(error => error);
    h.workers[0]!.events.message({ type: "assets", id: h.workers[0]!.messages[0].id, urls: ["https://example.test/a.css"] });
    expect((await result).message).toContain("Failed to load asset");
    expect(h.workers[0]!.terminated).toBe(1);
    const next = h.render(); h.done(1); await next; await h.pool.close();
  });

  test("recycles workers after a bounded number of documents", async () => {
    const h = setup({ maxJobsPerWorker: 2 });
    for (let i = 0; i < 3; i++) { const result = h.render(); h.done(i < 2 ? 0 : 1); await result; }
    expect(h.workers).toHaveLength(2);
    expect(h.workers[0]!.terminated).toBe(1);
    await h.pool.close();
  });

  test("reclaims idle workers", async () => {
    const h = setup({ idleTimeoutMs: 10 });
    const result = h.render(); h.done(); await result;
    await new Promise(resolve => setTimeout(resolve, 30));
    expect(h.workers[0]!.terminated).toBe(1);
    const next = h.render(); h.done(1); await next; await h.pool.close();
  });

  test("rejects invalid pool limits", () => {
    for (const maxWorkers of [0, -1, NaN, 1.5]) expect(() => setup({ maxWorkers })).toThrow();
    for (const maxJobsPerWorker of [0, -1, Infinity]) expect(() => setup({ maxJobsPerWorker })).toThrow();
    for (const idleTimeoutMs of [-1, Infinity, 2 ** 31]) expect(() => setup({ idleTimeoutMs })).toThrow();
  });

  test("waits for worker termination before close completes", async () => {
    const terminated = Promise.withResolvers<void>();
    let events!: WorkerEvents;
    let request: any;
    const pool = createWorkerPool(value => {
      events = value;
      return { post: value => { request = value; }, terminate: () => terminated.promise };
    });
    const rendering = pool.render(module, "x", options);
    events.message({ type: "done", id: request.id, pdf: new Uint8Array() });
    await rendering;
    let closed = false;
    const closing = pool.close().then(() => { closed = true; });
    await tick(); expect(closed).toBe(false);
    terminated.resolve(); await closing; expect(closed).toBe(true);
  });

  test("recovers from spawn and synchronous message-send failures", async () => {
    let attempts = 0;
    const pool = createWorkerPool(() => {
      if (++attempts === 1) throw new Error("spawn failed");
      return { post: () => { throw new Error("post failed"); }, terminate() {} };
    }, { maxWorkers: 1 });
    await expect(pool.render(module, "first", options)).rejects.toThrow("spawn failed");
    await expect(pool.render(module, "second", options)).rejects.toThrow("post failed");
    await pool.close();
  });

  test("replaces an idle worker that exits unexpectedly", async () => {
    const h = setup();
    const first = h.render(); h.done(); await first;
    h.workers[0]!.events.error(new Error("idle exit"));
    const next = h.render(); h.done(1); await next;
    expect(h.workers).toHaveLength(2);
    await h.pool.close();
  });
});
