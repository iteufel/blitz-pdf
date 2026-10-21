import loadWasm, { engine_version } from "../wasm/blitz_pdf.js";
import { createAssetLoader } from "./assets.js";
import { normalizeOptions } from "./options.js";
import { render, validateHtml } from "./render.js";
import { compileWasm } from "./wasm.js";
import { renderInWorker, type SpawnWorker } from "./worker-host.js";
import type { InitOptions, PdfOptions, WasmSource } from "./types.js";

export interface ApiConfig {
  defaultSource: () => Promise<WasmSource> | WasmSource;
  prepare?: (source: WasmSource) => Promise<WasmSource>;
  spawnWorker: SpawnWorker;
}

export function createApi({ defaultSource, prepare = async source => source, spawnWorker }: ApiConfig) {
  let compiled: Promise<WebAssembly.Module> | undefined;
  let ready: Promise<void> | undefined;

  function compile(source?: WasmSource): Promise<WebAssembly.Module> {
    if (compiled) return compiled;
    compiled = (async () => compileWasm(await prepare(source ?? await defaultSource())))()
      .catch((error: unknown) => { compiled = undefined; throw error; });
    return compiled;
  }

  /** Initialize once. Concurrent callers share initialization; failed loads can be retried. */
  function init(options: InitOptions = {}): Promise<void> {
    if (ready) return ready;
    ready = (async () => {
      await loadWasm({ module_or_path: await compile(options.wasm) });
    })().catch((error: unknown) => { ready = undefined; throw error; });
    return ready;
  }

  /** The compiled WASM module, compiled once and shared with every worker. It can be posted to your own workers. */
  function getWasmModule(): Promise<WebAssembly.Module> { return compile(); }

  /** Render HTML/CSS to a vector PDF/A-3u with embedded fonts and selectable text. */
  async function renderPdf(html: string, options: PdfOptions = {}): Promise<Uint8Array> {
    validateHtml(html);
    const { assetResolver, ...normalized } = normalizeOptions(options);
    await init();
    return render(html, normalized, assetResolver && createAssetLoader(assetResolver));
  }

  /** Like `renderPdf`, but layout and serialization run in a new worker. An `assets` function still runs on the calling thread. */
  async function renderPdfInWorker(html: string, options: PdfOptions = {}): Promise<Uint8Array> {
    validateHtml(html);
    const { assetResolver, ...normalized } = normalizeOptions(options);
    return renderInWorker(spawnWorker, await compile(), html, normalized, assetResolver);
  }

  async function getEngineVersion(): Promise<string> { await init(); return engine_version(); }
  return { init, renderPdf, renderPdfInWorker, getWasmModule, getEngineVersion };
}
