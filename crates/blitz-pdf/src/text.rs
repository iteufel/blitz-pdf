use anyrender::{
    Scene,
    recording::{GlyphRunCommand, RenderCommand},
};
use blitz_dom::{BaseDocument, node::TextBrush};
use parley::{Layout, PositionedLayoutItem};
use std::{cell::RefCell, collections::HashMap, ops::Range, sync::Arc};

#[derive(Clone, Debug, PartialEq)]
pub struct TextRun {
    pub text: Arc<str>,
    pub ranges: Vec<Range<usize>>,
}

#[derive(PartialEq, Eq)]
struct Key {
    font: u64,
    index: u32,
    size: u32,
    glyphs: Vec<(u32, u32, u32)>,
}

impl Key {
    fn from_command(run: &GlyphRunCommand) -> Self {
        Self {
            font: run.font_data.data.id(),
            index: run.font_data.index,
            size: run.font_size.to_bits(),
            glyphs: run
                .glyphs
                .iter()
                .map(|g| (g.id, g.x.to_bits(), g.y.to_bits()))
                .collect(),
        }
    }
}

/// One source per painted glyph command, in paint order. This identity survives
/// page clipping and repeated table fragments; equal glyph shapes never alias.
#[derive(Default)]
pub struct TextIndex {
    runs: Vec<TextRun>,
}

impl TextIndex {
    pub fn paint(doc: &mut BaseDocument, width: u32, height: u32) -> Result<(Scene, Self), String> {
        let recorder = RefCell::new(TextRecorder::default());
        let mut scene = Scene::new();
        blitz_paint::paint_scene_with_text(&mut scene, doc, 1.0, width, height, 0, 0, &recorder);
        let recorder = recorder.into_inner();
        if let Some(error) = recorder.error {
            return Err(error);
        }
        let mut observed = recorder.runs.into_iter();
        let mut index = Self::default();
        for command in &scene.commands {
            if let RenderCommand::GlyphRun(run) = command {
                let Some((key, source)) = observed.next() else {
                    return Err("Painted glyph run has no Unicode source".into());
                };
                if key != Key::from_command(run) {
                    return Err("Painted glyph run does not match its Unicode source".into());
                }
                index.runs.push(source);
            }
        }
        if observed.next().is_some() {
            return Err("Unicode source has no matching painted glyph run".into());
        }
        Ok((scene, index))
    }

    pub fn get(&self, ordinal: usize) -> Result<&TextRun, String> {
        self.runs
            .get(ordinal)
            .ok_or_else(|| "Painted glyph run has no Unicode source".into())
    }

    pub fn from_layout(layout: &Layout<TextBrush>, text: &str) -> Result<Self, String> {
        Ok(Self {
            runs: layout_runs(layout, text)?
                .into_iter()
                .map(|(_, source)| source)
                .collect(),
        })
    }
}

#[derive(Default)]
struct TextRecorder {
    runs: Vec<(Key, TextRun)>,
    error: Option<String>,
}

impl blitz_paint::TextObserver for TextRecorder {
    fn observe(&mut self, layout: &Layout<TextBrush>, text: &str) {
        if self.error.is_none() {
            match layout_runs(layout, text) {
                Ok(runs) => self.runs.extend(runs),
                Err(error) => self.error = Some(error),
            }
        }
    }
}

/// Map UTF-8 byte ranges from the exact shaped layout, including complete
/// ligatures, combining clusters, right-to-left runs, and style-split runs.
fn layout_runs(layout: &Layout<TextBrush>, text: &str) -> Result<Vec<(Key, TextRun)>, String> {
    let mut result = Vec::new();
    for line in layout.lines() {
        let mut consumed = HashMap::<(usize, usize), usize>::new();
        for item in line.items() {
            let PositionedLayoutItem::GlyphRun(glyph_run) = item else {
                continue;
            };
            let run = glyph_run.run();
            // A ligature may span multiple grapheme clusters. Its first
            // cluster owns the glyphs; continuation clusters extend the
            // source range. Preserve the entire range for every glyph.
            let mut groups: Vec<(Range<usize>, Vec<parley::Glyph>)> = Vec::new();
            for cluster in run.clusters() {
                if cluster.is_ligature_continuation() {
                    if let Some((range, _)) = groups.last_mut() {
                        range.end = cluster.text_range().end;
                    }
                } else {
                    groups.push((cluster.text_range(), cluster.glyphs().collect()));
                }
            }
            if run.is_rtl() {
                groups.reverse();
            }
            let mapped: Vec<_> = groups
                .into_iter()
                .flat_map(|(range, glyphs)| glyphs.into_iter().map(move |g| (g.id, range.clone())))
                .collect();
            let glyphs: Vec<_> = glyph_run.positioned_glyphs().collect();
            let run_range = run.text_range();
            let offset = consumed
                .entry((run_range.start, run_range.end))
                .or_default();
            let subset = mapped
                .get(*offset..*offset + glyphs.len())
                .ok_or("Could not associate shaped glyphs with their source text")?;
            *offset += glyphs.len();
            if subset.iter().zip(&glyphs).any(|((id, _), g)| *id != g.id) {
                return Err("Shaped glyph order does not match the source text".into());
            }
            let start = subset.iter().map(|(_, r)| r.start).min().unwrap_or(0);
            let end = subset.iter().map(|(_, r)| r.end).max().unwrap_or(start);
            let source = text.get(start..end).ok_or("Invalid text cluster range")?;
            let source = TextRun {
                text: Arc::from(source),
                ranges: subset
                    .iter()
                    .map(|(_, r)| r.start - start..r.end - start)
                    .collect(),
            };
            let key = Key {
                font: run.font().data.id(),
                index: run.font().index,
                size: run.font_size().to_bits(),
                glyphs: glyphs
                    .iter()
                    .map(|g| (g.id, g.x.to_bits(), g.y.to_bits()))
                    .collect(),
            };
            result.push((key, source));
        }
    }
    Ok(result)
}
