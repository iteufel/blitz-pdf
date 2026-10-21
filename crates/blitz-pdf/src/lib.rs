mod document;
mod fonts;
mod page_numbers;
mod page_setup;
mod pagination;
mod pdf;
mod resources;
mod tables;
mod templates;
mod text;

use blitz_dom::{DocumentConfig, MediaType};
use blitz_html::HtmlDocument;
use blitz_traits::shell::{ColorScheme, Viewport};
use serde::Deserialize;
use serde_bytes::ByteBuf;
use std::{
    collections::BTreeMap,
    sync::{Arc, atomic::Ordering},
};
use wasm_bindgen::prelude::*;

const DEFAULT_FONT: &[u8] = include_bytes!("../../../assets/fonts/NotoSans-Regular.woff2");

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Options {
    width: f64,
    height: f64,
    #[serde(rename = "useCSSPageSize", default)]
    use_css_page_size: bool,
    margin: Margins,
    max_pages: u32,
    media: String,
    base_url: String,
    title: Option<String>,
    #[serde(default)]
    metadata: document::DocumentMetadata,
    #[serde(default)]
    attachments: Vec<document::Attachment>,
    page_numbers: Option<page_numbers::PageNumberOptions>,
    header_template: Option<String>,
    footer_template: Option<String>,
    assets: BTreeMap<String, ByteBuf>,
    fonts: Vec<ByteBuf>,
}

#[derive(Clone, PartialEq, Deserialize)]
struct Margins {
    top: f64,
    right: f64,
    bottom: f64,
    left: f64,
}

impl Options {
    fn content_width(&self) -> f64 {
        self.width - self.margin.left - self.margin.right
    }
    fn content_height(&self) -> f64 {
        self.height
            - self.margin.top
            - self.margin.bottom
            - self.page_numbers.as_ref().map_or(0.0, |n| n.height())
    }
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
    page_setup_applied: bool,
    fonts: parley::FontContext,
    prepared: Option<PreparedDocument>,
    templates: Option<templates::Templates>,
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
        document::validate(&o)?;
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
        // The provisional layout loads stylesheets. CSS may replace both the
        // dimensions and margins, so validate printable geometry afterward.
        let content_width = if content_width >= 1.0 {
            content_width
        } else {
            o.width
        };
        let content_height = if content_height >= 1.0 {
            content_height
        } else {
            o.height
        };

        let fonts = fonts::build(std::mem::take(&mut o.fonts))?;
        let resources = Arc::new(resources::Resources::new(
            std::mem::take(&mut o.assets),
            dynamic,
        ));
        let document = HtmlDocument::from_html(
            html,
            DocumentConfig {
                round_layout: false,
                layout_viewport: Some((content_width as f32, content_height as f32)),
                viewport: Some(Viewport::new(
                    content_width.floor() as u32,
                    content_height.floor() as u32,
                    1.0,
                    ColorScheme::Light,
                )),
                base_url: Some(o.base_url.clone()),
                net_provider: Some(resources.clone()),
                font_ctx: Some(fonts.clone()),
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
            page_setup_applied: false,
            fonts,
            prepared: None,
            templates: None,
        })
    }

    fn advance(&mut self) -> Result<Vec<String>, String> {
        self.resources.check()?;
        if self.settled {
            return Ok(Vec::new());
        }
        loop {
            if self.prepared.is_some() {
                let templates = self.templates.as_mut().unwrap();
                if templates.advance(&self.resources)? {
                    self.settled = true;
                    return Ok(Vec::new());
                }
                return Ok(self.resources.pending_urls());
            }
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
                if !self.page_setup_applied {
                    self.page_setup_applied = true;
                    if page_setup::apply(self.document.as_mut(), &mut self.options)? {
                        self.document.set_viewport(Viewport::new(
                            self.options.content_width().floor() as u32,
                            self.options.content_height().floor() as u32,
                            1.0,
                            ColorScheme::Light,
                        ));
                        self.document.set_layout_viewport(Some((
                            self.options.content_width() as f32,
                            self.options.content_height() as f32,
                        )));
                        self.stable = false;
                        continue;
                    }
                }
                let prepared = prepare(&mut self.document, &self.options)?;
                self.templates = Some(templates::Templates::new(
                    &self.options,
                    &self.fonts,
                    &self.resources,
                    prepared.pages.len(),
                )?);
                self.prepared = Some(prepared);
                continue;
            }
            self.stable = stable;
        }
    }

    fn render(&mut self) -> Result<Vec<u8>, String> {
        if !self.settled {
            return Err("Cannot render while assets or layout are pending".into());
        }
        self.resources.check()?;
        let content = self.prepared.as_ref().ok_or("Document is not prepared")?;
        pdf::render(
            &content.scene,
            &content.index,
            &content.pages,
            &self.options,
            &self.templates.as_ref().unwrap().output,
            &self.fonts,
        )
    }
}

struct PreparedDocument {
    scene: anyrender::Scene,
    index: text::TextIndex,
    pages: Vec<pagination::PageRange>,
}

fn prepare(document: &mut HtmlDocument, o: &Options) -> Result<PreparedDocument, String> {
    let content_width = o.width - o.margin.left - o.margin.right;
    let content_height = o.height
        - o.margin.top
        - o.margin.bottom
        - o.page_numbers.as_ref().map_or(0.0, |n| n.height());
    let layout = document.root_element().final_layout();
    let unrounded = document.root_element().unrounded_layout();
    let total_height = f64::from(
        layout
            .size
            .height
            .max(layout.scrollable_overflow_rect.bottom),
    );
    if !total_height.is_finite() {
        return Err("Document layout has a non-finite height".into());
    }
    // Only forgive overflow introduced by rounding the trailing box edge.
    // Real fractional overflow must still produce another page.
    let logical_height = f64::from(
        unrounded
            .size
            .height
            .max(unrounded.scrollable_overflow_rect.bottom),
    );
    let rounding = (total_height - logical_height).clamp(0.0, pagination::ROUNDING_EPS) + 0.001;
    let pages = (((total_height - rounding) / content_height).ceil().max(1.0)) as u32;
    if pages > o.max_pages {
        return Err(format!(
            "Document needs {pages} pages, exceeding maxPages ({})",
            o.max_pages
        ));
    }

    let pagination = pagination::Pagination::from_document(document.as_ref());
    let (scene, index) = text::TextIndex::paint(
        document.as_mut(),
        content_width.ceil() as u32,
        total_height.ceil().max(1.0) as u32,
    )?;
    let pages = pagination.pages(&scene, total_height, content_height, rounding, o.max_pages)?;
    Ok(PreparedDocument {
        scene,
        index,
        pages,
    })
}

#[wasm_bindgen]
pub fn engine_version() -> String {
    format!("blitz-pdf/{} blitz/f8723f4", env!("CARGO_PKG_VERSION"))
}
