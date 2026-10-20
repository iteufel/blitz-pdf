//! Document metadata and associated files, independent of page painting.
use krilla::{
    Document,
    embed::{AssociationKind, EmbeddedFile, MimeType},
    metadata::{DateTime, Metadata, XmpExtension, XmpProperty},
};
use serde::Deserialize;
use serde_bytes::ByteBuf;
use std::collections::HashSet;

#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct DocumentMetadata {
    title: Option<String>,
    #[serde(default)]
    authors: Vec<String>,
    subject: Option<String>,
    #[serde(default)]
    keywords: Vec<String>,
    creator: Option<String>,
    producer: Option<String>,
    language: Option<String>,
    creation_date: Option<f64>,
    modification_date: Option<f64>,
    document_id: Option<String>,
    #[serde(default)]
    xmp: Vec<XmpSchema>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct Attachment {
    name: String,
    data: ByteBuf,
    mime_type: String,
    description: String,
    relationship: Relationship,
    modification_date: Option<f64>,
    compress: Option<bool>,
}

#[derive(Clone, Copy, Deserialize)]
enum Relationship {
    Source,
    Data,
    Alternative,
    Supplement,
    Unspecified,
}

impl Relationship {
    fn kind(self) -> AssociationKind {
        match self {
            Self::Source => AssociationKind::Source,
            Self::Data => AssociationKind::Data,
            Self::Alternative => AssociationKind::Alternative,
            Self::Supplement => AssociationKind::Supplement,
            Self::Unspecified => AssociationKind::Unspecified,
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct XmpSchema {
    name: String,
    prefix: String,
    namespace_uri: String,
    properties: Vec<XmpTextProperty>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct XmpTextProperty {
    name: String,
    value: String,
    description: String,
    category: Category,
}

#[derive(Deserialize)]
#[serde(rename_all = "lowercase")]
enum Category {
    Internal,
    External,
}

fn xml_name(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 128
        && !value.to_ascii_lowercase().starts_with("xml")
        && value.bytes().enumerate().all(|(i, c)| {
            c.is_ascii_alphabetic()
                || c == b'_'
                || (i > 0 && (c.is_ascii_digit() || c == b'.' || c == b'-'))
        })
}

fn validate_xmp(schemas: &[XmpSchema]) -> Result<(), String> {
    const RESERVED_PREFIXES: &[&str] = &[
        "x",
        "rdf",
        "dc",
        "pdf",
        "pdfaid",
        "pdfuaid",
        "pdfxid",
        "stRef",
        "stEvt",
        "stVer",
        "stJob",
        "stFnt",
        "stDim",
        "pdfaExtension",
        "pdfaSchema",
        "pdfaProperty",
        "pdfaType",
        "pdfaField",
        "xmp",
        "xmpRights",
        "xmpG",
        "xmpMM",
        "xmpBJ",
        "xmpTPg",
        "xmpDM",
        "xmpGImg",
        "xmpidq",
    ];
    const RESERVED_NAMESPACES: &[&str] = &[
        "adobe:ns:meta/",
        "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
        "http://purl.org/dc/elements/1.1/",
        "http://www.w3.org/XML/1998/namespace",
        "http://www.w3.org/2000/xmlns/",
        "http://ns.adobe.com/pdf/1.3/",
        "http://ns.adobe.com/xmp/Identifier/qual/1.0/",
        "http://www.npes.org/pdfx/ns/id/",
        "http://www.aiim.org/pdfua/ns/id/",
        "http://ns.adobe.com/xap/1.0/",
        "http://ns.adobe.com/xap/1.0/rights/",
        "http://ns.adobe.com/xap/1.0/sType/ResourceRef#",
        "http://ns.adobe.com/xap/1.0/sType/ResourceEvent#",
        "http://ns.adobe.com/xap/1.0/sType/Version#",
        "http://ns.adobe.com/xap/1.0/sType/Job#",
        "http://ns.adobe.com/xap/1.0/g/",
        "http://ns.adobe.com/xap/1.0/sType/Font#",
        "http://ns.adobe.com/xap/1.0/sType/Dimensions#",
        "http://ns.adobe.com/xap/1.0/mm/",
        "http://ns.adobe.com/xap/1.0/bj/",
        "http://ns.adobe.com/xap/1.0/t/pg/",
        "http://ns.adobe.com/xap/1.0/DynamicMedia/",
        "http://ns.adobe.com/xap/1.0/g/img/",
        "http://www.aiim.org/pdfa/ns/id/",
        "http://www.aiim.org/pdfa/ns/extension/",
        "http://www.aiim.org/pdfa/ns/schema#",
        "http://www.aiim.org/pdfa/ns/property#",
        "http://www.aiim.org/pdfa/ns/type#",
        "http://www.aiim.org/pdfa/ns/field#",
    ];
    if schemas.len() > 32 || schemas.iter().map(|s| s.properties.len()).sum::<usize>() > 256 {
        return Err("metadata.xmp exceeds the 32 schema or 256 property limit".into());
    }
    let mut prefixes = HashSet::new();
    let mut namespaces = HashSet::new();
    let mut size = 0;
    for schema in schemas {
        let uri = &schema.namespace_uri;
        let absolute_uri = uri.split_once(':').is_some_and(|(scheme, rest)| {
            !scheme.is_empty()
                && !rest.is_empty()
                && scheme.bytes().enumerate().all(|(i, c)| {
                    c.is_ascii_alphabetic()
                        || (i > 0 && (c.is_ascii_digit() || matches!(c, b'+' | b'-' | b'.')))
                })
        });
        if !valid_text(&schema.name)
            || schema.name.trim().is_empty()
            || !xml_name(&schema.prefix)
            || !valid_text(uri)
            || !absolute_uri
            || !uri
                .bytes()
                .all(|c| c.is_ascii_graphic() && !matches!(c, b'<' | b'>' | b'"' | b'\'' | b'&'))
        {
            return Err("Invalid XMP schema name, prefix, or absolute namespace URI".into());
        }
        if RESERVED_PREFIXES.contains(&schema.prefix.as_str())
            || RESERVED_NAMESPACES.contains(&uri.as_str())
        {
            return Err("Reserved XMP prefix or namespace".into());
        }
        if !prefixes.insert(&schema.prefix) || !namespaces.insert(uri) {
            return Err("Duplicate XMP prefix or namespace".into());
        }
        if schema.properties.is_empty() {
            return Err("XMP schemas must contain properties".into());
        }
        size += schema.name.len() + schema.prefix.len() + uri.len();
        let mut names = HashSet::new();
        for property in &schema.properties {
            if !xml_name(&property.name)
                || !valid_text(&property.value)
                || !valid_text(&property.description)
                || property.description.trim().is_empty()
            {
                return Err("Invalid XMP property name, value, or description".into());
            }
            if !names.insert(&property.name) {
                return Err("Duplicate XMP property name".into());
            }
            size += property.name.len() + property.value.len() + property.description.len();
        }
    }
    if size > 1024 * 1024 {
        return Err("metadata.xmp exceeds the 1 MiB limit".into());
    }
    Ok(())
}

fn valid_text(value: &str) -> bool {
    value.len() <= 16 * 1024 && value.chars().all(|c| matches!(c,
        '\u{9}' | '\u{a}' | '\u{d}' | '\u{20}'..='\u{d7ff}' | '\u{e000}'..='\u{fffd}' | '\u{10000}'..='\u{10ffff}'))
}

fn validate_date(value: Option<f64>) -> Result<(), String> {
    if value.is_some_and(|date| {
        !date.is_finite() || !(-62_135_596_800_000.0..=253_402_300_799_999.0).contains(&date)
    }) {
        return Err("Metadata and attachment dates must be in years 0001 through 9999".into());
    }
    Ok(())
}

pub(crate) fn validate(options: &crate::Options) -> Result<(), String> {
    let metadata = &options.metadata;
    validate_xmp(&metadata.xmp)?;
    for value in [
        &options.title,
        &metadata.title,
        &metadata.subject,
        &metadata.creator,
        &metadata.producer,
        &metadata.language,
        &metadata.document_id,
    ]
    .into_iter()
    .flatten()
    .chain(metadata.authors.iter())
    .chain(metadata.keywords.iter())
    {
        if !valid_text(value) {
            return Err("Metadata must contain valid XML text of at most 16 KiB per field".into());
        }
    }
    if metadata.authors.len() > 256
        || metadata.keywords.len() > 256
        || !valid_text(&metadata.authors.join(", "))
        || !valid_text(&metadata.keywords.join(", "))
    {
        return Err("Metadata author/keyword lists exceed their limits".into());
    }
    validate_date(metadata.creation_date)?;
    validate_date(metadata.modification_date)?;
    if let (Some(created), Some(modified)) = (metadata.creation_date, metadata.modification_date)
        && modified < created
    {
        return Err("metadata.modificationDate must not precede creationDate".into());
    }
    if options.attachments.len() > 100
        || options
            .attachments
            .iter()
            .map(|a| a.data.len())
            .sum::<usize>()
            > 64 * 1024 * 1024
    {
        return Err("Attachments exceed the 100 file or 64 MiB limit".into());
    }
    let mut names = HashSet::new();
    for file in &options.attachments {
        if !valid_text(&file.name)
            || file.name.len() > 255
            || file.name.trim().is_empty()
            || [".", ".."].contains(&file.name.as_str())
            || file
                .name
                .chars()
                .any(|c| c.is_control() || matches!(c, '/' | '\\' | ':'))
        {
            return Err(
                "Attachment name must be a filename without directories or control characters"
                    .into(),
            );
        }
        if !names.insert(&file.name) {
            return Err(format!("Duplicate attachment name: {}", file.name));
        }
        if MimeType::new(&file.mime_type).is_none() {
            return Err(format!("Invalid attachment MIME type: {}", file.mime_type));
        }
        if !valid_text(&file.description) {
            return Err(
                "Attachment description must contain valid XML text of at most 16 KiB".into(),
            );
        }
        validate_date(file.modification_date)?;
    }
    Ok(())
}

/// UTC calendar fields for an ECMAScript time value. Both backends share this
/// so PDF dates do not depend on the host's `Date` implementation. Unix time
/// has no leap seconds; the calendar is proleptic Gregorian (Howard Hinnant).
fn date(timestamp: f64) -> DateTime {
    let millis = timestamp.trunc();
    let millis = if millis >= i64::MAX as f64 {
        i64::MAX
    } else if millis <= i64::MIN as f64 {
        i64::MIN
    } else {
        millis as i64
    };
    let seconds = millis.div_euclid(1000);
    let days = seconds.div_euclid(86_400);
    let sod = seconds.rem_euclid(86_400) as u32;
    let (year, month, day) = civil_from_days(days);
    DateTime::new(year)
        .month(month)
        .day(day)
        .hour((sod / 3600) as u8)
        .minute(((sod % 3600) / 60) as u8)
        .second((sod % 60) as u8)
        .utc_offset_hour(0)
}

fn civil_from_days(days: i64) -> (u16, u8, u8) {
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let year = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = if month <= 2 { year + 1 } else { year };
    (year.clamp(0, 9999) as u16, month as u8, day as u8)
}

fn now_ms() -> f64 {
    #[cfg(all(feature = "wasm", target_arch = "wasm32"))]
    {
        js_sys::Date::now()
    }
    #[cfg(not(all(feature = "wasm", target_arch = "wasm32")))]
    {
        use std::time::{SystemTime, UNIX_EPOCH};
        match SystemTime::now().duration_since(UNIX_EPOCH) {
            Ok(duration) => duration.as_secs_f64() * 1000.0,
            Err(error) => -(error.duration().as_secs_f64() * 1000.0),
        }
    }
}

pub(crate) fn apply(pdf: &mut Document, options: &crate::Options) -> Result<(), String> {
    let input = &options.metadata;
    let created = input.creation_date.unwrap_or_else(now_ms);
    let modified = date(input.modification_date.unwrap_or(created));
    let mut metadata = Metadata::new()
        .producer(format!("blitz-pdf {}", env!("CARGO_PKG_VERSION")))
        .creation_date(date(created))
        .modification_date(modified)
        .authors(input.authors.clone())
        .keywords(input.keywords.clone());
    if let Some(title) = input.title.as_ref().or(options.title.as_ref()) {
        metadata = metadata.title(title.clone());
    }
    if let Some(subject) = &input.subject {
        metadata = metadata.description(subject.clone());
    }
    if let Some(creator) = &input.creator {
        metadata = metadata.creator(creator.clone());
    }
    if let Some(producer) = &input.producer {
        metadata = metadata.producer(producer.clone());
    }
    if let Some(language) = &input.language {
        metadata = metadata.language(language.clone());
    }
    if let Some(id) = &input.document_id {
        metadata = metadata.document_id(id.clone());
    }
    for schema in &input.xmp {
        metadata = metadata.xmp_extension(XmpExtension {
            name: schema.name.clone(),
            prefix: schema.prefix.clone(),
            namespace_uri: schema.namespace_uri.clone(),
            properties: schema
                .properties
                .iter()
                .map(|property| XmpProperty {
                    name: property.name.clone(),
                    value: property.value.clone(),
                    description: property.description.clone(),
                    internal: matches!(property.category, Category::Internal),
                })
                .collect(),
        });
    }
    pdf.set_metadata(metadata);
    for file in &options.attachments {
        pdf.embed_file(EmbeddedFile {
            path: file.name.clone(),
            mime_type: MimeType::new(&file.mime_type),
            description: Some(file.description.clone()),
            association_kind: file.relationship.kind(),
            data: file.data.to_vec().into(),
            modification_date: Some(file.modification_date.map(date).unwrap_or(modified)),
            compress: file.compress,
            location: None,
        })
        .ok_or_else(|| format!("Duplicate attachment name: {}", file.name))?;
    }
    Ok(())
}
