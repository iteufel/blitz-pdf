import { copyFile, mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { platformId } from "./native-platform.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
const library = process.platform === "win32" ? "target/release/blitz_pdf_wasm.dll"
  : process.platform === "darwin" ? "target/release/libblitz_pdf_wasm.dylib"
  : "target/release/libblitz_pdf_wasm.so";
run("cargo", ["build", "--locked", "--release", "--no-default-features", "--features", "napi"]);
const id = platformId();
const output = new URL(`../native/blitz_pdf.${id}.node`, import.meta.url);
await mkdir(new URL("../native/", import.meta.url), { recursive: true });
await copyFile(new URL(`../${library}`, import.meta.url), output);
console.log(`Native addon: native/blitz_pdf.${id}.node`);
