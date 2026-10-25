import { describe, expect, test } from "bun:test";
import { createApi } from "../src/api";
import type { WorkerEvents, WorkerHandle } from "../src/worker-host";
import type { HostMessage } from "../src/worker-protocol";

const module = new WebAssembly.Module(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]));
const pdf = new Uint8Array([37, 80, 68, 70]);
function setup(onRender?: (events: WorkerEvents, request: HostMessage) => void, terminate?: () => Promise<void>) {
  const workers: Array<{ events: WorkerEvents; messages: HostMessage[]; terminated: boolean }> = [];
  const api = createApi({
    defaultSource: () => module,
    spawnWorker: events => {
      const worker = { events, messages: [] as HostMessage[], terminated: false };
      workers.push(worker);
      return {
        post(message) {
          worker.messages.push(message);
          if (message.type === "render") queueMicrotask(() => {
            if (onRender) onRender(events, message);
            else events.message({ type: "done", id: message.id, pdf });
          });
        },
        async terminate() { worker.terminated = true; await terminate?.(); },
      } satisfies WorkerHandle;
    },
  });
  return { api, workers };
}

describe("one worker per render", () => {
  test("default API releases every engine instead of retaining idle workers", async () => {
    const h = setup();
    for (let i = 0; i < 3; i++) {
      expect(await h.api.renderPdfInWorker("<p>report</p>")).toEqual(pdf);
      expect(h.workers.every(worker => worker.terminated)).toBe(true);
    }
    expect(h.workers).toHaveLength(3);
  });

  for (const fails of [false, true]) test(`waits for termination after ${fails ? "failure" : "success"}`, async () => {
    const started = Promise.withResolvers<void>();
    const stopped = Promise.withResolvers<void>();
    const h = setup((events, request) => events.message(fails
      ? { type: "error", id: request.id, error: new Error("render failed") }
      : { type: "done", id: request.id, pdf }), async () => {
      started.resolve(); await stopped.promise;
    });
    let settled = false;
    const result = h.api.renderPdfInWorker("report").then(value => { settled = true; return value; }, error => {
      settled = true; return error;
    });
    try {
      await started.promise;
      expect(settled).toBe(false);
    } finally { stopped.resolve(); }
    const value = await result;
    if (fails) expect(value.message).toBe("render failed");
    else expect(value).toEqual(pdf);
    expect(h.workers[0]!.terminated).toBe(true);
  });

  test("terminates on asset failure and ignores late resolver results", async () => {
    const requested = Promise.withResolvers<void>();
    const asset = Promise.withResolvers<string>();
    const h = setup((events, request) => events.message({ type: "assets", id: request.id, urls: ["https://example.test/style.css"] }));
    const result = h.api.renderPdfInWorker("report", { assets: () => { requested.resolve(); return asset.promise; } }).catch(error => error);
    await requested.promise;
    h.workers[0]!.events.error(new Error("worker crashed"));
    expect((await result).message).toBe("worker crashed");
    asset.resolve("body{color:red}");
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(h.workers[0]!.messages).toHaveLength(1);
    expect(h.workers[0]!.terminated).toBe(true);
  });

  test("reports spawn and post failures without retaining a worker", async () => {
    const spawning = createApi({ defaultSource: () => module, spawnWorker: () => { throw new Error("spawn failed"); } });
    await expect(spawning.renderPdfInWorker("report")).rejects.toThrow("spawn failed");
    let terminated = false;
    const posting = createApi({ defaultSource: () => module, spawnWorker: () => ({
      post() { throw new Error("post failed"); }, terminate() { terminated = true; },
    }) });
    await expect(posting.renderPdfInWorker("report")).rejects.toThrow("post failed");
    expect(terminated).toBe(true);
  });

  test("reports termination failure instead of claiming memory has been released", async () => {
    const h = setup(undefined, async () => { throw new Error("termination failed"); });
    await expect(h.api.renderPdfInWorker("report")).rejects.toThrow("termination failed");
  });
});
