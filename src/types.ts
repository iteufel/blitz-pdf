/** Numbers are CSS pixels (96 px = 1 inch). */
export type Length = number | `${number}${"px" | "pt" | "mm" | "cm" | "in"}`;
export type PageFormat = "A0" | "A1" | "A2" | "A3" | "A4" | "A5" | "A6" | "Letter" | "Legal" | "Tabloid" | "Ledger";
export type BinaryData = Uint8Array | ArrayBuffer;
/** UTF-8 text (for CSS/SVG) or binary resource contents. */
export type AssetData = BinaryData | string;
export type AssetMap = Record<string, AssetData>;
/** Receives an absolute URL. Returning null/undefined rejects the render as a missing asset. */
export type AssetResolver = (url: string) => AssetData | null | undefined | Promise<AssetData | null | undefined>;
export type WasmSource = BinaryData | WebAssembly.Module | URL | Request | Response | string;
/** `wasm` runs the bundled WebAssembly module. `native` runs the Node-API addon in Node.js and Bun. */
export type Backend = "wasm" | "native";

export interface InitOptions {
  /** `wasm` is the default. `native` uses the Node-API addon and is available from the Node.js and Bun entry points. */
  backend?: Backend;
  /** Override the bundled WASM location, or supply bytes/a compiled module. Applies to the wasm backend. */
  wasm?: WasmSource;
  /** Override the Node-API addon path. Applies to the native backend. */
  native?: string | URL;
}

export interface PageNumberOptions {
  /** Single line with {page} and optionally {pages}. Default: "{page} / {pages}". */
  template?: string;
  /** Default: right. */
  align?: "left" | "center" | "right";
  /** Default: 12 CSS pixels (9pt). */
  fontSize?: Length;
}

/** A Date or an ISO 8601 timestamp with an explicit timezone. Serialized in UTC to whole seconds. */
export type PdfDate = Date | string;
export type AttachmentRelationship = "Source" | "Data" | "Alternative" | "Supplement" | "Unspecified";

export interface PdfAttachment {
  /** Unique filename, without directories. Unicode is supported. */
  name: string;
  /** File contents, not a path or URL. Strings are encoded as UTF-8. */
  data: AssetData;
  /** MIME type without parameters. Default: application/octet-stream. */
  mimeType?: string;
  /** Human-readable description. Default: name. */
  description?: string;
  /** PDF/A association with the whole document. Default: Unspecified. */
  relationship?: AttachmentRelationship;
  /** Default: the document modification date. */
  modificationDate?: PdfDate;
  /** Omit to let the engine choose whether compression helps. */
  compress?: boolean;
}

/** A custom text property and its PDF/A schema description. */
export interface PdfXmpProperty {
  /** XML local name, e.g. DocumentFileName. */
  name: string;
  value: string;
  description: string;
  /** Default: external (supplied by the user). */
  category?: "internal" | "external";
}

/** Custom XMP text properties, emitted with their PDF/A extension schema. */
export interface PdfXmpSchema {
  /** Human-readable schema name. */
  name: string;
  /** Absolute namespace URI, e.g. urn:example:documents:1.0#. */
  namespaceUri: string;
  /** Unique XML namespace prefix, e.g. acme. Built-in prefixes are reserved. */
  prefix: string;
  properties: readonly PdfXmpProperty[];
}

export interface PdfMetadata {
  /** Overrides the legacy top-level title option. */
  title?: string;
  author?: string | readonly string[];
  subject?: string;
  keywords?: readonly string[];
  /** Application that created the document. */
  creator?: string;
  /** Default: blitz-pdf and its version. */
  producer?: string;
  /** Document language, e.g. de-DE. */
  language?: string;
  /** Default: render start time. */
  creationDate?: PdfDate;
  /** Default: creationDate. Must not precede it. */
  modificationDate?: PdfDate;
  /** Stable input used to derive the PDF document ID across revisions. */
  documentId?: string;
  /** Up to 32 custom schemas / 256 text properties / 1 MiB combined. */
  xmp?: readonly PdfXmpSchema[];
}

export interface PdfOptions {
  // All output uses PDF/A-3u conformance, including Unicode mappings and ICC colors.
  /** Default: A4. Use width and height together for a custom page. */
  format?: PageFormat;
  /** Let CSS @page size override explicit format/width/height. Default: false.
   * Without explicit dimensions, CSS page size is always used when available. */
  preferCSSPageSize?: boolean;
  width?: Length;
  height?: Length;
  landscape?: boolean;
  /** Default: 0. Missing sides of an object default to 0. */
  margin?: Length | { top?: Length; right?: Length; bottom?: Length; left?: Length };
  /** CSS media queries to use. Default: print. */
  media?: "print" | "screen";
  /** Base for resolving asset URLs. Default: https://blitz-pdf.invalid/ */
  baseUrl?: string;
  /** Resource map or async loader, called once per absolute URL per render. Data URLs are handled internally. */
  assets?: AssetMap | AssetResolver;
  /** Additional static TTF, OTF, WOFF, or WOFF2 fonts, using their internal family names. */
  fonts?: readonly BinaryData[];
  /** PDF document title. */
  title?: string;
  /** Synchronized PDF information dictionary and XMP metadata. */
  metadata?: PdfMetadata;
  /** Direct file attachments. Maximum 100 files and 64 MiB combined. */
  attachments?: readonly PdfAttachment[];
  /** Selectable page-number footer. Reserves space above the bottom margin. Default: false. */
  pageNumbers?: boolean | PageNumberOptions;
  /** HTML rendered on every page inside the top margin. Styles are template-local. */
  headerTemplate?: string;
  /** HTML rendered on every page inside the bottom margin. Styles are template-local. */
  footerTemplate?: string;
  /** Reject larger documents. Default: 100; maximum: 1000. */
  maxPages?: number;
}
