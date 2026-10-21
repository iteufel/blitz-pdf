import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { PDFName } from "pdf-lib";
import { renderPdf, renderPdfInWorker } from "blitz-pdf";
import { inspect } from "./helpers";

const sample =
  "請求書 中文 한국어 हिन्दी বাংলা தமிழ் తెలుగు ಕನ್ನಡ മലയാളം ภาษาไทย ພາສາລາວ ភាសាខ្មែរ ქართული Հայերեն አማርኛ العربية עברית 𐐀 𠮷 𠀀 𰀀 𝄞 𝔘 ∑ ∞ 😀 🚀 👍🏽 👩‍💻";

for (const render of [renderPdf, renderPdfInWorker]) {
  test(`${render.name} falls back for Unicode glyphs without a CSS fallback list`, async () => {
    const pdf = await inspect(
      await render(
        `<style>body { font-family: "DejaVu Sans" }</style><p>Invoice ${sample}</p>`,
      ),
    );
    const text = pdf.pages.map((page) => page.text).join(" ");
    for (const character of sample) {
      if (!/[\s\u200d\ufe0f]/u.test(character))
        expect(text).toContain(character);
    }
    expect(text).toContain("Invoice");
    expect(pdf.images).toHaveLength(0);
  });
}

test("registered script fonts are used automatically when the requested family lacks a glyph", async () => {
  const font = await readFile(
    new URL("fixtures/fonts/NotoSansTamil-Regular.woff2", import.meta.url),
  );
  const pdf = await inspect(
    await renderPdf('<p style="font-family:DejaVu Sans">Invoice தமிழ்</p>', {
      fonts: [font],
    }),
  );
  for (const character of "தமிழ்")
    expect(pdf.pages[0]!.text).toContain(character);
  expect(
    pdf.embeddedFonts
      .map((font) => font.get(PDFName.of("FontName"))?.toString())
      .join(" "),
  ).toContain("NotoSansTamil");
});

test("body, margin templates and page numbers share the supplied fallback font", async () => {
  const font = await readFile(
    new URL("fixtures/fonts/NotoSansTamil-Regular.woff2", import.meta.url),
  );
  const pdf = await inspect(
    await renderPdf(
      '<p>Body தமிழ்</p><p style="break-before:page">Second 中文</p>',
      {
        fonts: [font],
        margin: 35,
        headerTemplate:
          '<div style="font:12px/18px DejaVu Sans">Header தமிழ்</div>',
        footerTemplate:
          '<div style="font:12px/18px DejaVu Sans">Footer தமிழ்</div>',
        pageNumbers: { template: "தமிழ் {page}/{pages}" },
      },
    ),
  );
  expect(pdf.pages).toHaveLength(2);
  for (const [index, page] of pdf.pages.entries()) {
    expect(page.text).toContain("Header");
    expect(page.text).toContain("Footer");
    expect(page.text).toContain(`${index + 1}/2`);
    const tamilItems = page.items.filter((item) =>
      /[\u0b80-\u0bff]/u.test(item.str),
    );
    expect(tamilItems.length).toBeGreaterThanOrEqual(3);
    for (const character of "தமிழ்") expect(page.text).toContain(character);
  }
  expect(
    pdf.embeddedFonts
      .map((font) => font.get(PDFName.of("FontName"))?.toString())
      .join(" "),
  ).toContain("NotoSansTamil");
});

test("async CSS fonts participate in fallback for generated content and shared templates", async () => {
  const font = await readFile(
    new URL("fixtures/fonts/NotoSansTamil-Regular.woff2", import.meta.url),
  );
  const requests: string[] = [];
  const pdf = await inspect(
    await renderPdf(
      '<html lang="ta"><link rel="stylesheet" href="fonts.css"><p class="generated">Body </p></html>',
      {
        margin: 30,
        headerTemplate:
          '<div style="font:12px/18px DejaVu Sans">Header தமிழ்</div>',
        pageNumbers: { template: "தமிழ் {page}" },
        assets: async (url) => {
          requests.push(url);
          if (url.endsWith("fonts.css"))
            return '@font-face { font-family: Script; src: url(tamil.woff2); } .generated::after { content: "தமிழ்"; }';
          if (url.endsWith("tamil.woff2")) return font;
          throw new Error(`Unexpected URL: ${url}`);
        },
      },
    ),
  );
  expect(requests).toHaveLength(2);
  const text = pdf.pages[0]!.text;
  for (const character of "தமிழ்") expect(text).toContain(character);
  expect(text).toContain("Header");
  const names = pdf.embeddedFonts
    .map((font) => font.get(PDFName.of("FontName"))?.toString())
    .join(" ");
  expect(names).toContain("NotoSansTamil");
  expect(names).not.toContain("Unifont");
});

test("decodes entities and CSS escapes before choosing fallback glyphs", async () => {
  const pdf = await inspect(
    await renderPdf(
      '<p>&#x8acb;&#27714;&#x66f8; &Afr;</p><style>.symbol::after {content:"\\1d11e"}</style><p class="symbol"></p>',
      {
        margin: 25,
        headerTemplate: '<div style="font-size:12px">&#x10400;</div>',
      },
    ),
  );
  for (const character of "請求書𝔄𝄞𐐀")
    expect(pdf.pages[0]!.text).toContain(character);
});

test("fallback font registrations do not leak between documents", async () => {
  const font = await readFile(
    new URL("fixtures/fonts/NotoSansTamil-Regular.woff2", import.meta.url),
  );
  await renderPdf("<p>தமிழ்</p>", { fonts: [font] });
  const pdf = await inspect(await renderPdf("<p>தமிழ்</p>"));
  const names = pdf.embeddedFonts
    .map((font) => font.get(PDFName.of("FontName"))?.toString())
    .join(" ");
  expect(names).toContain("Unifont");
  expect(names).not.toContain("NotoSansTamil");
});

test("bundles Noto defaults and CJK fallback without application font assets", async () => {
  const pdf = await inspect(
    await renderPdf(
      "<p>Regular <b>Bold</b> <i>Italic</i> <b><i>Both</i></b> <code>Code</code></p><p>請求書 <b>𠮷</b></p>",
    ),
  );
  const names = pdf.embeddedFonts
    .map((font) => font.get(PDFName.of("FontName"))?.toString())
    .join(" ");
  for (const name of [
    "NotoSans-Regular",
    "NotoSans-Bold",
    "NotoSans-Italic",
    "NotoSans-BoldItalic",
    "NotoSansMono-Regular",
    "NotoSansCJKjp-Regular",
    "NotoSansCJKjp-Bold",
  ])
    expect(names).toContain(name);
  expect(names).not.toContain("DejaVu");
  for (const character of "請求書𠮷")
    expect(pdf.pages[0]!.text).toContain(character);
});
