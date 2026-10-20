# Stylo paged-media patch

`stylo/` is the unmodified crates.io `stylo` 0.22.0 source except for:

- `properties/longhands.toml`: enable `break-before`, `break-after`, and
  `break-inside` and the `@page size` descriptor for Servo; add inherited
  positive-integer `widows` and `orphans`.
- `properties/shorthands.toml`: enable the three legacy `page-break-*` aliases.
- `properties/counted_unknown_properties.py`: stop classifying widows/orphans as unknown.
- `values/specified/box.rs`: parse `avoid-page`, `recto`, and `verso` break values.
- `stylesheets/rule_parser.rs`: enable Stylo's existing `@page` parser in Servo.
- `properties/properties.mako.rs`: the Servo `ComputedValues` size check is 240
  bytes on 64-bit targets. The added `page` style struct is one extra `Arc`.
  Wasm32 does not compile this check.

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
- `src/interactive/annotation.rs`: use the `f32` associated infinity constants
  so current Rust does not warn on the deprecated `std::f32` module constants.

Krilla 0.8.2 already writes associated files and embedded-file name trees. The
patch leaves that implementation intact. The renderer validates custom schema
names, namespace URIs, prefixes, and values before passing them to Krilla.
No invoice-specific behavior is added to the engine or public API.

When upgrading Krilla, review this patch and run `tests/document.test.ts`, the
Node/browser checks, and `npm run test:pdfa` against the rebuilt WASM.

# Blitz print layout patch

`blitz-dom/` contains `packages/blitz-dom` from Blitz revision
`e72650a6e67941852fddf025295cfee30c39ea32`, with its MIT/Apache-2.0 licenses.
Its standalone manifest expands the upstream workspace dependencies and pins
the sibling Blitz crates to the same revision.

- `config.rs`, `document.rs`, `stylo_device.rs`, `iframe.rs`, `resolve.rs`, and
  `layout/writing_mode.rs`: provide an optional fractional CSS viewport and
  optional layout rounding. Defaults preserve the upstream window behavior.
  The PDF body and margin templates disable rounding and supply the exact
  printable dimensions, including after CSS page setup changes them. Layout,
  transforms, painting, and pagination share the resulting geometry.
- `layout/construct.rs`: use baseline alignment for the root of an inline
  formatting context. A table cell's `vertical-align: middle` aligns the cell
  content within its row; applying it again to its own text inflated every line.
  Descendant inline alignment and the cell's placement remain intact.
- `layout/inline.rs`: let empty inline contexts compute their size and margin
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
