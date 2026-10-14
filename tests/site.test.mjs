import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { test } from "node:test";
import { PDFDocument } from "pdf-lib";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { renderPdf } from "../dist/node.js";
import { defaultExampleOptions, examples } from "../website/examples.mjs";
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

const expectedLayouts = {
  report: { pages: 2, size: [210, 297] },
  ticket: { pages: 1, size: [210, 148], text: [["Alex Morgan", "NF-2026-0104"]] },
  flight: { pages: 1, size: [297, 210], text: [["Flight telemetry", "Altitude profile", "Event log"]] },
  energy: { pages: 2, size: [210, 297], text: [["Energy balance", "Storage losses"], ["Dispatch snapshots", "Explore your own scenario."]] },
};

for (const [key, example] of Object.entries(examples)) {
  test(`${key} example renders its intended page geometry and content`, async () => {
    const expected = expectedLayouts[key] ?? { pages: 1, size: [210, 297] };
    const bytes = await renderPdf(example.html, { ...defaultExampleOptions, ...example.options });
    const pdf = await PDFDocument.load(bytes);
    assert.equal(pdf.getPageCount(), expected.pages);
    const page = pdf.getPage(0);
    assert.ok(Math.abs(page.getWidth() - expected.size[0] * 72 / 25.4) < .01);
    assert.ok(Math.abs(page.getHeight() - expected.size[1] * 72 / 25.4) < .01);
    if (!expected.text) return;
    const task = getDocument({ data: bytes });
    try {
      const parsed = await task.promise;
      for (let i = 0; i < expected.text.length; i++) {
        const content = await (await parsed.getPage(i + 1)).getTextContent();
        const text = content.items.map(item => item.str ?? "").join(" ").replace(/\s+/g, " ");
        for (const phrase of expected.text[i]) assert.ok(text.includes(phrase), `Page ${i + 1} is missing ${phrase}`);
        for (const item of content.items) {
          if (!item.str?.trim()) continue;
          const [x, y] = item.transform.slice(4);
          assert.ok(x >= -.5 && x + item.width <= page.getWidth() + .5 && y >= -.5 && y <= page.getHeight() + .5, `Text is outside the page: ${item.str}`);
        }
      }
    } finally { await task.destroy(); }
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
  for (const key of Object.keys(examples)) assert.ok(html.includes(`value="${key}"`), `Example ${key} is missing from the picker`);
});
