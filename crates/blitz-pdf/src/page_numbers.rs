use anyrender::{Glyph, Paint, recording::GlyphRunCommand};
use blitz_dom::node::TextBrush;
use krilla::surface::Surface;
use kurbo::{Affine, Vec2};
use parley::{Alignment, FontContext, LayoutContext, PositionedLayoutItem, StyleProperty};
use serde::Deserialize;

use crate::{
    Margins,
    pdf::{Cache, draw_text, text_bounds},
    text::TextIndex,
};

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PageNumberOptions {
    template: String,
    align: Align,
    font_size: f64,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "lowercase")]
enum Align {
    Left,
    Center,
    Right,
}

impl PageNumberOptions {
    pub fn height(&self) -> f64 {
        self.font_size * 2.0 + 8.0
    }

    pub fn validate(&self) -> Result<(), String> {
        if !self.font_size.is_finite() || !(1.0..=48.0).contains(&self.font_size) {
            return Err("pageNumbers.fontSize must be between 1 and 48 CSS pixels".into());
        }
        let rest = self.template.replace("{page}", "").replace("{pages}", "");
        if self.template.chars().count() > 512
            || self
                .template
                .chars()
                .any(|c| c.is_control() || c == '\u{2028}' || c == '\u{2029}')
            || !self.template.contains("{page}")
            || rest.contains(['{', '}'])
        {
            return Err(
                "pageNumbers.template must be a single line with {page} and optionally {pages}"
                    .into(),
            );
        }
        Ok(())
    }
}

/// Shape the footer after pagination, using the same Parley cluster mapping as
/// body text. No PDF post-processing, rasterization, or extra font dependency.
pub struct PageNumbers {
    options: PageNumberOptions,
    fonts: FontContext,
    layout: LayoutContext<TextBrush>,
    left: f64,
    top: f64,
    width: f64,
}

impl PageNumbers {
    pub fn new(
        options: &PageNumberOptions,
        [width, height]: [f64; 2],
        margin: &Margins,
        fonts: &FontContext,
    ) -> Self {
        Self {
            options: options.clone(),
            fonts: fonts.clone(),
            layout: LayoutContext::new(),
            left: margin.left,
            top: height - margin.bottom - options.font_size * 2.0,
            width: width - margin.left - margin.right,
        }
    }

    pub fn draw(
        &mut self,
        number: usize,
        total: usize,
        surface: &mut Surface<'_>,
        cache: &mut Cache,
    ) -> Result<(), String> {
        let text = self
            .options
            .template
            .replace("{page}", &number.to_string())
            .replace("{pages}", &total.to_string());
        let mut builder = self
            .layout
            .ranged_builder(&mut self.fonts, &text, 1.0, false);
        builder.push_default(StyleProperty::FontSize(self.options.font_size as f32));
        let mut layout = builder.build(&text);
        layout.break_all_lines(None);
        layout.align(Alignment::Start, Default::default());
        let width = f64::from(layout.full_width());
        let height = f64::from(layout.height());
        if width > self.width + 0.001 || height > self.options.font_size * 2.0 {
            return Err(
                "pageNumbers template does not fit the footer; shorten it or reduce fontSize"
                    .into(),
            );
        }
        let x = self.left
            + match self.options.align {
                Align::Left => 0.0,
                Align::Center => (self.width - width) / 2.0,
                Align::Right => self.width - width,
            };
        let y = self.top + (self.options.font_size * 2.0 - height) / 2.0;
        let index = TextIndex::from_layout(&layout, &text)?;
        let mut text_ordinal = 0;
        for line in layout.lines() {
            for item in line.items() {
                let PositionedLayoutItem::GlyphRun(glyph_run) = item else {
                    continue;
                };
                let run = glyph_run.run();
                let command = GlyphRunCommand {
                    font_data: run.font().clone(),
                    font_size: run.font_size(),
                    hint: false,
                    normalized_coords: Vec::new(),
                    embolden: Vec2::ZERO,
                    style: peniko::Fill::NonZero.into(),
                    brush: Paint::Solid(peniko::Color::from_rgb8(85, 101, 117)),
                    brush_alpha: 1.0,
                    transform: Affine::scale(0.75) * Affine::translate((x, y)),
                    glyph_transform: None,
                    glyphs: glyph_run
                        .positioned_glyphs()
                        .map(|g| Glyph {
                            id: g.id,
                            x: g.x,
                            y: g.y,
                        })
                        .collect(),
                };
                if let Some(bounds) = text_bounds(&command)
                    && (bounds.x0 < self.left * 0.75 - 0.01
                        || bounds.x1 > (self.left + self.width) * 0.75 + 0.01
                        || bounds.y0 < self.top * 0.75 - 0.01
                        || bounds.y1 > (self.top + self.options.font_size * 2.0) * 0.75 + 0.01)
                {
                    return Err("pageNumbers glyphs extend beyond the footer".into());
                }
                draw_text(surface, cache, index.get(text_ordinal)?, &command)?;
                text_ordinal += 1;
            }
        }
        Ok(())
    }
}
