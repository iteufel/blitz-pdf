import { expect, test } from "bun:test";
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream } from "pdf-lib";
import { renderPdf } from "blitz-pdf";
import { inspect } from "./helpers";
import { readFile } from "node:fs/promises";

test("declares PDF/A-3u and embeds an ICC output intent, metadata, dates, and document ID", async () => {
  const bytes = await renderPdf("<h1>Archival document</h1><p>café € office</p>", { title:"PDF/A résumé" });
  expect(new TextDecoder().decode(bytes.subarray(0, 8))).toBe("%PDF-1.7");
  const doc = await PDFDocument.load(bytes, { updateMetadata:false });
  const xmp = doc.catalog.lookup(PDFName.of("Metadata"), PDFRawStream);
  const xml = new TextDecoder().decode(xmp.contents);
  expect(xml).toContain("<pdfaid:part>3</pdfaid:part>");
  expect(xml).toContain("<pdfaid:conformance>U</pdfaid:conformance>");
  expect(xml).toContain("<xmp:CreateDate>");
  expect(xml).toContain("<xmpMM:DocumentID>");
  expect(doc.getCreationDate()?.getUTCFullYear()).toBe(new Date().getUTCFullYear());
  expect(doc.context.trailerInfo.ID).toBeDefined();
  expect(doc.context.trailerInfo.Encrypt).toBeUndefined();
  const intents = doc.catalog.lookup(PDFName.of("OutputIntents"), PDFArray);
  expect(intents.size()).toBe(1);
  const intent = intents.lookup(0, PDFDict);
  expect(intent.get(PDFName.of("S"))?.toString()).toBe("/GTS_PDFA1");
  const profile = intent.lookup(PDFName.of("DestOutputProfile"), PDFRawStream);
  expect(profile.dict.get(PDFName.of("N"))?.toString()).toBe("3");
  expect(profile.contents.length).toBeGreaterThan(100);
  const result = await inspect(bytes);
  expect(result.images).toHaveLength(0);
  expect(result.pages[0].text).toContain("café € office");
});

test("keeps transparency, gradients and source images PDF/A-compatible", async () => {
  const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==";
  const result = await inspect(await renderPdf(`<style>div{opacity:.6;background:linear-gradient(90deg,rgba(0,0,255,.3),red);border-radius:12px;padding:20px}</style><div>Transparent vector text<img src="data:image/png;base64,${png}" width="30" height="30"></div>`));
  expect(result.pages[0].hasText).toBe(true);
  expect(result.pages[0].text).toContain("Transparent vector text");
});

test("emits a conforming empty page for empty HTML", async () => {
  const result = await inspect(await renderPdf(""));
  expect(result.pages).toHaveLength(1);
  expect(result.pages[0].text).toBe("");
});

test("validates the pagination example with complete cards and a fresh chapter page", async () => {
  const html = await readFile(new URL("../examples/pagination.html", import.meta.url), "utf8");
  const result = await inspect(await renderPdf(html, { format:"A5", margin:"12mm" }));
  expect(result.pages.length).toBeGreaterThanOrEqual(3);
  expect(result.pages.at(-1)?.text).toContain("Explicit chapter break");
  expect(result.pages.at(-1)?.text).not.toContain("06 / Archival output");
  expect(result.images).toHaveLength(0);
});

test("fails closed when a font is missing a glyph required for PDF/A", async () => {
  await expect(renderPdf("<p>Missing: \u{10FFFF}</p>")).rejects.toThrow("PDF/A-3u export failed");
  expect((await inspect(await renderPdf("<p>Recovered</p>"))).pages[0].text).toContain("Recovered");
});
