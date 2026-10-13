/** Numbers are CSS pixels (96 px = 1 inch). */
export type Length = number | `${number}${"px" | "pt" | "mm" | "cm" | "in"}`;
export type PageFormat = "A3" | "A4" | "A5" | "Letter" | "Legal" | "Tabloid";
export type BinaryData = Uint8Array | ArrayBuffer;
/** UTF-8 text (for CSS/SVG) or binary resource contents. */
export type AssetData = BinaryData | string;
export type AssetMap = Record<string, AssetData>;
/** Receives an absolute URL. Returning null/undefined rejects the render as a missing asset. */
export type AssetResolver = (url: string) => AssetData | null | undefined | Promise<AssetData | null | undefined>;
export type WasmSource = BinaryData | WebAssembly.Module | URL | Request | Response | string;

export interface InitOptions {
  /** Override the bundled WASM location, or supply bytes/a compiled module. */
  wasm?: WasmSource;
}

export interface PageNumberOptions {
  /** Single line with {page} and optionally {pages}. Default: "{page} / {pages}". */
  template?: string;
  /** Default: right. */
  align?: "left" | "center" | "right";
  /** Default: 12 CSS pixels (9pt). */
  fontSize?: Length;
}

export interface PdfOptions {
  // All output uses PDF/A-3u conformance, including Unicode mappings and ICC colors.
  /** Default: A4. Use width and height together for a custom page. */
  format?: PageFormat;
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
  /** Selectable page-number footer. Reserves space above the bottom margin. Default: false. */
  pageNumbers?: boolean | PageNumberOptions;
  /** Reject larger documents. Default: 100; maximum: 1000. */
  maxPages?: number;
}
