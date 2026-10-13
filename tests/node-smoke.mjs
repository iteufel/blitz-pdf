import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";
import { renderPdf, init, getEngineVersion } from "blitz-pdf";

await Promise.all([init(), init()]);
const bytes = await renderPdf("<h1>Node.js vector PDF</h1><p>WASM works here.</p>", { format: "Letter" });
assert(bytes instanceof Uint8Array);
assert.equal(new TextDecoder().decode(bytes.subarray(0, 5)), "%PDF-");
const pdf = await PDFDocument.load(bytes);
assert.equal(pdf.getPageCount(), 1);
assert.deepEqual(pdf.getPage(0).getSize(), { width: 612, height: 792 });
assert.match(await getEngineVersion(), /blitz-pdf/);
await assert.rejects(renderPdf("", { maxPages: 0 }), /maxPages/);
const requests = [];
const dynamicBytes = await renderPdf('<link rel="stylesheet" href="main.css"><p class="box">Loaded font</p><p class="second">Second page</p>', {
  baseUrl: new URL("fixtures/dynamic/", import.meta.url).href,
  pageNumbers: { template: "Seite {page} von {pages}" },
  assets: async url => { requests.push(url); return readFile(new URL(url)); },
});
const dynamic = await PDFDocument.load(dynamicBytes);
assert.equal(dynamic.getPageCount(), 2);
assert.equal(requests.length, 3);
assert.equal(new Set(requests).size, 3);
assert(requests.some(url => url.endsWith("DejaVuSansMono.ttf")));
console.log(`Node ${process.version}: vector rendering, dimensions, validation, and async CSS/font loading with page breaks passed (${bytes.length} / ${dynamicBytes.length} bytes).`);
