import { access, readFile } from "node:fs/promises";

for (const name of ["dist/node.js", "dist/browser.js", "dist/node-worker.js", "dist/worker.js", "dist/node.d.ts", "dist/browser.d.ts", "wasm/blitz_pdf.js", "wasm/blitz_pdf_bg.wasm", "LICENSE", "THIRD_PARTY_NOTICES.md"]) {
  try { await access(new URL(`../${name}`, import.meta.url)); }
  catch { throw new Error(`Package is incomplete: missing ${name}. Run npm run build first.`); }
}
const wasm = await readFile(new URL("../wasm/blitz_pdf_bg.wasm", import.meta.url));
if (!WebAssembly.validate(wasm)) throw new Error("The packaged WASM binary is invalid");
const { renderPdf, renderPdfInWorker } = await import("../dist/node.js");
const pdf = await renderPdf("<p>Package verification</p>");
if (new TextDecoder().decode(pdf.subarray(0, 5)) !== "%PDF-") throw new Error("Package smoke test did not produce a PDF");
const workerPdf = await renderPdfInWorker("<p>Worker package verification</p>");
if (new TextDecoder().decode(workerPdf.subarray(0, 5)) !== "%PDF-") throw new Error("Package worker smoke test did not produce a PDF");
const requests = [];
const dynamic = await renderPdf('<link rel="stylesheet" href="test.css"><p>Dynamic asset verification</p>', {
  assets: async url => { requests.push(url); return "p{color:blue}"; },
  attachments: [{ name: "data.xml", data: "<data/>", mimeType: "text/xml", relationship: "Data" }],
  metadata: { author: "Package verification", xmp: [{
    name: "Package metadata", prefix: "test", namespaceUri: "urn:example:package:1.0#",
    properties: [{ name: "Build", value: "verified", description: "Package build status" }],
  }] },
});
if (new TextDecoder().decode(dynamic.subarray(0, 5)) !== "%PDF-" || requests.length !== 1) throw new Error("Package async asset smoke test failed");
if (!new TextDecoder().decode(dynamic).includes("<test:Build>verified</test:Build>")) throw new Error("Package custom XMP smoke test failed");
console.log("Package artifacts, rendering, worker rendering, async assets, attachments, and custom XMP verified.");
