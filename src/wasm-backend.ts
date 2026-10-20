import loadWasm, { engine_version, render_pdf, RenderJob } from "../wasm/blitz_pdf.js";
import type { WasmSource } from "./types.js";

/** Load the WebAssembly renderer. `source` is bytes, a URL, a response, or a compiled module. */
export async function loadWasmEngine(source: WasmSource) {
  await loadWasm({ module_or_path: source });
  return {
    render: (html: string, options: object) => render_pdf(html, options),
    start: (html: string, options: object) => {
      const job = new RenderJob(html, options);
      return {
        pending: () => job.pending_assets(),
        provide: (url: string, data: Uint8Array) => { job.provide_asset(url, data); },
        finish: () => job.finish(),
        free: () => { job.free(); },
      };
    },
    version: () => engine_version(),
  };
}
