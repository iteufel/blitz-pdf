import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { renderPdf, renderPdfInWorker } from "blitz-pdf";
import { inspect } from "./helpers";

// PDF.js currently ignores /ActualText, which PDF requires for glyphs with
// multiple Unicode meanings and many-to-many shaping clusters. Use an
// independent, ActualText-aware reader for exact code-point assertions.
async function inspectUnicode(bytes: Uint8Array, mode = "-raw") {
  const result = await inspect(bytes);
  const extracted = spawnSync("pdftotext", [mode, "-enc", "UTF-8", "-", "-"], { input: bytes, encoding: "utf8" });
  if (extracted.error) throw new Error("Unicode tests require Poppler's pdftotext (brew install poppler / apt-get install poppler-utils)", { cause: extracted.error });
  expect(extracted.status, extracted.stderr).toBe(0);
  const unicode = extracted.stdout.split("\f").slice(0, -1).map(page => page
    .replace(/[\u202a-\u202e]/g, "") // Poppler inserts bidi display controls.
    .replace(/\s+/g, " ").trim());
  expect(unicode).toHaveLength(result.pages.length);
  return { ...result, unicode };
}

const equivalentShapes = ["é", "e\u0301", "fi", "ﬁ", "ffi", "ﬃ"];

test("preserves distinct Unicode sequences that shape to identical glyphs", async () => {
  const result = await inspectUnicode(await renderPdf(equivalentShapes.map(text => `<p>${text}</p>`).join("")));
  expect(result.unicode).toEqual([equivalentShapes.join(" ")]);
  expect(result.images).toHaveLength(0);
  expect(result.embeddedFonts.length).toBeGreaterThan(0);
  expect(result.unicodeMaps.length).toBeGreaterThan(0);
});

test("associates Unicode with painted runs when hidden nodes and flex order change traversal", async () => {
  const result = await inspectUnicode(await renderPdf(`<style>
    .hidden { visibility: hidden } .flex { display: flex; flex-direction: column }
    .first { order: -1 } p { margin: 0 }
  </style><p class="hidden">ﬁ</p><div class="flex"><p>fi</p><p class="first">ﬁ</p></div>
  <p style="display:none">é</p><p>é</p><p>é</p>
  <div style="height:0;overflow:hidden">fi</div><p>ﬁ</p>`));
  expect(result.unicode).toEqual(["ﬁ fi é é ﬁ"]);
});

test("preserves Unicode independently on each page and in margin templates", async () => {
  const result = await inspectUnicode(await renderPdf('<p>fi</p><p style="break-before:page">ﬁ</p>', {
    margin: "40px",
    headerTemplate: '<div>é</div><div>é</div>',
    footerTemplate: '<div>ffi</div><div>ﬃ</div>',
  }));
  expect(result.pages).toHaveLength(2);
  for (const [i, text] of result.unicode.entries()) {
    expect(text).toBe(`${i === 0 ? "fi" : "ﬁ"} é é ffi ﬃ`);
  }
});

test("keeps form values separate from identically shaped body text", async () => {
  const result = await inspectUnicode(await renderPdf('<p>fi</p><input value="ﬁ"><p>é</p><textarea>é</textarea>'));
  expect(result.unicode).toEqual(["fi ﬁ é é"]);
});

test("preserves multilingual and supplementary-plane text through the worker API", async () => {
  const lines = ["Grüße café €", "Ελληνικά", "Русский Українська", "😀", "x́ q̇", ...equivalentShapes];
  const result = await inspectUnicode(await renderPdfInWorker(lines.map(text => `<p>${text}</p>`).join("")));
  expect(result.unicode).toEqual([lines.join(" ")]);
  expect(result.images).toHaveLength(0);
});

test.each(["مرحبا بالعالم", "שלום עולם"])("preserves shaped RTL text: %s", async text => {
  const result = await inspectUnicode(await renderPdf(`<p dir="rtl">${text}</p>`), "-layout");
  expect(result.unicode).toEqual([text]);
});

test("preserves CJK, supplementary ideographs, and composed/decomposed Hangul with supplied fonts", async () => {
  const font = await readFile(new URL("fixtures/fonts/NotoSansCJKsc-Regular.otf", import.meta.url));
  const lines = ["中文 日本語 한국어 𠮷", "한", "한"];
  const result = await inspectUnicode(await renderPdf(`<style>p { font-family: 'Noto Sans CJK SC' }</style>${lines.map(text => `<p>${text}</p>`).join("")}`, { fonts: [font] }));
  expect(result.unicode).toEqual([lines.join(" ")]);
  expect(result.images).toHaveLength(0);
});

test("preserves reordered Indic clusters and equivalent Unicode through asynchronous font loading", async () => {
  const font = await readFile(new URL("fixtures/fonts/NotoSansDevanagari-Regular.ttf", import.meta.url));
  const lines = ["नमस्ते दुनिया", "क़", "क़", "हिन्दी", "क्षि"];
  const result = await inspectUnicode(await renderPdf(`<style>
    @font-face { font-family: Indic; src: url(indic.ttf) } p { font-family: Indic }
  </style>${lines.map(text => `<p>${text}</p>`).join("")}`, { assets: async () => font }));
  expect(result.unicode).toEqual([lines.join(" ")]);
  expect(result.images).toHaveLength(0);
});

test("preserves Unicode as a single line falls back across supplied and bundled fonts", async () => {
  const fonts = await Promise.all(["NotoSansCJKsc-Regular.otf", "NotoSansDevanagari-Regular.ttf"]
    .map(name => readFile(new URL(`fixtures/fonts/${name}`, import.meta.url))));
  const text = "café Ελληνικά 中文 नमस्ते 한국어 😀";
  const result = await inspectUnicode(await renderPdf(`<p style="font-family:'Noto Sans CJK SC','Noto Sans Devanagari',sans-serif">${text}</p>`, { fonts }));
  expect(result.unicode).toEqual([text]);
  expect(result.embeddedFonts).toHaveLength(3);
  expect(result.images).toHaveLength(0);
});

test("retains source identity when table headers replay on subsequent pages", async () => {
  const result = await inspectUnicode(await renderPdf(`<style>
    table { border-collapse: collapse } td, th { padding: 10px; font-weight: normal }
  </style><table><thead><tr><th>ﬁ</th><th>é</th></tr></thead><tbody>
    ${Array.from({ length: 12 }, () => '<tr><td>fi</td><td>é</td></tr>').join("")}
  </tbody></table>`, { width: 240, height: 180, margin: 10 }));
  expect(result.pages.length).toBeGreaterThan(1);
  for (const text of result.unicode) expect(text).toStartWith("ﬁ é fi é");
  expect(result.unicode.join(" ").match(/fi é/g)).toHaveLength(12);
});

test("maps style-split, wrapped, transformed, and overlapping runs independently", async () => {
  const result = await inspectUnicode(await renderPdf(`<style>
    body { min-height: 260px } p { width: 45px } .overlap { position: absolute; top: 200px; left: 20px }
  </style><p><span style="color:red">fi</span> <span style="color:blue">ﬁ</span> ffi ﬃ é é</p>
  <div class="overlap">fi</div><div class="overlap">ﬁ</div>
  <div style="transform:translateX(20px)">é</div><div>é</div>`));
  expect(result.unicode).toEqual(["fi ﬁ ffi ﬃ é é é é fi ﬁ"]);
});

test("retains Unicode mappings in automatic page numbers", async () => {
  const result = await inspectUnicode(await renderPdf('<p>fi</p><p style="break-before:page">ﬁ</p>', {
    pageNumbers: { template: "é é fi ﬁ ffi ﬃ {page}/{pages}" },
  }));
  expect(result.unicode).toEqual(["fi é é fi ﬁ ffi ﬃ 1/2", "ﬁ é é fi ﬁ ffi ﬃ 2/2"]);
});

test("does not let missing glyph failures corrupt subsequent Unicode renders", async () => {
  await expect(renderPdf("<p>\u{10ffff}</p>")).rejects.toThrow("PDF/A-3u export failed");
  expect((await inspectUnicode(await renderPdf("<p>é</p><p>é</p>"))).unicode).toEqual(["é é"]);
});
