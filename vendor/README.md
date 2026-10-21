# Upstream versions

Checked against upstream on 2026-10-21:

- Blitz DOM and paint: `0.3.0-beta.4`, revision
  `f8723f495c7c6bfb611a923a21ed5c8e0fe95d55` from `DioxusLabs/blitz` main.
  All sibling Blitz crates use the same revision and its Taffy pin
  `4e59968eda29ceeb0bbaeb3993c8cd38baa3d0a6`.
- Stylo `0.22.0`, Krilla `0.8.2`, and Fontique `0.12.0` are the latest
  published crates.io releases. Their sources were compared with the release
  archives to confirm that only the patches and packaging files below differ.

# Stylo paged-media patch

`stylo/` contains the crates.io `stylo` 0.22.0 source (original crate checksum
`7a255e46af2478628c48daab3774090caabd7812b1dd3ca98801c2b9c53491ed`),
with the following changes:

- `properties/longhands.toml`: enable `break-before`, `break-after`, and
  `break-inside` and the `@page size` descriptor for Servo; add inherited
  positive-integer `widows` and `orphans`.
- `properties/shorthands.toml`: enable the three legacy `page-break-*` aliases.
- `properties/counted_unknown_properties.py`: stop classifying widows/orphans as unknown.
- `values/specified/box.rs`: parse `avoid-page`, `recto`, and `verso` break values.
- `stylesheets/rule_parser.rs`: enable Stylo's existing `@page` parser in Servo.

Upstream exposes break properties only in Gecko builds. Enabling them here lets
Blitz's actual Stylo cascade handle selectors, inheritance, media queries, CSS
variables, inline styles, and `!important`; no CSS rewriting is used.

This directory retains its upstream MPL-2.0 license. The modified source ships in
the npm archive. Update the patch when upgrading Stylo and run the pagination
suite and `tests/reports.test.ts`, especially cascade, page geometry and legacy aliases.

# Krilla document metadata patch

`krilla/` contains the crates.io `krilla` 0.8.2 source (original crate checksum
`27da593198b20eeba65caeb73c2bbeec3e53ab08fa549898312ce81c4fce5e33`). Its
MIT/Apache-2.0 licenses are retained alongside the ICC profile license.

Changes are limited to:

- `src/interchange/metadata.rs`: separate creation/modification dates and an
  API for custom XMP text properties with PDF/A extension schema descriptions.
- `src/configure/validate.rs`: merge custom schema descriptions into the same
  container as the engine's built-in schemas.
- `src/chunk_container.rs`: include custom schemas, language, and document
  identity in the instance-ID hash, and pass schemas to XMP serialization.

Krilla 0.8.2 already writes associated files and embedded-file name trees. The
patch leaves that implementation intact. The renderer validates custom schema
names, namespace URIs, prefixes, and values before passing them to Krilla.
No invoice-specific behavior is added to the engine or public API.

When upgrading Krilla, review this patch and run `tests/document.test.ts`, the
Node/browser checks, and `npm run test:pdfa` against the rebuilt WASM.

# Blitz print layout patch

`blitz-dom/` contains `packages/blitz-dom` from Blitz revision
`f8723f495c7c6bfb611a923a21ed5c8e0fe95d55`, with its MIT/Apache-2.0 licenses.
Its standalone manifest expands the upstream workspace dependencies and pins
the sibling Blitz crates to the same revision.

- `config.rs`, `document.rs`, `stylo_device.rs`, `iframe.rs`, `resolve.rs`, and
  `layout/writing_mode.rs`: provide an optional fractional CSS viewport and
  optional layout rounding. Defaults preserve the upstream window behavior.
  The PDF body and margin templates disable rounding and supply the exact
  printable dimensions, including after CSS page setup changes them. Layout,
  transforms, painting, and pagination share the resulting geometry.
- `layout/inline/build.rs`: use baseline alignment for the root of an inline
  formatting context. A table cell's `vertical-align: middle` aligns the cell
  content within its row; applying it again to its own text inflated every line.
  Descendant inline alignment and the cell's placement remain intact.
- `layout/inline/layout.rs`: let empty inline contexts compute their size and margin
  collapse normally. The empty-text shortcut prevented margins from collapsing
  through paragraphs containing empty spans and discarded explicit heights.
- `layout/table.rs`: keep `max-width` as an intrinsic measurement constraint,
  while allowing the final cell layout to use the width allocated by the grid.
  Generate anonymous row/cell wrappers around improper table children, including
  block content in a `display: table` container. `layout/construct.rs` creates
  the wrappers without altering the DOM; `layout/damage.rs` retains their roles
  and inherited styles when refreshing them. Ownership tracking frees them on
  reconstruction.

When upgrading Blitz, review these changes against upstream and run
`tests/layout.test.ts`, `tests/pagination.test.ts`, and `tests/reports.test.ts`
against rebuilt WASM. Layout tests check physical margins, fractional viewport
widths, header/footer geometry, table line spacing, descendant alignment, empty
paragraphs, explicit empty-box dimensions, exact page-boundary fits, constrained
table columns, anonymous cells, and inheritance after CSS page-size changes.

# Blitz Unicode paint notifications

`blitz-paint/` contains `packages/blitz-paint` from Blitz revision
`f8723f495c7c6bfb611a923a21ed5c8e0fe95d55`, with its MIT/Apache-2.0 licenses.
Its standalone manifest expands the upstream workspace dependencies and pins
sibling crates to the same revision.

- `src/lib.rs`: add the opt-in `TextObserver` and `paint_scene_with_text` API.
  The original `paint_scene` entry point keeps its existing behavior.
- `src/render.rs`: notify the observer immediately before painting inline text,
  input/textarea text, and outside list markers; forward it to subdocuments.
  The notifications supply the exact Parley layout and source string in paint
  order, including visibility and stacking order decisions.

The PDF renderer associates the observed runs with individual scene commands
and checks that their glyphs match. It retains this immutable association when
replaying pages or repeated table fragments. It no longer uses glyph shapes as
document-wide source-text identities: `fi` and `ﬁ`, for example, legitimately
share a shape while requiring different Unicode mappings.

When upgrading Blitz, retain these notifications at all text-paint boundaries
and run `tests/unicode.test.ts` (requires Poppler), the existing rendering,
pagination, and template suites, and `npm run test:pdfa` on the rebuilt WASM.

# Fontique registered-font fallback patch

`fontique/` contains crates.io Fontique 0.12.0 (checksum
`bbf1df16263783918b7da396077521f92b729ef7c429444dfcf03581f1448b77`),
with its MIT/Apache-2.0 licenses. Changes are limited to
`src/collection/mod.rs` and `src/collection/query.rs`:

- `Collection::set_registered_fallbacks` opts a collection into automatic fallback
  across its explicitly registered fonts. Other consumers retain upstream behavior.
- Queries try CSS families and script/locale fallbacks first, then registered
  families in deterministic registration order, with explicit last-resort families
  at the end. Font attributes and actual cluster coverage still control selection.
- Shared collection clones observe fonts registered later through CSS, including
  margin templates and the page-number renderer. No system fonts are discovered.

When upgrading Fontique, retain this behavior or use an equivalent upstream API.
Run `tests/font-fallback.test.ts`, the full rendering suite, and the PDF/A checks
against rebuilt WASM.
