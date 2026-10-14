import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { test } from "node:test";
import { PDFDocument } from "pdf-lib";
import { renderPdf } from "../dist/node.js";
import { examples } from "../website/examples.mjs";
import { MAX_HTML_BYTES, pdfFilename, validateHtml } from "../website/converter.mjs";

test("input limits count UTF-8 bytes and reject empty documents", () => {
  assert.throws(() => validateHtml(" \n\t"), /Add some HTML/);
  assert.throws(() => validateHtml("é".repeat(MAX_HTML_BYTES / 2 + 1)), /too large/);
  assert.doesNotThrow(() => validateHtml("a".repeat(MAX_HTML_BYTES)));
});

test("download names cannot contain path separators or control characters", () => {
  assert.equal(pdfFilename("report.pdf"), "report.pdf");
  assert.equal(pdfFilename("../a\\b\u0000.pdf"), "..-a-b-.pdf");
  assert.equal(pdfFilename("  ...  "), "document.pdf");
  assert.equal(pdfFilename(""), "document.pdf");
});

for (const [key, example] of Object.entries(examples)) {
  test(`${key} example produces the expected number of A4 PDF pages`, async () => {
    const bytes = await renderPdf(example.html, { format: "A4", margin: "15mm", pageNumbers: true });
    const pdf = await PDFDocument.load(bytes);
    assert.equal(pdf.getPageCount(), key === "report" ? 2 : 1);
    const page = pdf.getPage(0);
    assert.ok(Math.abs(page.getWidth() - 210 * 72 / 25.4) < .01);
    assert.ok(Math.abs(page.getHeight() - 297 * 72 / 25.4) < .01);
  });
}

test("site bundle contains the local worker, WASM, preview engine, and licenses", async () => {
  const root = new URL("../_site/", import.meta.url);
  for (const file of ["index.html", "app.mjs", "pdf-worker.mjs", "converter.mjs", "vendor/blitz/dist/browser.js", "vendor/blitz/wasm/blitz_pdf.js", "vendor/blitz/wasm/blitz_pdf_bg.wasm", "vendor/pdfjs/pdf.min.mjs", "vendor/pdfjs/pdf.worker.min.mjs", "vendor/pdfjs/LICENSE", "licenses/DejaVu.txt", ".nojekyll"]) {
    assert.ok((await stat(new URL(file, root))).isFile(), `${file} is missing`);
  }
  const html = await readFile(new URL("index.html", root), "utf8");
  assert.match(html, /wasm-unsafe-eval/);
  assert.doesNotMatch(html, /(?:src|href)="\//, "Site paths must work under /blitz-pdf/");
});
