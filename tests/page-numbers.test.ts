import { expect, test } from "bun:test";
import { renderPdf } from "blitz-pdf";
import { inspect } from "./helpers";

test("numbers the final pages with embedded, selectable Unicode footer text", async () => {
  const result = await inspect(await renderPdf('<p>First</p><p style="break-before:page">Second</p>', {
    pageNumbers: { template: "Prüfung café office fi é · Seite {page} von {pages}" },
  }));
  expect(result.pages).toHaveLength(2);
  for (const [index, page] of result.pages.entries()) {
    expect(page.text.normalize("NFC")).toContain(`Prüfung café office fi é · Seite ${index + 1} von 2`);
    expect(page.text).not.toContain(`Seite ${2 - index} von 2`);
  }
  expect(result.images).toHaveLength(0);
  expect(result.embeddedFonts.length).toBeGreaterThan(0);
  expect(result.unicodeMaps.length).toBeGreaterThan(0);
});

test("reserves footer space during automatic pagination and keeps body text above it", async () => {
  const html = '<style>body{margin:0}.row{height:32px;line-height:20px}</style>' + Array.from({ length: 10 }, (_, i) => `<div class="row">Row ${i}</div>`).join("");
  const result = await inspect(await renderPdf(html, {
    width: 300, height: 200, margin: 20, pageNumbers: { template: "Seite {page} von {pages}" },
  }));
  expect(result.pages).toHaveLength(3);
  for (const [index, page] of result.pages.entries()) {
    expect(page.text).toContain(`Seite ${index + 1} von 3`);
    const footer = page.items.find(item => item.str.includes("Seite"))!;
    expect(footer).toBeDefined();
    expect(footer.transform[5]).toBeGreaterThan(15);
    for (const row of page.items.filter(item => item.str.startsWith("Row"))) {
      expect(row.transform[5] - footer.transform[5]).toBeGreaterThan(20);
    }
  }
  const text = result.pages.map(page => page.text).join("\n");
  for (let i = 0; i < 10; i++) expect(text.match(new RegExp(`Row ${i}`, "g"))).toHaveLength(1);
  await expect(renderPdf('<div style="height:100px"></div>', { width: 200, height: 120, maxPages: 1, pageNumbers: true }))
    .rejects.toThrow("maxPages");
});

test("numbers intentional blank pages as part of the total", async () => {
  const result = await inspect(await renderPdf('<p>First</p><p style="break-before:right">Third</p>', { pageNumbers: true }));
  expect(result.pages).toHaveLength(3);
  expect(result.pages[0].text).toContain("1 / 3");
  expect(result.pages[1].text).toBe("2 / 3");
  expect(result.pages[2].text).toContain("3 / 3");
});

test.each(["left", "center", "right"] as const)("aligns page numbers to the %s within asymmetric margins", async align => {
  const result = await inspect(await renderPdf("", { width: 300, height: 200, margin: { left: 30, right: 50 }, pageNumbers: { align, fontSize: "8pt" } }));
  expect(result.pages[0].text).toBe("1 / 1");
  const items = result.pages[0].items;
  const left = Math.min(...items.map(item => item.transform[4]));
  const right = Math.max(...items.map(item => item.transform[4] + item.width));
  if (align === "left") expect(left).toBeCloseTo(30 * .75, 2);
  if (align === "center") expect((left + right) / 2).toBeCloseTo(140 * .75, 2);
  if (align === "right") expect(right).toBeCloseTo(250 * .75, 2);
  expect(result.images).toHaveLength(0);
});

test("disabling numbering preserves the default content area", async () => {
  const result = await inspect(await renderPdf('<style>body{margin:0}</style><div style="height:110px">Body</div>', { width: 200, height: 120, pageNumbers: false }));
  expect(result.pages).toHaveLength(1);
  expect(result.pages[0].text).toBe("Body");
});

test.each([
  [1, /plain object/],
  [{ template: "Page" }, /include/],
  [{ template: "{page}\n{pages}" }, /single line/],
  [{ template: "{page} / {total}" }, /placeholders/],
  [{ align: "justify" }, /align/],
  [{ fontSize: 0 }, /fontSize/],
  [{ color: "red" }, /Unknown/],
])("rejects invalid page number settings: %j", async (pageNumbers, message) => {
  await expect(renderPdf("", { pageNumbers } as never)).rejects.toThrow(message as RegExp);
});

test("rejects footer overflow and missing glyphs without poisoning subsequent renders", async () => {
  await expect(renderPdf("", { width: 60, height: 200, pageNumbers: { template: "Long footer label {page}" } }))
    .rejects.toThrow("does not fit the footer");
  await expect(renderPdf("", { width: 200, height: 30, pageNumbers: true }))
    .rejects.toThrow("leave at least one");
  await expect(renderPdf("", { pageNumbers: { template: "\u{10FFFF} {page}" } }))
    .rejects.toThrow("PDF/A-3u export failed");
  expect((await inspect(await renderPdf("<p>Recovered</p>", { pageNumbers: true }))).pages[0].text).toContain("1 / 1");
});
