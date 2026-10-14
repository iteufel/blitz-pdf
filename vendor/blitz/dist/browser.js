import { createApi } from "./api.js";
export const { init, renderPdf, getEngineVersion } = createApi(() => new URL("../wasm/blitz_pdf_bg.wasm", import.meta.url));
//# sourceMappingURL=browser.js.map