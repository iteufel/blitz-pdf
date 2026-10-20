import { readFileSync } from "node:fs";
import { arch, platform } from "node:os";

/** Keep this in sync with src/platform.ts. */
export function isMusl() {
  if (platform() !== "linux") return false;
  try {
    const report = process.report?.getReport?.();
    if (report?.header && "glibcVersionRuntime" in report.header) return !report.header.glibcVersionRuntime;
  } catch { /* Bun may not implement process.report. */ }
  try { return readFileSync("/usr/bin/ldd", "utf8").includes("musl"); }
  catch { return false; }
}

/** Addon filename suffix, for example `linux-x64-gnu`. */
export function platformId() {
  const architecture = arch();
  if (platform() === "linux") return `linux-${architecture}-${isMusl() ? "musl" : "gnu"}`;
  if (platform() === "darwin") return `darwin-${architecture}`;
  if (platform() === "win32") return `win32-${architecture}-msvc`;
  return `${platform()}-${architecture}`;
}
