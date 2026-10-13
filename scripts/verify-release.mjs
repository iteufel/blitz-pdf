import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { setTimeout } from "node:timers/promises";

const [archive, version] = process.argv.slice(2);
if (!archive || !version) throw new Error("Usage: node scripts/verify-release.mjs <archive.tgz> <version>");
const expected = `sha512-${createHash("sha512").update(await readFile(archive)).digest("base64")}`;
const url = `https://registry.npmjs.org/blitz-pdf/${encodeURIComponent(version)}`;

// npm may briefly serve stale metadata after accepting a publication.
for (let attempt = 1; attempt <= 12; attempt++) {
  const response = await fetch(url, {
    headers: { "Cache-Control": "no-cache" },
    signal: AbortSignal.timeout(15_000),
  });
  if (response.ok) {
    const published = await response.json();
    if (published.name !== "blitz-pdf" || published.version !== version || published.dist?.integrity !== expected) {
      throw new Error("The npm registry does not contain the exact archive built by this release");
    }
    console.log(`Verified blitz-pdf@${version} on npm; archive integrity matches.`);
    process.exit(0);
  }
  if (response.status !== 404 && response.status !== 429 && response.status < 500) {
    throw new Error(`npm registry verification failed: HTTP ${response.status}`);
  }
  if (attempt < 12) await setTimeout(5_000);
}
throw new Error(`blitz-pdf@${version} is not available on npm. Check the publish output and npm staging state.`);
