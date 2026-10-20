import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PDFDocument, PDFArray, PDFDict, PDFName, PDFRawStream, decodePDFRawStream } from "pdf-lib";
import { init, renderPdf, getEngineVersion } from "blitz-pdf";

await init({ backend: "native" });
const version = await getEngineVersion();
assert.match(version, /blitz-pdf/);
assert.match(version, /backend\/native$/);
const bytes = await renderPdf("<h1>Node-API vector PDF</h1><p>Native works here.</p>", { format: "Letter" });
assert.equal(bytes instanceof Uint8Array, true);
assert.equal(new TextDecoder().decode(bytes.subarray(0, 5)), "%PDF-");
const pdf = await PDFDocument.load(bytes);
assert.equal(pdf.getPageCount(), 1);
assert.deepEqual(pdf.getPage(0).getSize(), { width: 612, height: 792 });
const requests = [];
const dynamicBytes = await renderPdf('<style>@page{size:105mm 148mm;margin:8mm}</style><link rel="stylesheet" href="main.css"><p class="box">Loaded font</p><p class="second">Second page</p>', {
  baseUrl: new URL("fixtures/dynamic/", import.meta.url).href,
  metadata: { author: "Native app", language: "de-DE", creationDate: "2026-10-13T12:34:56Z" },
  attachments: [{ name: "bytes.bin", data: Buffer.from([0, 128, 255]) }],
  assets: async url => { requests.push(url); return readFile(new URL(url)); },
});
const dynamic = await PDFDocument.load(dynamicBytes);
assert.equal(dynamic.getPageCount(), 2);
assert.equal(dynamic.getAuthor(), "Native app");
assert.equal(dynamic.getCreationDate()?.toISOString(), "2026-10-13T12:34:56.000Z");
assert.equal(requests.length, 3);
const embedded = dynamic.catalog.lookup(PDFName.of("AF"), PDFArray).lookup(0, PDFDict).lookup(PDFName.of("EF"), PDFDict).lookup(PDFName.of("F"), PDFRawStream);
assert.ok(Buffer.from(decodePDFRawStream(embedded).decode()).equals(Buffer.from([0, 128, 255])));
console.log(`${version}: rendering, async assets, metadata, and attachments passed (${bytes.length} / ${dynamicBytes.length} bytes).`);
