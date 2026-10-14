//! Read parsed page declarations from the document's effective stylesheets.
//! Stylo handles CSS syntax, shorthand expansion, imports and media queries.
use blitz_dom::{BaseDocument, Node, node::SpecialElementData};
use cssparser::Parser;
use std::borrow::Cow;
use style::media_queries::MediaList;
use style::parser::ParserContext;
use style::properties::{LonghandId, PropertyDeclaration, PropertyDeclarationId};
use style::stylesheets::{
    CssRule, CustomMediaEvaluator, CustomMediaMap, DocumentStyleSheet, StylesheetInDocument,
};
use style::values::computed::{Context, Length, PageSize, PageSizeOrientation, ToComputedValue};

pub fn apply(doc: &mut BaseDocument, options: &mut crate::Options) -> Result<bool, String> {
    let mut sheets = Vec::new();
    collect_sheets(doc.root_element(), &mut sheets);
    let device = doc.stylist_device();
    let custom_media = CustomMediaMap::default();
    let mut winners: [Option<(PropertyDeclaration, bool)>; 5] = Default::default();
    for (sheet, media) in sheets {
        let guard = sheet.0.shared_lock.read();
        if !sheet.enabled() || !sheet.is_effective_for_device(device, &custom_media, &guard) {
            continue;
        }
        // Blitz does not attach <style>/<link> media attributes to the stored
        // stylesheet. Evaluate them here with Stylo's media-query parser.
        if let Some(media) = media {
            let contents = sheet.contents(&guard);
            let mut context = ParserContext::new(
                contents.origin,
                &contents.url_data,
                None,
                style_traits::ParsingMode::DEFAULT,
                contents.quirks_mode,
                Cow::Borrowed(&contents.namespaces),
                None,
                None,
                Default::default(),
            );
            let media = MediaList::parse(&mut context, &mut Parser::new(&media));
            if !media.evaluate(
                device,
                contents.quirks_mode,
                &mut CustomMediaEvaluator::new(&custom_media, &guard),
            ) {
                continue;
            }
        }
        for rule in sheet
            .contents(&guard)
            .effective_rules(device, &custom_media, &guard)
        {
            let CssRule::Page(rule) = rule else { continue };
            let rule = rule.read_with(&guard);
            // A continuous layout has one page geometry. Named/pseudo pages
            // must not accidentally change the geometry of every page.
            if !rule.selectors.is_empty() {
                continue;
            }
            for (declaration, importance) in
                rule.block.read_with(&guard).declaration_importance_iter()
            {
                let slot = match declaration.id() {
                    PropertyDeclarationId::Longhand(LonghandId::Size) => 0,
                    PropertyDeclarationId::Longhand(LonghandId::MarginTop) => 1,
                    PropertyDeclarationId::Longhand(LonghandId::MarginRight) => 2,
                    PropertyDeclarationId::Longhand(LonghandId::MarginBottom) => 3,
                    PropertyDeclarationId::Longhand(LonghandId::MarginLeft) => 4,
                    _ => continue,
                };
                let important = importance.important();
                if winners[slot]
                    .as_ref()
                    .is_none_or(|(_, old)| important || !old)
                {
                    winners[slot] = Some((declaration.clone(), important));
                }
            }
        }
    }
    let before = (options.width, options.height, options.margin.clone());
    Context::for_media_query_evaluation(device, device.quirks_mode(), |context| {
        if options.use_css_page_size
            && let Some((PropertyDeclaration::Size(size), _)) = &winners[0]
        {
            match size.to_computed_value(context) {
                PageSize::Size(size) => {
                    options.width = f64::from(size.width.0.px());
                    options.height = f64::from(size.height.0.px());
                }
                PageSize::Orientation(orientation) => {
                    let landscape = orientation == PageSizeOrientation::Landscape;
                    if (options.width > options.height) != landscape {
                        std::mem::swap(&mut options.width, &mut options.height);
                    }
                }
                PageSize::Auto => {}
            }
        }
        for (slot, target, basis) in [
            (1, &mut options.margin.top, options.height),
            (2, &mut options.margin.right, options.width),
            (3, &mut options.margin.bottom, options.height),
            (4, &mut options.margin.left, options.width),
        ] {
            let Some((declaration, _)) = &winners[slot] else {
                continue;
            };
            let specified = match declaration {
                PropertyDeclaration::MarginTop(value)
                | PropertyDeclaration::MarginRight(value)
                | PropertyDeclaration::MarginBottom(value)
                | PropertyDeclaration::MarginLeft(value) => value,
                PropertyDeclaration::CSSWideKeyword(..) => {
                    *target = 0.0;
                    continue;
                }
                _ => continue,
            };
            *target = match specified.to_computed_value(context) {
                style::values::generics::length::GenericMargin::Auto => 0.0,
                style::values::generics::length::GenericMargin::LengthPercentage(value) => {
                    f64::from(value.percentage_relative_to(Length::new(basis as f32)).px())
                }
                _ => 0.0,
            };
        }
    });
    validate(options)?;
    Ok(before != (options.width, options.height, options.margin.clone()))
}

fn collect_sheets(node: &Node, sheets: &mut Vec<(DocumentStyleSheet, Option<String>)>) {
    if let Some(element) = node.element_data()
        && let SpecialElementData::Stylesheet(sheet) = &element.special_data
    {
        sheets.push((
            sheet.clone(),
            element
                .attr(blitz_dom::local_name!("media"))
                .map(str::to_owned),
        ));
    }
    for id in &node.children {
        collect_sheets(node.with(*id), sheets);
    }
}

pub fn validate(o: &crate::Options) -> Result<(), String> {
    if [o.width, o.height]
        .iter()
        .any(|v| !v.is_finite() || *v <= 0.0 || *v > 19_200.0)
    {
        return Err("Page dimensions must be positive and at most 19200 CSS pixels".into());
    }
    if [o.margin.top, o.margin.right, o.margin.bottom, o.margin.left]
        .iter()
        .any(|v| !v.is_finite() || *v < 0.0)
        || o.content_width() < 1.0
        || o.content_height() < 1.0
    {
        return Err("Page margins and pageNumbers must be non-negative and leave at least one CSS pixel of content".into());
    }
    Ok(())
}
