//! Shared fonts and missing-glyph fallback for body, margin and page-number text.
use blitz_dom::{build_single_font_ctx, decode_font_bytes};
use parley::{
    FontContext,
    fontique::{Blob, GenericFamily, SourceCache},
};
use serde_bytes::ByteBuf;
use std::sync::Arc;

thread_local! {
    // Decode the built-in fonts once per engine. The collection remains
    // unshared here so document-specific registrations cannot mutate it.
    static BUNDLED: FontContext = build_bundled();
}

pub(crate) fn build(supplied: Vec<ByteBuf>) -> Result<FontContext, String> {
    let mut fonts = BUNDLED.with(Clone::clone);
    fonts.source_cache = SourceCache::new_shared();
    for (index, bytes) in supplied.iter().enumerate() {
        let bytes = decode_font_bytes(bytes).into_owned();
        if fonts
            .collection
            .register_fonts(Blob::new(Arc::new(bytes)), None)
            .is_empty()
        {
            return Err(format!(
                "Could not decode fonts[{index}]; use TTF, OTF, WOFF, or WOFF2"
            ));
        }
    }
    fonts.collection.make_shared();
    Ok(fonts)
}

fn build_bundled() -> FontContext {
    let mut fonts = build_single_font_ctx(crate::DEFAULT_FONT);
    for data in [
        include_bytes!("../../../assets/fonts/NotoSans-Bold.woff2").as_slice(),
        include_bytes!("../../../assets/fonts/NotoSans-Italic.woff2").as_slice(),
        include_bytes!("../../../assets/fonts/NotoSans-BoldItalic.woff2").as_slice(),
        include_bytes!("../../../assets/fonts/DejaVuSans.woff2").as_slice(),
        include_bytes!("../../../assets/fonts/DejaVuSansMono.ttf").as_slice(),
        include_bytes!("../../../assets/fonts/DejaVuSans-Bold.ttf").as_slice(),
        include_bytes!("../../../assets/fonts/DejaVuSans-Oblique.ttf").as_slice(),
        include_bytes!("../../../assets/fonts/DejaVuSans-BoldOblique.ttf").as_slice(),
    ] {
        fonts.collection.register_fonts(
            Blob::new(Arc::new(decode_font_bytes(data).into_owned())),
            None,
        );
    }
    let mono = fonts.collection.register_fonts(
        Blob::new(Arc::new(
            decode_font_bytes(include_bytes!(
                "../../../assets/fonts/NotoSansMono-Regular.woff2"
            ))
            .into_owned(),
        )),
        None,
    );
    fonts
        .collection
        .set_generic_families(GenericFamily::Monospace, mono.iter().map(|(id, _)| *id));
    // Bundled CJK and Unifont are tried after supplied and @font-face fonts.
    // CJK includes supplementary ideographs that are absent from Unifont.
    let mut last_resort = Vec::new();
    for data in [
        include_bytes!("../../../assets/fonts/NotoSansCJKjp-Regular.woff2").as_slice(),
        include_bytes!("../../../assets/fonts/NotoSansCJKjp-Bold.woff2").as_slice(),
        include_bytes!("../../../assets/fonts/unifont-18.0.01.woff2").as_slice(),
        include_bytes!("../../../assets/fonts/unifont_upper-18.0.01.woff2").as_slice(),
    ] {
        last_resort.extend(
            fonts
                .collection
                .register_fonts(
                    Blob::new(Arc::new(decode_font_bytes(data).into_owned())),
                    None,
                )
                .into_iter()
                .map(|(id, _)| id),
        );
    }
    let emoji = fonts.collection.register_fonts(
        Blob::new(Arc::new(
            decode_font_bytes(include_bytes!(
                "../../../assets/fonts/NotoEmoji-Regular.woff2"
            ))
            .into_owned(),
        )),
        None,
    );
    fonts
        .collection
        .set_generic_families(GenericFamily::Emoji, emoji.iter().map(|(id, _)| *id));
    // CSS and language-specific families are queried first. Later @font-face
    // registrations join the shared collection ahead of these last resorts.
    fonts
        .collection
        .set_registered_fallbacks(last_resort.into_iter());
    fonts
}
