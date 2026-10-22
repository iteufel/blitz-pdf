import { access, cp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const output = new URL("_site/", root);
for (const required of ["dist/browser.js", "wasm/blitz_pdf.js", "wasm/blitz_pdf_bg.wasm", "node_modules/pdfjs-dist/build/pdf.min.mjs"]) {
  try { await access(new URL(required, root)); }
  catch { throw new Error(`Missing ${required}. Run npm ci and npm run build before building the site.`); }
}
await rm(output, { recursive: true, force: true });
await cp(new URL("website/", root), output, { recursive: true });
await mkdir(new URL("vendor/blitz/dist/", output), { recursive: true });
for (const name of await readdir(new URL("dist/", root))) {
  if (name.endsWith(".js")) await cp(new URL(`dist/${name}`, root), new URL(`vendor/blitz/dist/${name}`, output));
}
await mkdir(new URL("vendor/blitz/wasm/", output), { recursive: true });
for (const name of ["blitz_pdf.js", "blitz_pdf_bg.wasm"]) {
  await cp(new URL(`wasm/${name}`, root), new URL(`vendor/blitz/wasm/${name}`, output));
}
await mkdir(new URL("vendor/pdfjs/", output), { recursive: true });
for (const name of ["pdf.min.mjs", "pdf.worker.min.mjs"]) {
  await cp(new URL(`node_modules/pdfjs-dist/build/${name}`, root), new URL(`vendor/pdfjs/${name}`, output));
}
for (const name of ["cmaps", "standard_fonts", "wasm"]) {
  await cp(new URL(`node_modules/pdfjs-dist/${name}/`, root), new URL(`vendor/pdfjs/${name}/`, output), { recursive: true });
}
await cp(new URL("node_modules/pdfjs-dist/LICENSE", root), new URL("vendor/pdfjs/LICENSE", output));
for (const name of ["LICENSE", "THIRD_PARTY_NOTICES.md", "licenses"]) {
  await cp(new URL(name, root), new URL(name, output), { recursive: true });
}
await cp(new URL("assets/icon.svg", root), new URL("icon.svg", output));
await writeFile(new URL(".nojekyll", output), "");
console.log(`Static converter built at ${fileURLToPath(output)} (all dependencies bundled, no CDN).`);
