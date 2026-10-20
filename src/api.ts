import { createAssetLoader } from "./assets.js";
import { normalizeOptions } from "./options.js";
import type { Backend, InitOptions, PdfOptions } from "./types.js";

interface RenderSession {
  pending(): string[];
  provide(url: string, data: Uint8Array): void;
  finish(): Uint8Array;
  free(): void;
}

interface Engine {
  render(html: string, options: object): Uint8Array;
  start(html: string, options: object): RenderSession;
  version(): string;
}

export function createApi(config: {
  defaultBackend: Backend;
  backends: Partial<Record<Backend, (options: InitOptions) => Promise<Engine>>>;
}) {
  let ready: Promise<Engine> | undefined;
  let backend: Backend | undefined;

  function requestedBackend(options: InitOptions): Backend {
    const requested = options.backend ?? backend ?? config.defaultBackend;
    if (requested !== "wasm" && requested !== "native") throw new TypeError("backend must be wasm or native");
    if (requested === "native" && options.wasm !== undefined) throw new TypeError("wasm applies only when backend is wasm");
    if (requested === "wasm" && options.native !== undefined) throw new TypeError("native applies only when backend is native");
    return requested;
  }

  /** Initialize once. Concurrent callers share initialization; failed loads can be retried. */
  function init(options: InitOptions = {}): Promise<void> {
    let requested: Backend;
    try { requested = requestedBackend(options); }
    catch (error) { return Promise.reject(error); }
    if (ready) {
      if (backend !== requested) return Promise.reject(new Error(`blitz-pdf is already using the ${backend} backend`));
      return ready.then(() => undefined);
    }
    const load = config.backends[requested];
    if (!load) return Promise.reject(new Error(`The ${requested} backend is not available from this entry point`));
    backend = requested;
    ready = load(options).catch((error: unknown) => { ready = undefined; backend = undefined; throw error; });
    return ready.then(() => undefined);
  }

  async function engine(): Promise<Engine> {
    await init();
    return ready!;
  }

  /** Render HTML/CSS to a vector PDF/A-3u with embedded fonts and selectable text. */
  async function renderPdf(html: string, options: PdfOptions = {}): Promise<Uint8Array> {
    if (typeof html !== "string") throw new TypeError("html must be a string");
    if (new TextEncoder().encode(html).byteLength > 16 * 1024 * 1024) throw new RangeError("HTML exceeds the 16 MiB limit");
    const { assetResolver, ...normalized } = normalizeOptions(options);
    const current = await engine();
    if (!assetResolver) return current.render(html, normalized);
    const load = createAssetLoader(assetResolver);
    const job = current.start(html, normalized);
    try {
      for (;;) {
        const urls = job.pending();
        if (urls.length === 0) return job.finish();
        const data = await load(urls);
        for (let i = 0; i < urls.length; i++) job.provide(urls[i]!, data[i]!);
      }
    } finally {
      // In-flight JS loaders never access this job, including after a sibling rejects.
      job.free();
    }
  }

  async function getEngineVersion(): Promise<string> {
    const current = await engine();
    return `${current.version()} backend/${backend}`;
  }

  return { init, renderPdf, getEngineVersion };
}
