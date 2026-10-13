import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { PDFName } from "pdf-lib";
import { renderPdf, init, getEngineVersion } from "blitz-pdf";
import { inspect } from "./helpers";

describe("real vector PDFs through the public package export", () => {
  test("initializes once for concurrent callers", async () => {
    await Promise.all([init(), init(), init()]);
    const { version } = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
    expect(await getEngineVersion()).toStartWith(`blitz-pdf/${version} blitz/`);
  });

  test("embeds selectable Unicode text and fonts with no raster page", async () => {
    const result = await inspect(await renderPdf("<h1>Vector PDF</h1><p>café office affinity ﬁ é € Ελληνικά</p>"));
    expect(result.pages).toHaveLength(1);
    expect(result.pages[0].text).toContain("Vector PDF");
    expect(result.pages[0].text.normalize("NFC")).toContain("café office affinity ﬁ é € Ελληνικά");
    expect(result.pages[0].hasText).toBe(true);
    expect(result.embeddedFonts.length).toBeGreaterThan(0);
    expect(result.unicodeMaps.length).toBeGreaterThan(0);
    expect(result.images).toHaveLength(0);
  });

  test("embeds regular, bold, italic, and monospace faces", async () => {
    const result = await inspect(await renderPdf("<p>Regular <b>Bold</b> <i>Italic</i> <code>Code</code></p>"));
    expect(result.embeddedFonts).toHaveLength(4);
    for (const word of ["Regular", "Bold", "Italic", "Code"]) expect(result.pages[0].text).toContain(word);
    expect(result.images).toHaveLength(0);
  });

  test("writes physical dimensions, margins, and Unicode metadata", async () => {
    const result = await inspect(await renderPdf("<style>body{margin:0}</style><p style='margin:0'>Position</p>", {
      width: "4in", height: "6in", landscape: true, margin: { left: "1in", top: "20mm" }, title: "Résumé",
    }));
    expect(result.pages[0].dimensions).toEqual({ width: 432, height: 288 });
    expect(result.title).toBe("Résumé");
    const text = result.pages[0].items.find(item => item.str === "Position")!;
    expect(text.transform[4]).toBeCloseTo(72, 2);
  });

  test("keeps CSS backgrounds, borders, gradients, and SVG as paths", async () => {
    const result = await inspect(await renderPdf(`<style>body{margin:0}.box{padding:12px;border:2px solid #123;border-radius:8px;background:linear-gradient(90deg,#aaf,#ffa)}</style><div class="box">Styled vector</div><svg width="80" height="50"><path d="M0 0L80 0L40 50Z" fill="red"/></svg>`));
    expect(result.pages[0].text).toContain("Styled vector");
    expect(result.pages[0].hasPaths).toBe(true);
    expect(result.images).toHaveLength(0);
  });

  test("resolves linked stylesheets and nested assets without network requests", async () => {
    const result = await inspect(await renderPdf('<link rel="stylesheet" href="main.css"><p class="hidden">Hidden</p><p>Kept</p>', {
      baseUrl: "https://example.test/docs/",
      assets: { "main.css": '@import "nested.css";', "nested.css": ".hidden{display:none}" },
    }));
    expect(result.pages[0].text).toContain("Kept");
    expect(result.pages[0].text).not.toContain("Hidden");
  });

  test("embeds source images while keeping surrounding text selectable", async () => {
    const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==";
    const result = await inspect(await renderPdf(`<p>Image caption</p><img src="pixel.png" width="40" height="40"><img src="data:image/png;base64,${png}" width="20" height="20">`, {
      assets: { "pixel.png": Buffer.from(png, "base64") },
    }));
    expect(result.pages[0].text).toContain("Image caption");
    expect(result.pages[0].hasText).toBe(true);
    expect(result.embeddedFonts.length).toBeGreaterThan(0);
    expect(result.images.length).toBeGreaterThan(0);
    for (const image of result.images) {
      expect(image.get(PDFName.of("Width"))?.toString()).toBe("1");
      expect(image.get(PDFName.of("Height"))?.toString()).toBe("1");
    }
  });

  test("loads font bytes and supports @font-face aliases", async () => {
    const data = await readFile(new URL("../assets/fonts/DejaVuSansMono.ttf", import.meta.url));
    const pdf = await renderPdf(`<style>@font-face{font-family:Custom;src:url(custom.ttf)}p{font-family:Custom}</style><p>Custom font</p>`, { assets: { "custom.ttf": data }, fonts: [data] });
    const result = await inspect(pdf);
    expect(result.pages[0].text).toContain("Custom font");
    expect(result.embeddedFonts).toHaveLength(1);
  });

  test("honors print and screen media queries", async () => {
    const html = `<style>@media print{.screen{display:none}}@media screen{.print{display:none}}</style><p class="print">PrintOnly</p><p class="screen">ScreenOnly</p>`;
    const print = await inspect(await renderPdf(html));
    const screen = await inspect(await renderPdf(html, { media: "screen" }));
    expect(print.pages[0].text).toContain("PrintOnly");
    expect(print.pages[0].text).not.toContain("ScreenOnly");
    expect(screen.pages[0].text).toContain("ScreenOnly");
    expect(screen.pages[0].text).not.toContain("PrintOnly");
  });

  test("paginates without duplicating text across pages", async () => {
    const rows = Array.from({ length: 10 }, (_, i) => `<div style="height:40px">Row ${i}</div>`).join("");
    const result = await inspect(await renderPdf(`<style>body{margin:0}</style>${rows}`, { width: 300, height: 200 }));
    expect(result.pages).toHaveLength(2);
    expect(result.images).toHaveLength(0);
    const text = result.pages.map(page => page.text).join(" ");
    for (let i = 0; i < 10; i++) expect(text.match(new RegExp(`Row ${i}`, "g"))).toHaveLength(1);
  });

  test("renders list markers and input values as text", async () => {
    const result = await inspect(await renderPdf('<ol><li>First</li><li>Second</li></ol><input value="Value">'));
    for (const word of ["First", "Second", "Value", "1.", "2."]) expect(result.pages[0].text).toContain(word);
  });

  test("preserves previous output after subsequent renders", async () => {
    const first = await renderPdf("<p>First document</p>");
    const copy = first.slice();
    await Promise.all(Array.from({ length: 8 }, (_, i) => renderPdf(`<p>Document ${i}</p>`)));
    expect(first).toEqual(copy);
    expect((await inspect(first)).pages[0].text).toContain("First document");
  });

  test("rejects missing resources and unsupported effects without raster fallback", async () => {
    await expect(renderPdf('<img src="missing.png">')).rejects.toThrow("Missing asset:");
    await expect(renderPdf('<div style="filter:blur(2px)">Keep text</div>')).rejects.toThrow("CSS filters");
    await expect(renderPdf('<div style="box-shadow:0 0 4px black">Shadow</div>')).rejects.toThrow("Blurred box shadows");
    await expect(renderPdf('<p>Too long</p><div style="height:1000px"></div>', { height: 200, width: 200, maxPages: 2 })).rejects.toThrow("maxPages");
    await expect(renderPdf("<p>Bad font</p>", { fonts: [new Uint8Array([1, 2, 3])] })).rejects.toThrow("Could not decode fonts");
    expect((await inspect(await renderPdf("<p>Still usable</p>"))).pages[0].text).toContain("Still usable");
  });
});
