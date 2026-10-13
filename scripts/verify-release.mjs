import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { setTimeout } from "node:timers/promises";

const [archive, version, mode] = process.argv.slice(2);
if (!archive || !version || (mode && mode !== "--check")) {
  throw new Error("Usage: node scripts/verify-release.mjs <archive.tgz> <version> [--check]");
}
const checkOnly = mode === "--check";
const expected = `sha512-${createHash("sha512").update(await readFile(archive)).digest("base64")}`;
const url = new URL(`https://registry.npmjs.org/blitz-pdf/${encodeURIComponent(version)}`);
const deadline = Date.now() + 5 * 60_000;

// New versions can take minutes to appear. A unique query also avoids cached 404s.
for (let attempt = 1; Date.now() < deadline; attempt++) {
  url.searchParams.set("release-check", `${Date.now()}-${attempt}`);
  let response;
  try {
    response = await fetch(url, {
      headers: { "Cache-Control": "no-cache" },
      signal: AbortSignal.timeout(Math.max(1, Math.min(15_000, deadline - Date.now()))),
    });
  } catch (error) {
    if (checkOnly) throw error;
    console.warn(`npm metadata request ${attempt} failed: ${error.message}`);
  }
  if (response?.ok) {
    const published = await response.json();
    if (published.name !== "blitz-pdf" || published.version !== version || published.dist?.integrity !== expected) {
      throw new Error("The npm registry does not contain the exact archive built by this release");
    }
    console.log(`Verified blitz-pdf@${version} on npm; archive integrity matches.`);
    process.exit(0);
  }
  // Exit 3 means this version is absent, so the publish step may create it.
  // Authentication, registry, and integrity failures must never mean "absent".
  if (checkOnly && response.status === 404) process.exit(3);
  if (response && (checkOnly || (response.status !== 404 && response.status !== 429 && response.status < 500))) {
    throw new Error(`npm registry verification failed: HTTP ${response.status}`);
  }
  const remaining = deadline - Date.now();
  if (remaining > 0) {
    console.log(`Waiting for blitz-pdf@${version} to appear on npm (attempt ${attempt}).`);
    await setTimeout(Math.min(5_000, remaining));
  }
}
throw new Error(`blitz-pdf@${version} is not available on npm. Check the publish output and npm staging state.`);
