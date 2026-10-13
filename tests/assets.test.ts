import { expect, mock, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { PDFName } from "pdf-lib";
import { renderPdf, type AssetData, type AssetResolver } from "blitz-pdf";
import { inspect } from "./helpers";

const pixel = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==", "base64");

test("awaits nested CSS, fonts, images and backgrounds before pagination; deduplicates URLs", async () => {
  const baseUrl = "https://assets.test/docs/";
  const assets: Record<string, AssetData> = {
    [baseUrl + "main.css"]: '@import "nested/layout.css";',
    [baseUrl + "nested/layout.css"]: `
      @font-face { font-family: Dynamic; src: url("../fonts/mono.ttf"); }
      body { margin: 0; font-family: Dynamic; }
      .hidden { display: none; }
      .second { break-before: page; }
      .swatch { width: 12px; height: 12px; background: url("../pixel.png"); }
    `,
    [baseUrl + "fonts/mono.ttf"]: await readFile(new URL("../assets/fonts/DejaVuSansMono.ttf", import.meta.url)),
    [baseUrl + "pixel.png"]: pixel.buffer.slice(pixel.byteOffset, pixel.byteOffset + pixel.byteLength),
  };
  const html = `<link rel="stylesheet" href="main.css"><link rel="stylesheet" href="./main.css">
    <p>Dynamic café office</p><p class="hidden">Must be hidden</p>
    <img src="pixel.png" width="12" height="12"><img src="./pixel.png" width="12" height="12">
    <div class="swatch"></div><p class="second">Next page</p>`;
  const resolve = mock(async (url: string) => { await Promise.resolve(); return assets[url]; });
  const result = await inspect(await renderPdf(html, { baseUrl, assets: resolve, width: 300, height: 250 }));
  expect(resolve.mock.calls.map(([url]) => url).sort()).toEqual(Object.keys(assets).sort());
  expect(result.pages).toHaveLength(2);
  expect(result.pages[0].text).toContain("Dynamic café office");
  expect(result.pages[0].text).not.toContain("Must be hidden");
  expect(result.pages[0].text).not.toContain("Next page");
  expect(result.pages[1].text).toBe("Next page");
  expect(result.pages[0].imagePaints).toBeGreaterThanOrEqual(3);
  expect(result.pages.every(page => page.hasText)).toBe(true);
  expect(result.unicodeMaps.length).toBeGreaterThan(0);
  expect(result.embeddedFonts.some(font => font.get(PDFName.of("FontName"))?.toString().includes("DejaVuSansMono"))).toBe(true);
  for (const image of result.images) {
    expect(image.get(PDFName.of("Width"))?.toString()).toBe("1");
    expect(image.get(PDFName.of("Height"))?.toString()).toBe("1");
  }
  const mapped = await inspect(await renderPdf(html, { baseUrl, assets, width: 300, height: 250 }));
  const layout = (pdf: typeof result) => pdf.pages.map(page => ({
    text: page.text, dimensions: page.dimensions, imagePaints: page.imagePaints,
    positions: page.items.map(item => ({ text: item.str, transform: item.transform, width: item.width })),
  }));
  expect(layout(result)).toEqual(layout(mapped));
});

test("accepts synchronous functions and preserves absolute file URLs", async () => {
  const resolve: AssetResolver = mock(url => {
    expect(url).toBe("file:///virtual/theme.css?version=2");
    return ".hidden{display:none}";
  });
  const result = await inspect(await renderPdf('<link rel="stylesheet" href="../theme.css?version=2"><p>Visible</p><p class="hidden">Hidden</p>', {
    baseUrl: "file:///virtual/reports/document.html", assets: resolve,
  }));
  expect(result.pages[0].text).toBe("Visible");
  expect(resolve).toHaveBeenCalledTimes(1);
});

test("handles data URLs internally and does not call the resolver for unused resources", async () => {
  const resolve = mock(async () => { throw new Error("No external requests expected"); });
  const result = await inspect(await renderPdf(`<style>@import url("data:text/css,.hidden%7Bdisplay%3Anone%7D");</style>
    <p>Inline assets</p><p class="hidden">Hidden</p><img src="data:image/png;base64,${pixel.toString("base64")}" width="10" height="10">`, { assets: resolve }));
  expect(resolve).not.toHaveBeenCalled();
  expect(result.pages[0].text).toBe("Inline assets");
  expect(result.pages[0].imagePaints).toBe(1);
});

test("supports empty CSS and copies only a returned binary view", async () => {
  const encoded = Buffer.from("XXXX.hidden{display:none}XXXX");
  const resolve = mock(async (url: string) => url.endsWith("empty.css") ? "" : encoded.subarray(4, encoded.length - 4));
  const result = await inspect(await renderPdf('<link rel="stylesheet" href="empty.css"><link rel="stylesheet" href="view.css"><p>Visible</p><p class="hidden">Hidden</p>', { assets: resolve }));
  expect(result.pages[0].text).toBe("Visible");
});

test("isolates interleaved renders and scopes the URL cache to each render", async () => {
  const html = '<link rel="stylesheet" href="shared.css"><p class="a">Alpha</p><p class="b">Beta</p>';
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let notify!: () => void;
  const started = new Promise<void>(resolve => { notify = resolve; });
  const firstResolver = mock(async () => { notify(); await gate; return ".b{display:none}"; });
  const first = renderPdf(html, { assets: firstResolver });
  await started;
  try {
    const second = await inspect(await renderPdf(html, { assets: async () => ".a{display:none}" }));
    expect(second.pages[0].text).toBe("Beta");
  } finally { release(); }
  expect((await inspect(await first)).pages[0].text).toBe("Alpha");
  await renderPdf(html, { assets: firstResolver });
  expect(firstResolver).toHaveBeenCalledTimes(2);
});

test("can render another document from an async resolver without a WASM borrow conflict", async () => {
  let inner: Uint8Array | undefined;
  const outer = await renderPdf('<link rel="stylesheet" href="theme.css"><p>Outer</p>', {
    assets: async () => { inner = await renderPdf("<p>Inner</p>"); return "p{color:blue}"; },
  });
  expect((await inspect(inner!)).pages[0].text).toBe("Inner");
  expect((await inspect(outer)).pages[0].text).toBe("Outer");
});

test.each([null, undefined])("reports a missing asset when a resolver returns %p", async value => {
  await expect(renderPdf('<link rel="stylesheet" href="missing.css">', { assets: async () => value }))
    .rejects.toThrow("Missing asset: https://blitz-pdf.invalid/missing.css");
});

test.each([123, {}, [], new Uint16Array([1])])("rejects unsupported resolver data: %p", async value => {
  await expect(renderPdf('<link rel="stylesheet" href="invalid.css">', { assets: (async () => value) as never }))
    .rejects.toThrow(/Asset resolver result for https:\/\/blitz-pdf.invalid\/invalid.css must be a Uint8Array or ArrayBuffer/);
});

test.each([false, true])("includes the URL and original cause for a thrown/rejected loader (async=%p)", async asynchronous => {
  const cause = new Error("Storage unavailable");
  const resolve = asynchronous ? async () => { throw cause; } : () => { throw cause; };
  const error = await renderPdf('<link rel="stylesheet" href="error.css">', { assets: resolve }).then(() => undefined, error => error);
  expect(error).toBeInstanceOf(Error);
  expect(error.message).toBe("Failed to load asset: https://blitz-pdf.invalid/error.css");
  expect(error.cause).toBe(cause);
});

test("loads independent assets concurrently and recovers with another callback still in flight", async () => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const started: string[] = [];
  const rendering = renderPdf('<link rel="stylesheet" href="fail.css"><link rel="stylesheet" href="slow.css">', {
    assets: async url => {
      started.push(url);
      if (url.endsWith("fail.css")) throw new Error("Failed intentionally");
      await gate;
      return "body{color:green}";
    },
  });
  try {
    await expect(rendering).rejects.toThrow("Failed to load asset:");
    expect(started).toHaveLength(2);
    const next = await inspect(await renderPdf("<p>Recovered</p>", { assets: async () => "" }));
    expect(next.pages[0].text).toBe("Recovered");
  } finally { release(); }
  // Let the late result settle after its render job has been freed.
  await new Promise(resolve => setTimeout(resolve, 0));
});

test.each([1, 2])("enforces the 64 MiB budget across %p dynamic assets", async count => {
  const bytes = new Uint8Array(Math.floor(64 * 1024 * 1024 / count) + 1);
  await expect(renderPdf(Array.from({ length: count }, (_, i) => `<link rel="stylesheet" href="${i}.css">`).join(""), {
    assets: async () => bytes,
  })).rejects.toThrow("Assets exceed the 64 MiB limit");
});

test("enforces the request limit before calling the resolver", async () => {
  const resolve = mock(async () => "");
  await expect(renderPdf('<link rel="stylesheet" href="same.css">'.repeat(1025), { assets: resolve }))
    .rejects.toThrow("Too many resource requests");
  expect(resolve).not.toHaveBeenCalled();
});

test("still enforces maxPages and PDF/A glyph validation after async asset loading", async () => {
  await expect(renderPdf('<link rel="stylesheet" href="pages.css"><p>First</p><p>Second</p>', {
    maxPages: 1, assets: async () => "p+p{break-before:page}",
  })).rejects.toThrow("maxPages");
  await expect(renderPdf('<link rel="stylesheet" href="font.css"><p>Missing: \u{10FFFF}</p>', {
    assets: async () => "p{font-family:sans-serif}",
  })).rejects.toThrow("PDF/A-3u export failed");
});
