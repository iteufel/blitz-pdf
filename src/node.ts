import { createApi } from "./api.js";

export type { AssetData, AssetMap, AssetResolver, AttachmentRelationship, Backend, BinaryData, InitOptions, Length, PageFormat, PageNumberOptions, PdfAttachment, PdfDate, PdfMetadata, PdfOptions, PdfXmpProperty, PdfXmpSchema, WasmSource } from "./types.js";

export const { init, renderPdf, getEngineVersion } = createApi({
  defaultBackend: "wasm",
  backends: {
    wasm: options => import("./node-wasm.js").then(module => module.loadNodeWasm(options)),
    native: options => import("./native-backend.js").then(module => module.loadNativeEngine(options.native)),
  },
});
