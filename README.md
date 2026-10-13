<img src="assets/icon.svg" width="64" height="64" alt="">

# blitz-pdf

HTML and CSS to **vector PDF/A-3u**, powered by [Blitz](https://github.com/DioxusLabs/blitz)
and [Krilla](https://github.com/LaurenzV/krilla), compiled to WebAssembly.

Runs in **Bun, Node.js, and browsers**. Text is selectable and searchable, fonts
are subsetted and embedded, and shapes remain vectors. No Chromium, GPU, native
addon, or rendering service. Source images remain images.

This is an early implementation; see the limitations below.

## Install

```sh
npm install blitz-pdf
# or
bun add blitz-pdf
```

## Node.js and Bun

```js
import { renderPdf } from "blitz-pdf";

const pdf = await renderPdf(`
  <style>body { font-family: sans-serif } h1 { color: #2457db }</style>
  <h1>Hello, PDF</h1>
  <p>Selectable text: café, office, €.</p>
`, { format: "A4", margin: "15mm", title: "Example" });

// Node.js
await (await import("node:fs/promises")).writeFile("example.pdf", pdf);

// Bun
// await Bun.write("example.pdf", pdf);
```

The first render loads the bundled WASM automatically. The npm package includes
JavaScript, TypeScript declarations, and the WASM containing the fonts. Consumers
do not need Rust. The package is ESM, targeting Node.js 20+ and modern Bun.

## Browser

```js
import { renderPdf } from "blitz-pdf/browser";

const bytes = await renderPdf("<h1>Made in the browser</h1>");
const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
const link = document.createElement("a");
link.href = url;
link.download = "example.pdf";
link.click();
// Revoke the URL when it is no longer needed.
```

Bundlers should copy the WASM referenced through `new URL(..., import.meta.url)`.
For a custom deployment, set its location before the first render:

```js
import { init, renderPdf } from "blitz-pdf/browser";
await init({ wasm: new URL("/assets/blitz_pdf_bg.wasm", location.href) });
const pdf = await renderPdf("<p>Ready</p>");
```

The binary is exported as `blitz-pdf/wasm`. Serve it with
`Content-Type: application/wasm`. `init` also accepts bytes, a `Response`, or a
compiled `WebAssembly.Module`. Concurrent callers share initialization; failed
loads can be retried.

Asset I/O is asynchronous. HTML layout and PDF serialization perform synchronous
CPU work. Use a Web Worker or server worker thread when the calling thread must
stay responsive. Each worker gets its own WASM instance. Shared memory and
cross-origin isolation are not required.

## Options

`renderPdf(html: string, options?: PdfOptions): Promise<Uint8Array>`

| Option | Default | Meaning |
| --- | --- | --- |
| `format` | `"A4"` | `A3`, `A4`, `A5`, `Letter`, `Legal`, or `Tabloid` |
| `width`, `height` | From format | Supply both for custom dimensions; omit `format` |
| `landscape` | `false` | Swap width and height |
| `margin` | `0` | One length or `{ top, right, bottom, left }`; omitted sides are zero |
| `media` | `"print"` | CSS media queries: `print` or `screen` |
| `title` | Unset | PDF metadata title |
| `pageNumbers` | `false` | `true` or `{ template, align, fontSize }` for an automatic text footer |
| `baseUrl` | `https://blitz-pdf.invalid/` | Resolve relative asset URLs |
| `assets` | `{}` | Resource map or `(url) => data / Promise<data>`; data is a UTF-8 string, `Uint8Array`, or `ArrayBuffer` |
| `fonts` | `[]` | Additional static TTF, OTF, WOFF, or WOFF2 font bytes |
| `maxPages` | `100` | Reject larger documents; maximum 1000 |

Lengths accept numbers in CSS pixels (96 px = 1 inch), or strings with `px`,
`pt`, `mm`, `cm`, or `in`. PDF dimensions use 72 points per inch. Page dimensions
are limited to 19200 CSS pixels; margins must leave printable content.
`getEngineVersion()` returns the package version and pinned Blitz revision.

## Resources and fonts

The renderer requests resources through `assets` or decodes data URLs. Supply an
asset map or a loading function; network and file access are controlled by your
function. Missing resources fail with an error.
Linked CSS, nested imports, images, and `@font-face` use the same resolver.

```js
const pdf = await renderPdf(`
  <link rel="stylesheet" href="invoice.css">
  <img src="logo.png" width="80">
  <h1>Invoice</h1>
`, {
  baseUrl: "https://example.com/documents/",
  assets: {
    "invoice.css": "h1 { color: navy }",
    "logo.png": new Uint8Array(await (await fetch("/logo.png")).arrayBuffer()),
  },
});
```

For dynamic loading, `assets` can be an async function in Bun, Node, browsers,
and workers:

```js
const pdf = await renderPdf(`
  <link rel="stylesheet" href="invoice.css">
  <img src="logo.png" width="80">
  <h1>Invoice</h1>
`, {
  baseUrl: "https://example.com/documents/",
  assets: async (url) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status} loading ${url}`);
    return response.arrayBuffer();
  },
});
```

The callback receives an **absolute URL string**, resolved against the document
or referring stylesheet. Return UTF-8 text, a `Uint8Array` (including a Node/Bun
`Buffer`), or an `ArrayBuffer`; synchronous returns also work. For filesystem
assets, use a `file:` base URL and return `readFile(new URL(url))` in your callback.
`AssetData`, `AssetMap`, and `AssetResolver` are exported TypeScript types.

Blitz discovers resources as it parses and lays out the document, including
nested CSS imports, font faces, and CSS background images. Loading completes
before pagination and PDF serialization. Each absolute URL is loaded once per
render and cached for that render; data URLs bypass the callback. Up to eight
independent callbacks run concurrently. Concurrent renders have separate caches.
Browser callbacks follow the browser's normal CORS rules.

Returning `null` or `undefined` rejects the render as a missing asset. A thrown
error or rejected promise includes the resource URL and preserves the original
error as `cause`. Invalid return types and assets exceeding the combined 64 MiB
limit also reject. Already-running callbacks may finish after another callback
fails; their results are discarded. Apply fetch timeouts in your loader when
needed. The existing asset-map API continues to work.

DejaVu Sans regular, bold, italic, and bold italic are bundled; DejaVu Sans Mono
backs `monospace`. Other generic families fall back to DejaVu Sans. There is no
system font discovery. Fonts passed in `fonts` use their internal family names;
use `@font-face` with an asset URL for a CSS alias. Supply fonts for scripts not
covered by the bundled family.

Input limits: 16 MiB HTML, 64 MiB supplied assets, 32 MiB supplied fonts, and 1024
resource requests. These are practical limits, not a complete sandbox; isolate
untrusted documents in a terminable worker with application limits.

## PDF/A-3 conformance

Every successful render targets **PDF/A-3u (ISO 19005-3, level U)**. The PDF 1.7
output includes embedded fonts and Unicode mappings, an sRGB ICC output intent,
device-independent colors, PDF/A identification in XMP, document IDs, and a UTC
creation timestamp. Text remains selectable; no page or text rasterization is
used. Transparency and source images remain supported.

Krilla's archival validator runs during serialization. Nonconforming inputs,
such as a missing glyph or a font with restricted embedding permissions, fail
the render instead of producing a mislabeled file. Use fonts licensed for
embedding. Level U does not require a structure tree; tagged PDF/A-3a is not
implemented.

The independent conformance test captures PDFs from the Bun integration suite
and validates each with [veraPDF](https://docs.verapdf.org/cli/validation/).
It also requires a deliberately nonconforming control PDF to fail validation.

```sh
# Development/CI only; Java 21 and unzip are required for installation.
npm run setup:verapdf
npm run test:pdfa
# Or use an existing installation:
VERAPDF_BIN=/path/to/verapdf npm run test:pdfa
```

The installer pins veraPDF 1.30.3 and verifies its SHA-256 checksum. Reports and
captured PDFs are saved under `output/pdfa-validation/`. Java and veraPDF are
not runtime dependencies of the npm package.

## Page breaks

Pagination uses the printable area after `margin`. Supported controls in normal
vertical flow include:

- `break-before` / `break-after`: `page`, `always`, `avoid`, `avoid-page`,
  `left`, `right`, `recto`, and `verso`.
- `break-inside: avoid` / `avoid-page`, plus legacy `page-break-before`,
  `page-break-after`, and `page-break-inside` aliases.
- Inherited `widows` and `orphans` (positive integers; default 2).
- Automatic protection of text lines, table rows, images, and SVG boxes.

```html
<style>
  h2 { break-after: avoid; }
  .chapter { break-before: page; }
  .card { break-inside: avoid; }
  p { widows: 3; orphans: 3; }
</style>
```

Selectors, external stylesheets, print/screen queries, variables, specificity,
and `!important` use Stylo's real cascade. Adjacent forced breaks coalesce;
first/last break rules do not add accidental blank pages. Left/right/recto/verso
may intentionally insert a blank page, respecting the document's direction.
All pages, including intentional blanks, count toward `maxPages`.

Forced breaks take precedence over keep-together rules. Blocks larger than a
page are allowed to fragment, and impossible widow/orphan constraints are
relaxed to make progress. A text line that cannot fit the printable height
fails explicitly. Keep-with-next protects a heading even when the following
paragraph spans multiple pages.

### Page numbers

```js
const pdf = await renderPdf(html, {
  format: "A4",
  margin: "17mm",
  pageNumbers: {
    template: "RE-2026-1042 · Seite {page} von {pages}",
    align: "right",
    fontSize: "8pt",
  },
});
```

`pageNumbers: true` defaults to `"{page} / {pages}"`, right alignment, and
12 CSS pixels (9pt). The template is a single line containing `{page}` and
optionally `{pages}`. Alignment accepts `left`, `center`, or `right`; font size
accepts the usual lengths, from 1 to 48 CSS pixels. A template that does not
fit the page width fails explicitly.

The renderer reserves a footer band of `2 × fontSize + 8px` above the bottom
margin **before pagination**. Numbers use the final page count, including
intentional blanks. The footer uses embedded DejaVu Sans and the same Unicode
shaping as body text, preserving selectable text and PDF/A-3u. It works with
async assets in every runtime. `PageNumberOptions` is an exported TypeScript type.

## German invoice example

```sh
npm run example:german-invoice
# Or run the same generator using Bun:
bun examples/german-invoice.mjs
```

Creates `output/pdf/german-invoice.pdf`: three A4 pages, 24 itemized services,
German dates and currency, supplier/customer details, invoice and order numbers,
a service period, a 3% project discount, 19% VAT, payment details, and automatic
“Seite X von Y” footers. The final amount is **25.631,23 EUR**. Calculations use
integer cents and half-up rounding. The stylesheet loads through the async
`assets` callback. The generator also writes the HTML/CSS and calculated totals
alongside the PDF for inspection.

The [example source and scope](examples/german-invoice/README.md) explain the
fictitious data and the German invoice fields. This is a **PDF/A-3u example
without embedded XML**, as opposed to a structured e-invoice. Its 2026 domestic
B2B scenario assumes the recipient agrees to PDF delivery under the applicable
transition rule. [§ 14 UStG](https://www.gesetze-im-internet.de/ustg_1980/__14.html),
[§ 27(38) UStG](https://www.gesetze-im-internet.de/ustg_1980/__27.html).

## Current limits

- CSS support follows Blitz, whose coverage is evolving.
- Text retains shaped glyphs and Unicode cluster mappings, including ligatures.
  Unrecognized or ambiguous text runs are rejected rather than assigned guessed
  Unicode.
- Pagination fragments one continuous vertical layout. CSS `@page`, repeated
  table/fixed headers, nested multicolumn fragmentation, and independent
  fragmentation of parallel flex/grid flows are not implemented. Oversized
  boxes/images may span pages; box decorations are sliced rather than cloned.
- CSS filters, blurred shadows, non-default variable font instances, and
  repeating radial gradients are rejected. Use static font faces. There is no
  automatic raster fallback.
- Gradients become sRGB PDF shadings; advanced CSS interpolation spaces may
  differ. SVG shapes stay vector; upstream SVG text may become vector outlines.
- Scripts are not executed. Interactive forms, link annotations, accessibility
  tags, encryption, and signatures are not generated.

## Development

Install Node.js 22.13+ for development tooling, Bun, and rustup. The repository
pins Rust 1.99.0 and its WASM target in `rust-toolchain.toml`.

```sh
npm ci
cargo install wasm-bindgen-cli --version 0.2.129 --locked
npm run build
bun test
npm run test:node
npm run example:node
# or: bun run example:bun
npm pack
```

The wasm-bindgen CLI version must match `Cargo.lock`. Dependencies and upstream
commits are locked. `npm pack` verifies artifacts and renders a PDF before making
the tarball; it does not publish. Install locally using
`npm install ./blitz-pdf-0.1.0.tgz`.

The pinned Stylo source in `vendor/stylo` enables paged-media properties in the
Servo build; `vendor/README.md` records the small patch. Its MPL-2.0 source is
included in the npm archive.

`bun test` exercises the compiled module through its public package export. Tests
extract Unicode with PDF.js and inspect embedded fonts, vector paths, absence
of page images, dimensions, pagination, assets, media queries, and error recovery.
For browser verification, run `npm run test:browser` and open
`http://127.0.0.1:4173`. CI builds WASM, runs Bun and Node tests, validates the
captured PDFs with veraPDF, benchmarks, and packs an npm artifact.

## Publishing releases

Push a tag matching the package version, such as `v0.1.1`, to start
[Publish to npm](https://github.com/iteufel/blitz-pdf/actions/workflows/publish.yml).
The workflow checks that the tag, npm manifests, and root Rust package versions
agree. It then builds WASM from source, runs the Bun and Node tests, validates
PDF/A-3u with veraPDF, runs benchmarks, and publishes the verified archive.
Release builds do not restore dependency or compiler caches.

Publishing uses [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/)
with GitHub OIDC and provenance. The npm trust must permit direct publishing from
`iteufel/blitz-pdf`, workflow `publish.yml`, with no environment restriction.
No `NPM_TOKEN` repository secret is needed. Stable versions use the npm `latest`
tag; prereleases use `next`. After publishing, the workflow checks that npm serves
the exact archive it built, comparing SHA-512 integrity.

For the next patch release:

1. Run `npm version patch --no-git-tag-version` to update both npm manifests.
2. Set the same version in `Cargo.toml` and the `blitz-pdf-wasm` entry in
   `Cargo.lock`.
3. Commit the changes, create the matching Git tag, and push both:

```sh
git add package.json package-lock.json Cargo.toml Cargo.lock
git commit -m "chore: release 0.1.1"
git tag v0.1.1
git push origin main v0.1.1
```

To retry a failed release, rerun its GitHub Actions run or use
`gh workflow run publish.yml --ref v0.1.1`. Manual runs require a matching version
tag too. Published npm versions cannot be overwritten; subsequent releases need
a new version.

## Performance benchmarks

```sh
bun run bench
bun run bench --iterations=50 --warmup=5
bun run bench --iterations=50 --warmup=5 --json > benchmark-results.json
```

Benchmarks measure WASM initialization separately, then first-render, mean,
median, p95, throughput, and output size for small HTML, a styled invoice,
100 paragraphs, matching asset-map/async-loader documents with nested CSS
and a font, and the complete three-page German invoice with page numbers.
The async benchmarks use in-memory data to measure resolver overhead
without network latency. Warmed samples include parsing, styling/layout,
painting, font subsetting, and PDF serialization. Resource fetches, file writes, and process
startup are excluded. Each iteration renders a new document. JSON records the
runtime, platform, sample count, and RSS.

Results depend on hardware, engine, fonts, and document complexity. Run on your
deployment hardware. CI records results without a timing threshold on shared
runners.

## License

MIT. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and `licenses/` for
dependencies and fonts. This is an independent integration.
