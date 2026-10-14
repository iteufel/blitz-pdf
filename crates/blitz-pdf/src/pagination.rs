//! Vertical fragmentation of Blitz's continuous layout. CSS rules come from
//! computed Stylo values, so external CSS, media queries and the cascade apply.
use anyrender::{Scene, recording::RenderCommand};
use blitz_dom::{BaseDocument, Node};
use kurbo::Rect;
use std::sync::Arc;
use style::computed_values::{direction::T as Direction, position::T as Position};
use style::values::specified::box_::{
    BreakBetween, BreakWithin, Display, DisplayInside, DisplayOutside, Overflow,
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

    fn clipped(self, clip: Option<Rect>) -> Option<Self> {
        let span = clip.map_or(self, |clip| Self {
            top: self.top.max(clip.y0),
            bottom: self.bottom.min(clip.y1),
        });
        (span.bottom > span.top + EPS).then_some(span)
    }
}

struct TextLine {
    span: Span,
    element: Arc<str>,
    index: Option<usize>,
}

fn pagination_error(
    code: &str,
    message: &str,
    page_index: usize,
    page_top: f64,
    available: f64,
    line: Option<&TextLine>,
) -> String {
    let context = line.map_or_else(
        || "element=unavailable; line_index=unavailable; line_range=unavailable".into(),
        |line| {
            format!(
                "element={}; line_index={}; line_range=[{:.3}, {:.3}]px; line_height={:.3}px",
                line.element,
                line.index
                    .map_or_else(|| "unavailable".into(), |index| index.to_string()),
                line.span.top,
                line.span.bottom,
                line.span.bottom - line.span.top,
            )
        },
    );
    format!(
        "[{code}] {message}; page_index={page_index}; page_top={page_top:.3}px; available_height={available:.3}px; {context}"
    )
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
    lines: Vec<TextLine>,
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

fn element_name(node: &Node) -> Arc<str> {
    let Some(element) = node.element_data() else {
        return format!("anonymous ({})", node.id).into();
    };
    let id = element
        .id
        .as_ref()
        .map(|id| format!("#{id}"))
        .unwrap_or_default();
    format!("{}{} ({})", element.name.local, id, node.id).into()
}

// Match Blitz's padding-box overflow clip. Flattened table cells use their
// layout parents, so the clipping container may not be their DOM parent.
pub(crate) fn overflow_clip(mut node: &Node) -> Option<Rect> {
    let mut clip: Option<Rect> = None;
    loop {
        if let Some(style) = node.primary_styles()
            && node
                .element_data()
                .is_some_and(|e| &*e.name.local != "html")
            && (style.get_box().overflow_x != Overflow::Visible
                || style.get_box().overflow_y != Overflow::Visible)
        {
            let pos = node.absolute_position(0.0, 0.0);
            let layout = node.final_layout();
            let bounds = Rect::new(
                f64::from(pos.x + layout.border.left),
                f64::from(pos.y + layout.border.top),
                f64::from(pos.x + layout.size.width - layout.border.right),
                f64::from(pos.y + layout.size.height - layout.border.bottom),
            );
            clip = Some(clip.map_or(bounds, |clip| clip.intersect(bounds)));
        }
        let Some(parent) = node.layout_parent.get() else {
            break;
        };
        node = node.with(parent);
    }
    clip
}

fn avoids(value: BreakBetween) -> bool {
    matches!(value, BreakBetween::Avoid | BreakBetween::AvoidPage)
}

// Match Blitz's inline height calculation: Parley adds a cursor line after a
// terminal forced break, but that line is not a CSS line box. Actual blank
// lines have a nonempty text range (the newline) and must keep their height.
fn css_lines(
    inline: &blitz_dom::node::TextLayout,
) -> impl Iterator<Item = parley::Line<'_, blitz_dom::node::TextBrush>> {
    let count = inline.layout.len();
    let trailing_cursor = count >= 2
        && inline
            .layout
            .get(count - 2)
            .is_some_and(|line| line.break_reason() == parley::layout::BreakReason::Explicit)
        && inline
            .layout
            .get(count - 1)
            .is_some_and(|line| line.text_range().is_empty() && line.items().next().is_none());
    let count = if inline.text.is_empty() && inline.layout.inline_boxes().len() == 0 {
        0
    } else {
        count - usize::from(trailing_cursor)
    };
    inline.layout.lines().take(count)
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
        let clip = overflow_clip(node);
        let mut spans = css_lines(inline).filter_map(|line| {
            let m = line.metrics();
            Span {
                top: offset + f64::from(m.block_min_coord),
                bottom: offset + f64::from(m.block_max_coord),
            }
            .clipped(clip)
        });
        if let Some(span) = if first { spans.next() } else { spans.last() } {
            return Some(span);
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
        let outer_clip = node
            .layout_parent
            .get()
            .and_then(|id| overflow_clip(node.with(id)));
        let clip = overflow_clip(node);
        if outer_clip.is_some_and(|clip| clip.height() <= EPS || clip.width() <= EPS) {
            return;
        }
        let block = display.outside() != DisplayOutside::Inline;
        if block && display != Display::Contents {
            if outer_clip.is_none_or(|clip| start >= clip.y0 - EPS && start < clip.y1 - EPS) {
                self.force(
                    style.get_box().break_before,
                    if first { 0.0 } else { start },
                    true,
                    rtl,
                );
            }
            // A terminal break-after has no subsequent content to move.
            if let Some(next) = next_top
                && outer_clip.is_none_or(|clip| next >= clip.y0 - EPS && next <= clip.y1 + EPS)
            {
                self.force(style.get_box().break_after, next, false, rtl);
            }
        }
        if ((block
            && matches!(
                style.get_box().break_inside,
                BreakWithin::Avoid | BreakWithin::AvoidPage
            ))
            || display == Display::TableRow
            || node
                .element_data()
                .is_some_and(|e| matches!(e.name.local.as_ref(), "img" | "svg")))
            && let Some(span) = (Span {
                top: start,
                bottom: end,
            })
            .clipped(outer_clip)
        {
            self.avoid.push(span);
        }

        if let Some(inline) = node
            .element_data()
            .and_then(|e| e.inline_layout_data.as_ref())
        {
            let offset =
                start + f64::from(layout.border.top + layout.padding.top + inline.block_offset);
            let element = element_name(node);
            let lines: Vec<_> = css_lines(inline)
                .enumerate()
                .filter_map(|(index, line)| {
                    let metrics = line.metrics();
                    let span = (Span {
                        top: offset + f64::from(metrics.block_min_coord),
                        bottom: offset + f64::from(metrics.block_max_coord),
                    })
                    .clipped(clip)?;
                    self.lines.push(TextLine {
                        span,
                        element: element.clone(),
                        index: Some(index),
                    });
                    Some(span)
                })
                .collect();
            self.paragraphs.push(Paragraph {
                top: clip.map_or(start, |clip| start.max(clip.y0)),
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
                if top(next) > end + EPS
                    && let Some(span) = (Span {
                        top: end,
                        bottom: top(next),
                    })
                    .clipped(clip)
                {
                    self.margins.push(span);
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
                if top(next) >= child_end - EPS
                    && let Some(span) = (Span {
                        top: edge_line(child, false).map_or(top(child), |s| s.top),
                        bottom: edge_line(next, true).map_or(next_end, |s| s.bottom),
                    })
                    .clipped(clip)
                {
                    self.avoid.push(span);
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
        let mut clips = crate::pdf::ClipBounds::default();
        for command in &scene.commands {
            clips.update(command);
            if let RenderCommand::GlyphRun(run) = command
                && let Some(bounds) = crate::pdf::text_bounds(run)
            {
                let bounds = clips.intersect(bounds);
                if bounds.width() > EPS && bounds.height() > EPS {
                    self.lines.push(TextLine {
                        span: Span {
                            top: bounds.y0,
                            bottom: bounds.y1,
                        },
                        element: "unavailable (painted glyph run)".into(),
                        index: None,
                    });
                }
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
                    return Err(pagination_error(
                        "PAGINATION_TABLE_GROUPS_TOO_TALL",
                        "Repeated table header and footer leave no space for table rows",
                        pages.len(),
                        start,
                        available,
                        None,
                    ));
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
                    let mut blocking_line = None;
                    for line in &self.lines {
                        if line.span.crosses(end) && line.span.top < earlier {
                            earlier = line.span.top;
                            blocking_line = Some(line);
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
                        return Err(pagination_error(
                            "PAGINATION_FORCED_BREAK_INTERSECTS_LINE",
                            "A forced page break intersects a text line; put the break on a non-overlapping block boundary",
                            pages.len(),
                            start,
                            available,
                            blocking_line,
                        ));
                    }
                    if earlier <= start + EPS {
                        let too_tall = blocking_line
                            .is_some_and(|line| line.span.bottom - line.span.top > available + EPS);
                        let (code, message) = if too_tall {
                            (
                                "PAGINATION_LINE_TOO_TALL",
                                "A text line is taller than the printable page",
                            )
                        } else {
                            (
                                "PAGINATION_NO_PROGRESS",
                                "Pagination cannot advance without splitting overlapping text lines",
                            )
                        };
                        return Err(pagination_error(
                            code,
                            message,
                            pages.len(),
                            start,
                            available,
                            blocking_line,
                        ));
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
                    return Err(pagination_error(
                        "PAGINATION_NO_PROGRESS",
                        "Repeated table groups prevent pagination from making progress",
                        pages.len(),
                        start,
                        available,
                        None,
                    ));
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
