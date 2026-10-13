import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";

function checkRelease({ version = "0.1.0", ref = `refs/tags/v${version}`, drift = "" } = {}) {
  const root = mkdtempSync(join(tmpdir(), "blitz-pdf-release-"));
  const output = join(root, "outputs");
  const storedVersion = (file: string) => drift === file ? "9.9.9" : version;
  try {
    mkdirSync(join(root, "scripts"));
    copyFileSync(new URL("../scripts/check-release.mjs", import.meta.url), join(root, "scripts/check-release.mjs"));
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "blitz-pdf", version }));
    writeFileSync(join(root, "package-lock.json"), JSON.stringify({
      version: storedVersion("package-lock.json"),
      packages: { "": { version: storedVersion("package-lock.json root package") } },
    }));
    writeFileSync(join(root, "Cargo.toml"), `[package]\nname = "blitz-pdf-wasm"\nversion = "${storedVersion("Cargo.toml")}"\n\n[dependencies]\n`);
    writeFileSync(join(root, "Cargo.lock"), `version = 4\n\n[[package]]\nname = "another-crate"\nversion = "9.9.9"\n\n[[package]]\nname = "blitz-pdf-wasm"\nversion = "${storedVersion("Cargo.lock")}"\n`);
    const result = spawnSync("node", [join(root, "scripts/check-release.mjs")], {
      encoding: "utf8", env: { ...process.env, GITHUB_REF: ref, GITHUB_OUTPUT: output },
    });
    return { ...result, outputs: existsSync(output) ? readFileSync(output, "utf8") : "" };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe("release validation", () => {
  test("publishes a matching stable tag to latest", () => {
    const result = checkRelease();
    expect(result.status).toBe(0);
    expect(result.outputs).toBe("version=0.1.0\ntag=latest\nfilename=blitz-pdf-0.1.0.tgz\n");
  });

  test("keeps prereleases off latest", () => {
    const result = checkRelease({ version: "0.2.0-beta.1" });
    expect(result.status).toBe(0);
    expect(result.outputs).toContain("tag=next\n");
  });

  for (const ref of ["refs/heads/main", "refs/tags/v0.2.0"]) {
    test(`rejects a release from ${ref}`, () => {
      const result = checkRelease({ ref });
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("Release from tag v0.1.0");
      expect(result.outputs).toBe("");
    });
  }

  for (const drift of ["package-lock.json", "package-lock.json root package", "Cargo.toml", "Cargo.lock"]) {
    test(`rejects version drift in ${drift}`, () => {
      const result = checkRelease({ drift });
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(`${drift} has version 9.9.9`);
      expect(result.outputs).toBe("");
    });
  }
});

describe("published archive verification", () => {
  for (const matches of [true, false]) {
    test(matches ? "accepts the exact published archive" : "rejects a different published archive", () => {
      const root = mkdtempSync(join(tmpdir(), "blitz-pdf-registry-"));
      try {
        const archive = join(root, "package.tgz");
        const preload = join(root, "registry.mjs");
        const content = Buffer.from("test release archive");
        writeFileSync(archive, content);
        const integrity = `sha512-${createHash("sha512").update(matches ? content : Buffer.from("different archive")).digest("base64")}`;
        writeFileSync(preload, `globalThis.fetch = async (url) => {
          if (url !== "https://registry.npmjs.org/blitz-pdf/0.1.0") throw new Error("Unexpected registry URL");
          return new Response(JSON.stringify(${JSON.stringify({ name: "blitz-pdf", version: "0.1.0", dist: { integrity } })}), { status: 200 });
        };`);
        const result = spawnSync("node", ["--import", preload, new URL("../scripts/verify-release.mjs", import.meta.url).pathname, archive, "0.1.0"], { encoding: "utf8" });
        if (matches) {
          expect(result.status).toBe(0);
          expect(result.stdout).toContain("archive integrity matches");
        } else {
          expect(result.status).not.toBe(0);
          expect(result.stderr).toContain("does not contain the exact archive");
        }
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });
  }
});
