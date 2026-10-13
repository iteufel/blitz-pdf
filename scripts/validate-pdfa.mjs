// Independently validate the actual PDFs inspected by the Bun regression suite.
import { spawnSync } from "node:child_process";
import { access, mkdir, mkdtemp, readdir, writeFile } from "node:fs/promises";
import { join, resolve, basename } from "node:path";
import { PDFDocument } from "pdf-lib";

const root = new URL("../", import.meta.url);
const output = resolve("output/pdfa-validation");
await mkdir(output, { recursive:true });
const capture = await mkdtemp(join(output, "run-"));
let validator = process.env.VERAPDF_BIN;
if (!validator) {
  const bundled = resolve(".cache/verapdf/verapdf");
  try { await access(bundled); validator = bundled; }
  catch { validator = "verapdf"; }
}
const version = spawnSync(validator, ["--version"], { encoding:"utf8" });
if (version.error || version.status !== 0) throw new Error("veraPDF is required. Run npm run setup:verapdf (requires Java), or set VERAPDF_BIN to its executable.");

const tests = (await readdir(new URL("../tests/", import.meta.url))).filter(name => name.endsWith(".test.ts")).sort().map(name => `tests/${name}`);
const run = spawnSync("bun", ["test", ...tests], { cwd:root, env:{ ...process.env, PDFA_CAPTURE_DIR:capture }, stdio:"inherit" });
if (run.error || run.status !== 0) throw new Error("Bun regression tests failed; PDF/A validation aborted");
const files = (await readdir(capture)).filter(name => name.endsWith(".pdf"));
if (!files.length) throw new Error("No test PDFs were captured");

// A negative control ensures that the validator is really checking conformance,
// rather than just accepting a syntactically valid PDF or returning exit code 0.
const plain = await PDFDocument.create();
plain.addPage().drawText("This is deliberately not PDF/A");
const controlName = "nonconformant-control.pdf";
const control = join(output, controlName);
await writeFile(control, await plain.save());
const validation = spawnSync(validator, ["--format", "json", "--flavour", "3u", capture, control], { encoding:"utf8", maxBuffer:64*1024*1024, timeout:120_000 });
if (validation.error) throw validation.error;
await writeFile(join(output, "report.json"), validation.stdout);
// Exit 1 is expected when our deliberate negative control is noncompliant.
// The per-file report, not the batch exit code, determines success below.
if (validation.status !== 0 && validation.status !== 1) throw new Error(`veraPDF exited ${validation.status}: ${validation.stderr}`);
const report = JSON.parse(validation.stdout).report;
const jobs = report?.jobs;
if (!Array.isArray(jobs) || jobs.length !== files.length + 1) throw new Error("veraPDF did not validate every input");
let controlRejected = false;
const failed = [];
let checks = 0;
for (const job of jobs) {
  const results = job.validationResult;
  const isControl = basename(job.itemDetails?.name ?? "") === controlName;
  if (!Array.isArray(results) || results.length !== 1) { failed.push(job.itemDetails?.name ?? "Unknown file"); continue; }
  const result = results[0];
  const profile = result.profileName === "PDF/A-3u validation profile";
  if (isControl) { controlRejected = profile && result.compliant === false && result.details.failedChecks > 0; continue; }
  if (!profile || result.compliant !== true || result.details.failedChecks !== 0 || result.jobEndStatus !== "normal") failed.push(job.itemDetails.name);
  checks += result.details.passedChecks ?? 0;
}
if (!controlRejected) throw new Error("veraPDF failed to reject the deliberately nonconformant control");
if (failed.length) throw new Error(`PDF/A-3u validation failed for ${failed.length} files. See output/pdfa-validation/report.json\n${failed.join("\n")}`);
const summary = { validator:version.stdout.trim(), profile:"PDF/A-3u", documents:files.length, passedChecks:checks, failedChecks:0, negativeControlRejected:controlRejected, captureDirectory:capture };
await writeFile(join(output, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
console.log(`veraPDF: ${files.length} PDFs conform to PDF/A-3u; ${checks} checks passed, 0 failed. Negative control rejected.`);
