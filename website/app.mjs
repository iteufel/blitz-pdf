import { getDocument, GlobalWorkerOptions } from "./vendor/pdfjs/pdf.min.mjs";
import { convertInWorker, MAX_HTML_BYTES, pdfFilename } from "./converter.mjs";
import { defaultExampleOptions, examples } from "./examples.mjs";

GlobalWorkerOptions.workerSrc = new URL("./vendor/pdfjs/pdf.worker.min.mjs", import.meta.url).href;
const $ = (id) => document.getElementById(id);
const editor = $("html");
const download = $("download");
const canvas = $("pdf-canvas");
const surface = $("preview-surface");
let pdf, pdfTask, pdfUrl, job, renderTask;
let revision = 0, pageNumber = 1, pageRender = 0;
let edited = false, selection = "ticket", pendingReplacement;

function showError(message) {
  $("error").textContent = message;
  $("error").hidden = !message;
}

function setBadge(text, state = "") {
  $("preview-badge").textContent = text;
  $("preview-badge").className = `badge ${state}`;
}

function setBusy(busy) {
  $("convert").disabled = busy;
  $("convert").querySelector("span").textContent = busy ? "Generating…" : "Generate PDF";
  $("cancel").hidden = !busy;
  $("preview-title").setAttribute("aria-busy", String(busy));
}

function disableDownload() {
  download.removeAttribute("href");
  download.setAttribute("aria-disabled", "true");
  download.tabIndex = -1;
}

function invalidate() {
  revision++;
  if (job) { job.cancel(); job = undefined; }
  setBusy(false);
  disableDownload();
  showError("");
  setBadge(pdf ? "Changes pending" : "Not generated", pdf ? "stale" : "");
  $("status").textContent = "Generate a PDF to apply your changes.";
}

function updateEditor() {
  // Capped to keep the gutter small even for unusually large pasted files.
  const count = Math.min(editor.value.split("\n").length, 10_000);
  $("lines").textContent = Array.from({ length: count }, (_, i) => i + 1).join("\n");
  $("lines").scrollTop = editor.scrollTop;
  $("source-size").textContent = `${editor.value.length.toLocaleString()} characters`;
}

function replaceSource(html, name, example) {
  invalidate();
  editor.value = html;
  editor.scrollTop = 0;
  $("filename").value = name;
  selection = example;
  $("example").value = example;
  edited = false;
  updateEditor();
}

function loadExample(key) {
  const example = examples[key];
  const options = { ...defaultExampleOptions, ...example.options };
  $("format").value = options.format ?? "css";
  $("orientation").value = options.landscape ? "landscape" : "portrait";
  $("margin").value = options.margin;
  $("page-numbers").checked = options.pageNumbers;
  $("css-page").checked = options.preferCSSPageSize;
  syncPageSizeControls();
  replaceSource(example.html, example.name, key);
}

function syncPageSizeControls() {
  const fromCSS = $("format").value === "css";
  if (fromCSS) $("css-page").checked = true;
  $("css-page").disabled = fromCSS;
  $("orientation").disabled = fromCSS;
}

function confirmReplacement(action, description) {
  if (!edited) { action(); return; }
  pendingReplacement = action;
  $("replace-message").textContent = `Replace your edited source with ${description}?`;
  $("replace-confirm").hidden = false;
  $("replace-accept").focus();
}

function clearReplacement() {
  pendingReplacement = undefined;
  $("replace-confirm").hidden = true;
}

async function renderPage() {
  const current = ++pageRender;
  renderTask?.cancel();
  if (!pdf) return;
  $("previous").disabled = pageNumber <= 1;
  $("next").disabled = pageNumber >= pdf.numPages;
  $("page-position").textContent = `${pageNumber} / ${pdf.numPages}`;
  try {
    const page = await pdf.getPage(pageNumber);
    if (current !== pageRender) return;
    const natural = page.getViewport({ scale: 1 });
    const padding = parseFloat(getComputedStyle(surface).paddingLeft) * 2;
    const scale = $("zoom").value === "fit" ? Math.max(.1, (surface.clientWidth - padding - 2) / natural.width) : Number($("zoom").value);
    const viewport = page.getViewport({ scale });
    const density = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(12_000_000 / (viewport.width * viewport.height)));
    canvas.width = Math.floor(viewport.width * density);
    canvas.height = Math.floor(viewport.height * density);
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;
    canvas.setAttribute("aria-label", `PDF preview, page ${pageNumber} of ${pdf.numPages}. Download the PDF for selectable text.`);
    canvas.hidden = false;
    $("placeholder").hidden = true;
    renderTask = page.render({ canvasContext: canvas.getContext("2d"), viewport, transform: [density, 0, 0, density, 0, 0] });
    await renderTask.promise;
  } catch (error) {
    if (current !== pageRender || error.name === "RenderingCancelledException") return;
    showError("The PDF was created, but its preview could not be displayed. You can still download it.");
  }
}

async function generate() {
  if (job) return;
  showError("");
  disableDownload();
  const version = revision;
  const started = performance.now();
  let currentJob, loadingTask;
  try {
    currentJob = convertInWorker(editor.value, {
      format: $("format").value === "css" ? undefined : $("format").value,
      landscape: $("orientation").value === "landscape",
      margin: $("margin").value,
      pageNumbers: $("page-numbers").checked,
      preferCSSPageSize: $("css-page").checked,
      title: pdfFilename($("filename").value).replace(/\.pdf$/, ""),
    });
    job = currentJob;
    setBusy(true);
    setBadge("Generating", "busy");
    $("status").textContent = "Rendering locally… The first conversion loads the PDF engine.";
    const bytes = await currentJob.promise;
    if (version !== revision || job !== currentJob) return;
    const size = bytes.byteLength;
    const blob = new Blob([bytes], { type: "application/pdf" });
    loadingTask = getDocument({
      data: bytes,
      isEvalSupported: false,
      cMapUrl: new URL("./vendor/pdfjs/cmaps/", import.meta.url).href,
      cMapPacked: true,
      standardFontDataUrl: new URL("./vendor/pdfjs/standard_fonts/", import.meta.url).href,
      wasmUrl: new URL("./vendor/pdfjs/wasm/", import.meta.url).href,
    });
    const nextPdf = await loadingTask.promise;
    if (version !== revision || job !== currentJob) { await loadingTask.destroy(); return; }
    pageRender++;
    renderTask?.cancel();
    const previousTask = pdfTask;
    pdfTask = loadingTask;
    pdf = nextPdf;
    // PDF.js 6 releases documents through their loading task.
    void previousTask?.destroy();
    pageNumber = 1;
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    pdfUrl = URL.createObjectURL(blob);
    download.href = pdfUrl;
    download.download = pdfFilename($("filename").value);
    download.setAttribute("aria-disabled", "false");
    download.removeAttribute("tabindex");
    $("pdf-info").textContent = `${pdf.numPages} ${pdf.numPages === 1 ? "page" : "pages"} · ${size < 1024 * 1024 ? `${Math.max(1, Math.round(size / 1024))} KB` : `${(size / 1024 / 1024).toFixed(1)} MB`}`;
    setBadge("Ready", "ready");
    $("status").textContent = `PDF ready in ${((performance.now() - started) / 1000).toFixed(1)}s. Your document stayed in this browser.`;
    surface.scrollTop = 0;
    await renderPage();
  } catch (error) {
    if (version !== revision || (currentJob && job !== currentJob)) return;
    await loadingTask?.destroy();
    setBadge(pdf ? "Previous PDF" : "Not generated", "stale");
    if (error.name !== "AbortError") showError(error.message || "Something went wrong. Please try again.");
    $("status").textContent = "Could not generate this document. Check the source and try again.";
  } finally {
    if (job === currentJob) { job = undefined; setBusy(false); }
  }
}

async function openFile(file) {
  if (!file) return;
  try {
    if (!/\.html?$/i.test(file.name)) throw new Error("Choose an HTML file ending in .html or .htm.");
    if (file.size > MAX_HTML_BYTES) throw new Error("This HTML file is too large. Choose one smaller than 2 MiB.");
    const html = await file.text();
    confirmReplacement(() => replaceSource(html, file.name.replace(/\.html?$/i, ""), ""), `“${file.name}”`);
  } catch (error) { showError(error.message); }
}

$("settings").addEventListener("submit", (event) => { event.preventDefault(); void generate(); });
$("settings").addEventListener("input", invalidate);
$("format").addEventListener("change", () => {
  $("css-page").checked = $("format").value === "css";
  syncPageSizeControls();
});
for (const id of ["page-numbers", "css-page"]) $(id).addEventListener("change", invalidate);
editor.addEventListener("input", () => {
  edited = true;
  selection = "";
  $("example").value = "";
  clearReplacement();
  invalidate();
  updateEditor();
});
editor.addEventListener("scroll", () => { $("lines").scrollTop = editor.scrollTop; });
document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") { event.preventDefault(); void generate(); }
  if (event.key === "Escape" && job) $("cancel").click();
});
if (!/Mac|iPhone|iPad/.test(navigator.platform)) $("convert").querySelector("kbd").textContent = "Ctrl ↵";
$("cancel").addEventListener("click", () => { invalidate(); $("status").textContent = "Conversion cancelled. You can edit or try again."; });
$("example").addEventListener("change", (event) => {
  const key = event.target.value;
  $("example").value = selection;
  if (!examples[key]) return;
  confirmReplacement(() => { clearReplacement(); loadExample(key); void generate(); }, "the selected example and its page settings");
});
$("replace-accept").addEventListener("click", () => { const action = pendingReplacement; clearReplacement(); action?.(); });
$("replace-cancel").addEventListener("click", () => { clearReplacement(); editor.focus(); });
$("upload").addEventListener("click", () => $("file").click());
$("file").addEventListener("change", () => { void openFile($("file").files[0]); $("file").value = ""; });
let dragDepth = 0;
const dropzone = $("dropzone");
dropzone.addEventListener("dragenter", (event) => { event.preventDefault(); dragDepth++; dropzone.classList.add("dragging"); });
dropzone.addEventListener("dragover", (event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; });
dropzone.addEventListener("dragleave", () => { if (--dragDepth <= 0) dropzone.classList.remove("dragging"); });
dropzone.addEventListener("drop", (event) => {
  event.preventDefault(); dragDepth = 0; dropzone.classList.remove("dragging");
  if (event.dataTransfer.files.length !== 1) { showError("Drop one HTML file at a time."); return; }
  void openFile(event.dataTransfer.files[0]);
});
// Do not let a missed drop navigate away and lose the document.
for (const type of ["dragover", "drop"]) window.addEventListener(type, (event) => { if (event.dataTransfer.types.includes("Files")) event.preventDefault(); });
$("previous").addEventListener("click", () => { if (pdf && pageNumber > 1) { pageNumber--; surface.scrollTop = 0; void renderPage(); } });
$("next").addEventListener("click", () => { if (pdf && pageNumber < pdf.numPages) { pageNumber++; surface.scrollTop = 0; void renderPage(); } });
$("zoom").addEventListener("change", () => { void renderPage(); });
let resizeTimer;
new ResizeObserver(() => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { if (pdf && $("zoom").value === "fit") void renderPage(); }, 150); }).observe(surface);
window.addEventListener("pagehide", () => { job?.cancel(); if (pdfUrl) URL.revokeObjectURL(pdfUrl); });
window.addEventListener("pageshow", (event) => { if (event.persisted) { invalidate(); void generate(); } });
loadExample("ticket");
void generate();
