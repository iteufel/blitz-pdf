import type { WasmSource } from "./types.js";

export async function compileWasm(source: WasmSource): Promise<WebAssembly.Module> {
  if (source instanceof WebAssembly.Module) return source;
  if (typeof source === "string" || source instanceof URL || (typeof Request === "function" && source instanceof Request)) {
    source = await fetch(source);
  }
  if (typeof Response === "function" && source instanceof Response) {
    if (!source.ok) throw new Error(`Failed to fetch WASM: ${source.status} ${source.statusText} fetching '${source.url}'`);
    // Streaming compilation rejects other MIME types, so fall back to buffering instead.
    if (typeof WebAssembly.compileStreaming === "function" && source.headers.get("Content-Type") === "application/wasm") {
      return WebAssembly.compileStreaming(source);
    }
    return WebAssembly.compile(await source.arrayBuffer());
  }
  return WebAssembly.compile(source as BufferSource);
}
