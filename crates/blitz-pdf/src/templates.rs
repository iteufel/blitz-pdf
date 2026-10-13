//! Margin HTML uses the same vector pipeline, resource provider and shared font
//! collection as the body. Each final page number is laid out before painting.
use blitz_dom::{DocumentConfig, Node, NodeId};
use blitz_html::HtmlDocument;
use blitz_traits::shell::{ColorScheme, Viewport};
use std::sync::{Arc, atomic::Ordering};

pub struct PaintedTemplate {
    pub scene: anyrender::Scene,
    pub index: crate::text::TextIndex,
    pub height: f64,
    pub y: f64,
}

struct Template {
    document: HtmlDocument,
    placeholders: Vec<(NodeId, bool)>,
    height: f64,
    y: f64,
    name: &'static str,
}

pub struct Templates {
    documents: Vec<Template>,
    pub output: Vec<Vec<PaintedTemplate>>,
    width: f64,
    pages: usize,
    started: bool,
    stable: bool,
    passes: usize,
}

fn placeholders(node: &Node, output: &mut Vec<(NodeId, bool)>) {
    if let Some(element) = node.element_data() {
        let class = element.attr(blitz_dom::local_name!("class")).unwrap_or("");
        let current = class.split_ascii_whitespace().any(|v| v == "pageNumber");
        let total = class.split_ascii_whitespace().any(|v| v == "totalPages");
        if current || total {
            output.push((node.id, total));
            return;
        }
    }
    for child in &node.children {
        placeholders(node.with(*child), output);
    }
}

impl Templates {
    pub fn new(
        options: &crate::Options,
        fonts: &parley::FontContext,
        resources: &Arc<crate::resources::Resources>,
        pages: usize,
    ) -> Result<Self, String> {
        let mut documents = Vec::new();
        for (html, height, y, name) in [
            (
                &options.header_template,
                options.margin.top,
                0.0,
                "headerTemplate",
            ),
            (
                &options.footer_template,
                options.margin.bottom,
                options.height - options.margin.bottom,
                "footerTemplate",
            ),
        ] {
            let Some(html) = html.as_ref().filter(|html| !html.is_empty()) else {
                continue;
            };
            if html.len() > 1024 * 1024 {
                return Err(format!("{name} exceeds the 1 MiB limit"));
            }
            if height < 1.0 {
                return Err(format!(
                    "{name} requires a page margin of at least one CSS pixel"
                ));
            }
            let html = format!(
                "<!doctype html><html><head><style>html,body{{margin:0;padding:0;background:transparent}}</style></head><body>{html}</body></html>"
            );
            let document = HtmlDocument::from_html(
                &html,
                DocumentConfig {
                    viewport: Some(Viewport::new(
                        options.content_width().floor() as u32,
                        height.floor() as u32,
                        1.0,
                        ColorScheme::Light,
                    )),
                    base_url: Some(options.base_url.clone()),
                    net_provider: Some(resources.clone()),
                    font_ctx: Some(fonts.clone()),
                    media_type: Some(if options.media == "print" {
                        blitz_dom::MediaType::print()
                    } else {
                        blitz_dom::MediaType::screen()
                    }),
                    ..Default::default()
                },
            );
            let mut slots = Vec::new();
            placeholders(document.root_element(), &mut slots);
            documents.push(Template {
                document,
                placeholders: slots,
                height,
                y,
                name,
            });
        }
        Ok(Self {
            documents,
            output: Vec::new(),
            width: options.content_width(),
            pages,
            started: false,
            stable: false,
            passes: 0,
        })
    }

    /// Returns false when the shared async asset resolver must run again.
    pub fn advance(&mut self, resources: &crate::resources::Resources) -> Result<bool, String> {
        if self.documents.is_empty() {
            return Ok(true);
        }
        while self.output.len() < self.pages {
            resources.check()?;
            if !resources.pending_urls().is_empty() {
                return Ok(false);
            }
            if !self.started {
                for template in &mut self.documents {
                    let mut document = template.document.mutate();
                    for &(id, total) in &template.placeholders {
                        let value = if total {
                            self.pages
                        } else {
                            self.output.len() + 1
                        }
                        .to_string();
                        let text = document.create_text_node(&value);
                        document.replace_children(id, &[text]);
                    }
                }
                self.started = true;
            }
            if self.passes >= 32 {
                return Err("Template resources did not settle after 32 layout passes".into());
            }
            let before = resources.requests.load(Ordering::Relaxed);
            for template in &mut self.documents {
                template.document.resolve(0.0);
            }
            self.passes += 1;
            resources.check()?;
            let stable = before == resources.requests.load(Ordering::Relaxed)
                && self
                    .documents
                    .iter()
                    .all(|t| !t.document.has_pending_critical_resources());
            if stable && self.stable {
                let mut painted = Vec::new();
                for template in &mut self.documents {
                    let layout = template.document.root_element().final_layout();
                    let height = f64::from(
                        layout
                            .size
                            .height
                            .max(layout.scrollable_overflow_rect.bottom),
                    );
                    if height > template.height + crate::pagination::ROUNDING_EPS {
                        return Err(format!(
                            "{} does not fit its page margin; increase the margin or reduce the template height",
                            template.name
                        ));
                    }
                    let index = crate::text::TextIndex::from_document(template.document.as_ref())?;
                    let mut scene = anyrender::Scene::new();
                    blitz_paint::paint_scene(
                        &mut scene,
                        template.document.as_mut(),
                        1.0,
                        self.width.ceil() as u32,
                        template.height.ceil() as u32,
                        0,
                        0,
                    );
                    painted.push(PaintedTemplate {
                        scene,
                        index,
                        height: template.height,
                        y: template.y,
                    });
                }
                self.output.push(painted);
                self.started = false;
                self.stable = false;
                self.passes = 0;
            } else {
                self.stable = stable;
            }
        }
        Ok(true)
    }
}
