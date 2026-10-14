import { expect, test } from "bun:test";
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, PDFString, PDFHexString, decodePDFRawStream } from "pdf-lib";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { renderPdf, type PdfOptions, type PdfXmpSchema } from "blitz-pdf";
import { normalizeOptions } from "../src/options";
import { inspect } from "./helpers";

const cii = `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100"/>`;
const invoiceSchema = (profile = "EN 16931"): PdfXmpSchema => ({
  name: "Factur-X PDFA Extension Schema", prefix: "fx",
  namespaceUri: "urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#",
  properties: [
    { name: "DocumentFileName", value: "factur-x.xml", description: "Embedded invoice filename" },
    { name: "DocumentType", value: "INVOICE", description: "Document type" },
    { name: "Version", value: "1.0", description: "Schema version" },
    { name: "ConformanceLevel", value: profile, description: "Invoice profile" },
  ],
});
const customSchema = (): PdfXmpSchema => ({
  name: "Project metadata", prefix: "acme", namespaceUri: "urn:example:project:1.0#",
  properties: [{ name: "ProjectId", value: "R&D <42> café", description: "Project identifier" }],
});
async function readAttachments(bytes: Uint8Array) {
  const task = getDocument({ data: bytes.slice() });
  try {
    const pdf = await task.promise;
    return await Promise.all([...(await pdf.getAttachments() ?? new Map()).entries()].map(async ([id, file]) => ({
      ...file, content: await pdf.getAttachmentContent(id),
    })));
  } finally { await task.destroy(); }
}
const fixedDate = "2026-10-13T12:34:56Z";
const name = PDFName.of;
const decodeText = (dict: PDFDict, key: string) => (dict.lookup(name(key)) as PDFString | PDFHexString).decodeText();
const xmp = (pdf: PDFDocument) => new TextDecoder().decode(pdf.catalog.lookup(name("Metadata"), PDFRawStream).contents);

test("writes matching Unicode document metadata and distinct UTC dates to Info and XMP", async () => {
  const bytes = await renderPdf("<p>Metadata</p>", {
    title: "Legacy title",
    metadata: {
      title: 'Rechnung <42> & "café"', author: ["Müller & Söhne", "Zoë"], subject: "Résumé <invoice>\r\nSecond line\rThird line",
      keywords: ["Rechnung", "R&D"], creator: "Invoice app", producer: "Custom producer",
      language: "de-DE", documentId: "invoice-42", creationDate: "2026-10-13T14:34:56.789+02:00",
      modificationDate: new Date("2026-10-14T01:02:03.456Z"),
    },
  });
  await inspect(bytes);
  const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
  expect(pdf.getTitle()).toBe('Rechnung <42> & "café"');
  expect(pdf.getAuthor()).toBe("Müller & Söhne, Zoë");
  expect(pdf.getSubject()).toBe("Résumé <invoice>\nSecond line\nThird line");
  expect(pdf.getKeywords()).toBe("Rechnung, R&D");
  expect(pdf.getCreator()).toBe("Invoice app");
  expect(pdf.getProducer()).toBe("Custom producer");
  expect(pdf.getCreationDate()?.toISOString()).toBe("2026-10-13T12:34:56.000Z");
  expect(pdf.getModificationDate()?.toISOString()).toBe("2026-10-14T01:02:03.000Z");
  expect(decodeText(pdf.catalog, "Lang")).toBe("de-DE");
  const task = getDocument({ data: bytes.slice() });
  try {
    const parsed = await task.promise;
    const { metadata } = await parsed.getMetadata();
    expect(metadata?.get("dc:title")).toBe(pdf.getTitle()!);
    expect(metadata?.get("dc:creator")).toEqual([pdf.getAuthor()!]);
    expect(metadata?.get("dc:description")).toBe(pdf.getSubject()!);
    expect(metadata?.get("pdf:keywords")).toBe(pdf.getKeywords()!);
    expect(metadata?.get("xmp:creatortool")).toBe(pdf.getCreator()!);
    expect(metadata?.get("pdf:producer")).toBe(pdf.getProducer()!);
    expect(Date.parse(metadata?.get("xmp:createdate") as string)).toBe(pdf.getCreationDate()!.getTime());
    expect(Date.parse(metadata?.get("xmp:modifydate") as string)).toBe(pdf.getModificationDate()!.getTime());
  } finally { await task.destroy(); }
});

test("retains title compatibility, empty-title override, and default modification date", async () => {
  const legacy = await PDFDocument.load(await renderPdf("", { title: "Legacy" }), { updateMetadata: false });
  expect(legacy.getTitle()).toBe("Legacy");
  const bytes = await renderPdf("", { title: "Legacy", metadata: { title: "", author: "One author", creationDate: fixedDate } });
  await inspect(bytes);
  const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
  expect(pdf.getTitle()).toBeUndefined();
  expect(pdf.getAuthor()).toBe("One author");
  expect(pdf.getCreationDate()).toEqual(pdf.getModificationDate());
});

test("direct attachments round-trip exact binary/text bytes with PDF/A associations and sorted names", async () => {
  const binary = new Uint8Array([0, 1, 127, 128, 255]);
  const files = [
    { name: "z.bin", data: binary.buffer, relationship: "Source" as const, compress: false },
    { name: "a.xml", data: '<invoice>café &amp; €</invoice>', mimeType: "application/xml", relationship: "Data" as const, compress: true },
    { name: "Résumé.txt", data: "Unicode attachment", mimeType: "text/plain", description: "Résumé & details", relationship: "Supplement" as const, modificationDate: "2026-10-12T00:00:00Z" },
    { name: "empty.bin", data: new Uint8Array(0) },
    { name: "alternative.bin", data: binary, relationship: "Alternative" as const },
  ];
  const bytes = await renderPdf("<p>Attachments</p>", { metadata: { creationDate: fixedDate }, attachments: files });
  await inspect(bytes);
  const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
  const af = pdf.catalog.lookup(name("AF"), PDFArray);
  const names = pdf.catalog.lookup(name("Names"), PDFDict).lookup(name("EmbeddedFiles"), PDFDict).lookup(name("Names"), PDFArray);
  expect(af.size()).toBe(files.length);
  expect(names.size()).toBe(files.length * 2);
  const sorted = [...files].sort((a, b) => Buffer.compare(Buffer.from(a.name), Buffer.from(b.name)));
  for (let i = 0; i < sorted.length; i++) {
    const input = sorted[i]!;
    const spec = af.lookup(i, PDFDict);
    expect(names.get(i * 2 + 1).toString()).toBe(af.get(i).toString());
    expect(decodeText(spec, "UF")).toBe(input.name);
    expect(spec.get(name("AFRelationship"))?.toString()).toBe(`/${input.relationship ?? "Unspecified"}`);
    expect(decodeText(spec, "Desc")).toBe(input.description ?? input.name);
    const ef = spec.lookup(name("EF"), PDFDict);
    expect(ef.get(name("F"))?.toString()).toBe(ef.get(name("UF"))?.toString());
    const stream = ef.lookup(name("F"), PDFRawStream);
    expect(stream.dict.lookup(name("Subtype"), PDFName).decodeText()).toBe(input.mimeType ?? "application/octet-stream");
    const expected = typeof input.data === "string" ? new TextEncoder().encode(input.data) : new Uint8Array(input.data);
    expect(decodePDFRawStream(stream).decode()).toEqual(expected);
    const params = stream.dict.lookup(name("Params"), PDFDict);
    expect(params.get(name("Size"))?.toString()).toBe(String(expected.length));
    expect(decodeText(params, "ModDate")).toBe(input.modificationDate ? "D:20261012000000Z" : "D:20261013123456Z");
  }
  const attachments = await readAttachments(bytes);
  expect(attachments.map(a => a.filename).sort()).toEqual(files.map(f => f.name).sort());
  expect(attachments.find(a => a.filename === "z.bin")?.content).toEqual(binary);
});

test("generic attachments and XMP schemas can express Factur-X packaging", async () => {
  const profile = "EN 16931";
  const bytes = await renderPdf("<h1>Invoice</h1>", {
    attachments: [{ name: "factur-x.xml", data: cii, mimeType: "text/xml", relationship: "Alternative" }],
    metadata: { xmp: [invoiceSchema(profile)] },
  });
  await inspect(bytes);
  const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
  const xml = xmp(pdf);
  expect(xml).toContain('xmlns:fx="urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#"');
  expect(xml).toContain("<fx:DocumentFileName>factur-x.xml</fx:DocumentFileName>");
  expect(xml).toContain("<fx:DocumentType>INVOICE</fx:DocumentType>");
  expect(xml).toContain("<fx:Version>1.0</fx:Version>");
  expect(xml).toContain(`<fx:ConformanceLevel>${profile}</fx:ConformanceLevel>`);
  expect(xml.match(/<pdfaExtension:schemas>/g)).toHaveLength(1);
  for (const property of ["DocumentFileName", "DocumentType", "Version", "ConformanceLevel"]) {
    expect(xml).toContain(`<pdfaProperty:name>${property}</pdfaProperty:name>`);
  }
  const af = pdf.catalog.lookup(name("AF"), PDFArray);
  expect(af.size()).toBe(1);
  const file = af.lookup(0, PDFDict);
  expect(decodeText(file, "UF")).toBe("factur-x.xml");
  expect(file.get(name("AFRelationship"))?.toString()).toBe(["MINIMUM", "BASIC WL"].includes(profile) ? "/Data" : "/Alternative");
  const stream = file.lookup(name("EF"), PDFDict).lookup(name("F"), PDFRawStream);
  expect(new TextDecoder().decode(decodePDFRawStream(stream).decode())).toBe(cii);
});

test("multiple application schemas share one extension container and preserve escaped text", async () => {
  const bytes = await renderPdf("<p>Project file</p>", { metadata: { xmp: [customSchema(), {
    name: "Review & approval", prefix: "review", namespaceUri: "https://example.com/review/1.0/",
    properties: [{ name: "Status", value: "Ready", description: "Review status", category: "internal" }],
  }, {
    name: "Custom namespace", prefix: "xmpCustom", namespaceUri: "http://ns.adobe.com/custom-example/1.0/",
    properties: [{ name: "Value", value: "Custom", description: "A custom namespace beside a built-in namespace" }],
  }] } });
  await inspect(bytes);
  const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
  const xml = xmp(pdf);
  expect(xml.match(/<pdfaExtension:schemas>/g)).toHaveLength(1);
  expect(xml).toContain("<acme:ProjectId>R&amp;D &lt;42&gt; café</acme:ProjectId>");
  expect(xml).toContain("<review:Status>Ready</review:Status>");
  expect(xml).toContain("<xmpCustom:Value>Custom</xmpCustom:Value>");
  expect(xml).toContain("<pdfaSchema:schema>Review &amp; approval</pdfaSchema:schema>");
  expect(xml).toContain("<pdfaProperty:category>internal</pdfaProperty:category>");
  expect(pdf.catalog.has(name("AF"))).toBe(false);
});

test("snapshots attachment byte views, XMP schemas, metadata lists and dates before awaiting assets", async () => {
  const data = Buffer.from([9, 1, 2, 9]);
  const xml = Buffer.from(cii);
  const schema = customSchema();
  const author = ["Original author"];
  const creationDate = new Date(fixedDate);
  const promise = renderPdf('<link rel="stylesheet" href="style.css"><p>Async attachments</p>', {
    metadata: { author, creationDate, xmp: [schema] },
    attachments: [{ name: "view.bin", data: data.subarray(1, 3) }, { name: "factur-x.xml", data: xml, relationship: "Source" }],
    assets: async () => { await Promise.resolve(); return "p{color:navy}"; },
  });
  data.fill(8); xml.fill(0); author[0] = "Changed"; creationDate.setUTCFullYear(2000);
  schema.properties[0]!.value = "Changed"; schema.prefix = "changed";
  const bytes = await promise;
  await inspect(bytes);
  const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
  expect(pdf.getAuthor()).toBe("Original author");
  expect(pdf.getCreationDate()?.toISOString()).toBe("2026-10-13T12:34:56.000Z");
  const af = pdf.catalog.lookup(name("AF"), PDFArray);
  expect(af.lookup(0, PDFDict).get(name("AFRelationship"))?.toString()).toBe("/Source");
  expect(xmp(pdf)).toContain("<acme:ProjectId>R&amp;D &lt;42&gt; café</acme:ProjectId>");
  const files = await readAttachments(bytes);
  expect(files.find(f => f.filename === "view.bin")?.content).toEqual(new Uint8Array([1, 2]));
  expect(new TextDecoder().decode(files.find(f => f.filename === "factur-x.xml")?.content ?? undefined)).toBe(cii);
});

test("stable document IDs survive revisions while XMP-only changes change instance IDs", async () => {
  const ids = [];
  for (const value of ["Revision 1", "Revision 2"]) {
    const schema = customSchema();
    schema.properties[0]!.value = value;
    const bytes = await renderPdf("<p>Document</p>", {
      metadata: { documentId: "document-42", creationDate: fixedDate, xmp: [schema] },
    });
    await inspect(bytes);
    const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
    ids.push((pdf.context.trailerInfo.ID as PDFArray).asArray().map(id => id.toString()));
  }
  expect(ids[0]![0]).toBe(ids[1]![0]);
  expect(ids[0]![1]).not.toBe(ids[1]![1]);
});

test("changing only document language produces a new instance ID", async () => {
  const ids = [];
  for (const language of ["en", "de"]) {
    const bytes = await renderPdf("<p>Text</p>", { metadata: { language, documentId: "report", creationDate: fixedDate } });
    await inspect(bytes);
    const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
    ids.push((pdf.context.trailerInfo.ID as PDFArray).asArray().map(id => id.toString()));
  }
  expect(ids[0]![0]).toBe(ids[1]![0]);
  expect(ids[0]![1]).not.toBe(ids[1]![1]);
});

test.each([
  [{ metadata: null }, /plain object/], [{ metadata: { typo: true } }, /Unknown metadata/],
  [{ metadata: { author: 1 } }, /array/], [{ metadata: { keywords: "one" } }, /array/],
  [{ metadata: { title: "bad\u0000" } }, /XML/], [{ title: "bad\ud800" }, /XML/],
  [{ metadata: { subject: "x".repeat(16385) } }, /limit/], [{ metadata: { language: "German language" } }, /language tag/],
  [{ metadata: { creationDate: "2026-02-30T00:00:00Z" } }, /calendar/],
  [{ metadata: { creationDate: "2026-01-01" } }, /timezone/],
  [{ metadata: { creationDate: "2026-01-01T24:00:00Z" } }, /calendar/],
  [{ metadata: { creationDate: new Date(NaN) } }, /valid date/],
  [{ metadata: { creationDate: fixedDate, modificationDate: "2025-01-01T00:00:00Z" } }, /precede/],
  [{ attachments: {} }, /array/], [{ attachments: [null] }, /plain object/],
  [{ attachments: [{ name: "../invoice.xml", data: "" }] }, /filename/],
  [{ attachments: [{ name: "", data: "" }] }, /filename/],
  [{ attachments: [{ name: "a", data: "", mimeType: "text/xml; charset=utf-8" }] }, /MIME/],
  [{ attachments: [{ name: "a", data: [1, 2] }] }, /Uint8Array/],
  [{ attachments: [{ name: "a", data: "", relationship: "Other" }] }, /relationship/],
  [{ attachments: [{ name: "a", data: "", compress: "yes" }] }, /boolean/],
  [{ attachments: [{ name: "a", data: "", typo: true }] }, /Unknown/],
  [{ attachments: [{ name: "é.xml", data: "a" }, { name: "e\u0301.xml", data: "b" }] }, /Duplicate/],
  [{ zugferd: {} }, /Unknown PDF option/],
  [{ metadata: { xmp: {} } }, /array/],
  [{ metadata: { xmp: [{ ...customSchema(), prefix: "pdfaid" }] } }, /reserved/],
  [{ metadata: { xmp: [{ ...customSchema(), namespaceUri: "http://ns.adobe.com/pdf/1.3/" }] } }, /reserved/],
  [{ metadata: { xmp: [{ ...customSchema(), prefix: 'a" xmlns:b="bad' }] } }, /XML name/],
  [{ metadata: { xmp: [{ ...customSchema(), namespaceUri: 'urn:example:"bad' }] } }, /absolute URI/],
  [{ metadata: { xmp: [{ ...customSchema(), namespaceUri: 'relative' }] } }, /absolute URI/],
  [{ metadata: { xmp: [customSchema(), customSchema()] } }, /duplicate/],
  [{ metadata: { xmp: [{ ...customSchema(), properties: [] }] } }, /non-empty/],
  [{ metadata: { xmp: [{ ...customSchema(), properties: [{ name: "a", value: "b" }] }] } }, /string/],
  [{ metadata: { xmp: [{ ...customSchema(), properties: [{ name: "a", value: "b", description: "c", category: "invalid" }] }] } }, /category/],
  [{ metadata: { xmp: [{ ...customSchema(), properties: [{ name: "a", value: "b", description: "c" }, { name: "a", value: "d", description: "e" }] }] } }, /duplicate/],
] as [unknown, RegExp][])("rejects invalid document options (%#)", async (options, message) => {
  await expect(renderPdf("", options as PdfOptions)).rejects.toThrow(message);
});

test("enforces combined attachment and XMP limits", () => {
  const attachments = Array.from({ length: 100 }, (_, i) => ({ name: `${i}.bin`, data: new Uint8Array(0) }));
  expect(() => normalizeOptions({ attachments: [...attachments, { name: "extra", data: "" }] })).toThrow("100 file");
  const data = new Uint8Array(32 * 1024 * 1024);
  expect(() => normalizeOptions({ attachments: [{ name: "a", data }, { name: "b", data }, { name: "extra", data: "x" }] })).toThrow("64 MiB");
  expect(() => normalizeOptions({ metadata: { xmp: Array.from({ length: 33 }, customSchema) } })).toThrow("32 schema");
  expect(() => normalizeOptions({ metadata: { xmp: [{ ...customSchema(), properties: Array.from({ length: 257 }, (_, i) => ({ name: `p${i}`, value: "", description: "Property" })) }] } })).toThrow("256 property");
  expect(() => normalizeOptions({ metadata: { xmp: [{ ...customSchema(), properties: Array.from({ length: 65 }, (_, i) => ({ name: `p${i}`, value: "x".repeat(16384), description: "Property" })) }] } })).toThrow("1 MiB");
});

test("recovers after invalid custom metadata and does not leak attachments into subsequent renders", async () => {
  await expect(renderPdf("", { metadata: { xmp: [{ ...customSchema(), prefix: "rdf" }] } })).rejects.toThrow();
  const bytes = await renderPdf("<p>Recovered</p>");
  expect((await inspect(bytes)).pages[0]?.text).toContain("Recovered");
  const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
  expect(pdf.catalog.has(name("AF"))).toBe(false);
  expect(xmp(pdf)).not.toContain("xmlns:acme=");
});
