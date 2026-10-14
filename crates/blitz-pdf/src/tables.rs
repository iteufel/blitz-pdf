//! Repeating row groups are measured from the actual laid-out table cells.
//! Row/group DOM nodes need not own boxes in Blitz's flattened table grid.
use blitz_dom::Node;
use kurbo::Rect;
use style::values::specified::box_::{Display, DisplayInside};

#[derive(Debug)]
pub struct Table {
    pub body_top: f64,
    pub body_bottom: f64,
    pub header: Option<Rect>,
    pub footer: Option<Rect>,
    pub rows: Vec<Rect>,
}

fn display(node: &Node) -> Option<Display> {
    node.primary_styles().map(|s| s.clone_display())
}

fn cells(node: &Node) -> Option<Rect> {
    let display = display(node)?;
    if display.is_none() {
        return None;
    }
    if display == Display::TableCell {
        let pos = node.absolute_position(0.0, 0.0);
        let size = node.final_layout().size;
        let bounds = Rect::new(
            f64::from(pos.x),
            f64::from(pos.y),
            f64::from(pos.x + size.width),
            f64::from(pos.y + size.height),
        );
        let bounds =
            crate::pagination::overflow_clip(node).map_or(bounds, |clip| bounds.intersect(clip));
        return (bounds.width() > 0.0 && bounds.height() > 0.0).then_some(bounds);
    }
    node.children
        .iter()
        .filter_map(|id| cells(node.with(*id)))
        .reduce(|a, b| a.union(b))
}

fn rows(node: &Node, result: &mut Vec<Rect>) {
    match display(node) {
        Some(Display::TableRow) => {
            if let Some(bounds) = cells(node) {
                result.push(bounds);
            }
        }
        Some(d) if !d.is_none() => {
            for id in &node.children {
                rows(node.with(*id), result);
            }
        }
        _ => {}
    }
}

pub fn collect(node: &Node, result: &mut Vec<Table>) {
    let Some(display) = display(node) else { return };
    if display.is_none() {
        return;
    }
    if display.inside() == DisplayInside::Table {
        let mut header = None;
        let mut footer = None;
        let mut body_rows = Vec::new();
        for id in &node.children {
            let group = node.with(*id);
            let inside = group.primary_styles().map(|s| s.clone_display().inside());
            match inside {
                Some(DisplayInside::TableHeaderGroup) if header.is_none() => header = cells(group),
                Some(DisplayInside::TableFooterGroup) if footer.is_none() => footer = cells(group),
                _ => rows(group, &mut body_rows),
            }
        }
        body_rows.sort_by(|a, b| a.y0.total_cmp(&b.y0));
        if let (Some(first), Some(last)) = (body_rows.first(), body_rows.last()) {
            let body_top = first.y0;
            let body_bottom = last.y1;
            // Include border spacing between a repeated group and the body.
            if let Some(h) = &mut header {
                h.y1 = h.y1.max(body_top);
            }
            if let Some(f) = &mut footer {
                f.y0 = f.y0.min(body_bottom);
            }
            result.push(Table {
                body_top,
                body_bottom,
                header,
                footer,
                rows: body_rows,
            });
        }
        // Nested tables remain part of their containing row's fragmentation.
        return;
    }
    for id in &node.children {
        collect(node.with(*id), result);
    }
}
