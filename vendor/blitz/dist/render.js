import { render_pdf, RenderJob } from "../wasm/blitz_pdf.js";
export function validateHtml(html) {
    if (typeof html !== "string")
        throw new TypeError("html must be a string");
    if (new TextEncoder().encode(html).byteLength > 16 * 1024 * 1024)
        throw new RangeError("HTML exceeds the 16 MiB limit");
}
/** Requires an initialized WASM instance in the current thread. */
export async function render(html, options, load) {
    if (!load)
        return render_pdf(html, options);
    const job = new RenderJob(html, options);
    try {
        for (;;) {
            const urls = job.pending_assets();
            if (urls.length === 0)
                return job.finish();
            const data = await load(urls);
            for (let i = 0; i < urls.length; i++)
                job.provide_asset(urls[i], data[i]);
        }
    }
    finally {
        // In-flight JS loaders never access this job, including after a sibling rejects.
        job.free();
    }
}
//# sourceMappingURL=render.js.map