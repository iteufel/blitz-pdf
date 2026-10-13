import { mkdir } from "node:fs/promises";
import { renderPdf } from "blitz-pdf";

const html = await Bun.file(new URL("./invoice.html", import.meta.url)).text();
const pdf = await renderPdf(html, { format: "A4", margin: "18mm", title: "Invoice INV-0042" });
await mkdir(new URL("../output/pdf/", import.meta.url), { recursive: true });
await Bun.write(new URL("../output/pdf/invoice.pdf", import.meta.url), pdf);
console.log(`Created output/pdf/invoice.pdf (${pdf.length} bytes).`);
