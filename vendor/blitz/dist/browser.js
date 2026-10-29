import { createApi } from "./api.js";
export const { init, renderPdf, renderPdfInWorker, createPdfWorkerPool, getWasmModule, getEngineVersion } = createApi({
    defaultSource: () => new URL("../wasm/blitz_pdf_bg.wasm", import.meta.url),
    spawnWorker: events => {
        const worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
        worker.onmessage = event => events.message(event.data);
        worker.onerror = event => {
            event.preventDefault();
            events.error(new Error(`Render worker failed: ${event.message || "unknown error"}`));
        };
        worker.onmessageerror = () => events.error(new Error("Render worker sent a message that could not be deserialized"));
        return { post: (message, transfer) => worker.postMessage(message, transfer), terminate: () => worker.terminate() };
    },
});
//# sourceMappingURL=browser.js.map