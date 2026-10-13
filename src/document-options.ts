import { assetBytes } from "./assets.js";
import { record } from "./validation.js";
import type { AssetData, AttachmentRelationship, PdfAttachment, PdfDate, PdfOptions, PdfXmpSchema } from "./types.js";

const MAX_ATTACHMENT_BYTES = 64 * 1024 * 1024;
const encoder = new TextEncoder();
const relationships = new Set(["Source", "Data", "Alternative", "Supplement", "Unspecified"]);
const reservedPrefixes = new Set(["x", "rdf", "dc", "pdf", "pdfaid", "pdfuaid", "pdfxid", "stRef", "stEvt", "stVer", "stJob", "stFnt", "stDim", "pdfaExtension", "pdfaSchema", "pdfaProperty", "pdfaType", "pdfaField", "xmp", "xmpRights", "xmpG", "xmpMM", "xmpBJ", "xmpTPg", "xmpDM", "xmpGImg", "xmpidq"]);
const reservedNamespaces = new Set([
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
]);

function keys(value: object, allowed: readonly string[], name: string) {
  record(value, name);
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) throw new TypeError(`Unknown ${name} option: ${key}`);
  }
}

function text(value: unknown, name: string, maxBytes = 16 * 1024): string {
  if (typeof value !== "string") throw new TypeError(`${name} must be a string`);
  // XML 1.0 characters only, including rejection of unpaired UTF-16 surrogates.
  if (/[^\u0009\u000a\u000d\u0020-\ud7ff\ue000-\ufffd\u{10000}-\u{10ffff}]/u.test(value)) {
    throw new TypeError(`${name} contains invalid XML characters`);
  }
  if (value.length > maxBytes || encoder.encode(value).byteLength > maxBytes) {
    throw new RangeError(`${name} exceeds the ${maxBytes} byte limit`);
  }
  // XML normalizes literal CR/CRLF to LF. Match that in the PDF Info dictionary.
  return value.replace(/\r\n?/g, "\n");
}

function optionalText(value: unknown, name: string) {
  return value === undefined ? null : text(value, name);
}

function textList(value: unknown, name: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new TypeError(`${name} must be an array of strings`);
  if (value.length > 256) throw new RangeError(`${name} must contain at most 256 entries`);
  const result = Array.from(value, (entry, i) => text(entry, `${name}[${i}]`));
  text(result.join(", "), name);
  return result;
}

function xmlName(value: unknown, label: string): string {
  const name = text(value, label, 128);
  if (!/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(name) || /^xml/i.test(name)) {
    throw new TypeError(`${label} must be an ASCII XML name without a colon or xml prefix`);
  }
  return name;
}

function xmpSchemas(value: readonly PdfXmpSchema[] | undefined) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new TypeError("metadata.xmp must be an array of schemas");
  if (value.length > 32) throw new RangeError("metadata.xmp exceeds the 32 schema limit");
  const prefixes = new Set<string>();
  const namespaces = new Set<string>();
  let count = 0, size = 0;
  return Array.from(value, (schema: PdfXmpSchema, i) => {
    const label = `metadata.xmp[${i}]`;
    keys(schema, ["name", "namespaceUri", "prefix", "properties"], label);
    const name = text(schema.name, `${label}.name`);
    if (!name.trim()) throw new TypeError(`${label}.name must not be empty`);
    const prefix = xmlName(schema.prefix, `${label}.prefix`);
    const namespaceUri = text(schema.namespaceUri, `${label}.namespaceUri`);
    // xmp-writer writes namespace declarations as attributes. Require an absolute,
    // ASCII URI without XML delimiters; callers can percent-encode these characters.
    if (!/^[a-z][a-z0-9+.-]*:[\x21-\x7e]+$/i.test(namespaceUri) || /[<>"'&]/.test(namespaceUri)) {
      throw new TypeError(`${label}.namespaceUri must be an absolute URI with XML delimiters percent-encoded`);
    }
    if (reservedPrefixes.has(prefix) || reservedNamespaces.has(namespaceUri)) {
      throw new TypeError(`${label} uses a reserved XMP prefix or namespace`);
    }
    if (prefixes.has(prefix) || namespaces.has(namespaceUri)) throw new TypeError(`${label} has a duplicate XMP prefix or namespace`);
    prefixes.add(prefix); namespaces.add(namespaceUri);
    if (!Array.isArray(schema.properties) || schema.properties.length === 0) throw new TypeError(`${label}.properties must be a non-empty array`);
    count += schema.properties.length;
    if (count > 256) throw new RangeError("metadata.xmp exceeds the 256 property limit");
    const propertyNames = new Set<string>();
    size += encoder.encode(name + namespaceUri + prefix).byteLength;
    const properties = Array.from(schema.properties, (property, j) => {
      const key = `${label}.properties[${j}]`;
      keys(property, ["name", "value", "description", "category"], key);
      const name = xmlName(property.name, `${key}.name`);
      if (propertyNames.has(name)) throw new TypeError(`${key} has a duplicate XMP property name`);
      propertyNames.add(name);
      const value = text(property.value, `${key}.value`);
      const description = text(property.description, `${key}.description`);
      if (!description.trim()) throw new TypeError(`${key}.description must not be empty`);
      const category = property.category === undefined ? "external" : property.category;
      if (category !== "internal" && category !== "external") throw new TypeError(`${key}.category must be internal or external`);
      size += encoder.encode(name + value + description).byteLength;
      if (size > 1024 * 1024) throw new RangeError("metadata.xmp exceeds the 1 MiB limit");
      return { name, value, description, category };
    });
    return { name, prefix, namespaceUri, properties };
  });
}

function date(value: PdfDate | undefined, name: string, fallback: number): number {
  if (value === undefined) return fallback;
  let result: number;
  if (value instanceof Date) result = value.getTime();
  else if (typeof value === "string") {
    const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.exec(value);
    if (!match) throw new TypeError(`${name} must be a Date or ISO timestamp with a timezone`);
    const [, y, mo, d, h, mi, s, zone] = match;
    const year = Number(y), month = Number(mo), day = Number(d);
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (month < 1 || month > 12 || day < 1 || day > days[month - 1]! ||
        Number(h) > 23 || Number(mi) > 59 || Number(s) > 59 ||
        (zone !== "Z" && (Number(zone!.slice(1, 3)) > 23 || Number(zone!.slice(4)) > 59))) {
      throw new RangeError(`${name} is not a valid calendar date`);
    }
    result = Date.parse(value);
  } else throw new TypeError(`${name} must be a Date or ISO timestamp with a timezone`);
  if (!Number.isFinite(result) || result < -62135596800000 || result > 253402300799999) {
    throw new RangeError(`${name} must be a valid date in years 0001 through 9999`);
  }
  return Math.floor(result / 1000) * 1000;
}

export function normalizeDocumentOptions(options: PdfOptions) {
  const legacyTitle = optionalText(options.title, "title");
  const input = options.metadata === undefined ? {} : options.metadata;
  keys(input, ["title", "author", "subject", "keywords", "creator", "producer", "language", "creationDate", "modificationDate", "documentId", "xmp"], "metadata");
  const creationDate = date(input.creationDate, "metadata.creationDate", Math.floor(Date.now() / 1000) * 1000);
  const modificationDate = date(input.modificationDate, "metadata.modificationDate", creationDate);
  if (modificationDate < creationDate) throw new RangeError("metadata.modificationDate must not precede creationDate");
  const language = optionalText(input.language, "metadata.language");
  if (language !== null && !/^(?:[a-z]{2,8}|x)(?:-[a-z0-9]{1,8})*$/i.test(language)) {
    throw new TypeError("metadata.language must be a language tag such as de-DE");
  }
  const metadata = {
    title: input.title === undefined ? legacyTitle : text(input.title, "metadata.title"),
    authors: textList(typeof input.author === "string" ? [input.author] : input.author, "metadata.author"),
    subject: optionalText(input.subject, "metadata.subject"),
    keywords: textList(input.keywords, "metadata.keywords"),
    creator: optionalText(input.creator, "metadata.creator"),
    producer: optionalText(input.producer, "metadata.producer"),
    language, creationDate, modificationDate,
    documentId: optionalText(input.documentId, "metadata.documentId"),
    xmp: xmpSchemas(input.xmp),
  };

  if (options.attachments !== undefined && !Array.isArray(options.attachments)) {
    throw new TypeError("attachments must be an array");
  }
  if ((options.attachments?.length ?? 0) > 100) {
    throw new RangeError("Attachments exceed the 100 file limit");
  }
  let totalBytes = 0;
  const names = new Set<string>();
  function attachment(file: PdfAttachment, label: string) {
    keys(file, ["name", "data", "mimeType", "description", "relationship", "modificationDate", "compress"], label);
    const name = text(file.name, `${label}.name`, 255);
    if (!name.trim() || name === "." || name === ".." || /[/\\:\u0000-\u001f\u007f-\u009f]/u.test(name)) {
      throw new TypeError(`${label}.name must be a filename without directories or control characters`);
    }
    const normalizedName = name.normalize("NFC");
    if (names.has(normalizedName)) throw new TypeError(`Duplicate attachment name: ${name}`);
    names.add(normalizedName);
    const mimeType = file.mimeType === undefined ? "application/octet-stream" : file.mimeType;
    if (typeof mimeType !== "string" || mimeType.length > 255 || !/^[a-z0-9][a-z0-9.+-]*\/[a-z0-9][a-z0-9.+-]*$/i.test(mimeType)) {
      throw new TypeError(`${label}.mimeType must be a MIME type without parameters`);
    }
    const relationship = file.relationship === undefined ? "Unspecified" : file.relationship;
    if (!relationships.has(relationship)) throw new TypeError(`${label}.relationship is invalid`);
    if (file.compress !== undefined && typeof file.compress !== "boolean") throw new TypeError(`${label}.compress must be a boolean`);
    const data = file.data;
    // Check binary sizes before allocating the defensive copy.
    const size = typeof data === "string" ? data.length : data instanceof Uint8Array || data instanceof ArrayBuffer ? data.byteLength : 0;
    if (totalBytes + size > MAX_ATTACHMENT_BYTES) throw new RangeError("Attachments exceed the 64 MiB limit");
    const bytes = assetBytes(data as AssetData, `${label}.data`);
    totalBytes += bytes.byteLength;
    if (totalBytes > MAX_ATTACHMENT_BYTES) throw new RangeError("Attachments exceed the 64 MiB limit");
    return {
      name, data: bytes, mimeType,
      description: file.description === undefined ? name : text(file.description, `${label}.description`),
      relationship: relationship as AttachmentRelationship,
      modificationDate: date(file.modificationDate, `${label}.modificationDate`, modificationDate),
      compress: file.compress ?? null,
    };
  }
  const attachments = Array.from(options.attachments ?? [], (file, i) => attachment(file, `attachments[${i}]`));
  return { metadata, attachments };
}
