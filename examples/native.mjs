import { mkdir, readFile, writeFile } from "node:fs/promises";
import { init, renderPdf } from "blitz-pdf";

await init({ backend: "native" });
const html = await readFile(new URL("./invoice.html", import.meta.url), "utf8");
const pdf = await renderPdf(html, { format: "A4", margin: "18mm", title: "Invoice INV-0042" });
await mkdir(new URL("../output/pdf/", import.meta.url), { recursive: true });
await writeFile(new URL("../output/pdf/invoice-native.pdf", import.meta.url), pdf);
console.log(`Created output/pdf/invoice-native.pdf (${pdf.length} bytes).`);
