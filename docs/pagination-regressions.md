# Pagination regressions in 0.1.2

The regressions are exercised through `renderPdf` in `tests/pagination.test.ts`.
Rebuild the WASM before running them.

## Final breaks and empty lines

```js
await renderPdf("<p>Text<br></p>", { format: "A4" });
```

With the pinned Blitz `e72650a` and Parley 0.12.0, instrumenting this layout
shows a paragraph height of 19 CSS pixels. Parley supplies two line ranges:
`[0, 19]` for `Text\n`, and `[19, 38]` with an empty text range and no positioned
items. Both have a finite, ordinary line height of 19 pixels.

Blitz's `packages/blitz-dom/src/layout/inline.rs` excludes that second line
from the block's height: it exists to position an editor cursor after a final
newline, not as another CSS line box. Pagination previously kept it. With the
default paragraph margins, the document ends inside this extra line; repeated
attempts to move the break backward eventually stop making progress. The old
error incorrectly classified this as a line taller than A4.

`css_lines` now uses the same terminal-line test as Blitz, including for
keep-with-next edges and widow/orphan counts. A real blank line has a newline in
its text range and remains in pagination with its measured line box. No text,
invisible anchor, or other character is inserted. Position assertions cover
multiple blank lines, table cells, and automatic/forced page boundaries.

## Height-limited tables

Use the following HTML in both a browser and `renderPdf(html, { format: "A4" })`:

```html
<style>
  .info { width: 75mm; max-height: 75mm; overflow: hidden; }
  .info table { width: 100%; border-collapse: collapse; }
  .info td {
    max-width: 0;
    word-break: break-all;
    overflow-wrap: break-word;
  }
</style>
<div class="info">
  <table>
    <tr><td>Text</td><td>Text</td></tr>
    <tr><td>Text</td><td>Text</td></tr>
    <tr><td>Text</td><td>Text</td></tr>
    <tr><td>Text</td><td>Text</td></tr>
    <tr><td>Text</td><td>Text</td></tr>
    <tr><td>Text</td><td>Text</td></tr>
  </table>
</div>
```

Measured in Chromium 154 on macOS, `getBoundingClientRect()` gives a table
width of about 283.46 pixels, cell widths of about 141.73 pixels and a total
height of 123 pixels. Changing `max-width` to `none` produces the same
dimensions for these equal cell contents.

Unpatched Blitz's final cell layout instead has width 2 pixels (zero content width plus
padding), height 78 pixels, and four 19-pixel lines for `Text`. Its table grid
adapts cells to grid items while retaining `max_size.width`; the inline layout
therefore receives a zero-width constraint.

The resulting tall table exceeds its container's height. Pagination previously
used line and row ranges beyond the overflow clip; the document end inside a
clipped line could cause the same misleading error as the first reproduction.
Pagination now clips those ranges to the visible padding box and intersects
glyph bounds with the scene's nested clips. PDF text emission uses the same
clip bounds to omit fully hidden runs. Regression coverage includes both
`max-width` values, nested `hidden`/`clip` containers and clipped oversized ink.

The subsequent [layout patch](layout-regressions.md) separates the intrinsic
width constraint from the final allocated column width. The zero-width case
now renders all twelve cells, and the test requires that content for both
`max-width` values. This fixes the reproduction without replacing the entire
table width algorithm.

## Diagnostic distinctions

`PAGINATION_LINE_TOO_TALL` requires a blocking line whose visible height exceeds
the available height. `PAGINATION_NO_PROGRESS` covers, for example, staggered
columns of overlapping 40-pixel lines on an 80-pixel page. A forced break through
a line has its own `PAGINATION_FORCED_BREAK_INTERSECTS_LINE` code. Tests assert
the element, page/line indexes, available height and line range, and verify that
rendering remains usable after an error.

The Argon asset-path issue is outside this change.
