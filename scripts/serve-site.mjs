import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../_site/", import.meta.url));
const mime = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".wasm": "application/wasm", ".svg": "image/svg+xml", ".pdf": "application/pdf", ".json": "application/json" };
// SITE_BASE_PATH lets local verification exercise GitHub project-page URLs.
const base = `/${(process.env.SITE_BASE_PATH ?? "").replace(/^\/+|\/+$/g, "")}`.replace(/\/?$/, "/");
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    if (base !== "/" && pathname === base.slice(0, -1)) { response.writeHead(301, { Location: base }); response.end(); return; }
    if (!pathname.startsWith(base)) throw new Error("Outside base path");
    const relative = pathname.slice(base.length) || "index.html";
    const file = resolve(root, relative);
    if (!file.startsWith(root.endsWith(sep) ? root : root + sep)) throw new Error("Invalid path");
    const content = await readFile(file);
    response.writeHead(200, { "Content-Type": mime[extname(file)] ?? "application/octet-stream", "Cache-Control": "no-cache", "X-Content-Type-Options": "nosniff" });
    response.end(content);
  } catch { response.writeHead(404); response.end("Not found. Run npm run build:site first."); }
});
server.listen(Number(process.env.PORT ?? 4173), "127.0.0.1", () => console.log(`Converter: http://127.0.0.1:${server.address().port}${base}`));
