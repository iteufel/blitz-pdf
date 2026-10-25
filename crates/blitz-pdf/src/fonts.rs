//! Shared fonts and missing-glyph fallback for body, margin and page-number text.
use blitz_dom::decode_font_bytes;
use parley::{
    FontContext,
    fontique::{Blob, Collection, CollectionOptions, GenericFamily, SourceCache},
};
use serde_bytes::ByteBuf;
use std::sync::Arc;

thread_local! {
    // Register the built-in fonts once per engine. The collection remains
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

// The blob borrows the WASM data segment; no decoded font-sized heap copy is
// needed. Cloned document collections retain these immutable bytes safely.
fn bundled_blob(bytes: &'static [u8]) -> Blob<u8> {
    Blob::new(Arc::new(bytes))
}

macro_rules! bundled_font {
    ($name:literal) => {
        include_bytes!(concat!(env!("OUT_DIR"), "/fonts/", $name, ".sfnt")).as_slice()
    };
}

fn build_bundled() -> FontContext {
    let mut fonts = FontContext {
        source_cache: SourceCache::new_shared(),
        collection: Collection::new(CollectionOptions {
            shared: false,
            system_fonts: false,
        }),
    };
    let regular = fonts
        .collection
        .register_fonts(bundled_blob(bundled_font!("NotoSans-Regular")), None);
    for generic in [
        GenericFamily::SansSerif,
        GenericFamily::Serif,
        GenericFamily::Monospace,
        GenericFamily::SystemUi,
    ] {
        fonts
            .collection
            .append_generic_families(generic, regular.iter().map(|(id, _)| *id));
    }
    for data in [
        bundled_font!("NotoSans-Bold"),
        bundled_font!("NotoSans-Italic"),
        bundled_font!("NotoSans-BoldItalic"),
        bundled_font!("DejaVuSans"),
        include_bytes!("../../../assets/fonts/DejaVuSansMono.ttf").as_slice(),
        include_bytes!("../../../assets/fonts/DejaVuSans-Bold.ttf").as_slice(),
        include_bytes!("../../../assets/fonts/DejaVuSans-Oblique.ttf").as_slice(),
        include_bytes!("../../../assets/fonts/DejaVuSans-BoldOblique.ttf").as_slice(),
    ] {
        fonts.collection.register_fonts(bundled_blob(data), None);
    }
    let mono = fonts
        .collection
        .register_fonts(bundled_blob(bundled_font!("NotoSansMono-Regular")), None);
    fonts
        .collection
        .set_generic_families(GenericFamily::Monospace, mono.iter().map(|(id, _)| *id));
    // Bundled CJK and Unifont are tried after supplied and @font-face fonts.
    // CJK includes supplementary ideographs that are absent from Unifont.
    let mut last_resort = Vec::new();
    for data in [
        bundled_font!("NotoSansCJKjp-Regular"),
        bundled_font!("NotoSansCJKjp-Bold"),
        bundled_font!("unifont-18.0.01"),
        bundled_font!("unifont_upper-18.0.01"),
    ] {
        last_resort.extend(
            fonts
                .collection
                .register_fonts(bundled_blob(data), None)
                .into_iter()
                .map(|(id, _)| id),
        );
    }
    let emoji = fonts
        .collection
        .register_fonts(bundled_blob(bundled_font!("NotoEmoji-Regular")), None);
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
