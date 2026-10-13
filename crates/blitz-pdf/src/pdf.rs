use crate::text::TextIndex;
use anyrender::{
    Paint, Scene,
    recording::{GlyphRunCommand, RenderCommand},
};
use krilla::{
    Document, SerializeSettings,
    blend::BlendMode,
    color::rgb,
    configure::{Archival, ConfigurationBuilder},
    geom::{Path, PathBuilder, Point, Size, Transform},
    image::Image,
    num::NormalizedF32,
    page::PageSettings,
    paint::{
        Fill, FillRule, LinearGradient, Paint as PdfPaint, RadialGradient, SpreadMethod, Stop,
        SweepGradient,
    },
    surface::Surface,
    text::{Font, GlyphId, KrillaGlyph},
};
use kurbo::{Affine, BezPath, PathEl, Rect, Shape};
use peniko::{Extend, GradientKind, ImageAlphaType, ImageFormat, Mix};
use skrifa::{
    FontRef, GlyphId as SkrifaGlyphId, MetadataProvider,
    instance::{LocationRef, NormalizedCoord, Size as FontSize},
};
use std::collections::HashMap;

fn norm(value: f32) -> NormalizedF32 {
    NormalizedF32::new(value.clamp(0.0, 1.0)).unwrap()
}
fn transform(value: Affine) -> Transform {
    let [a, b, c, d, e, f] = value.as_coeffs().map(|v| v as f32);
    Transform::from_row(a, b, c, d, e, f)
}
fn rule(value: peniko::Fill) -> FillRule {
    match value {
        peniko::Fill::NonZero => FillRule::NonZero,
        peniko::Fill::EvenOdd => FillRule::EvenOdd,
    }
}
fn path(value: &BezPath) -> Option<Path> {
    let mut builder = PathBuilder::new();
    for el in value.elements() {
        match *el {
            PathEl::MoveTo(p) => builder.move_to(p.x as f32, p.y as f32),
            PathEl::LineTo(p) => builder.line_to(p.x as f32, p.y as f32),
            PathEl::QuadTo(a, b) => builder.quad_to(a.x as f32, a.y as f32, b.x as f32, b.y as f32),
            PathEl::CurveTo(a, b, c) => builder.cubic_to(
                a.x as f32, a.y as f32, b.x as f32, b.y as f32, c.x as f32, c.y as f32,
            ),
            PathEl::ClosePath => builder.close(),
        }
    }
    builder.finish()
}

fn paint(
    value: &Paint,
    brush_transform: Option<Affine>,
) -> Result<(PdfPaint, NormalizedF32), String> {
    match value {
        Paint::Solid(color) => {
            let [r, g, b, a] = color.components;
            Ok((
                rgb::Color::new(
                    (r.clamp(0.0, 1.0) * 255.0).round() as u8,
                    (g.clamp(0.0, 1.0) * 255.0).round() as u8,
                    (b.clamp(0.0, 1.0) * 255.0).round() as u8,
                )
                .into(),
                norm(a),
            ))
        }
        Paint::Gradient(gradient) => {
            let stops = gradient
                .stops
                .iter()
                .map(|stop| {
                    let color = stop.color.to_alpha_color::<peniko::color::Srgb>();
                    let [r, g, b, a] = color.components;
                    Stop {
                        offset: norm(stop.offset),
                        color: rgb::Color::new(
                            (r.clamp(0.0, 1.0) * 255.0).round() as u8,
                            (g.clamp(0.0, 1.0) * 255.0).round() as u8,
                            (b.clamp(0.0, 1.0) * 255.0).round() as u8,
                        )
                        .into(),
                        opacity: norm(a),
                    }
                })
                .collect();
            let spread_method = match gradient.extend {
                Extend::Pad => SpreadMethod::Pad,
                Extend::Repeat => SpreadMethod::Repeat,
                Extend::Reflect => SpreadMethod::Reflect,
            };
            let transform = transform(brush_transform.unwrap_or(Affine::IDENTITY));
            let result: PdfPaint = match gradient.kind {
                GradientKind::Linear(p) => LinearGradient {
                    x1: p.start.x as f32,
                    y1: p.start.y as f32,
                    x2: p.end.x as f32,
                    y2: p.end.y as f32,
                    transform,
                    spread_method,
                    stops,
                    anti_alias: true,
                }
                .into(),
                GradientKind::Radial(p) => {
                    if gradient.extend != Extend::Pad {
                        return Err("Repeating radial gradients are not supported by the vector PDF backend".into());
                    }
                    RadialGradient {
                        fx: p.start_center.x as f32,
                        fy: p.start_center.y as f32,
                        fr: p.start_radius,
                        cx: p.end_center.x as f32,
                        cy: p.end_center.y as f32,
                        cr: p.end_radius,
                        transform,
                        spread_method,
                        stops,
                        anti_alias: true,
                    }
                    .into()
                }
                GradientKind::Sweep(p) => SweepGradient {
                    cx: p.center.x as f32,
                    cy: p.center.y as f32,
                    start_angle: -p.start_angle.to_degrees(),
                    end_angle: -p.end_angle.to_degrees(),
                    transform,
                    spread_method,
                    stops,
                    anti_alias: true,
                }
                .into(),
            };
            Ok((result, NormalizedF32::ONE))
        }
        _ => Err("Unsupported paint in vector PDF output".into()),
    }
}

fn blend(mix: Mix) -> Result<BlendMode, String> {
    Ok(match mix {
        Mix::Normal => BlendMode::Normal,
        Mix::Multiply => BlendMode::Multiply,
        Mix::Screen => BlendMode::Screen,
        Mix::Overlay => BlendMode::Overlay,
        Mix::Darken => BlendMode::Darken,
        Mix::Lighten => BlendMode::Lighten,
        Mix::ColorDodge => BlendMode::ColorDodge,
        Mix::ColorBurn => BlendMode::ColorBurn,
        Mix::HardLight => BlendMode::HardLight,
        Mix::SoftLight => BlendMode::SoftLight,
        Mix::Difference => BlendMode::Difference,
        Mix::Exclusion => BlendMode::Exclusion,
        Mix::Hue => BlendMode::Hue,
        Mix::Saturation => BlendMode::Saturation,
        Mix::Color => BlendMode::Color,
        Mix::Luminosity => BlendMode::Luminosity,
    })
}

#[derive(Default)]
pub(crate) struct Cache {
    fonts: HashMap<(u64, u32), Font>,
    images: HashMap<u64, Image>,
}

impl Cache {
    fn font(&mut self, run: &GlyphRunCommand) -> Result<Font, String> {
        if run.normalized_coords.iter().any(|c| *c != 0) {
            return Err("Non-default variable font instances are not supported yet; supply a static TTF or OTF font".into());
        }
        let key = (run.font_data.data.id(), run.font_data.index);
        if let Some(font) = self.fonts.get(&key) {
            return Ok(font.clone());
        }
        let font = Font::new(
            run.font_data.data.as_ref().to_vec().into(),
            run.font_data.index,
        )
        .ok_or("Could not embed font in PDF")?;
        self.fonts.insert(key, font.clone());
        Ok(font)
    }

    fn image(&mut self, data: &peniko::ImageData) -> Result<Image, String> {
        if let Some(image) = self.images.get(&data.data.id()) {
            return Ok(image.clone());
        }
        if u64::from(data.width) * u64::from(data.height) > 16_777_216 {
            return Err("Image exceeds 16 megapixels".into());
        }
        let mut pixels = data.data.as_ref().to_vec();
        for pixel in pixels.as_chunks_mut::<4>().0 {
            match data.format {
                ImageFormat::Rgba8 => {}
                ImageFormat::Bgra8 => pixel.swap(0, 2),
                _ => return Err("Unsupported source image format".into()),
            }
            if data.alpha_type == ImageAlphaType::AlphaPremultiplied && pixel[3] != 0 {
                let alpha = u32::from(pixel[3]);
                for channel in &mut pixel[..3] {
                    *channel = ((u32::from(*channel) * 255 + alpha / 2) / alpha).min(255) as u8;
                }
            }
        }
        let image = Image::from_rgba8(pixels, data.width, data.height);
        self.images.insert(data.data.id(), image.clone());
        Ok(image)
    }
}

fn draw_fill(
    surface: &mut Surface<'_>,
    cache: &mut Cache,
    shape: &BezPath,
    fill: peniko::Fill,
    affine: Affine,
    brush: &Paint,
    brush_affine: Option<Affine>,
) -> Result<(), String> {
    let Some(pdf_path) = path(shape) else {
        return Ok(());
    };
    if let Paint::Image(brush) = brush {
        let brush_affine = brush_affine.unwrap_or(Affine::IDENTITY);
        if brush_affine.determinant().abs() < 1e-12 {
            return Ok(());
        }
        let image = cache.image(&brush.image)?;
        let w = f64::from(brush.image.width);
        let h = f64::from(brush.image.height);
        if w > 0.0 && h > 0.0 {
            let bounds = brush_affine
                .inverse()
                .transform_rect_bbox(shape.bounding_box());
            let xs = if brush.sampler.x_extend == Extend::Pad {
                0..1
            } else {
                (bounds.x0 / w).floor() as i32..(bounds.x1 / w).ceil() as i32
            };
            let ys = if brush.sampler.y_extend == Extend::Pad {
                0..1
            } else {
                (bounds.y0 / h).floor() as i32..(bounds.y1 / h).ceil() as i32
            };
            if i64::from(xs.end - xs.start) * i64::from(ys.end - ys.start) > 10_000 {
                return Err("Too many repeated image tiles".into());
            }
            surface.push_transform(&transform(affine));
            surface.push_clip_path(&pdf_path, &rule(fill));
            surface.push_transform(&transform(brush_affine));
            surface.push_opacity(norm(brush.sampler.alpha));
            for y in ys {
                for x in xs.clone() {
                    let flip_x = brush.sampler.x_extend == Extend::Reflect && x % 2 != 0;
                    let flip_y = brush.sampler.y_extend == Extend::Reflect && y % 2 != 0;
                    let matrix = Affine::translate((
                        (f64::from(x) + f64::from(flip_x)) * w,
                        (f64::from(y) + f64::from(flip_y)) * h,
                    )) * Affine::scale_non_uniform(
                        if flip_x { -1.0 } else { 1.0 },
                        if flip_y { -1.0 } else { 1.0 },
                    );
                    surface.push_transform(&transform(matrix));
                    surface.draw_image(image.clone(), Size::from_wh(w as f32, h as f32).unwrap());
                    surface.pop();
                }
            }
            surface.pop();
            surface.pop();
            surface.pop();
            surface.pop();
        }
    } else {
        let (paint, opacity) = paint(brush, brush_affine)?;
        surface.push_transform(&transform(affine));
        surface.set_stroke(None);
        surface.set_fill(Some(Fill {
            paint,
            opacity,
            rule: rule(fill),
        }));
        surface.draw_path(&pdf_path);
        surface.pop();
    }
    Ok(())
}

pub(crate) fn draw_text(
    surface: &mut Surface<'_>,
    cache: &mut Cache,
    index: &TextIndex,
    run: &GlyphRunCommand,
) -> Result<(), String> {
    if run.glyphs.is_empty() || run.font_size <= 0.0 {
        return Ok(());
    }
    let source = index.get(run)?;
    let font = cache.font(run)?;
    let glyph_affine = run.glyph_transform.unwrap_or(Affine::IDENTITY);
    let inverse = glyph_affine.inverse();
    let glyphs: Vec<_> = run
        .glyphs
        .iter()
        .zip(&source.ranges)
        .map(|(glyph, range)| {
            // Transform glyph outlines around their own origin, retaining the exact
            // shaped positions when Blitz synthesizes italic text.
            let point = inverse * kurbo::Point::new(f64::from(glyph.x), f64::from(glyph.y));
            KrillaGlyph::new(
                GlyphId::new(glyph.id),
                0.0,
                point.x as f32 / run.font_size,
                -point.y as f32 / run.font_size,
                0.0,
                range.clone(),
                None,
            )
        })
        .collect();
    let (paint, opacity) = paint(&run.brush, None)?;
    surface.push_transform(&transform(run.transform * glyph_affine));
    surface.push_opacity(norm(run.brush_alpha));
    surface.set_stroke(None);
    surface.set_fill(Some(Fill {
        paint,
        opacity,
        rule: FillRule::NonZero,
    }));
    surface.draw_glyphs(
        Point::from_xy(0.0, 0.0),
        &glyphs,
        font,
        &source.text,
        run.font_size,
        false,
    );
    surface.pop();
    surface.pop();
    Ok(())
}

pub(crate) fn text_bounds(run: &GlyphRunCommand) -> Option<Rect> {
    let font = FontRef::from_index(run.font_data.data.as_ref(), run.font_data.index).ok()?;
    let coords: Vec<_> = run
        .normalized_coords
        .iter()
        .map(|c| NormalizedCoord::from_bits(*c))
        .collect();
    let metrics = font.glyph_metrics(FontSize::new(run.font_size), LocationRef::new(&coords));
    let mut result: Option<Rect> = None;
    for glyph in &run.glyphs {
        let Some(bounds) = metrics.bounds(SkrifaGlyphId::new(glyph.id)) else {
            continue;
        };
        let outline = Rect::new(
            f64::from(bounds.x_min),
            -f64::from(bounds.y_max),
            f64::from(bounds.x_max),
            -f64::from(bounds.y_min),
        );
        let affine = run.transform
            * Affine::translate((f64::from(glyph.x), f64::from(glyph.y)))
            * run.glyph_transform.unwrap_or(Affine::IDENTITY);
        let bounds = affine.transform_rect_bbox(outline);
        result = Some(result.map_or(bounds, |r| r.union(bounds)));
    }
    result
}

fn intersects_page(shape: &BezPath, affine: Affine, top: f64, bottom: f64) -> bool {
    let bounds = affine.transform_rect_bbox(shape.bounding_box());
    // Do not replay the next fragment's border exactly on the clip edge:
    // PDF viewers can otherwise antialias a hairline onto the previous page.
    bounds.y1 > top + 0.001 && bounds.y0 < bottom - 0.001
}

pub fn render(
    scene: &Scene,
    index: &TextIndex,
    ranges: &[crate::pagination::PageRange],
    options: &crate::Options,
) -> Result<Vec<u8>, String> {
    let (width, height) = (options.width, options.height);
    let margin = &options.margin;
    let page_numbers = options.page_numbers.as_ref();
    let content_width = width - margin.left - margin.right;
    // Enforce PDF/A-3u on every export: ICC-managed colors, output intent,
    // embedded fonts, Unicode mappings and matching XMP identification.
    // Krilla fails finish() if any input violates the archival requirements.
    let configuration = ConfigurationBuilder::new()
        .with_archival_validator(Archival::A3_U)
        .finish()
        .map_err(|e| format!("Invalid PDF/A-3u configuration: {e:?}"))?;
    let mut pdf = Document::new_with(SerializeSettings {
        configuration,
        ..Default::default()
    });
    crate::document::apply(&mut pdf, options)?;
    let mut cache = Cache::default();
    let mut numbering = page_numbers
        .map(|options| crate::page_numbers::PageNumbers::new(options, [width, height], margin));
    for (page_index, range) in ranges.iter().enumerate() {
        let (top, bottom) = (range.top, range.bottom);
        let mut page = pdf.start_page_with(
            PageSettings::from_wh((width * 0.75) as f32, (height * 0.75) as f32)
                .ok_or("Invalid PDF page size")?,
        );
        let mut surface = page.surface();
        let result = if range.blank {
            Ok(())
        } else {
            surface.push_transform(&transform(
                Affine::scale(0.75) * Affine::translate((margin.left, margin.top)),
            ));
            surface.push_clip_path(
                &path(&Rect::new(0.0, 0.0, content_width, bottom - top).to_path(0.01)).unwrap(),
                &FillRule::NonZero,
            );
            surface.push_transform(&transform(Affine::translate((0.0, -top))));
            let mut layers = Vec::new();
            let result = (|| -> Result<(), String> {
                for command in &scene.commands {
                    match command {
                        RenderCommand::PushLayer(c) => {
                            if c.filter.is_some() || c.backdrop_filter.is_some() {
                                return Err(
                                    "CSS filters are not supported by the vector PDF backend"
                                        .into(),
                                );
                            }
                            if c.blend.compose != peniko::Compose::SrcOver {
                                return Err(
                                    "Unsupported Porter-Duff compositing in vector PDF output"
                                        .into(),
                                );
                            }
                            let clip =
                                path(&(c.transform * &c.clip)).ok_or("Invalid layer clip")?;
                            surface.push_clip_path(&clip, &rule(c.fill));
                            surface.push_opacity(norm(c.alpha));
                            surface.push_blend_mode(blend(c.blend.mix)?);
                            layers.push(3);
                        }
                        RenderCommand::PushClipLayer(c) => {
                            let clip = path(&(c.transform * &c.clip)).ok_or("Invalid clip path")?;
                            surface.push_clip_path(&clip, &rule(c.fill));
                            layers.push(1);
                        }
                        RenderCommand::PopLayer => {
                            for _ in 0..layers.pop().ok_or("Unbalanced paint layers")? {
                                surface.pop();
                            }
                        }
                        RenderCommand::Fill(c)
                            if intersects_page(&c.shape, c.transform, top, bottom) =>
                        {
                            draw_fill(
                                &mut surface,
                                &mut cache,
                                &c.shape,
                                c.fill,
                                c.transform,
                                &c.brush,
                                c.brush_transform,
                            )?
                        }
                        RenderCommand::Fill(_) => {}
                        RenderCommand::Stroke(c) => {
                            let outline = kurbo::stroke(
                                c.shape.elements().iter().copied(),
                                &c.style,
                                &Default::default(),
                                0.01,
                            );
                            if !intersects_page(&outline, c.transform, top, bottom) {
                                continue;
                            }
                            draw_fill(
                                &mut surface,
                                &mut cache,
                                &outline,
                                peniko::Fill::NonZero,
                                c.transform,
                                &c.brush,
                                c.brush_transform,
                            )?;
                        }
                        RenderCommand::GlyphRun(c) => {
                            if let Some(g) = c.glyphs.first() {
                                let y = text_bounds(c).map(|r| r.y0).unwrap_or_else(|| {
                                    (c.transform
                                        * kurbo::Point::new(f64::from(g.x), f64::from(g.y)))
                                    .y
                                });
                                // Embed only text belonging to this page, preserving
                                // extraction order without duplicate clipped text.
                                if y >= top - 0.01 && y < bottom - 0.01 {
                                    draw_text(&mut surface, &mut cache, index, c)?;
                                }
                            }
                        }
                        RenderCommand::BoxShadow(c) => {
                            if c.std_dev > 0.0 {
                                return Err(
                                "Blurred box shadows are not supported by the vector PDF backend"
                                    .into(),
                            );
                            }
                            let shape = c.rect.to_rounded_rect(c.radius).to_path(0.01);
                            if !intersects_page(&shape, c.transform, top, bottom) {
                                continue;
                            }
                            draw_fill(
                                &mut surface,
                                &mut cache,
                                &shape,
                                peniko::Fill::NonZero,
                                c.transform,
                                &Paint::Solid(c.brush),
                                None,
                            )?;
                        }
                    }
                }
                if !layers.is_empty() {
                    return Err("Unbalanced paint layers".into());
                }
                Ok(())
            })();
            // Krilla checks balanced stacks when a surface is dropped. Even rejected
            // commands must unwind cleanly so a user error cannot poison the WASM
            // instance and break subsequent renders.
            for count in layers.into_iter().rev() {
                for _ in 0..count {
                    surface.pop();
                }
            }
            surface.pop();
            surface.pop();
            surface.pop();
            result
        };
        let result = result.and_then(|()| {
            if let Some(numbering) = &mut numbering {
                numbering.draw(page_index + 1, ranges.len(), &mut surface, &mut cache)?;
            }
            Ok(())
        });
        surface.finish();
        page.finish();
        result?;
    }
    pdf.finish()
        .map_err(|e| format!("PDF/A-3u export failed: {e:?}"))
}
