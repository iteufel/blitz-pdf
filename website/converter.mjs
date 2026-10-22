export const MAX_HTML_BYTES = 2 * 1024 * 1024;
export const CONVERSION_TIMEOUT = 60_000;

export function validateHtml(html) {
  if (typeof html !== "string" || !html.trim()) throw new Error("Add some HTML before generating a PDF.");
  if (new TextEncoder().encode(html).byteLength > MAX_HTML_BYTES) throw new Error("This HTML is too large. Use a file smaller than 2 MiB.");
}

export function pdfFilename(value) {
  const name = String(value).replace(/\.pdf$/i, "").replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, "-").replace(/[. ]+$/g, "").trim().slice(0, 100);
  return `${name || "document"}.pdf`;
}

// A fresh, terminable worker isolates each document and releases its WASM memory.
export function convertInWorker(html, options) {
  validateHtml(html);
  const worker = new Worker(new URL("./pdf-worker.mjs", import.meta.url), { type: "module" });
  let rejectJob;
  let timeout;
  const promise = new Promise((resolve, reject) => {
    rejectJob = reject;
    worker.onmessage = ({ data }) => {
      if (data.ok) resolve(data.bytes);
      else reject(new Error(data.error || "PDF conversion failed."));
    };
    worker.onerror = () => reject(new Error("The PDF engine could not run. Reload the page and try again in an up-to-date browser."));
    worker.onmessageerror = () => reject(new Error("The PDF engine returned an unreadable response. Please try again."));
    timeout = setTimeout(() => reject(new Error("Conversion took longer than 60 seconds. Try a smaller document.")), CONVERSION_TIMEOUT);
    worker.postMessage({ html, options });
  }).finally(() => {
    clearTimeout(timeout);
    worker.terminate();
  });
  return {
    promise,
    cancel() {
      worker.terminate();
      rejectJob(new DOMException("Conversion cancelled.", "AbortError"));
    },
  };
}
