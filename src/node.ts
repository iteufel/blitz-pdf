import { readFile } from "node:fs/promises";
import { Worker } from "node:worker_threads";
import { createApi } from "./api.js";

export type { AssetData, AssetMap, AssetResolver, AttachmentRelationship, BinaryData, InitOptions, Length, PageFormat, PageNumberOptions, PdfAttachment, PdfDate, PdfMetadata, PdfOptions, PdfXmpProperty, PdfXmpSchema, WasmSource } from "./types.js";
export const { init, renderPdf, renderPdfInWorker, getWasmModule, getEngineVersion } = createApi({
  defaultSource: () => readFile(new URL("../wasm/blitz_pdf_bg.wasm", import.meta.url)),
  prepare: async source => {
    if (source instanceof URL && source.protocol === "file:") return readFile(source);
    if (typeof source === "string" && source.startsWith("file:")) return readFile(new URL(source));
    return source;
  },
  spawnWorker: events => {
    const worker = new Worker(new URL("./node-worker.js", import.meta.url));
    worker.on("message", events.message);
    worker.on("error", events.error);
    worker.on("messageerror", events.error);
    worker.on("exit", code => events.error(new Error(`Render worker exited with code ${code}`)));
    return { post: (message, transfer) => worker.postMessage(message, transfer), terminate: () => void worker.terminate() };
  },
});
