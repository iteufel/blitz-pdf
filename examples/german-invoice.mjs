import { readFile, mkdir, writeFile } from "node:fs/promises";
import { renderPdf } from "blitz-pdf";
import { createInvoiceHtml, invoiceOptions } from "./german-invoice/template.mjs";
import { invoice, calculateInvoice } from "./german-invoice/data.mjs";

const baseUrl = new URL("german-invoice/", import.meta.url);
const html = createInvoiceHtml(invoice);
const bytes = await renderPdf(html, {
  ...invoiceOptions(invoice),
  baseUrl: baseUrl.href,
  // Demonstrates the async asset API with a real external stylesheet.
  assets: async url => readFile(new URL(url)),
});
const output = new URL("../output/pdf/", import.meta.url);
await mkdir(output, { recursive: true });
await writeFile(new URL("german-invoice.pdf", output), bytes);
await writeFile(new URL("german-invoice.html", output), html);
await writeFile(new URL("invoice.css", output), await readFile(new URL("invoice.css", baseUrl)));
await writeFile(new URL("german-invoice-totals.json", output), JSON.stringify(calculateInvoice(invoice), null, 2) + "\n");
console.log(`Created output/pdf/german-invoice.pdf (${bytes.length} bytes, PDF/A-3u with automatic page numbers).`);
