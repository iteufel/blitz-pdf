//! Vertical fragmentation of Blitz's continuous layout. CSS rules come from
//! computed Stylo values, so external CSS, media queries and the cascade apply.
use anyrender::{Scene, recording::RenderCommand};
use blitz_dom::{BaseDocument, Node};
use style::computed_values::{direction::T as Direction, position::T as Position};
use style::values::specified::box_::{
    BreakBetween, BreakWithin, Display, DisplayInside, DisplayOutside,
};

const EPS: f64 = 0.01;
pub const ROUNDING_EPS: f64 = 0.5;

#[derive(Clone, Copy, Debug)]
struct Span {
    top: f64,
    bottom: f64,
}

impl Span {
    fn crosses(self, y: f64) -> bool {
        self.top < y - EPS && self.bottom > y + EPS
    }
}

#[derive(Clone, Copy)]
struct ForcedBreak {
    y: f64,
    // None means any page; Some(true) means an odd (recto) page.
    odd: Option<bool>,
    before: bool,
}

struct Paragraph {
    top: f64,
    lines: Vec<Span>,
    orphans: usize,
    widows: usize,
}

#[derive(Clone)]
pub struct PageRange {
    pub top: f64,
    pub bottom: f64,
    pub blank: bool,
    pub offset: f64,
    pub repeats: Vec<crate::pdf::Fragment>,
}

#[derive(Default)]
pub struct Pagination {
    forced: Vec<ForcedBreak>,
    avoid: Vec<Span>,
    lines: Vec<Span>,
    paragraphs: Vec<Paragraph>,
    tables: Vec<crate::tables::Table>,
    margins: Vec<Span>,
}

fn in_flow(node: &Node) -> bool {
    node.primary_styles().is_some_and(|s| {
        !s.clone_display().is_none()
            && !matches!(s.get_box().position, Position::Absolute | Position::Fixed)
    })
}

fn top(node: &Node) -> f64 {
    f64::from(node.absolute_position(0.0, 0.0).y)
}

fn avoids(value: BreakBetween) -> bool {
    matches!(value, BreakBetween::Avoid | BreakBetween::AvoidPage)
}

// Keep only adjoining line fragments together. Keeping both entire blocks
// would discard heading protection whenever the following paragraph is long.
fn edge_line(node: &Node, first: bool) -> Option<Span> {
    if let Some(inline) = node
        .element_data()
        .and_then(|e| e.inline_layout_data.as_ref())
    {
        let layout = node.final_layout();
        let offset =
            top(node) + f64::from(layout.border.top + layout.padding.top + inline.block_offset);
        let line = if first {
            inline.layout.lines().next()
        } else {
            inline.layout.lines().last()
        };
        if let Some(line) = line {
            let m = line.metrics();
            return Some(Span {
                top: offset + f64::from(m.block_min_coord),
                bottom: offset + f64::from(m.block_max_coord),
            });
        }
    }
    let children = node.layout_children.borrow();
    let children = children.as_ref()?;
    let mut spans = children
        .iter()
        .map(|id| node.with(*id))
        .filter(|n| in_flow(n))
        .filter_map(|n| edge_line(n, first));
    if first { spans.next() } else { spans.last() }
}

impl Pagination {
    pub fn from_document(doc: &BaseDocument) -> Self {
        let mut result = Self::default();
        let rtl = doc
            .root_element()
            .primary_styles()
            .is_some_and(|s| s.get_inherited_box().direction == Direction::Rtl);
        result.visit(doc.root_element(), None, rtl, true);
        crate::tables::collect(doc.root_element(), &mut result.tables);
        for table in &result.tables {
            result.avoid.extend(table.rows.iter().map(|row| Span {
                top: row.y0,
                bottom: row.y1,
            }));
            if let (Some(header), Some(first)) = (table.header, table.rows.first()) {
                result.avoid.push(Span {
                    top: header.y0,
                    bottom: first.y1,
                });
            }
            if let (Some(footer), Some(last)) = (table.footer, table.rows.last()) {
                result.avoid.push(Span {
                    top: last.y0,
                    bottom: footer.y1,
                });
            }
        }
        // A following break-before wins over a preceding break-after at the
        // same boundary. Collapse both into one break (no accidental blank page).
        result
            .forced
            .sort_by(|a, b| a.y.total_cmp(&b.y).then(a.before.cmp(&b.before)));
        let mut merged: Vec<ForcedBreak> = Vec::new();
        for point in result.forced {
            if let Some(previous) = merged.last_mut()
                && (previous.y - point.y).abs() < EPS
            {
                *previous = point;
            } else {
                merged.push(point);
            }
        }
        result.forced = merged;
        result
    }

    fn force(&mut self, value: BreakBetween, y: f64, before: bool, rtl: bool) {
        let odd = match value {
            BreakBetween::Always | BreakBetween::Page => None,
            BreakBetween::Left => Some(rtl),
            BreakBetween::Right => Some(!rtl),
            BreakBetween::Recto => Some(true),
            BreakBetween::Verso => Some(false),
            _ => return,
        };
        self.forced.push(ForcedBreak { y, odd, before });
    }

    fn visit(&mut self, node: &Node, next_top: Option<f64>, rtl: bool, first: bool) {
        if !in_flow(node) {
            return;
        }
        let Some(style) = node.primary_styles() else {
            return;
        };
        let display = style.clone_display();
        let layout = node.final_layout();
        let start = top(node);
        let end = start + f64::from(layout.size.height);
        let block = display.outside() != DisplayOutside::Inline;
        if block && display != Display::Contents {
            self.force(
                style.get_box().break_before,
                if first { 0.0 } else { start },
                true,
                rtl,
            );
            // A terminal break-after has no subsequent content to move.
            if let Some(next) = next_top {
                self.force(style.get_box().break_after, next, false, rtl);
            }
        }
        if (block
            && matches!(
                style.get_box().break_inside,
                BreakWithin::Avoid | BreakWithin::AvoidPage
            ))
            || display == Display::TableRow
            || node
                .element_data()
                .is_some_and(|e| matches!(e.name.local.as_ref(), "img" | "svg"))
        {
            self.avoid.push(Span {
                top: start,
                bottom: end,
            });
        }

        if let Some(inline) = node
            .element_data()
            .and_then(|e| e.inline_layout_data.as_ref())
        {
            let offset =
                start + f64::from(layout.border.top + layout.padding.top + inline.block_offset);
            let lines: Vec<_> = inline
                .layout
                .lines()
                .map(|line| {
                    let metrics = line.metrics();
                    Span {
                        top: offset + f64::from(metrics.block_min_coord),
                        bottom: offset + f64::from(metrics.block_max_coord),
                    }
                })
                .collect();
            self.lines.extend(lines.iter().copied());
            self.paragraphs.push(Paragraph {
                top: start,
                lines,
                orphans: style.get_inherited_box().orphans as usize,
                widows: style.get_inherited_box().widows as usize,
            });
        }

        let children = node.layout_children.borrow();
        let Some(children) = children.as_ref() else {
            return;
        };
        let children: Vec<_> = children
            .iter()
            .map(|id| node.with(*id))
            .filter(|n| in_flow(n))
            .collect();
        for (i, child) in children.iter().enumerate() {
            let next = children.get(i + 1).copied();
            if let Some(next) = next {
                let end = top(child) + f64::from(child.final_layout().size.height);
                if top(next) > end + EPS {
                    self.margins.push(Span {
                        top: end,
                        bottom: top(next),
                    });
                }
            }
            let boundary = next.map(top).or(next_top);
            let first_child = first && i == 0 && layout.padding.top + layout.border.top == 0.0;
            self.visit(child, boundary, rtl, first_child);
            // Keep-with-next/previous applies at adjoining block boundaries.
            // It must not collect unrelated parallel flex/grid columns.
            if let Some(next) = next
                && !matches!(display.inside(), DisplayInside::Flex | DisplayInside::Grid)
                && let (Some(a), Some(b)) = (child.primary_styles(), next.primary_styles())
                && (avoids(a.get_box().break_after) || avoids(b.get_box().break_before))
            {
                let child_end = top(child) + f64::from(child.final_layout().size.height);
                let next_end = top(next) + f64::from(next.final_layout().size.height);
                if top(next) >= child_end - EPS {
                    self.avoid.push(Span {
                        top: edge_line(child, false).map_or(top(child), |s| s.top),
                        bottom: edge_line(next, true).map_or(next_end, |s| s.bottom),
                    });
                }
            }
        }
    }

    pub fn pages(
        mut self,
        scene: &Scene,
        total_height: f64,
        height: f64,
        rounding: f64,
        max_pages: u32,
    ) -> Result<Vec<PageRange>, String> {
        // Glyph ink may exceed its CSS line box (combining marks, transforms).
        // Both must fit without clipping. Whitespace-only glyphs have no ink.
        for command in &scene.commands {
            if let RenderCommand::GlyphRun(run) = command
                && let Some(r) = crate::pdf::text_bounds(run)
            {
                self.lines.push(Span {
                    top: r.y0,
                    bottom: r.y1,
                });
            }
        }
        let mut pages = Vec::new();
        let mut start = 0.0;
        let mut next_break = 0;
        while start < total_height - EPS || pages.is_empty() {
            // Discard adjoining block margins at an explicit break. Otherwise
            // a full preceding page can leave a margin-only blank page.
            if !pages.is_empty()
                && let Some(point) = self.forced.get(next_break)
                && point.y > start + EPS
                && self
                    .margins
                    .iter()
                    .any(|m| m.top <= start + EPS && m.bottom >= point.y - EPS)
            {
                start = point.y;
            }
            while let Some(point) = self.forced.get(next_break)
                && point.y <= start + EPS
            {
                if let Some(odd) = point.odd
                    && ((pages.len() + 1) % 2 == 1) != odd
                {
                    push(
                        &mut pages,
                        PageRange {
                            top: start,
                            bottom: start,
                            blank: true,
                            offset: 0.0,
                            repeats: Vec::new(),
                        },
                        max_pages,
                    )?;
                }
                next_break += 1;
            }
            let header = self
                .tables
                .iter()
                .find(|t| start >= t.body_top - EPS && start < t.body_bottom - EPS)
                .and_then(|t| t.header);
            let offset = header.map_or(0.0, |h| h.height());
            let mut available = height - offset;
            let mut footer = None;
            let end = loop {
                if available < 1.0 {
                    return Err(
                        "Repeated table header and footer leave no space for table rows".into(),
                    );
                }
                let limit = if total_height <= start + available + rounding {
                    total_height.max(1.0)
                } else {
                    start + available
                };
                let forced = self
                    .forced
                    .get(next_break)
                    .filter(|b| b.y <= limit + EPS && b.y < total_height - EPS);
                let mut end = forced.map_or(limit, |b| b.y);
                loop {
                    let mut earlier = end;
                    for line in &self.lines {
                        if line.crosses(end) {
                            earlier = earlier.min(line.top);
                        }
                    }
                    if forced.is_none() {
                        for span in &self.avoid {
                            // An oversized avoid block has to fragment; relaxing
                            // avoidance here guarantees forward progress.
                            if span.crosses(end)
                                && span.bottom - span.top <= available + EPS
                                && span.top > start + EPS
                            {
                                earlier = earlier.min(span.top);
                            }
                        }
                        for p in &self.paragraphs {
                            let first = p.lines.partition_point(|l| l.bottom <= start + EPS);
                            let split = p.lines.partition_point(|l| l.bottom <= end + EPS);
                            if split <= first || split >= p.lines.len() {
                                continue;
                            }
                            if (split - first < p.orphans
                                || p.lines.len() < p.orphans.saturating_add(p.widows))
                                && p.top > start + EPS
                            {
                                earlier = earlier.min(p.top);
                            } else if p.lines.len() - split < p.widows {
                                let cut = p.lines.len().saturating_sub(p.widows);
                                if cut > first && cut - first >= p.orphans {
                                    earlier = earlier.min(p.lines[cut].top);
                                } else if p.top > start + EPS {
                                    earlier = earlier.min(p.top);
                                }
                            }
                        }
                    }
                    if earlier >= end - EPS {
                        break;
                    }
                    if forced.is_some() {
                        return Err("A forced page break intersects a text line; put the break on a non-overlapping block boundary".into());
                    }
                    if earlier <= start + EPS {
                        return Err("A text line is taller than the printable page; increase page height or reduce font size".into());
                    }
                    end = earlier;
                }
                if footer.is_none() {
                    let candidate = self
                        .tables
                        .iter()
                        .find(|t| end > t.body_top + EPS && end < t.body_bottom - EPS)
                        .and_then(|t| t.footer);
                    if let Some(group) = candidate {
                        footer = Some(group);
                        available -= group.height();
                        continue;
                    }
                }
                if end <= start + EPS {
                    return Err(
                        "Repeated table groups prevent pagination from making progress".into(),
                    );
                }
                break end;
            };
            // If reserving the footer moved the entire table to the next page,
            // there is no table body on this page to accompany that footer.
            footer = footer.filter(|f| {
                self.tables.iter().any(|t| {
                    t.footer == Some(*f) && end > t.body_top + EPS && end < t.body_bottom - EPS
                })
            });
            let mut repeats = Vec::new();
            if let Some(h) = header {
                repeats.push(fragment(h, 0.0));
            }
            if let Some(f) = footer {
                repeats.push(fragment(f, offset + end - start));
            }
            push(
                &mut pages,
                PageRange {
                    top: start,
                    bottom: end,
                    blank: false,
                    offset,
                    repeats,
                },
                max_pages,
            )?;
            start = end;
        }
        Ok(pages)
    }
}

fn push(pages: &mut Vec<PageRange>, page: PageRange, max_pages: u32) -> Result<(), String> {
    if pages.len() >= max_pages as usize {
        return Err(format!("Document exceeds maxPages ({max_pages})"));
    }
    pages.push(page);
    Ok(())
}

fn fragment(rect: kurbo::Rect, y: f64) -> crate::pdf::Fragment {
    crate::pdf::Fragment {
        left: rect.x0,
        top: rect.y0,
        right: rect.x1,
        bottom: rect.y1,
        x: rect.x0,
        y,
    }
}
