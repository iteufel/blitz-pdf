import { createApi } from "./api.js";
import { loadWasmEngine } from "./wasm-backend.js";

export type { AssetData, AssetMap, AssetResolver, AttachmentRelationship, Backend, BinaryData, InitOptions, Length, PageFormat, PageNumberOptions, PdfAttachment, PdfDate, PdfMetadata, PdfOptions, PdfXmpProperty, PdfXmpSchema, WasmSource } from "./types.js";

export const { init, renderPdf, getEngineVersion } = createApi({
  defaultBackend: "wasm",
  backends: {
    wasm: options => loadWasmEngine(options.wasm ?? new URL("../wasm/blitz_pdf_bg.wasm", import.meta.url)),
  },
});
