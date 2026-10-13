mod page_numbers;
mod pagination;
mod pdf;
mod resources;
mod text;

use blitz_dom::{DocumentConfig, MediaType, build_single_font_ctx, decode_font_bytes};
use blitz_html::HtmlDocument;
use blitz_traits::shell::{ColorScheme, Viewport};
use parley::fontique::{Blob, GenericFamily};
use serde::Deserialize;
use serde_bytes::ByteBuf;
use std::{
    collections::BTreeMap,
    sync::{Arc, atomic::Ordering},
};
use wasm_bindgen::prelude::*;

const DEFAULT_FONT: &[u8] = include_bytes!("../../../assets/fonts/DejaVuSans.woff2");

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Options {
    width: f64,
    height: f64,
    margin: Margins,
    max_pages: u32,
    media: String,
    base_url: String,
    title: Option<String>,
    page_numbers: Option<page_numbers::PageNumberOptions>,
    assets: BTreeMap<String, ByteBuf>,
    fonts: Vec<ByteBuf>,
}

#[derive(Deserialize)]
struct Margins {
    top: f64,
    right: f64,
    bottom: f64,
    left: f64,
}

#[wasm_bindgen]
pub fn render_pdf(html: &str, options: JsValue) -> Result<Vec<u8>, JsError> {
    let mut job =
        RenderJob::build(html, parse_options(options)?, false).map_err(|e| JsError::new(&e))?;
    job.advance().map_err(|e| JsError::new(&e))?;
    job.render().map_err(|e| JsError::new(&e))
}

fn parse_options(options: JsValue) -> Result<Options, JsError> {
    serde_wasm_bindgen::from_value(options)
        .map_err(|e| JsError::new(&format!("Invalid render options: {e}")))
}

/// A document retained across asynchronous JS resource loads. No Rust borrow or
/// callback crosses an await; JavaScript explicitly resumes it with asset bytes.
#[wasm_bindgen]
pub struct RenderJob {
    document: HtmlDocument,
    resources: Arc<resources::Resources>,
    options: Options,
    passes: usize,
    stable: bool,
    settled: bool,
}

#[wasm_bindgen]
impl RenderJob {
    #[wasm_bindgen(constructor)]
    pub fn new(html: &str, options: JsValue) -> Result<RenderJob, JsError> {
        Self::build(html, parse_options(options)?, true).map_err(|e| JsError::new(&e))
    }

    /// Advance style/layout until it needs external data, or is ready to paint.
    pub fn pending_assets(&mut self) -> Result<Vec<String>, JsError> {
        self.advance().map_err(|e| JsError::new(&e))
    }

    pub fn provide_asset(&mut self, url: &str, bytes: Vec<u8>) -> Result<(), JsError> {
        self.resources
            .provide(url, bytes)
            .map_err(|e| JsError::new(&e))
    }

    pub fn finish(&mut self) -> Result<Vec<u8>, JsError> {
        self.render().map_err(|e| JsError::new(&e))
    }
}

impl Drop for RenderJob {
    fn drop(&mut self) {
        self.resources.clear_pending();
    }
}

impl RenderJob {
    fn build(html: &str, mut o: Options, dynamic: bool) -> Result<Self, String> {
        let dimensions = [
            o.width,
            o.height,
            o.margin.top,
            o.margin.right,
            o.margin.bottom,
            o.margin.left,
        ];
        if dimensions.iter().any(|x| !x.is_finite() || *x < 0.0)
            || o.width <= 0.0
            || o.height <= 0.0
            || o.width > 19_200.0
            || o.height > 19_200.0
        {
            return Err("Page dimensions must be positive and at most 19200 CSS pixels; margins must be non-negative".into());
        }
        if o.max_pages == 0 || o.max_pages > 1000 {
            return Err("maxPages must be between 1 and 1000".into());
        }
        if html.len() > 16 * 1024 * 1024 {
            return Err("HTML exceeds the 16 MiB limit".into());
        }
        if o.assets.values().map(|v| v.len()).sum::<usize>() > 64 * 1024 * 1024 {
            return Err("Assets exceed the 64 MiB limit".into());
        }
        if o.fonts.iter().map(|v| v.len()).sum::<usize>() > 32 * 1024 * 1024 {
            return Err("Fonts exceed the 32 MiB limit".into());
        }
        if let Some(numbers) = &o.page_numbers {
            numbers.validate()?;
        }
        let media = match o.media.as_str() {
            "print" => MediaType::print(),
            "screen" => MediaType::screen(),
            _ => return Err("media must be print or screen".into()),
        };
        let content_width = o.width - o.margin.left - o.margin.right;
        let content_height = o.height
            - o.margin.top
            - o.margin.bottom
            - o.page_numbers.as_ref().map_or(0.0, |n| n.height());
        if content_width < 1.0 || content_height < 1.0 {
            return Err("Margins must leave at least one CSS pixel of content".into());
        }

        let mut fonts = build_single_font_ctx(DEFAULT_FONT);
        for data in [
            include_bytes!("../../../assets/fonts/DejaVuSans-Bold.ttf").as_slice(),
            include_bytes!("../../../assets/fonts/DejaVuSans-Oblique.ttf").as_slice(),
            include_bytes!("../../../assets/fonts/DejaVuSans-BoldOblique.ttf").as_slice(),
        ] {
            fonts
                .collection
                .register_fonts(Blob::new(Arc::new(data.to_vec())), None);
        }
        let mono = fonts.collection.register_fonts(
            Blob::new(Arc::new(
                include_bytes!("../../../assets/fonts/DejaVuSansMono.ttf").to_vec(),
            )),
            None,
        );
        fonts
            .collection
            .set_generic_families(GenericFamily::Monospace, mono.iter().map(|(id, _)| *id));
        for (index, bytes) in std::mem::take(&mut o.fonts).iter().enumerate() {
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
        let resources = Arc::new(resources::Resources::new(
            std::mem::take(&mut o.assets),
            dynamic,
        ));
        let document = HtmlDocument::from_html(
            html,
            DocumentConfig {
                viewport: Some(Viewport::new(
                    content_width.floor() as u32,
                    content_height.floor() as u32,
                    1.0,
                    ColorScheme::Light,
                )),
                base_url: Some(o.base_url.clone()),
                net_provider: Some(resources.clone()),
                font_ctx: Some(fonts),
                media_type: Some(media),
                ..Default::default()
            },
        );

        Ok(Self {
            document,
            resources,
            options: o,
            passes: 0,
            stable: false,
            settled: false,
        })
    }

    fn advance(&mut self) -> Result<Vec<String>, String> {
        self.resources.check()?;
        if self.settled {
            return Ok(Vec::new());
        }
        loop {
            let pending = self.resources.pending_urls();
            if !pending.is_empty() {
                self.stable = false;
                return Ok(pending);
            }
            if self.passes == 32 {
                return Err("Resources did not settle after 32 layout passes".into());
            }
            let before = self.resources.requests.load(Ordering::Relaxed);
            self.document.resolve(0.0);
            self.passes += 1;
            self.resources.check()?;
            let stable = before == self.resources.requests.load(Ordering::Relaxed)
                && !self.document.has_pending_critical_resources();
            // A final quiet pass ingests responses queued by the preceding layout.
            if stable && self.stable {
                self.settled = true;
                return Ok(Vec::new());
            }
            self.stable = stable;
        }
    }

    fn render(&mut self) -> Result<Vec<u8>, String> {
        if !self.settled {
            return Err("Cannot render while assets or layout are pending".into());
        }
        self.resources.check()?;
        let o = &self.options;
        let document = &mut self.document;
        let content_width = o.width - o.margin.left - o.margin.right;
        let content_height = o.height
            - o.margin.top
            - o.margin.bottom
            - o.page_numbers.as_ref().map_or(0.0, |n| n.height());
        let layout = document.root_element().final_layout();
        let total_height = f64::from(
            layout
                .size
                .height
                .max(layout.scrollable_overflow_rect.bottom),
        );
        if !total_height.is_finite() {
            return Err("Document layout has a non-finite height".into());
        }
        // Ignore subpixel roundoff at an exact page boundary.
        let pages = ((total_height / content_height - 0.001).ceil().max(1.0)) as u32;
        if pages > o.max_pages {
            return Err(format!(
                "Document needs {pages} pages, exceeding maxPages ({})",
                o.max_pages
            ));
        }

        let index = text::TextIndex::from_document(document.as_ref())?;
        let pagination = pagination::Pagination::from_document(document.as_ref());
        let mut scene = anyrender::Scene::new();
        blitz_paint::paint_scene(
            &mut scene,
            document.as_mut(),
            1.0,
            content_width.ceil() as u32,
            total_height.ceil().max(1.0) as u32,
            0,
            0,
        );
        let pages = pagination.pages(&scene, total_height, content_height, o.max_pages)?;
        pdf::render(
            &scene,
            &index,
            [o.width, o.height],
            &o.margin,
            &pages,
            o.title.as_deref(),
            o.page_numbers.as_ref(),
        )
    }
}

#[wasm_bindgen]
pub fn engine_version() -> String {
    format!("blitz-pdf/{} blitz/e72650a", env!("CARGO_PKG_VERSION"))
}
