import { expect, test } from "bun:test";
import { renderPdf } from "blitz-pdf";
import { inspect } from "./helpers";

const options = { width: 300, height: 200 };
const base = "<style>body{margin:0}p,h2{margin:0;font-size:16px;line-height:20px}</style>";

test("renders a trailing br on A4 without a text anchor", async () => {
  const result = await inspect(await renderPdf("<p>Text<br></p>", { format: "A4" }));
  expect(result.pages).toHaveLength(1);
  expect(result.pages[0].text.trim()).toBe("Text");
});

test.each(["<br><br>", "<br><br><br>"])("renders terminal blank lines on A4 (%s)", async breaks => {
  const result = await inspect(await renderPdf(`<p>Text${breaks}</p>`, { format: "A4" }));
  expect(result.pages).toHaveLength(1);
  expect(result.pages[0].text.trim()).toBe("Text");
});

test.each([1, 2, 4])("preserves the height of %i trailing breaks", async count => {
  const result = await inspect(await renderPdf(`${base}<p>Text${"<br>".repeat(count)}</p><p>After</p>`, options));
  expect(result.pages).toHaveLength(1);
  const items = result.pages[0].items;
  const text = items.find(item => item.str === "Text")!;
  const after = items.find(item => item.str === "After")!;
  expect(text).toBeDefined();
  expect(after).toBeDefined();
  expect(text.transform[5] - after.transform[5]).toBeCloseTo(count * 20 * 0.75, 1);
});

test("preserves blank lines between text and in an empty paragraph", async () => {
  const result = await inspect(await renderPdf(`${base}<p>Before<br><br><br>After</p><p><br><br></p><p>End</p>`, options));
  expect(result.pages).toHaveLength(1);
  const y = (text: string) => result.pages[0].items.find(item => item.str === text)!.transform[5];
  expect(y("Before") - y("After")).toBeCloseTo(60 * 0.75, 1);
  expect(y("After") - y("End")).toBeCloseTo(60 * 0.75, 1);
});

test.each(["", "break-before:page"])("preserves trailing blank lines after a page break (%s)", async rule => {
  const result = await inspect(await renderPdf(`${base}<div style="height:190px">Intro</div><p style="${rule}">Text<br><br></p><p>After</p>`, options));
  expect(result.pages).toHaveLength(2);
  expect(result.pages[0].text).not.toContain("Text");
  const items = result.pages[1].items;
  const text = items.find(item => item.str === "Text")!;
  const after = items.find(item => item.str === "After")!;
  expect(text).toBeDefined();
  expect(after).toBeDefined();
  expect(text.transform[5] - after.transform[5]).toBeCloseTo(40 * 0.75, 1);
});

test("keeps blank lines in table cells across page breaks", async () => {
  const html = (breaks: number) => `${base}<style>td{padding:0;font:16px/20px sans-serif}table{border-collapse:collapse;border-spacing:0}</style><div style="height:81px">Intro</div><table>${Array.from({ length: 4 }, (_, i) => `<tr><td>Row${i}${"<br>".repeat(breaks)}</td><td>Cell${i}</td></tr>`).join("")}</table>`;
  const result = await inspect(await renderPdf(html(2), { ...options, height: 100 }));
  const reference = await inspect(await renderPdf(html(1), { ...options, height: 100 }));
  expect(result.pages).toHaveLength(3);
  expect(result.pages[0].text).not.toContain("Row0");
  for (let i = 0; i < 4; i++) {
    const page = result.pages.find(page => page.text.includes(`Row${i}`))!;
    expect(page.text).toContain(`Cell${i}`);
  }
  const spacing = (pdf: typeof result) => {
    const items = pdf.pages[1].items;
    return items.find(item => item.str.startsWith("Row0"))!.transform[5] - items.find(item => item.str.startsWith("Row1"))!.transform[5];
  };
  expect(spacing(reference)).toBeCloseTo(20 * 0.75, 1);
  expect(spacing(result)).toBeCloseTo(40 * 0.75, 1);
});

test("preserves an empty line at the start of an automatic page fragment", async () => {
  const result = await inspect(await renderPdf(`${base}<style>p{orphans:1;widows:1}</style><p>Text<br><br><br><br></p><p>After</p>`, { ...options, height:60 }));
  expect(result.pages).toHaveLength(2);
  expect(result.pages[0].text.trim()).toBe("Text");
  expect(result.pages[1].text.trim()).toBe("After");
  expect(result.pages[0].items.find(item => item.str === "Text")!.transform[5] - result.pages[1].items.find(item => item.str === "After")!.transform[5]).toBeCloseTo(20 * 0.75, 1);
});

test("preserves leading blank lines immediately after a forced page break", async () => {
  const result = await inspect(await renderPdf(`${base}<p>Before</p><p style="break-before:page"><br><br>After<br></p>`, options));
  expect(result.pages).toHaveLength(2);
  expect(result.pages[1].text.trim()).toBe("After");
  expect(result.pages[0].items.find(item => item.str === "Before")!.transform[5] - result.pages[1].items.find(item => item.str === "After")!.transform[5]).toBeCloseTo(40 * 0.75, 1);
});

test("keeps a block with the real last line before a trailing br", async () => {
  const result = await inspect(await renderPdf(`${base}<div style="height:160px">Intro</div><p style="break-after:avoid">Heading<br></p><p>Body</p>`, options));
  expect(result.pages).toHaveLength(1);
  const items = result.pages[0].items;
  expect(items.find(item => item.str === "Heading")!.transform[5] - items.find(item => item.str === "Body")!.transform[5]).toBeCloseTo(20 * 0.75, 1);
});

test.each(["0", "none"])("paginates a height-limited table with max-width:%s cells", async maxWidth => {
  const rows = Array.from({ length: 6 }, () => "<tr><td>Text</td><td>Text</td></tr>").join("");
  const html = `<style>
    .info { width:75mm; max-height:75mm; overflow:hidden }
    .info table { width:100%; border-collapse:collapse }
    .info td { max-width:${maxWidth}; word-break:break-all; overflow-wrap:break-word }
  </style><div class="info"><table>${rows}</table></div>`;
  const result = await inspect(await renderPdf(html, { format: "A4" }));
  expect(result.pages).toHaveLength(1);
  expect(result.pages[0].text.replaceAll(/\s/g, "")).toContain("Text");
  expect(result.pages[0].text.match(/Text/g)).toHaveLength(12);
});

test.each(["hidden", "clip"])("ignores lines outside nested overflow:%s containers", async overflow => {
  const result = await inspect(await renderPdf(`${base}<div style="height:70px;overflow:${overflow};padding:5px;border:2px solid"><div style="height:30px;overflow:${overflow}"><p>Visible<br>Partial<br>Hidden<br>Hidden</p></div></div><p>After</p>`, options));
  expect(result.pages).toHaveLength(1);
  expect(result.pages[0].text).toContain("Visible");
  expect(result.pages[0].text).not.toContain("Hidden");
  expect(result.pages[0].text).toContain("After");
  const items = result.pages[0].items;
  expect(items.find(item => item.str === "Visible")!.transform[5] - items.find(item => item.str === "After")!.transform[5]).toBeCloseTo(77 * 0.75, 1);
});

test("clips oversized line boxes and glyph ink before pagination", async () => {
  const result = await inspect(await renderPdf(`${base}<div style="height:40px;overflow:hidden"><p style="font-size:100px;line-height:120px">Tall</p></div><p>After</p>`, { ...options, height:80 }));
  expect(result.pages).toHaveLength(1);
  expect(result.pages[0].text).toContain("After");
});

test.each(["break-before:page", "break-after:page"])("honors %s on a clipping container", async rule => {
  const result = await inspect(await renderPdf(`${base}<p>Before</p><div style="${rule};height:20px;overflow:hidden;border:2px solid"><p>Inside</p><p style="break-before:page">Hidden</p></div><p>After</p>`, options));
  expect(result.pages).toHaveLength(2);
  expect(result.pages[0].text).toContain("Before");
  expect(result.pages[1].text).toContain("After");
  expect(result.pages[rule.startsWith("break-before") ? 1 : 0].text).toContain("Inside");
  expect(result.pages.map(page => page.text).join("")).not.toContain("Hidden");
});

test("does not repeat clipped table groups beyond the visible table", async () => {
  const rows = Array.from({ length: 8 }, (_, i) => `<tr><td>Row${i}</td></tr>`).join("");
  const result = await inspect(await renderPdf(`${base}<style>table{font:16px/20px sans-serif}td,th{padding:0}</style><div style="height:80px">Intro</div><div style="height:80px;overflow:hidden"><table><thead><tr><th>Header</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><td>HiddenFooter</td></tr></tfoot></table></div><p>After</p>`, { ...options, height:100 }));
  expect(result.pages).toHaveLength(2);
  const text = result.pages.map(page => page.text).join("");
  expect(text.match(/Header/g)).toHaveLength(1);
  expect(text).toContain("Row0");
  expect(text).not.toContain("Row7");
  expect(text).not.toContain("HiddenFooter");
  expect(result.pages[1].text).toContain("After");
});

test.each(["break-before:page", "page-break-before:always"])("honors %s", async rule => {
  const result = await inspect(await renderPdf(`${base}<p>First</p><p style="${rule}">Second</p>`, options));
  expect(result.pages).toHaveLength(2);
  expect(result.pages[0].text).toContain("First");
  expect(result.pages[0].text).not.toContain("Second");
  expect(result.pages[1].text).toContain("Second");
});

test.each(["break-after:page", "page-break-after:always"])("honors %s and coalesces adjacent forced breaks", async rule => {
  const result = await inspect(await renderPdf(`${base}<p style="${rule}">First</p><p style="margin-top:16px;break-before:page">Second</p>`, options));
  expect(result.pages).toHaveLength(2);
  expect(result.pages[0].text).toContain("First");
  expect(result.pages[1].text).toContain("Second");
});

test("does not add empty pages at the start, end, or exact page boundary", async () => {
  const result = await inspect(await renderPdf(`${base}<div style="height:200px;break-before:page;break-after:page">First</div><div style="height:200px;break-before:page;break-after:page">Second</div>`, options));
  expect(result.pages).toHaveLength(2);
  expect(result.pages[0].text).toContain("First");
  expect(result.pages[1].text).toContain("Second");
});

test("propagates a first-child break through default margins without a leading blank page", async () => {
  const result = await inspect(await renderPdf('<p style="break-before:page">Only page</p>', options));
  expect(result.pages).toHaveLength(1);
  expect(result.pages[0].text).toContain("Only page");
});

test("ignores a final break-after on a short document", async () => {
  const result = await inspect(await renderPdf(`${base}<section><p style="break-after:page">Only page</p></section>`, options));
  expect(result.pages).toHaveLength(1);
});

test("supports a standalone break-after between nested blocks", async () => {
  const result = await inspect(await renderPdf(`${base}<section><p style="break-after:page">First</p></section><section><p>Second</p></section>`, options));
  expect(result.pages).toHaveLength(2);
  expect(result.pages[0].text).toContain("First");
  expect(result.pages[1].text).toContain("Second");
});

test.each([["left", 3], ["right", 2], ["recto", 3], ["verso", 2]])("resolves %s page progression in RTL documents", async (value, count) => {
  const result = await inspect(await renderPdf(`<html dir="rtl">${base}<p>First</p><p style="break-before:${value}">Next</p></html>`, options));
  expect(result.pages).toHaveLength(count as number);
  expect(result.pages.at(-1)?.text).toContain("Next");
});

test.each(["avoid", "avoid-page"])("keeps break-inside:%s blocks on one page", async value => {
  const result = await inspect(await renderPdf(`${base}<div style="height:160px">Intro</div><section style="break-inside:${value};height:80px;border:2px solid blue"><p>BlockStart</p><p>BlockEnd</p></section>`, options));
  expect(result.pages).toHaveLength(2);
  expect(result.pages[0].text).not.toContain("BlockStart");
  expect(result.pages[1].text).toContain("BlockStart");
  expect(result.pages[1].text).toContain("BlockEnd");
});

test("applies linked CSS, media queries, variables, specificity and !important", async () => {
  const html = `${base}<link rel="stylesheet" href="print.css"><div style="height:160px">Intro</div><section id="card" style="break-inside:auto"><p>CardStart</p><p>CardEnd</p><p>CardLast</p></section>`;
  const result = await inspect(await renderPdf(html, { ...options, assets: { "print.css": "@media print { :root{--keep:avoid} #card{page-break-inside:var(--keep)!important} } @media screen{#card{break-inside:auto!important}}" } }));
  expect(result.pages[0].text).not.toContain("CardStart");
  expect(result.pages[1].text).toContain("CardLast");
});

test.each(["break-after:avoid", "page-break-after:avoid"])("keeps headings with the following block using %s", async rule => {
  const result = await inspect(await renderPdf(`${base}<div style="height:160px">Intro</div><h2 style="${rule}">Heading</h2><p>BodyLineOne<br>BodyLineTwo</p>`, options));
  expect(result.pages[0].text).not.toContain("Heading");
  expect(result.pages[1].text).toContain("Heading");
  expect(result.pages[1].text).toContain("BodyLineTwo");
});

test("honors break-before:avoid-page", async () => {
  const result = await inspect(await renderPdf(`${base}<div style="height:160px">Intro</div><h2>Heading</h2><p style="break-before:avoid-page">FirstLine<br>LastLine</p>`, options));
  expect(result.pages[0].text).not.toContain("Heading");
  expect(result.pages[1].text).toContain("Heading");
});

test("keeps a heading with the first lines of an oversized following paragraph", async () => {
  const lines = Array.from({length:20}, (_, i)=>`LongLine${i}`).join("<br>");
  const result = await inspect(await renderPdf(`${base}<div style="height:180px">Intro</div><h2 style="break-after:avoid">Heading</h2><p>${lines}</p>`, options));
  expect(result.pages[0].text).not.toContain("Heading");
  expect(result.pages[1].text).toContain("Heading");
  expect(result.pages[1].text).toContain("LongLine0");
});

test("lets oversized avoid blocks fragment without losing or duplicating lines", async () => {
  const content = Array.from({ length: 25 }, (_, i) => `Unique${i.toString().padStart(2,"0")}`).join("<br>");
  const result = await inspect(await renderPdf(`${base}<section style="break-inside:avoid"><p>${content}</p></section>`, options));
  expect(result.pages).toHaveLength(3);
  const text = result.pages.map(p => p.text).join(" ");
  for (let i = 0; i < 25; i++) expect(text.match(new RegExp(`Unique${i.toString().padStart(2,"0")}`, "g"))).toHaveLength(1);
});

test("forced breaks take precedence over break-inside:avoid", async () => {
  const result = await inspect(await renderPdf(`${base}<section style="break-inside:avoid"><p>First</p><p style="break-before:page">Second</p></section>`, options));
  expect(result.pages).toHaveLength(2);
  expect(result.pages[0].text).toContain("First");
  expect(result.pages[1].text).toContain("Second");
});

test("ignores forced breaks on hidden, inline and absolutely positioned elements", async () => {
  const result = await inspect(await renderPdf(`${base}<p>First<span style="break-before:page">Inline</span></p><p style="display:none;break-before:page">Hidden</p><p style="position:absolute;top:60px;break-before:page">Absolute</p><p>Last</p>`, options));
  expect(result.pages).toHaveLength(1);
  expect(result.pages[0].text).toContain("Last");
  expect(result.pages[0].text).not.toContain("Hidden");
});

test.each(["right", "recto"])("starts %s sections on odd pages with one intentional blank page", async value => {
  const result = await inspect(await renderPdf(`${base}<p>First</p><p style="break-before:${value}">Third</p>`, options));
  expect(result.pages).toHaveLength(3);
  expect(result.pages[1].text).toBe("");
  expect(result.pages[2].text).toContain("Third");
});

test.each(["left", "verso"])("starts %s sections on even pages", async value => {
  const result = await inspect(await renderPdf(`${base}<p>First</p><p style="break-before:${value}">Second</p>`, options));
  expect(result.pages).toHaveLength(2);
  expect(result.pages[1].text).toContain("Second");
});

test("honors inherited widows and orphans", async () => {
  const result = await inspect(await renderPdf(`${base}<style>body{widows:3;orphans:3}</style><div style="height:120px">Intro</div><p>L1<br>L2<br>L3<br>L4<br>L5<br>L6</p>`, options));
  expect(result.pages[0].text).toContain("L3");
  expect(result.pages[0].text).not.toContain("L4");
  expect(result.pages[1].text).toContain("L4");
  expect(result.pages[1].text).toContain("L6");
});

test("moves a paragraph when too few orphan lines fit", async () => {
  const result = await inspect(await renderPdf(`${base}<div style="height:180px">Intro</div><p>ParagraphOne<br>ParagraphTwo<br>ParagraphThree</p>`, options));
  expect(result.pages[0].text).not.toContain("ParagraphOne");
  expect(result.pages[1].text).toContain("ParagraphOne");
});

test("keeps table rows together across automatic page breaks", async () => {
  const rows = Array.from({length:6}, (_, i) => `<tr><td>Row${i}A<br>Row${i}B</td><td>Cell${i}</td></tr>`).join("");
  const result = await inspect(await renderPdf(`${base}<table style="border-collapse:collapse;width:100%"><tbody>${rows}</tbody></table>`, {...options, height:100}));
  for (let i=0;i<6;i++) {
    const page = result.pages.find(p=>p.text.includes(`Row${i}A`));
    expect(page?.text).toContain(`Row${i}B`);
    expect(page?.text).toContain(`Cell${i}`);
  }
});

test("does not paint a moved image on the preceding page's clip edge", async () => {
  const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==";
  const result = await inspect(await renderPdf(`${base}<div style="height:160px">Intro</div><img src="data:image/png;base64,${png}" style="display:block;width:80px;height:80px;border:2px solid blue">`, options));
  expect(result.pages).toHaveLength(2);
  expect(result.pages[0].imagePaints).toBe(0);
  expect(result.pages[1].imagePaints).toBe(1);
});

test("counts forced and intentional blank pages toward maxPages", async () => {
  await expect(renderPdf(`${base}<p>First</p><p style="break-before:right">Third</p>`, {...options, maxPages:2})).rejects.toThrow("maxPages");
});

test("rejects a line taller than the printable area and stays usable", async () => {
  await expect(renderPdf(`${base}<p>First</p><p id="tall" style="break-before:page;font-size:100px;line-height:120px">Tall</p>`, {...options, height:80})).rejects.toThrow(
    /\[PAGINATION_LINE_TOO_TALL\].*text line.*page_index=1; page_top=20\.000px; available_height=80\.000px; element=p#tall .*line_index=0; line_range=\[20\.000, 140\.000\]px; line_height=120\.000px/,
  );
  expect((await inspect(await renderPdf(`${base}<p>After failure</p>`, options))).pages).toHaveLength(1);
});

test("distinguishes overlapping lines from a line taller than the page", async () => {
  await expect(renderPdf(`${base}<style>p{line-height:40px;widows:1;orphans:1}</style><div style="display:grid;grid-template-columns:1fr 1fr"><p id="left">A<br>B<br>C</p><p style="margin-top:20px">D<br>E<br>F</p></div>`, { ...options, height:80 })).rejects.toThrow(
    /\[PAGINATION_NO_PROGRESS\].*overlapping text lines.*page_index=0; page_top=0\.000px; available_height=80\.000px; element=p#left .*line_range=\[0\.000, 40\.000\]px; line_height=40\.000px/,
  );
});

test("reports the line intersected by a forced break", async () => {
  await expect(renderPdf(`${base}<p id="before" style="line-height:40px">Before</p><p style="margin-top:-20px;break-before:page">After</p>`, options)).rejects.toThrow(
    /\[PAGINATION_FORCED_BREAK_INTERSECTS_LINE\].*page_index=0.*available_height=200\.000px; element=p#before .*line_index=0; line_range=\[0\.000, 40\.000\]px/,
  );
});

test("moves text crossing a page edge to the next page", async () => {
  const result = await inspect(await renderPdf(`<style>body{margin:0}p{font-size:30px;line-height:40px;margin:0}</style><div style="height:185px"></div><p>Uncut line</p>`, { width: 300, height: 200 }));
  expect(result.pages).toHaveLength(2);
  expect(result.pages[0].text).not.toContain("Uncut line");
  expect(result.pages[1].text).toContain("Uncut line");
  const text = result.pages[1].items.find(item => item.str === "Uncut line")!;
  expect(text.transform[5]).toBeGreaterThan(110);
  expect(text.transform[5]).toBeLessThan(150);
});

test("preserves every line of a multipage paragraph once", async () => {
  const lines = Array.from({ length: 30 }, (_, i) => `Line${i.toString().padStart(2, "0")}`).join("<br>");
  const result = await inspect(await renderPdf(`<style>body{margin:0}p{font-size:17px;line-height:25px;margin:0}</style><p>${lines}</p>`, { width: 300, height: 143 }));
  const text = result.pages.map(page => page.text).join(" ");
  for (let i = 0; i < 30; i++) expect(text.match(new RegExp(`Line${i.toString().padStart(2, "0")}`, "g"))).toHaveLength(1);
});
