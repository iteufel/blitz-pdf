import { createApi } from "./api.js";

export type { AssetData, AssetMap, AssetResolver, AttachmentRelationship, BinaryData, InitOptions, Length, PageFormat, PageNumberOptions, PdfAttachment, PdfDate, PdfMetadata, PdfOptions, PdfXmpProperty, PdfXmpSchema, WasmSource } from "./types.js";
export const { init, renderPdf, getEngineVersion } = createApi(
  () => new URL("../wasm/blitz_pdf_bg.wasm", import.meta.url),
);
