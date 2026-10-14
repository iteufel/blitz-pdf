import { expect, test } from "bun:test";
import { renderPdf } from "blitz-pdf";
import { inspect } from "./helpers";

const reset = "<style>html,body{margin:0;padding:0;font:12px/16px sans-serif}</style>";
const options = { width: 400.75, height: 300.875 };
type Pdf = Awaited<ReturnType<typeof inspect>>;
const item = (pdf: Pdf, text: string) => pdf.pages.flatMap(page => page.items).find(item => item.str === text)!;
// Stylo resolves CSS lengths in 1/60-pixel app units; allow that quantization,
// while rejecting the former whole-pixel rounding and viewport truncation.
const coordinate = (actual: number, expected: number) => expect(Math.abs(actual - expected)).toBeLessThan(0.02);

test("preserves fractional millimetre margins in both axes", async () => {
  const origin = await inspect(await renderPdf(`${reset}<div>Position</div>`, options));
  const shifted = await inspect(await renderPdf(`${reset}<div style="margin:10mm 0 0 25mm">Position</div>`, options));
  coordinate(item(shifted, "Position").transform[4] - item(origin, "Position").transform[4], 25 * 72 / 25.4);
  coordinate(item(origin, "Position").transform[5] - item(shifted, "Position").transform[5], 10 * 72 / 25.4);
});

test.each([false, true])("keeps the fractional content viewport after page setup (CSS: %s)", async css => {
  const page = "<style>@page{size:400.75px 300.875px;margin:20.375px 13.375px 20.375px 12.25px}</style>";
  const pdf = await inspect(await renderPdf(`${reset}${css ? page : ""}<div style="width:100px;margin-left:auto">Right</div><div style="margin-left:50vw">Viewport</div>`, css
    ? { preferCSSPageSize: true }
    : { ...options, margin: { top: 20.375, right: 13.375, bottom: 20.375, left: 12.25 } }));
  const contentWidth = options.width - 12.25 - 13.375;
  coordinate(item(pdf, "Right").transform[4], (12.25 + contentWidth - 100) * 0.75);
  coordinate(item(pdf, "Viewport").transform[4], (12.25 + contentWidth / 2) * 0.75);
});

test("uses fractional geometry in header and footer templates", async () => {
  const template = (text: string) => `<div style="font:12px/16px sans-serif;width:100px;margin:2.375px 0 0 auto">${text}</div>`;
  const pdf = await inspect(await renderPdf(`${reset}<div>Body</div>`, {
    ...options, margin: { top: 20.375, right: 13.375, bottom: 20.375, left: 12.25 },
    headerTemplate: template("Header"), footerTemplate: template("Footer"),
  }));
  for (const text of ["Header", "Footer"]) {
    coordinate(item(pdf, text).transform[4], (options.width - 13.375 - 100) * 0.75);
  }
  coordinate(item(pdf, "Header").transform[5] - item(pdf, "Body").transform[5], (20.375 - 2.375) * 0.75);
  coordinate(item(pdf, "Header").transform[5] - item(pdf, "Footer").transform[5], (options.height - 20.375) * 0.75);
});

test.each(["normal", "16px"])("table cells use the same line spacing as blocks (line-height: %s)", async lineHeight => {
  const rows = ["Version", "Reference", "Date"];
  const cell = (text: string) => `<small>${text}</small><br>Value<br>`;
  const styles = `${reset}<style>body{line-height:${lineHeight}}table{border-collapse:collapse}td{padding:0}</style>`;
  const block = await inspect(await renderPdf(`${styles}${rows.map(text => `<div>${cell(text)}</div>`).join("")}<div>After</div>`, options));
  const table = await inspect(await renderPdf(`${styles}<table>${rows.map(text => `<tr><td>${cell(text)}</td></tr>`).join("")}</table><div>After</div>`, options));
  for (const text of [...rows, "After"]) {
    expect(item(table, text).transform[5]).toBeCloseTo(item(block, text).transform[5], 2);
  }
});

test("keeps table-cell positioning and descendant vertical alignment", async () => {
  const pdf = await inspect(await renderPdf(`${reset}<style>table{border-collapse:collapse}td{padding:0;height:64px}</style><table><tr><td style="vertical-align:top">Top</td><td style="vertical-align:middle">Middle</td><td style="vertical-align:bottom">Bottom</td></tr></table><div>Baseline<span style="vertical-align:super">Raised</span></div>`, options));
  expect(item(pdf, "Top").transform[5] - item(pdf, "Middle").transform[5]).toBeCloseTo(24 * 0.75, 2);
  expect(item(pdf, "Middle").transform[5] - item(pdf, "Bottom").transform[5]).toBeCloseTo(24 * 0.75, 2);
  expect(item(pdf, "Raised").transform[5]).toBeGreaterThan(item(pdf, "Baseline").transform[5]);
});

test.each([
  "<p><span></span></p><p>First</p><p>Second</p>",
  "<p>First</p><p><span></span></p><p>Second</p><p><span></span></p>",
  "<p><span><p>First</p><p>Second</p></span></p>",
])("collapses margins through empty inline paragraphs: %s", async html => {
  const styles = `${reset}<style>p{margin:14px 0}</style>`;
  const reference = await inspect(await renderPdf(`${styles}<p>First</p><p>Second</p>`, options));
  const pdf = await inspect(await renderPdf(styles + html, options));
  expect(pdf.pages).toHaveLength(1);
  for (const text of ["First", "Second"]) {
    expect(item(pdf, text).transform[5]).toBeCloseTo(item(reference, text).transform[5], 2);
  }
});

test.each([
  ["min-height:10px", 10],
  ["height:10px", 10],
  ["padding:5px 0", 10],
  ["border-top:2px solid;border-bottom:2px solid", 4],
] as const)("retains the box of an empty inline paragraph with %s", async (style, height) => {
  const pdf = await inspect(await renderPdf(`${reset}<style>p{margin:14px 0}</style><p>First</p><p style="${style}"><span></span></p><p>Second</p>`, options));
  expect(item(pdf, "First").transform[5] - item(pdf, "Second").transform[5]).toBeCloseTo((16 + 28 + height) * 0.75, 2);
});

test("fits a table row exactly into the space left on a page", async () => {
  const pdf = await inspect(await renderPdf(`${reset}<style>table{border-collapse:collapse}td{padding:0;font:16px/20px sans-serif}</style><div style="height:80px">Intro</div><table><tr><td>Last row<br></td></tr></table>`, { width: 300, height: 100 }));
  expect(pdf.pages).toHaveLength(1);
  expect(pdf.pages[0].text).toContain("Last row");
});

test.each(["auto", "fixed"])("stretches max-width:0 cells to their columns (%s table layout)", async layout => {
  const pdf = await inspect(await renderPdf(`${reset}<style>table{width:300px;table-layout:${layout};border-collapse:collapse}td{padding:0;max-width:0;word-break:break-all;overflow-wrap:break-word}</style><table><tr><td><small>Version</small><br>One<br></td><td><small>Reference</small><br>Two</td></tr><tr><td><div>Three</div></td><td>Four</td></tr></table><div>After</div>`, options));
  expect(pdf.pages).toHaveLength(1);
  for (const text of ["Version", "One", "Reference", "Two", "Three", "Four", "After"]) {
    expect(item(pdf, text)).toBeDefined();
  }
  coordinate(item(pdf, "Two").transform[4] - item(pdf, "One").transform[4], 150 * 0.75);
  coordinate(item(pdf, "Four").transform[4] - item(pdf, "Three").transform[4], 150 * 0.75);
  coordinate(item(pdf, "One").transform[5] - item(pdf, "Three").transform[5], 16 * 0.75);
});

const tableStyles = `${reset}<style>.table{display:table;width:100%;box-sizing:border-box;padding:10mm 20mm 0 25mm;border-collapse:collapse}.row{display:table-row}.cell{display:table-cell}p{margin:14px 0}</style>`;
test.each([
  ["<p>First</p><p>Second</p>", '<div class="row"><div class="cell"><p>First</p><p>Second</p></div></div>'],
  ['<div class="cell">First</div><div class="cell">Second</div>', '<div class="row"><div class="cell">First</div><div class="cell">Second</div></div>'],
  ['<div class="row"><p>First</p><p>Second</p></div>', '<div class="row"><div class="cell"><p>First</p><p>Second</p></div></div>'],
  ['<div style="display:contents"><p>First</p><p>Second</p></div>', '<div class="row"><div class="cell"><p>First</p><p>Second</p></div></div>'],
  ['<p>First</p><div class="row"><div class="cell">Second</div></div>', '<div class="row"><div class="cell"><p>First</p></div></div><div class="row"><div class="cell">Second</div></div>'],
  ['<p>First</p><span style="display:none">Hidden</span><p>Second</p>', '<div class="row"><div class="cell"><p>First</p><p>Second</p></div></div>'],
])("generates missing table wrappers without changing spacing: %s", async (implicit, explicit) => {
  const render = async (content: string) => inspect(await renderPdf(`${tableStyles}<div class="table">${content}</div><div>After</div>`, options));
  const pdf = await render(implicit);
  const reference = await render(explicit);
  for (const text of ["First", "Second", "After"]) {
    expect(item(pdf, text)).toBeDefined();
    coordinate(item(pdf, text).transform[4], item(reference, text).transform[4]);
    coordinate(item(pdf, text).transform[5], item(reference, text).transform[5]);
  }
});

test("keeps inline whitespace and row font inheritance in anonymous cells", async () => {
  const pdf = await inspect(await renderPdf(`${tableStyles}<div class="table"><div class="row" style="font:20px/24px monospace"><span>First</span> <span>Second</span></div></div>`, options));
  expect(pdf.pages[0].text.trim()).toBe("First Second");
  expect(pdf.pages[0].items[0].height).toBeCloseTo(20 * 0.75, 2);
});

test("paginates paragraphs and a nested table inside an anonymous cell", async () => {
  const content = '<p>First</p><p>Second</p><table style="border-collapse:collapse"><tr><td>Third</td></tr><tr><td>Fourth</td></tr></table>';
  const pdf = await inspect(await renderPdf(`${reset}<style>p{margin:14px 0}td{padding:0}</style><div style="display:table;width:100%">${content}</div>`, { width: 300, height: 70 }));
  expect(pdf.pages).toHaveLength(2);
  const text = pdf.pages.map(page => page.text).join(" ");
  for (const word of ["First", "Second", "Third", "Fourth"]) expect(text.match(new RegExp(word, "g"))).toHaveLength(1);
});

test("refreshes anonymous cell inheritance after CSS page geometry changes", async () => {
  const pdf = await inspect(await renderPdf(`${reset}<style>@page{size:300px 300px}.table{display:table}.row{display:table-row;font:12px/16px monospace}@media(max-width:400px){.row{font-size:20px;line-height:24px}}</style><div class="table"><div class="row"><p>First</p><p>Second</p></div></div>`, { preferCSSPageSize: true }));
  expect(item(pdf, "First").height).toBeCloseTo(20 * 0.75, 2);
  expect(item(pdf, "Second").height).toBeCloseTo(20 * 0.75, 2);
});
