# Report margins and spacing

`tests/layout.test.ts` exercises the public `renderPdf` API against rebuilt
WASM. The underlying changes are in the vendored Blitz DOM crate; their
upstream revision and modified files are listed in `vendor/README.md`.

## Fractional geometry

Blitz normally rounds layout boxes to integer screen pixels. PDF physical
lengths need fractional coordinates: a 25 mm offset is about 94.488 CSS pixels,
not 94. Truncating the content viewport also moves right-aligned and
percentage-sized content. Body layout and header/footer templates now use the
exact CSS viewport and preserve box coordinates through painting and pagination.
Tests allow Stylo's 1/60-pixel length quantization.

## Table line heights and empty paragraphs

The root text style of an inline formatting context must use baseline
alignment. A table cell's `vertical-align: middle` belongs to placement inside
the row; passing it to the text builder inflated the cell's own lines too.
Tests compare ordinary blocks with cells containing small labels, values, and
trailing breaks, and retain descendant superscript and cell alignment coverage.

An empty paragraph containing a span must allow margins to collapse through it.
The previous empty-text shortcut reported a non-collapsible box, adding an
extra paragraph margin. It also bypassed explicit heights. Empty inline
contexts now follow normal sizing and collapse calculations; explicit
height, min-height, padding, borders, and real blank lines remain effective.

## Table widths and generated wrappers

The report's information table uses `max-width: 0` on its cells. That constraint
affects intrinsic measurement, while the final cells must fill their allocated
columns. Previously it also clamped the final content width to zero, producing
character-by-character wrapping. Tests cover auto/fixed tables and both inline
and block cell contents, including the full text of height-limited tables.

The report body uses `display: table` with ordinary headings, paragraphs, and
nested tables as children. These require anonymous rows and cells under
[CSS 2.1 section 17.2.1](https://www.w3.org/TR/CSS2/tables.html#anonymous-boxes).
Blitz previously discarded those children. Layout construction now wraps
consecutive improper children while preserving the author's DOM for selectors.
Tests compare implicit and explicit wrappers, whitespace, hidden siblings,
row inheritance, CSS page-size changes, and pagination with nested content.

## Project reproduction

The original offer template was expanded with its project's template compiler,
synthetic offer data, the unmodified DIN stylesheet, and the project's Noto Sans
font files. The report configuration defaults to `style_din5008`; its export
call passes `styleFile`, `fontFamily`, and A4 options, without `styleOverwrite`.
The stylesheet supplies the 27 mm top and 41 mm bottom page margins.

The resulting one-page report was rendered with Poppler and inspected, including
the address block, information table, greeting, line item, totals, and footer
text. Chromium DOM measurements verified column distribution and margin
behavior with the same HTML. Against the supplied Chromium PDF, the six shared
information-table labels have the same 21 pt baseline interval; their absolute
baselines differ by 0.118 pt. The delivery heading and greeting differ by
0.137 pt and 0.125 pt respectively, and the body left edge by 0.003 pt.

The supplied business PDFs contain different
data, and normal font metrics can vary across Chromium platforms; this is
coverage of the project template and layout regressions, not a pixel-equality
claim for different documents.
