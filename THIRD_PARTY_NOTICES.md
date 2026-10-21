# Third-party notices

blitz-pdf is an independent project, not an official Dioxus Labs package.

The distributed WebAssembly module includes:

- [Blitz](https://github.com/DioxusLabs/blitz), MIT OR Apache-2.0, pinned to `e72650a6e67941852fddf025295cfee30c39ea32`.
- [Krilla](https://github.com/LaurenzV/krilla), MIT OR Apache-2.0, for PDF serialization and font subsetting.
- [Parley](https://github.com/linebender/parley), MIT OR Apache-2.0, for text layout.
- [Stylo](https://github.com/servo/stylo), MPL-2.0, for CSS styling.
- [Taffy](https://github.com/DioxusLabs/taffy), MIT, for layout.

The resolved dependency inventory and upstream license notices are in
`licenses/RUST_DEPENDENCIES.txt`. `Cargo.lock` pins versions and source commits.
Upstream sources are available at the repository links in that inventory and
through crates.io. Stylo 0.22.0 is patched to expose paged-media CSS properties
in its Servo build. Its full modified MPL-2.0 source and license are included in
`vendor/stylo`. Krilla 0.8.2 is patched for custom XMP extension schemas and
independent modification dates; its source and MIT/Apache-2.0 licenses are in
`vendor/krilla`. Blitz's DOM crate is patched for fractional PDF geometry,
table-cell sizing/spacing, anonymous table wrappers, and paragraph margin
collapse; its source and MIT/Apache-2.0 licenses are in `vendor/blitz-dom`.
Blitz's paint crate exposes source-layout notifications for Unicode PDF text;
its source and MIT/Apache-2.0 licenses are in `vendor/blitz-paint`.
`vendor/README.md` lists these patches. Other dependencies are used without
source modifications.

Bundled DejaVu fonts use the Bitstream Vera / DejaVu license reproduced in
`licenses/DejaVu.txt`. The regular WOFF2 comes from Blitz's
`examples/wasm_hello/assets/DejaVuSans.woff2` at the pinned revision. Other faces
are from the official DejaVu 2.37 TTF release. Fonts are subsetted and embedded
in generated PDFs.
