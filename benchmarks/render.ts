import { init, renderPdf, getEngineVersion, type AssetMap, type Backend, type PdfOptions } from "blitz-pdf";
import { readFile } from "node:fs/promises";
import { createInvoiceHtml, invoiceOptions } from "../examples/german-invoice/template.mjs";

function backendArgument(): Backend {
  const text = process.argv.find(value => value.startsWith("--backend="))?.split("=")[1] ?? "wasm";
  if (text !== "wasm" && text !== "native") throw new Error("--backend must be wasm or native");
  return text;
}

function argument(name: string, fallback: number): number {
  const text = process.argv.find(value => value.startsWith(`--${name}=`))?.split("=")[1];
  const value = text === undefined ? fallback : Number(text);
  if (!Number.isInteger(value) || value < 1 || value > 10_000) throw new Error(`--${name} must be an integer from 1 to 10000`);
  return value;
}
const iterations = argument("iterations", 20);
const warmup = argument("warmup", 3);
const backend = backendArgument();
const millis = () => Number(Bun.nanoseconds()) / 1e6;
const start = millis();
await init({ backend });
const initializationMs = millis() - start;
const dynamicHtml = '<link rel="stylesheet" href="main.css"><p>Dynamic assets: café office affinity.</p><p class="second">Next page</p>';
const dynamicAssets: AssetMap = {
  "https://blitz-pdf.invalid/main.css": '@import "nested.css"; @font-face{font-family:Loaded;src:url(mono.ttf)} p{font-family:Loaded}',
  "https://blitz-pdf.invalid/nested.css": '.second{break-before:page}',
  "https://blitz-pdf.invalid/mono.ttf": await readFile(new URL("../assets/fonts/DejaVuSansMono.ttf", import.meta.url)),
};
const invoiceCss = await readFile(new URL("../examples/german-invoice/invoice.css", import.meta.url));
const scenarios: { name: string; html: string; options?: PdfOptions }[] = [
  { name: "small", html: "<h1>Hello, PDF</h1><p>Selectable text rendered by Blitz and WASM.</p>" },
  { name: "styled-invoice", html: `<style>body{font-family:sans-serif;padding:24px}header{display:flex;justify-content:space-between}h1{color:#2457db}table{width:100%;border-collapse:collapse}td,th{padding:8px;border-bottom:1px solid #ddd;text-align:left}</style><header><h1>Invoice</h1><p>INV-0042</p></header><p>Customer: Example Company</p><table><tr><th>Item</th><th>Quantity</th><th>Price</th></tr>${Array.from({length:15},(_,i)=>`<tr><td>Consulting service ${i+1}</td><td>2</td><td>€150.00</td></tr>`).join("")}</table>` },
  { name: "multipage-100-paragraphs", html: `<style>body{font-family:sans-serif}p{margin:0 0 12px;line-height:1.5}</style>${Array.from({length:100},(_,i)=>`<p>Paragraph ${i+1}. Blitz lays out HTML and CSS. Fonts are embedded and text remains selectable in this vector PDF.</p>`).join("")}` },
  { name: "assets-map", html: dynamicHtml, options: { assets: dynamicAssets } },
  { name: "assets-async", html: dynamicHtml, options: { assets: async url => dynamicAssets[url] } },
  { name: "german-invoice-3-pages", html: createInvoiceHtml(), options: { ...invoiceOptions() as PdfOptions, assets: async url => url.endsWith("/invoice.css") ? invoiceCss : undefined } },
];
const results = [];
for (const scenario of scenarios) {
  const options: PdfOptions = { margin: "12mm", ...scenario.options };
  const coldStart = millis();
  let bytes = await renderPdf(scenario.html, options);
  const firstRenderMs = millis() - coldStart;
  for (let n=0;n<warmup;n++) await renderPdf(scenario.html, options);
  const samples = [];
  for (let n=0;n<iterations;n++) {
    const before = millis();
    bytes = await renderPdf(scenario.html, options);
    samples.push(millis() - before);
    if (bytes[0] !== 37 || bytes[1] !== 80) throw new Error("Renderer did not return a PDF");
  }
  samples.sort((a,b)=>a-b);
  const meanMs = samples.reduce((a,b)=>a+b,0)/iterations;
  results.push({ scenario:scenario.name, iterations, firstRenderMs, meanMs, p50Ms:samples[Math.ceil(iterations*.5)-1], p95Ms:samples[Math.ceil(iterations*.95)-1], minMs:samples[0], maxMs:samples.at(-1), rendersPerSecond:1000/meanMs, outputBytes:bytes.length });
}
const report = { runtime:`Bun ${Bun.version}`, platform:`${process.platform}/${process.arch}`, backend, engine:await getEngineVersion(), initializationMs, warmup, rssBytes:process.memoryUsage().rss, results };
if (process.argv.includes("--json")) console.log(JSON.stringify(report,null,2));
else {
  console.log(`${report.runtime} • ${report.platform} • ${report.engine}`);
  console.log(`${backend} initialization: ${initializationMs.toFixed(2)} ms; warmup: ${warmup}; samples: ${iterations}`);
  console.table(results.map(row=>({scenario:row.scenario,"first ms":row.firstRenderMs.toFixed(2),"mean ms":row.meanMs.toFixed(2),"p50 ms":row.p50Ms.toFixed(2),"p95 ms":row.p95Ms.toFixed(2),"PDF/s":row.rendersPerSecond.toFixed(1),"PDF bytes":row.outputBytes})));
  console.log("Times include HTML parsing, layout, painting, font subsetting, and PDF serialization. Runs are sequential; no network or filesystem writes are timed.");
}
