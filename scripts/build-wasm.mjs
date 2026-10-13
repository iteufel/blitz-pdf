import { mkdir, readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const lock = await readFile(new URL("../Cargo.lock", import.meta.url), "utf8");
const version = lock.split("[[package]]").find(block => /name = "wasm-bindgen"/.test(block))?.match(/version = "([^"]+)"/)?.[1];
const cli = spawnSync("wasm-bindgen", ["--version"], { encoding: "utf8" });
if (!version || cli.status !== 0 || cli.stdout.trim() !== `wasm-bindgen ${version}`) {
  throw new Error(`Install the matching build tool: cargo install wasm-bindgen-cli --version ${version} --locked`);
}
function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
run("cargo", ["build", "--locked", "--release", "--target", "wasm32-unknown-unknown"]);
await mkdir(new URL("../wasm/", import.meta.url), { recursive: true });
run("wasm-bindgen", ["target/wasm32-unknown-unknown/release/blitz_pdf_wasm.wasm", "--target", "web", "--out-dir", "wasm", "--out-name", "blitz_pdf"]);
