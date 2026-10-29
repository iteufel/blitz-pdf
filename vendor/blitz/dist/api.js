import loadWasm, { engine_version } from "../wasm/blitz_pdf.js";
import { createAssetLoader } from "./assets.js";
import { normalizeOptions } from "./options.js";
import { render, validateHtml } from "./render.js";
import { compileWasm } from "./wasm.js";
import { createWorkerPool, renderInWorker } from "./worker-host.js";
export function createApi({ defaultSource, prepare = async (source) => source, spawnWorker }) {
    let compiled;
    let ready;
    function compile(source) {
        if (compiled)
            return compiled;
        compiled = (async () => compileWasm(await prepare(source ?? await defaultSource())))()
            .catch((error) => { compiled = undefined; throw error; });
        return compiled;
    }
    /** Initialize once. Concurrent callers share initialization; failed loads can be retried. */
    function init(options = {}) {
        if (ready)
            return ready;
        ready = (async () => {
            await loadWasm({ module_or_path: await compile(options.wasm) });
        })().catch((error) => { ready = undefined; throw error; });
        return ready;
    }
    /** The compiled WASM module, compiled once and shared with every worker. It can be posted to your own workers. */
    function getWasmModule() { return compile(); }
    /** Render HTML/CSS to a vector PDF/A-3u with embedded fonts and selectable text. */
    async function renderPdf(html, options = {}) {
        validateHtml(html);
        const { assetResolver, ...normalized } = normalizeOptions(options);
        await init();
        return render(html, normalized, assetResolver && createAssetLoader(assetResolver));
    }
    /** Create an owned pool, with independent concurrency and shutdown. No workers start until needed. */
    function createPdfWorkerPool(options = {}) {
        const pool = createWorkerPool(spawnWorker, options);
        // Include compilation in accepted work so close also drains renders waiting for WASM.
        const pending = new Set();
        let closing;
        return {
            renderPdf(html, options = {}) {
                if (closing)
                    return Promise.reject(new Error("PDF worker pool is closed"));
                const work = (async () => {
                    validateHtml(html);
                    const { assetResolver, ...normalized } = normalizeOptions(options);
                    return pool.render(await compile(), html, normalized, assetResolver);
                })();
                pending.add(work);
                void work.then(() => pending.delete(work), () => pending.delete(work));
                return work;
            },
            close() {
                closing ??= Promise.allSettled([...pending]).then(() => pool.close());
                return closing;
            },
        };
    }
    /** Render in a fresh worker and release its engine before settling. */
    async function renderPdfInWorker(html, options = {}) {
        validateHtml(html);
        const { assetResolver, ...normalized } = normalizeOptions(options);
        return renderInWorker(spawnWorker, await compile(), html, normalized, assetResolver);
    }
    async function getEngineVersion() { await init(); return engine_version(); }
    return { init, renderPdf, renderPdfInWorker, createPdfWorkerPool, getWasmModule, getEngineVersion };
}
//# sourceMappingURL=api.js.map