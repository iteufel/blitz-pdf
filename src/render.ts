import { render_pdf, RenderJob } from "../wasm/blitz_pdf.js";
import type { normalizeOptions } from "./options.js";

/** Normalized options without the resolver function, so they can be posted to a worker. */
export type RenderOptions = Omit<ReturnType<typeof normalizeOptions>, "assetResolver">;
export type LoadAssets = (urls: string[]) => Promise<Uint8Array[]>;

export function validateHtml(html: unknown): asserts html is string {
  if (typeof html !== "string") throw new TypeError("html must be a string");
  if (new TextEncoder().encode(html).byteLength > 16 * 1024 * 1024) throw new RangeError("HTML exceeds the 16 MiB limit");
}

/** Requires an initialized WASM instance in the current thread. */
export async function render(html: string, options: RenderOptions, load?: LoadAssets): Promise<Uint8Array> {
  if (!load) return render_pdf(html, options);
  const job = new RenderJob(html, options);
  try {
    for (;;) {
      const urls = job.pending_assets();
      if (urls.length === 0) return job.finish();
      const data = await load(urls);
      for (let i = 0; i < urls.length; i++) job.provide_asset(urls[i]!, data[i]!);
    }
  } finally {
    // In-flight JS loaders never access this job, including after a sibling rejects.
    job.free();
  }
}
