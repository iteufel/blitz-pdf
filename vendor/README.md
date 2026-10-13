# Stylo paged-media patch

`stylo/` is the unmodified crates.io `stylo` 0.22.0 source except for:

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
