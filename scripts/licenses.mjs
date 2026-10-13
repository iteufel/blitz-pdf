import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const metadata = JSON.parse(execFileSync("cargo", ["metadata", "--locked", "--offline", "--format-version", "1"], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }));
const packages = metadata.packages.filter(pkg => pkg.name !== "blitz-pdf-wasm").sort((a,b) => `${a.name} ${a.version}`.localeCompare(`${b.name} ${b.version}`));
let output = "Rust dependency inventory and upstream license notices\nGenerated from Cargo.lock by scripts/licenses.mjs.\n\n";
const texts = new Map();
for (const pkg of packages) {
  output += `${pkg.name} ${pkg.version}\nLicense: ${pkg.license ?? "See upstream license"}\nSource: ${pkg.repository ?? pkg.source}\n\n`;
  let directory = dirname(pkg.manifest_path);
  for (let depth = 0; depth < 4; depth++, directory = dirname(directory)) {
    const names = (await readdir(directory)).filter(name => /^(LICENSE|COPYING|NOTICE)([-_.].*)?$/i.test(name));
    let found = false;
    for (const name of names) {
      let text;
      try { text = await readFile(join(directory, name), "utf8"); } catch { continue; }
      if (!text.trim()) continue;
      found = true;
      const key = createHash("sha256").update(text).digest("hex");
      const entry = texts.get(key) ?? { text, packages: new Set() };
      entry.packages.add(`${pkg.name} ${pkg.version} (${name})`);
      texts.set(key, entry);
    }
    if (found) break;
  }
}
for (const entry of texts.values()) output += `\n${"=".repeat(72)}\n${[...entry.packages].join("\n")}\n${"=".repeat(72)}\n\n${entry.text}\n`;
await writeFile(new URL("../licenses/RUST_DEPENDENCIES.txt", import.meta.url), output);
console.log(`Collected ${texts.size} license notices for ${packages.length} resolved dependencies.`);
