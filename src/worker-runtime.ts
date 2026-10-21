import { initSync } from "../wasm/blitz_pdf.js";
import { render } from "./render.js";
import type { HostMessage, WorkerMessage } from "./worker-protocol.js";

export interface WorkerEndpoint {
  post(message: WorkerMessage, transfer: ArrayBuffer[]): void;
  onMessage(handler: (message: HostMessage) => void): void;
}

/** Worker side of `renderPdfInWorker`: one render per worker; asset bytes come from the host. */
export function serve(endpoint: WorkerEndpoint): void {
  let receiveAssets: ((data: Uint8Array[]) => void) | undefined;
  endpoint.onMessage(async message => {
    if (message.type === "assets") {
      const receive = receiveAssets;
      receiveAssets = undefined;
      receive?.(message.data);
      return;
    }
    try {
      initSync({ module: message.module });
      const load = message.external
        ? (urls: string[]) => new Promise<Uint8Array[]>(resolve => {
          receiveAssets = resolve;
          endpoint.post({ type: "assets", urls }, []);
        })
        : undefined;
      const pdf = await render(message.html, message.options, load);
      endpoint.post({ type: "done", pdf }, [pdf.buffer as ArrayBuffer]);
    } catch (error) {
      try { endpoint.post({ type: "error", error }, []); }
      catch { endpoint.post({ type: "error", error: new Error(String(error)) }, []); }
    }
  });
}
