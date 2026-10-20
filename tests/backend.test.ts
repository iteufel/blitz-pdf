import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { PDFDocument } from "pdf-lib";
import { fileURLToPath } from "node:url";
import { platformId } from "../src/platform.ts";
import { platformId as scriptPlatformId } from "../scripts/native-platform.mjs";
import { inspect } from "./helpers";

const root = fileURLToPath(new URL("../", import.meta.url));
const harness = fileURLToPath(new URL("./backend-harness.mjs", import.meta.url));

function run(command: string, args: string[]) {
  return spawnSync(command, args, { cwd: root, encoding: "utf8" });
}

function pdfBytes(encoded: string) {
  return Uint8Array.from(Buffer.from(encoded, "base64"));
}

function lines(result: ReturnType<typeof run>) {
  expect(result.status, result.stderr).toBe(0);
  return Object.fromEntries(result.stdout.trim().split("\n").map(line => {
    const index = line.indexOf("=");
    return [line.slice(0, index), line.slice(index + 1)];
  }));
}

test("build script and runtime agree on the native addon id", () => {
  expect(platformId()).toBe(scriptPlatformId());
  expect(platformId()).toMatch(/^[a-z0-9]+-[a-z0-9]+-/);
});

test("node and bun default to wasm and can select the native backend", () => {
  for (const command of [process.execPath, "node"]) {
    const wasm = lines(run(command, [harness, "blitz-pdf", "render"]));
    expect(wasm.version).toContain("backend/wasm");
    expect(wasm.pdf).toBe("%PDF-");
    const native = lines(run(command, [harness, "blitz-pdf", "render", "native"]));
    expect(native.version).toContain("backend/native");
    expect(native.pdf).toBe("%PDF-");
  }
});

test("wasm and native render the same document", async () => {
  const wasm = lines(run(process.execPath, [harness, "blitz-pdf", "document", "wasm"]));
  const native = lines(run(process.execPath, [harness, "blitz-pdf", "document", "native"]));
  expect(wasm.version).toContain("backend/wasm");
  expect(native.version).toContain("backend/native");
  const wasmPdf = await inspect(pdfBytes(wasm.pdf!));
  const nativePdf = await inspect(pdfBytes(native.pdf!));
  expect(wasmPdf.pages).toHaveLength(1);
  expect(nativePdf.pages).toHaveLength(1);
  expect(nativePdf.pages[0]?.text).toContain("Native");
  expect(nativePdf.pages[0]?.text.normalize("NFC")).toContain("café office");
  expect(nativePdf.pages[0]?.text).toBe(wasmPdf.pages[0]?.text);
  expect(nativePdf.pages[0]?.dimensions).toEqual(wasmPdf.pages[0]?.dimensions);
  expect(nativePdf.title).toBe("Backend");
  const nativeDoc = await PDFDocument.load(pdfBytes(native.pdf!));
  const wasmDoc = await PDFDocument.load(pdfBytes(wasm.pdf!));
  expect(nativeDoc.getAuthor()).toBe("Ada");
  expect(nativeDoc.getCreationDate()?.toISOString()).toBe("2026-10-13T12:34:56.000Z");
  expect(wasmDoc.getCreationDate()?.toISOString()).toBe(nativeDoc.getCreationDate()?.toISOString());
});

test("a process keeps the first backend and rejects a mismatched option", () => {
  const switched = lines(run(process.execPath, [harness, "blitz-pdf", "switch"]));
  expect(switched.error).toContain("already using the wasm backend");
  const mismatch = lines(run(process.execPath, [harness, "blitz-pdf", "reject", JSON.stringify({ backend: "native", wasm: "file:///tmp/blitz.pdf" })]));
  expect(mismatch.error).toContain("TypeError:wasm applies only when backend is wasm");
  const invalid = lines(run(process.execPath, [harness, "blitz-pdf", "reject", JSON.stringify({ backend: "gpu" })]));
  expect(invalid.error).toContain("TypeError:backend must be wasm or native");
  const missing = lines(run(process.execPath, [harness, "blitz-pdf", "reject", JSON.stringify({ backend: "native", native: "/tmp/blitz-pdf-missing.node" })]));
  expect(missing.error).toContain("No native blitz-pdf addon");
});

test("entry points select a default and can still choose the other node backend", () => {
  const nativeEntry = lines(run(process.execPath, [harness, "blitz-pdf/native", "render"]));
  expect(nativeEntry.version).toContain("backend/native");
  const nativeWasm = lines(run(process.execPath, [harness, "blitz-pdf/native", "render", "wasm"]));
  expect(nativeWasm.version).toContain("backend/wasm");
  const browser = lines(run(process.execPath, [harness, "blitz-pdf/browser", "reject", JSON.stringify({ backend: "native" })]));
  expect(browser.error).toContain("not available from this entry point");
});

test("node smoke covers the native backend", () => {
  const child = run("node", [fileURLToPath(new URL("./native-smoke.mjs", import.meta.url))]);
  expect(child.status, child.stderr).toBe(0);
  expect(child.stdout).toContain("backend/native");
});
