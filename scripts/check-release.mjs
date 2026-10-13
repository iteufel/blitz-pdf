import { appendFile, readFile } from "node:fs/promises";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const manifest = JSON.parse(await read("package.json"));
const lock = JSON.parse(await read("package-lock.json"));
const cargo = (await read("Cargo.toml")).split(/^\[/m).find(section => section.startsWith("package]"));
const cargoLock = (await read("Cargo.lock")).split("[[package]]").find(section => /^name = "blitz-pdf-wasm"$/m.test(section));
const versionOf = section => section?.match(/^version = "([^"]+)"$/m)?.[1];
const { name, version } = manifest;

if (name !== "blitz-pdf") throw new Error("The release package must be named blitz-pdf");
if (process.env.GITHUB_REF !== `refs/tags/v${version}`) {
  throw new Error(`Release from tag v${version}, matching package.json. Received ${process.env.GITHUB_REF ?? "no tag"}.`);
}
for (const [file, actual] of [
  ["package-lock.json", lock.version],
  ["package-lock.json root package", lock.packages?.[""]?.version],
  ["Cargo.toml", versionOf(cargo)],
  ["Cargo.lock", versionOf(cargoLock)],
]) {
  if (actual !== version) throw new Error(`${file} has version ${actual}; expected ${version}`);
}

const result = {
  version,
  tag: version.includes("-") ? "next" : "latest",
  filename: `${name}-${version}.tgz`,
};
if (process.env.GITHUB_OUTPUT) {
  await appendFile(process.env.GITHUB_OUTPUT, Object.entries(result).map(([key, value]) => `${key}=${value}\n`).join(""));
}
console.log(`Release ${name}@${version} to npm tag ${result.tag}`);
