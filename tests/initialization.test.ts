import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";

test("browser API retries failed initialization and accepts a byte subarray", () => {
  const child = spawnSync(process.execPath, ["--eval", `
    import {readFile} from "node:fs/promises";
    import {init,renderPdf} from "blitz-pdf/browser";
    let rejected=false;
    try { await init({wasm:new Uint8Array([1,2,3])}); } catch { rejected=true; }
    if (!rejected) throw new Error("Invalid WASM was accepted");
    const data=await readFile(new URL(import.meta.resolve("blitz-pdf/wasm")));
    const padded=new Uint8Array(data.length+8); padded.set(data,4);
    await init({wasm:padded.subarray(4,-4)});
    const pdf=await renderPdf("<p>After retry</p>");
    console.log(new TextDecoder().decode(pdf.subarray(0,5)));
  `], { cwd: new URL("../", import.meta.url), encoding: "utf8" });
  expect(child.status, child.stderr).toBe(0);
  expect(child.stdout.trim()).toBe("%PDF-");
});

test.each(["module", "response"])("initializes from %s", kind => {
  const child = spawnSync(process.execPath, ["--eval", `
    import {readFile} from "node:fs/promises";
    import {init,renderPdf} from "blitz-pdf/browser";
    const bytes=await readFile(new URL(import.meta.resolve("blitz-pdf/wasm")));
    const wasm=${kind === "module" ? "await WebAssembly.compile(bytes)" : "new Response(bytes, {headers:{'Content-Type':'application/wasm'}})"};
    await init({wasm});
    const pdf=await renderPdf("<p>Explicit initialization</p>");
    console.log(new TextDecoder().decode(pdf.subarray(0,5)));
  `], { cwd: new URL("../", import.meta.url), encoding: "utf8" });
  expect(child.status, child.stderr).toBe(0);
  expect(child.stdout.trim()).toBe("%PDF-");
});
