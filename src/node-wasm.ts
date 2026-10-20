import { readFile } from "node:fs/promises";
import type { InitOptions, WasmSource } from "./types.js";
import { loadWasmEngine } from "./wasm-backend.js";

async function prepare(source: WasmSource): Promise<WasmSource> {
  if (source instanceof URL && source.protocol === "file:") return readFile(source);
  if (typeof source === "string" && source.startsWith("file:")) return readFile(new URL(source));
  return source;
}

/** Node and Bun wasm loader. File URLs are read before the module is instantiated. */
export async function loadNodeWasm(options: InitOptions) {
  const source = options.wasm ?? await readFile(new URL("../wasm/blitz_pdf_bg.wasm", import.meta.url));
  return loadWasmEngine(await prepare(source));
}
