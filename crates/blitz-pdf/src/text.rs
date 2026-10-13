use anyrender::recording::GlyphRunCommand;
use blitz_dom::{
    BaseDocument,
    node::{ListItemLayoutPosition, Marker, TextBrush},
};
use parley::{Layout, PositionedLayoutItem};
use std::{collections::HashMap, ops::Range, sync::Arc};

#[derive(Clone, Debug, PartialEq)]
pub struct TextRun {
    pub text: Arc<str>,
    pub ranges: Vec<Range<usize>>,
}

#[derive(Hash, PartialEq, Eq)]
struct Key {
    font: u64,
    index: u32,
    size: u32,
    glyphs: Vec<(u32, u32, u32)>,
}

/// AnyRender deliberately omits source text. Recover it from the *same* Parley
/// layouts Blitz paints, retaining shaped cluster ranges rather than guessing
/// characters from a font's cmap (which loses ligatures and combining marks).
#[derive(Default)]
pub struct TextIndex {
    runs: HashMap<Key, Option<TextRun>>,
}

impl TextIndex {
    pub fn from_document(doc: &BaseDocument) -> Result<Self, String> {
        let mut index = Self::default();
        for (_, node) in doc.tree().iter() {
            let Some(element) = node.element_data() else {
                continue;
            };
            if let Some(inline) = &element.inline_layout_data {
                index.add_layout(&inline.layout, &inline.text)?;
            }
            if let Some(list) = &element.list_item_data
                && let ListItemLayoutPosition::Outside(layout) = &list.position
            {
                let text = match &list.marker {
                    Marker::Char(c) => c.to_string(),
                    Marker::String(s) => s.clone(),
                };
                index.add_layout(layout, &text)?;
            }
            if let Some(input) = element.text_input_data()
                && let Some(layout) = input.editor.try_layout()
            {
                index.add_layout(layout, input.editor.raw_text())?;
            }
        }
        Ok(index)
    }

    pub(crate) fn add_layout(
        &mut self,
        layout: &Layout<TextBrush>,
        text: &str,
    ) -> Result<(), String> {
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
                    .flat_map(|(range, glyphs)| {
                        glyphs.into_iter().map(move |g| (g.id, range.clone()))
                    })
                    .collect();
                let glyphs: Vec<_> = glyph_run.positioned_glyphs().collect();
                if glyphs.is_empty() {
                    continue;
                }
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
                let start = subset.iter().map(|(_, r)| r.start).min().unwrap();
                let end = subset.iter().map(|(_, r)| r.end).max().unwrap();
                let source = text.get(start..end).ok_or("Invalid text cluster range")?;
                let value = TextRun {
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
                self.runs
                    .entry(key)
                    .and_modify(|existing| {
                        // Identically shaped text can have different Unicode source
                        // (e.g. "fi" versus U+FB01). Never silently pick the wrong one.
                        if existing.as_ref() != Some(&value) {
                            *existing = None;
                        }
                    })
                    .or_insert(Some(value));
            }
        }
        Ok(())
    }

    pub fn get(&self, run: &GlyphRunCommand) -> Result<&TextRun, String> {
        let key = Key {
            font: run.font_data.data.id(),
            index: run.font_data.index,
            size: run.font_size.to_bits(),
            glyphs: run
                .glyphs
                .iter()
                .map(|g| (g.id, g.x.to_bits(), g.y.to_bits()))
                .collect(),
        };
        self.runs.get(&key).and_then(Option::as_ref).ok_or_else(|| {
            "Cannot preserve Unicode for an unrecognized or ambiguous text run".into()
        })
    }
}
