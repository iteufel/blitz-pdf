import { readFile, mkdir, writeFile } from "node:fs/promises";
import { renderPdf } from "blitz-pdf";

const html = await readFile(new URL("./pagination.html", import.meta.url), "utf8");
const pdf = await renderPdf(html, { format:"A5", margin:"12mm", title:"PDF/A-3u page break verification" });
await mkdir(new URL("../output/pdf/", import.meta.url), { recursive:true });
await writeFile(new URL("../output/pdf/pagination.pdf", import.meta.url), pdf);
console.log(`Created output/pdf/pagination.pdf (${pdf.length} bytes).`);
