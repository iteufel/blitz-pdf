import { expect, test } from "bun:test";
import { normalizeOptions } from "../src/options";
import { renderPdf } from "blitz-pdf";

test("normalizes dimensions without treating zero margins as missing", () => {
  const result = normalizeOptions({ width: "72pt", height: "25.4mm", margin: { top: 0 } });
  expect(result.width).toBeCloseTo(96, 8);
  expect(result.height).toBeCloseTo(96, 8);
  expect(result.margin).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
});

test.each([
  [{ width: 1 }, /together/], [{ width: 0, height: 100 }, /positive/],
  [{ width: NaN, height: 100 }, /finite/], [{ width: Infinity, height: 100 }, /finite/],
  [{ margin: -1 }, /non-negative/], [{ margin: "90%" }, /length/],
  [{ margin: { left: 1000 } }, /leave/], [{ margin: { typo: 1 } }, /side/],
  [{ format: "unknown" }, /format/], [{ format: "A4", width: 20, height: 30 }, /either/],
  [{ maxPages: 0 }, /maxPages/], [{ maxPages: 1.5 }, /maxPages/],
  [{ media: "speech" }, /media/], [{ dpi: 144 }, /Unknown/],
  [{ baseUrl: "relative/path" }, /absolute/], [{ baseUrl: "javascript:1" }, /baseUrl/],
  [{ assets: [] }, /plain object/], [{ fonts: [123] }, /Uint8Array/],
  [{ landscape: "yes" }, /boolean/], [{ title: 7 }, /string/],
])("rejects invalid options: %j", async (options, message) => {
  await expect(renderPdf("<p>Text</p>", options as never)).rejects.toThrow(message as RegExp);
});

test("uses only the supplied byte view and does not mutate caller data", () => {
  const backing = new Uint8Array([9, 1, 2, 9]);
  const result = normalizeOptions({ assets: { "a.bin": backing.subarray(1, 3) } });
  backing.fill(7);
  expect([...result.assets["https://blitz-pdf.invalid/a.bin"]!]).toEqual([1, 2]);
});

test("rejects resource aliases which resolve to the same URL", () => {
  expect(() => normalizeOptions({ assets: { "a.css": "", "./a.css": "" } })).toThrow("Duplicate");
});

test("snapshots Node/Bun Buffer contents when normalizing assets and fonts", () => {
  const backing = Buffer.from([9, 1, 2, 9]);
  const result = normalizeOptions({ assets: { "a.bin": backing.subarray(1, 3) }, fonts: [backing] });
  backing.fill(7);
  expect([...result.assets["https://blitz-pdf.invalid/a.bin"]!]).toEqual([1, 2]);
  expect([...result.fonts[0]!]).toEqual([9, 1, 2, 9]);
});
