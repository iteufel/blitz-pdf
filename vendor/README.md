# Stylo paged-media patch

`stylo/` is the unmodified crates.io `stylo` 0.22.0 source except for:

- `properties/longhands.toml`: enable `break-before`, `break-after`, and
  `break-inside` for Servo; add inherited positive-integer `widows` and `orphans`.
- `properties/shorthands.toml`: enable the three legacy `page-break-*` aliases.
- `properties/counted_unknown_properties.py`: stop classifying widows/orphans as unknown.
- `values/specified/box.rs`: parse `avoid-page`, `recto`, and `verso` break values.

Upstream exposes break properties only in Gecko builds. Enabling them here lets
Blitz's actual Stylo cascade handle selectors, inheritance, media queries, CSS
variables, inline styles, and `!important`; no CSS rewriting is used.

This directory retains its upstream MPL-2.0 license. The modified source ships in
the npm archive. Update the patch when upgrading Stylo and run the pagination
suite, especially the cascade and legacy-alias tests.
