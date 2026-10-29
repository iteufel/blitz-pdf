import { initSync } from "../wasm/blitz_pdf.js";
import { render } from "./render.js";
/** One document at a time; retain the initialized engine and its bundled-font cache. */
export function serve(endpoint) {
    let initialized = false;
    let activeId;
    let receiveAssets;
    endpoint.onMessage(async (message) => {
        if (message.type === "assets") {
            if (message.id !== activeId)
                return;
            const receive = receiveAssets;
            receiveAssets = undefined;
            receive?.(message.data);
            return;
        }
        if (activeId !== undefined) {
            endpoint.post({ type: "error", id: message.id, error: new Error("Worker already has an active document") }, []);
            return;
        }
        activeId = message.id;
        try {
            if (!initialized) {
                initSync({ module: message.module });
                initialized = true;
            }
            const load = message.external
                ? (urls) => new Promise(resolve => {
                    receiveAssets = resolve;
                    endpoint.post({ type: "assets", id: message.id, urls }, []);
                })
                : undefined;
            const pdf = await render(message.html, message.options, load);
            endpoint.post({ type: "done", id: message.id, pdf }, [pdf.buffer]);
        }
        catch (error) {
            try {
                endpoint.post({ type: "error", id: message.id, error }, []);
            }
            catch {
                endpoint.post({ type: "error", id: message.id, error: new Error(String(error)) }, []);
            }
        }
        finally {
            activeId = undefined;
            receiveAssets = undefined;
        }
    });
}
//# sourceMappingURL=worker-runtime.js.map