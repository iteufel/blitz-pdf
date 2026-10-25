import { initSync } from "../wasm/blitz_pdf.js";
import { render } from "./render.js";
import type { HostMessage, WorkerMessage } from "./worker-protocol.js";

export interface WorkerEndpoint {
  post(message: WorkerMessage, transfer: ArrayBuffer[]): void;
  onMessage(handler: (message: HostMessage) => void): void;
}

/** One document at a time; retain the initialized engine and its bundled-font cache. */
export function serve(endpoint: WorkerEndpoint): void {
  let initialized = false;
  let activeId: number | undefined;
  let receiveAssets: ((data: Uint8Array[]) => void) | undefined;
  endpoint.onMessage(async message => {
    if (message.type === "assets") {
      if (message.id !== activeId) return;
      const receive = receiveAssets;
      receiveAssets = undefined;
      receive?.(message.data);
      return;
    }
    if (activeId !== undefined) {
      endpoint.post({ type: "error", id: message.id, error: new Error("Worker already has an active document") }, []);
      return;
    }
    activeId = message.id;
    try {
      if (!initialized) {
        initSync({ module: message.module });
        initialized = true;
      }
      const load = message.external
        ? (urls: string[]) => new Promise<Uint8Array[]>(resolve => {
          receiveAssets = resolve;
          endpoint.post({ type: "assets", id: message.id, urls }, []);
        })
        : undefined;
      const pdf = await render(message.html, message.options, load);
      endpoint.post({ type: "done", id: message.id, pdf }, [pdf.buffer as ArrayBuffer]);
    } catch (error) {
      try { endpoint.post({ type: "error", id: message.id, error }, []); }
      catch { endpoint.post({ type: "error", id: message.id, error: new Error(String(error)) }, []); }
    } finally {
      activeId = undefined;
      receiveAssets = undefined;
    }
  });
}
