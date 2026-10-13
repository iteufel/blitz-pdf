import loadWasm, { render_pdf, engine_version, RenderJob } from "../wasm/blitz_pdf.js";
import { createAssetLoader } from "./assets.js";
import { normalizeOptions } from "./options.js";
import type { InitOptions, PdfOptions, WasmSource } from "./types.js";

export function createApi(defaultSource: () => Promise<WasmSource> | WasmSource,
  prepare: (source: WasmSource) => Promise<WasmSource> = async source => source) {
  let ready: Promise<void> | undefined;

  /** Initialize once. Concurrent callers share initialization; failed loads can be retried. */
  function init(options: InitOptions = {}): Promise<void> {
    if (ready) return ready;
    ready = (async () => {
      const source = await prepare(options.wasm ?? await defaultSource());
      await loadWasm({ module_or_path: source });
    })().catch((error: unknown) => { ready = undefined; throw error; });
    return ready;
  }

  /** Render HTML/CSS to a vector PDF/A-3u with embedded fonts and selectable text. */
  async function renderPdf(html: string, options: PdfOptions = {}): Promise<Uint8Array> {
    if (typeof html !== "string") throw new TypeError("html must be a string");
    if (new TextEncoder().encode(html).byteLength > 16 * 1024 * 1024) throw new RangeError("HTML exceeds the 16 MiB limit");
    const { assetResolver, ...normalized } = normalizeOptions(options);
    await init();
    if (!assetResolver) return render_pdf(html, normalized);
    const load = createAssetLoader(assetResolver);
    const job = new RenderJob(html, normalized);
    try {
      for (;;) {
        const urls = job.pending_assets();
        if (urls.length === 0) return job.finish();
        const data = await load(urls);
        for (let i = 0; i < urls.length; i++) job.provide_asset(urls[i]!, data[i]!);
      }
    } finally {
      // In-flight JS loaders never access this job, including after a sibling rejects.
      job.free();
    }
  }

  async function getEngineVersion(): Promise<string> { await init(); return engine_version(); }
  return { init, renderPdf, getEngineVersion };
}
