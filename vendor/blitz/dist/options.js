import { assetBytes, copyBytes, MAX_ASSET_BYTES } from "./assets.js";
import { normalizeDocumentOptions } from "./document-options.js";
import { record } from "./validation.js";
const formats = {
    A0: [841 * 96 / 25.4, 1189 * 96 / 25.4],
    A1: [594 * 96 / 25.4, 841 * 96 / 25.4],
    A2: [420 * 96 / 25.4, 594 * 96 / 25.4],
    A3: [297 * 96 / 25.4, 420 * 96 / 25.4],
    A4: [210 * 96 / 25.4, 297 * 96 / 25.4],
    A5: [148 * 96 / 25.4, 210 * 96 / 25.4],
    A6: [105 * 96 / 25.4, 148 * 96 / 25.4],
    Letter: [8.5 * 96, 11 * 96], Legal: [8.5 * 96, 14 * 96], Tabloid: [11 * 96, 17 * 96], Ledger: [17 * 96, 11 * 96],
};
const optionKeys = new Set(["format", "width", "height", "landscape", "preferCSSPageSize", "margin", "media", "baseUrl", "assets", "fonts", "title", "metadata", "attachments", "pageNumbers", "headerTemplate", "footerTemplate", "maxPages"]);
const unitScale = { px: 1, pt: 96 / 72, mm: 96 / 25.4, cm: 96 / 2.54, in: 96 };
function length(value, name) {
    let result;
    if (typeof value === "number")
        result = value;
    else if (typeof value === "string") {
        const match = /^\s*(\d+(?:\.\d+)?|\.\d+)(px|pt|mm|cm|in)\s*$/.exec(value);
        if (!match)
            throw new TypeError(`${name} must be a number of CSS pixels or a length in px, pt, mm, cm, or in`);
        result = Number(match[1]) * unitScale[match[2]];
    }
    else
        throw new TypeError(`${name} must be a CSS length`);
    if (!Number.isFinite(result) || result < 0)
        throw new RangeError(`${name} must be finite and non-negative`);
    return result;
}
export function normalizeOptions(options = {}) {
    record(options, "options");
    for (const key of Object.keys(options)) {
        if (!optionKeys.has(key))
            throw new TypeError(`Unknown PDF option: ${key}`);
    }
    if (options.landscape !== undefined && typeof options.landscape !== "boolean")
        throw new TypeError("landscape must be a boolean");
    if (options.preferCSSPageSize !== undefined && typeof options.preferCSSPageSize !== "boolean")
        throw new TypeError("preferCSSPageSize must be a boolean");
    for (const key of ["headerTemplate", "footerTemplate"]) {
        if (options[key] !== undefined && typeof options[key] !== "string")
            throw new TypeError(`${key} must be an HTML string`);
        if (new TextEncoder().encode(options[key] ?? "").byteLength > 1024 * 1024)
            throw new RangeError(`${key} exceeds the 1 MiB limit`);
    }
    const format = options.format ?? "A4";
    if (!Object.hasOwn(formats, format))
        throw new TypeError(`Unknown page format: ${String(format)}`);
    if ((options.width === undefined) !== (options.height === undefined))
        throw new TypeError("width and height must be provided together");
    if (options.format !== undefined && options.width !== undefined)
        throw new TypeError("Use either format or custom width and height");
    let [width, height] = options.width === undefined
        ? formats[format] : [length(options.width, "width"), length(options.height, "height")];
    if (options.landscape)
        [width, height] = [height, width];
    if (width <= 0 || height <= 0 || width > 19200 || height > 19200)
        throw new RangeError("Page dimensions must be positive and at most 19200 CSS pixels");
    const inputMargin = options.margin ?? 0;
    const margin = { top: 0, right: 0, bottom: 0, left: 0 };
    if (typeof inputMargin === "object") {
        record(inputMargin, "margin");
        for (const key of Object.keys(inputMargin))
            if (!Object.hasOwn(margin, key))
                throw new TypeError(`Unknown margin side: ${key}`);
        for (const side of Object.keys(margin))
            margin[side] = length(inputMargin[side] ?? 0, `margin.${side}`);
    }
    else {
        const value = length(inputMargin, "margin");
        for (const side of Object.keys(margin))
            margin[side] = value;
    }
    let pageNumbers = null;
    if (options.pageNumbers !== undefined && options.pageNumbers !== false) {
        const input = options.pageNumbers === true ? {} : options.pageNumbers;
        record(input, "pageNumbers");
        for (const key of Object.keys(input))
            if (!["template", "align", "fontSize"].includes(key))
                throw new TypeError(`Unknown pageNumbers option: ${key}`);
        const template = input.template ?? "{page} / {pages}";
        if (typeof template !== "string" || template.length > 512 || /[\u0000-\u001f\u007f\u0085\u2028\u2029]/u.test(template))
            throw new TypeError("pageNumbers.template must be a single line of at most 512 characters");
        if (!template.includes("{page}") || /[{}]/.test(template.replaceAll("{page}", "").replaceAll("{pages}", "")))
            throw new TypeError("pageNumbers.template must include {page}; only {page} and {pages} placeholders are supported");
        const align = input.align ?? "right";
        if (!["left", "center", "right"].includes(align))
            throw new TypeError("pageNumbers.align must be left, center, or right");
        const fontSize = length(input.fontSize ?? 12, "pageNumbers.fontSize");
        if (fontSize < 1 || fontSize > 48)
            throw new RangeError("pageNumbers.fontSize must be between 1 and 48 CSS pixels");
        pageNumbers = { template, align, fontSize };
    }
    // Printable geometry is validated after external CSS @page rules have loaded.
    const media = options.media ?? "print";
    if (media !== "print" && media !== "screen")
        throw new TypeError("media must be print or screen");
    const maxPages = options.maxPages ?? 100;
    if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 1000)
        throw new RangeError("maxPages must be an integer between 1 and 1000");
    const document = normalizeDocumentOptions(options);
    const baseUrl = options.baseUrl ?? "https://blitz-pdf.invalid/";
    if (typeof baseUrl !== "string")
        throw new TypeError("baseUrl must be an absolute URL string");
    let base;
    try {
        base = new URL(baseUrl);
    }
    catch {
        throw new TypeError("baseUrl must be an absolute URL string");
    }
    if (!["http:", "https:", "file:"].includes(base.protocol))
        throw new TypeError("baseUrl must use http:, https:, or file:");
    const assets = Object.create(null);
    const inputAssets = options.assets;
    const assetResolver = typeof inputAssets === "function" ? inputAssets : undefined;
    if (inputAssets !== undefined && !assetResolver) {
        record(inputAssets, "assets");
        let size = 0;
        for (const [key, value] of Object.entries(inputAssets)) {
            const data = assetBytes(value, `assets[${key}]`);
            size += data.byteLength;
            if (size > MAX_ASSET_BYTES)
                throw new RangeError("Assets exceed the 64 MiB limit");
            const url = new URL(key, base).href;
            if (Object.hasOwn(assets, url))
                throw new TypeError(`Duplicate resolved asset URL: ${url}`);
            assets[url] = data;
        }
    }
    if (options.fonts !== undefined && !Array.isArray(options.fonts))
        throw new TypeError("fonts must be an array of font bytes");
    const fonts = (options.fonts ?? []).map((font, i) => copyBytes(font, `fonts[${i}]`));
    if (fonts.reduce((total, font) => total + font.byteLength, 0) > 32 * 1024 * 1024)
        throw new RangeError("Fonts exceed the 32 MiB limit");
    return { width, height, margin, media, maxPages, baseUrl: base.href, assets, assetResolver, fonts, pageNumbers,
        useCSSPageSize: options.preferCSSPageSize === true || (options.format === undefined && options.width === undefined),
        headerTemplate: options.headerTemplate ?? null, footerTemplate: options.footerTemplate ?? null, ...document };
}
//# sourceMappingURL=options.js.map