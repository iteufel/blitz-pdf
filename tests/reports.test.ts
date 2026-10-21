import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { renderPdf } from "../src/node";
import { inspect } from "./helpers";

const reset = "<style>html,body{margin:0;padding:0}p{margin:0;font:12px/18px sans-serif}</style>";
const mm = 72 / 25.4;

test("uses CSS page dimensions and orientation", async () => {
  for (const [size, width, height] of [["105mm 148mm",105,148], ["A4 landscape",297,210], ["80mm",80,80]] as const) {
    const pdf = await inspect(await renderPdf(`${reset}<style>@page {size:${size};margin:0}</style><p>Label</p>`));
    expect(pdf.pages).toHaveLength(1);
    expect(pdf.pages[0].dimensions.width).toBeCloseTo(width * mm, 3);
    expect(pdf.pages[0].dimensions.height).toBeCloseTo(height * mm, 3);
  }
});

test("CSS page size precedence is explicit and margins apply independently", async () => {
  const html = `${reset}<style>@page{size:105mm 148mm;margin:10mm;margin-left:15mm}</style><p>Position</p>`;
  const explicit = await inspect(await renderPdf(html, { width: "100mm", height: "100mm" }));
  const css = await inspect(await renderPdf(html, { format:"A4", preferCSSPageSize:true }));
  expect(explicit.pages[0].dimensions.width).toBeCloseTo(100 * mm, 3);
  expect(css.pages[0].dimensions.width).toBeCloseTo(105 * mm, 3);
  expect(css.pages[0].items[0].transform[4]).toBeCloseTo(15 * mm, 2);
  expect(css.pages[0].items[0].transform[5]).toBeLessThan((148-10) * mm);
});

test("page rules preserve import order, important declarations and print media", async () => {
  const requests: string[] = [];
  const html = `${reset}<link rel="stylesheet" href="first.css"><style>
    @page{size:120mm 160mm;margin:2mm}
    @media screen{@page{size:200mm 200mm}}
    @media print{@page{margin-left:9mm!important;margin-top:calc(2mm + 3mm)}}
  </style><link rel="stylesheet" href="last.css"><p>Cascade</p>`;
  const options = { assets:async (url: string) => { requests.push(url); return url.endsWith("first.css") ? '@import "nested.css"; @page{size:100mm 150mm}' : url.endsWith("nested.css") ? '@page{size:105mm 148mm!important}' : '@page{size:80mm 80mm;margin-left:20mm}'; } };
  const pdf = await inspect(await renderPdf(html, options));
  expect(pdf.pages[0].dimensions.width).toBeCloseTo(105 * mm, 3);
  expect(pdf.pages[0].items[0].transform[4]).toBeCloseTo(9 * mm, 2);
  expect(requests).toHaveLength(3);
  const screen = await inspect(await renderPdf(`${reset}<style>@media screen{@page{size:200px 100px}}@media print{@page{size:300px 400px}}</style>`, { media:"screen" }));
  expect(screen.pages[0].dimensions).toEqual({ width:150, height:75 });
  const attributes = await inspect(await renderPdf(`${reset}<link rel="stylesheet" media="print" href="print.css"><style media="screen">@page{size:200mm 200mm!important}</style>`, {
    assets:{"print.css":"@page{size:105mm 148mm}"},
  }));
  expect(attributes.pages[0].dimensions.width).toBeCloseTo(105*mm, 3);
});

test("fractional millimetre page height does not create an extra page", async () => {
  const pdf = await inspect(await renderPdf(`<style>html,body{margin:0;padding:0}body{height:20mm;display:flex;flex-direction:column;justify-content:flex-end}</style><footer>Footer</footer>`, { width:"148mm",height:"20mm",maxPages:1 }));
  expect(pdf.pages).toHaveLength(1);
  expect(pdf.pages[0].text).toContain("Footer");
  expect(pdf.pages[0].dimensions.height).toBeCloseTo(20*mm, 3);
  await expect(renderPdf(`${reset}<div style="height:76px"></div>`, { width:"148mm",height:"20mm",maxPages:1 })).rejects.toThrow("maxPages");
});

test("adds the missing ISO and Ledger paper formats", async () => {
  for (const [format,width,height] of [["A0",841*mm,1189*mm],["A1",594*mm,841*mm],["A2",420*mm,594*mm],["A6",105*mm,148*mm],["Ledger",1224,792]] as const) {
    const pdf = await inspect(await renderPdf("", { format }));
    expect(pdf.pages[0].dimensions.width).toBeCloseTo(width, 3);
    expect(pdf.pages[0].dimensions.height).toBeCloseTo(height, 3);
  }
});

test("renders selectable margin templates on every page including intentional blanks", async () => {
  const pdf = await inspect(await renderPdf(`${reset}<p>First body</p><p style="break-before:right">Last body</p>`, {
    width:300,height:200,margin:{top:30,bottom:30,left:15,right:15},
    headerTemplate:'<div style="font:12px/20px sans-serif">Report <span class="pageNumber">x</span> of <b class="totalPages">x</b></div>',
    footerTemplate:'<p style="margin:0;font:10px/20px sans-serif">Footer <span class="pageNumber"></span></p>',
  }));
  expect(pdf.pages).toHaveLength(3);
  for (const [i,page] of pdf.pages.entries()) {
    expect(page.text).toContain(`Report ${i+1} of 3`);
    expect(page.text).toContain(`Footer ${i+1}`);
    expect(page.items.find(item=>item.str.startsWith("Report"))!.transform[5]).toBeGreaterThan(127.5);
    expect(page.items.find(item=>item.str.startsWith("Footer"))!.transform[5]).toBeLessThan(22.5);
    expect(page.imagePaints).toBe(0);
  }
  expect(pdf.pages[1].text).not.toContain("body");
});

test("template CSS and images use the same async resolver and base URL", async () => {
  const urls: string[] = [];
  const pdf = await inspect(await renderPdf(`${reset}<link rel="stylesheet" href="shared.css"><p>Body</p>`, {
    width:300,height:200,margin:{top:35,bottom:35}, baseUrl:"https://example.com/reports/",
    headerTemplate:'<link rel="stylesheet" href="shared.css"><img src="logo.svg" width="15" height="15">Header',
    footerTemplate:'<link rel="stylesheet" href="shared.css"><span>Footer</span>',
    assets:async url => { urls.push(url); return url.endsWith(".css") ? "body{font:12px/20px monospace}" : '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15"><rect width="15" height="15" fill="blue"/></svg>'; },
  }));
  expect(urls.sort()).toEqual(["https://example.com/reports/logo.svg","https://example.com/reports/shared.css"]);
  expect(pdf.pages[0].text).toContain("Header");
  expect(pdf.pages[0].text).toContain("Footer");
  expect(pdf.pages[0].hasPaths).toBe(true);
});

test("validates template fit and new option types and recovers after failure", async () => {
  await expect(renderPdf("", { headerTemplate:"Header" })).rejects.toThrow("margin");
  await expect(renderPdf("", { margin:{bottom:10},footerTemplate:'<div style="height:30px">Tall</div>' })).rejects.toThrow("footerTemplate");
  await expect(renderPdf("", { headerTemplate:42 } as never)).rejects.toThrow("headerTemplate");
  await expect(renderPdf("", { preferCSSPageSize:"yes" } as never)).rejects.toThrow("preferCSSPageSize");
  expect((await inspect(await renderPdf("<p>Recovered</p>"))).pages[0].text).toContain("Recovered");
});

const tableCSS = "<style>html,body{margin:0;padding:0}table{border-collapse:collapse;width:100%;font:12px/20px sans-serif}th,td{padding:0;height:20px;text-align:left}thead{background:#eee}tfoot{background:#ddd}</style>";
const tableRows = (count: number) => Array.from({length:count}, (_,i)=>`<tr><td>Row${String(i).padStart(2,"0")}</td><td>Value${i}</td></tr>`).join("");

test("reserves repeated table header and footer height across four pages", async () => {
  const pdf = await inspect(await renderPdf(`${tableCSS}<table><thead><tr><th>Column</th><th>Value</th></tr></thead><tbody>${tableRows(24)}</tbody><tfoot><tr><td>Table summary</td><td>EUR</td></tr></tfoot></table>`, {width:300,height:180,margin:10}));
  expect(pdf.pages).toHaveLength(4);
  const allText = pdf.pages.map(p=>p.text).join("\n");
  for (let i=0;i<24;i++) expect(allText.match(new RegExp(`Row${String(i).padStart(2,"0")}`,"g"))).toHaveLength(1);
  for (const page of pdf.pages) {
    expect(page.text.match(/Column/g)).toHaveLength(1);
    expect(page.text.match(/Table summary/g)).toHaveLength(1);
    const header = page.items.find(i=>i.str === "Column")!;
    const footer = page.items.find(i=>i.str === "Table summary")!;
    const rows = page.items.filter(i=>i.str.startsWith("Row"));
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.transform[5]).toBeLessThan(header.transform[5]-5);
      expect(row.transform[5]).toBeGreaterThan(footer.transform[5]+5);
    }
    expect(footer.transform[5]).toBeGreaterThan(7.5);
  }
});

test("repeats only table header groups and stops at the end of the table", async () => {
  const pdf = await inspect(await renderPdf(`${tableCSS}<table><thead><tr><th>Repeated</th></tr></thead><tbody>${tableRows(12)}</tbody></table><p style="break-before:page">After table</p>`, {width:300,height:120,margin:10}));
  expect(pdf.pages.at(-1)!.text).toContain("After table");
  expect(pdf.pages.at(-1)!.text).not.toContain("Repeated");
  for (const page of pdf.pages.slice(0,-1)) expect(page.text.match(/Repeated/g)).toHaveLength(1);
  const disabled = await inspect(await renderPdf(`${tableCSS}<style>thead{display:table-row-group}</style><table><thead><tr><th>Once</th></tr></thead><tbody>${tableRows(12)}</tbody></table>`, {width:300,height:120}));
  expect(disabled.pages.map(p=>p.text).join("\n").match(/Once/g)).toHaveLength(1);
});

test("table footers can repeat without a header and templates use the final count", async () => {
  const pdf = await inspect(await renderPdf(`${tableCSS}<table><tbody>${tableRows(12)}</tbody><tfoot><tr><td>Table footer</td></tr></tfoot></table>`, {width:300,height:160,margin:{top:25,bottom:25}, headerTemplate:'<div style="font:10px/15px sans-serif">Page <span class="pageNumber"></span>/<span class="totalPages"></span></div>'}));
  expect(pdf.pages.length).toBeGreaterThan(2);
  for (const [i,page] of pdf.pages.entries()) {
    expect(page.text.match(/Table footer/g)).toHaveLength(1);
    expect(page.text).toContain(`Page ${i+1}/${pdf.pages.length}`);
  }
});

test("templates share fonts loaded through the body stylesheet", async () => {
  const font = await readFile(new URL("../assets/fonts/DejaVuSansMono.ttf",import.meta.url));
  const pdf = await inspect(await renderPdf(`${reset}<style>@font-face{font-family:ReportFace;src:url(report.ttf)}p{font:16px/20px ReportFace}</style><p>WiWiWi</p>`, {
    width:300,height:200,margin:{top:30,bottom:30},assets:{"report.ttf":font},
    headerTemplate:'<div style="font:16px/20px ReportFace">WiWiWi</div>',
    footerTemplate:'<div style="font:16px/20px ReportFace">WiWiWi</div>',
  }));
  const items = pdf.pages[0].items.filter(i=>i.str === "WiWiWi");
  expect(items).toHaveLength(3);
  expect(items[1].width).toBeCloseTo(items[0].width, 3);
  expect(items[2].width).toBeCloseTo(items[0].width, 3);
});

test("CSS page margins reserve templates before body pagination", async () => {
  // Block templates use their explicit 15px line height, independently of the
  // body's default-font strut (Noto Sans has taller metrics than DejaVu Sans).
  const pdf = await inspect(await renderPdf(`${reset}<style>@page{size:200px 100px;margin:20px 10px}</style><p>First<br>Second<br>Third<br>Fourth</p>`, {
    headerTemplate:'<div style="font:10px/15px sans-serif">Header</div>',footerTemplate:'<div style="font:10px/15px sans-serif">Footer</div>',
  }));
  expect(pdf.pages).toHaveLength(2);
  for (const page of pdf.pages) {
    expect(page.dimensions).toEqual({width:150,height:75});
    expect(page.text).toContain("Header");
    expect(page.text).toContain("Footer");
  }
});

test("rejects CSS dimensions with no printable area and respects size:auto", async () => {
  await expect(renderPdf(`${reset}<style>@page{size:20px;margin:12px}</style>`)).rejects.toThrow("margin");
  const pdf = await inspect(await renderPdf(`${reset}<style>@page{size:80mm} @page{size:auto}</style>`,{width:200,height:100,preferCSSPageSize:true}));
  expect(pdf.pages[0].dimensions).toEqual({width:150,height:75});
  const overridden = await inspect(await renderPdf(`${reset}<link rel="stylesheet" href="page.css"><p>Fits after CSS</p>`, {
    width:40,height:40,margin:30,preferCSSPageSize:true,
    assets:async ()=>"@page{size:200px 100px;margin:5px}",
  }));
  expect(overridden.pages[0].dimensions).toEqual({width:150,height:75});
  expect(overridden.pages[0].text).toContain("Fits after CSS");
});

test("repeated table groups count toward maxPages and cannot consume a whole page", async () => {
  const html = `${tableCSS}<table><thead><tr><th>Column</th></tr></thead><tbody>${tableRows(24)}</tbody><tfoot><tr><td>Summary</td></tr></tfoot></table>`;
  await expect(renderPdf(html,{width:300,height:180,margin:10,maxPages:3})).rejects.toThrow("maxPages");
  await expect(renderPdf(html,{width:300,height:40,maxPages:100})).rejects.toThrow();
});

test("margin templates retain transparency instead of painting a white background", async () => {
  const bytes = await renderPdf(reset, {
    width:200,height:120,margin:{top:30,bottom:30,left:10,right:10},
    headerTemplate:'<div style="height:20px;background:rgba(255,0,0,0.5)"></div>',
  });
  await inspect(bytes);
  const task = getDocument({data:bytes.slice(),useSystemFonts:false});
  try {
    const pdf = await task.promise, page = await pdf.getPage(1), viewport = page.getViewport({scale:4});
    type Surface = {canvas:HTMLCanvasElement;context:CanvasRenderingContext2D};
    const factory = pdf.canvasFactory as {create(width:number,height:number):Surface;destroy(surface:Surface):void};
    const surface = factory.create(Math.ceil(viewport.width),Math.ceil(viewport.height));
    try {
      await page.render({canvasContext:surface.context,viewport,background:"#00ff00"}).promise;
      const pixel = (x:number,y:number)=>Array.from(surface.context.getImageData(x,y,1,1).data);
      expect(pixel(1,1)).toEqual([0,255,0,255]);
      expect(pixel(150,200)).toEqual([0,255,0,255]);
      const translucent = pixel(150,15);
      expect(translucent[0]).toBeGreaterThan(120);
      expect(translucent[0]).toBeLessThan(135);
      expect(translucent[1]).toBeGreaterThan(120);
      expect(translucent[1]).toBeLessThan(135);
      expect(translucent[2]).toBe(0);
    } finally { factory.destroy(surface); }
  } finally { await task.destroy(); }
});
