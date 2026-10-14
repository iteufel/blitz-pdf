import { readFile } from "node:fs/promises";
import { createApi } from "./api.js";
export const { init, renderPdf, getEngineVersion } = createApi(() => readFile(new URL("../wasm/blitz_pdf_bg.wasm", import.meta.url)), async (source) => {
    if (source instanceof URL && source.protocol === "file:")
        return readFile(source);
    if (typeof source === "string" && source.startsWith("file:"))
        return readFile(new URL(source));
    return source;
});
//# sourceMappingURL=node.js.map