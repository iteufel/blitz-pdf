import { expect, test } from "bun:test";
import { renderPdf } from "blitz-pdf";
import { inspect } from "./helpers";

const options = { width: 300, height: 200 };
const base = "<style>body{margin:0}p,h2{margin:0;font-size:16px;line-height:20px}</style>";

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
  await expect(renderPdf(`${base}<p style="font-size:100px;line-height:120px">Tall</p>`, {...options, height:80})).rejects.toThrow("text line");
  expect((await inspect(await renderPdf(`${base}<p>After failure</p>`, options))).pages).toHaveLength(1);
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
