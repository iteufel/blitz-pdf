import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
import { PDFDocument, PDFDict, PDFName, PDFRawStream } from "pdf-lib";
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

export async function inspect(bytes: Uint8Array) {
  // The independent conformance runner captures exactly the PDFs exercised by
  // these assertions, then sends all of them through veraPDF after the suite.
  if (process.env.PDFA_CAPTURE_DIR) {
    const hash = createHash("sha256").update(bytes).digest("hex");
    await writeFile(join(process.env.PDFA_CAPTURE_DIR, `${hash}.pdf`), bytes);
  }
  const structure = await PDFDocument.load(bytes);
  const objects = structure.context.enumerateIndirectObjects().map(([, object]) => object);
  const dicts = objects.map(object => object instanceof PDFRawStream ? object.dict : object).filter(object => object instanceof PDFDict);
  const images = dicts.filter(dict => dict.get(PDFName.of("Subtype"))?.toString() === "/Image");
  const embeddedFonts = dicts.filter(dict => dict.has(PDFName.of("FontFile2")) || dict.has(PDFName.of("FontFile3")));
  const unicodeMaps = dicts.filter(dict => dict.has(PDFName.of("ToUnicode")));
  const task = getDocument({ data: bytes.slice(), useSystemFonts: false });
  try {
    const pdf = await task.promise;
    const pages = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const text = await page.getTextContent({ disableNormalization: true });
      const operators = await page.getOperatorList();
      pages.push({
        text: text.items.map(item => "str" in item ? item.str + (item.hasEOL ? "\n" : "") : "").join(""),
        items: text.items.filter(item => "str" in item),
        hasText: operators.fnArray.includes(OPS.showText),
        hasPaths: operators.fnArray.includes(OPS.constructPath),
        imagePaints: operators.fnArray.filter(op => op === OPS.paintImageXObject || op === OPS.paintInlineImageXObject).length,
        dimensions: structure.getPage(n - 1).getSize(),
      });
    }
    return { pages, images, embeddedFonts, unicodeMaps, title: structure.getTitle() };
  } finally { await task.destroy(); }
}
