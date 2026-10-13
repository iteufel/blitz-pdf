import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PDFDocument, PDFArray, PDFDict, PDFName, PDFRawStream, decodePDFRawStream } from "pdf-lib";
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
const dynamicBytes = await renderPdf('<style>@page{size:105mm 148mm;margin:8mm}</style><link rel="stylesheet" href="main.css"><p class="box">Loaded font</p><p class="second">Second page</p>', {
  baseUrl: new URL("fixtures/dynamic/", import.meta.url).href,
  headerTemplate: '<div style="font:10px/14px sans-serif">Node report <span class="pageNumber"></span> of <span class="totalPages"></span></div>',
  footerTemplate: '<div style="font:10px/14px sans-serif">Node footer</div>',
  pageNumbers: { template: "Seite {page} von {pages}" },
  metadata: { author: "Node app", language: "de-DE", xmp: [{
    name: "Test metadata", prefix: "test", namespaceUri: "urn:example:test:1.0#",
    properties: [{ name: "Runtime", value: "Node", description: "Generating runtime" }],
  }] },
  attachments: [{ name: "bytes.bin", data: Buffer.from([0, 128, 255]) }, { name: "data.xml", data: "<data/>", mimeType: "text/xml" }],
  assets: async url => { requests.push(url); return readFile(new URL(url)); },
});
const dynamic = await PDFDocument.load(dynamicBytes);
assert.equal(dynamic.getPageCount(), 2);
assert(Math.abs(dynamic.getPage(0).getSize().width - 105*72/25.4) < 0.001);
assert.equal(requests.length, 3);
assert.equal(new Set(requests).size, 3);
assert(requests.some(url => url.endsWith("DejaVuSansMono.ttf")));
assert.equal(dynamic.getAuthor(), "Node app");
const af = dynamic.catalog.lookup(PDFName.of("AF"), PDFArray);
assert.equal(af.size(), 2);
const embedded = af.lookup(0, PDFDict).lookup(PDFName.of("EF"), PDFDict).lookup(PDFName.of("F"), PDFRawStream);
assert.deepEqual(decodePDFRawStream(embedded).decode(), new Uint8Array([0, 128, 255]));
assert.match(new TextDecoder().decode(dynamic.catalog.lookup(PDFName.of("Metadata"), PDFRawStream).contents), /<test:Runtime>Node<\/test:Runtime>/);
console.log(`Node ${process.version}: rendering, async assets, metadata, attachments, custom XMP, CSS pages and margin templates passed (${bytes.length} / ${dynamicBytes.length} bytes).`);
