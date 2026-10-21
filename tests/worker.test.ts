import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { getWasmModule, renderPdf, renderPdfInWorker } from "blitz-pdf";
import { inspect } from "./helpers";

const fixtures = new URL("fixtures/dynamic/", import.meta.url).href;

describe("renderPdfInWorker", () => {
  test("compiles the WASM module once and shares it", async () => {
    const [first, second] = await Promise.all([getWasmModule(), getWasmModule()]);
    expect(first).toBeInstanceOf(WebAssembly.Module);
    expect(second).toBe(first);
    await renderPdfInWorker("<p>Shared</p>");
    expect(await getWasmModule()).toBe(first);
  });

  test("matches main-thread output", async () => {
    const html = "<h1>Worker PDF</h1><p>café office €</p>";
    const options = { format: "A5", metadata: { creationDate: "2026-01-01T00:00:00Z", documentId: "worker" } } as const;
    const [worker, main] = await Promise.all([renderPdfInWorker(html, options), renderPdf(html, options)]);
    expect(worker).toEqual(main);
    const result = await inspect(worker);
    expect(result.pages[0]!.text).toContain("café office €");
  });

  test("runs the asset resolver on the calling thread", async () => {
    const requests: string[] = [];
    const pdf = await renderPdfInWorker('<style>@page{size:105mm 148mm;margin:8mm}</style><link rel="stylesheet" href="main.css"><p class="box">Loaded font</p><p class="second">Second page</p>', {
      baseUrl: fixtures,
      assets: async url => { requests.push(url); return readFile(new URL(url)); },
    });
    expect(new Set(requests).size).toBe(3);
    expect(requests.some(url => url.endsWith("DejaVuSansMono.ttf"))).toBe(true);
    expect((await inspect(pdf)).pages).toHaveLength(2);
  });

  test("renders concurrently in separate workers", async () => {
    const pdfs = await Promise.all(Array.from({ length: 4 }, (_, i) => renderPdfInWorker(`<p>Document ${i}</p>`)));
    for (const [i, pdf] of pdfs.entries()) expect((await inspect(pdf)).pages[0]!.text).toContain(`Document ${i}`);
  });

  test("rejects with validation, asset, and engine errors", async () => {
    await expect(renderPdfInWorker(42 as unknown as string)).rejects.toThrow("html must be a string");
    await expect(renderPdfInWorker("<p>x</p>", { maxPages: 0 })).rejects.toThrow(/maxPages/);
    const failure = await renderPdfInWorker('<link rel="stylesheet" href="a.css">', { assets: () => { throw new Error("offline"); } }).catch(error => error);
    expect(failure.message).toBe("Failed to load asset: https://blitz-pdf.invalid/a.css");
    expect(failure.cause.message).toBe("offline");
    await expect(renderPdfInWorker('<link rel="stylesheet" href="a.css">', { assets: () => null })).rejects.toThrow(/Missing asset/);
    await expect(renderPdfInWorker('<p style="break-after:page">a</p><p>b</p>', { maxPages: 1 })).rejects.toThrow("Document exceeds maxPages (1)");
    expect((await renderPdfInWorker("<p>Still usable</p>")).byteLength).toBeGreaterThan(0);
  });

  test("shares a precompiled module supplied to init", () => {
    const child = spawnSync(process.execPath, ["--eval", `
      import {readFile} from "node:fs/promises";
      import {init,getWasmModule,renderPdfInWorker} from "blitz-pdf";
      const module=await WebAssembly.compile(await readFile(new URL(import.meta.resolve("blitz-pdf/wasm"))));
      await init({wasm:module});
      if (await getWasmModule() !== module) throw new Error("Module was recompiled");
      const pdf=await renderPdfInWorker("<p>Supplied module</p>");
      console.log(new TextDecoder().decode(pdf.subarray(0,5)));
    `], { cwd: new URL("../", import.meta.url), encoding: "utf8" });
    expect(child.status, child.stderr).toBe(0);
    expect(child.stdout.trim()).toBe("%PDF-");
  });
});
