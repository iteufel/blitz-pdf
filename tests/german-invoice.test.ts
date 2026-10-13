import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { PDFDocument, PDFName } from "pdf-lib";
import { renderPdf } from "blitz-pdf";
import { inspect } from "./helpers";
import { invoice, calculateInvoice } from "../examples/german-invoice/data.mjs";
import { createInvoiceHtml, invoiceOptions, money } from "../examples/german-invoice/template.mjs";

test("the German invoice computes line amounts, discount, taxable net, VAT and total in cents", () => {
  const totals = calculateInvoice(invoice);
  expect(totals.sections.flatMap(section => section.items)).toHaveLength(24);
  expect(totals.subtotalCents).toBe(2220500);
  expect(totals.discountCents).toBe(66615);
  expect(totals.netCents).toBe(2153885);
  expect(totals.vatCents).toBe(409238);
  expect(totals.totalCents).toBe(2563123);
  expect(money(totals.totalCents)).toBe("25.631,23\u00a0€");
  expect(totals.sections[0].carriedCents).toBe(0);
  expect(totals.sections[1].carriedCents).toBe(totals.sections[0].cumulativeCents);
  expect(totals.sections[2].carriedCents).toBe(totals.sections[1].cumulativeCents);
});

test("the example makes three complete A4 invoice pages, with actual page numbers and no XML", async () => {
  const data = await renderPdf(createInvoiceHtml(invoice), {
    ...invoiceOptions(invoice),
    baseUrl: new URL("../examples/german-invoice/", import.meta.url).href,
    assets: async url => readFile(new URL(url)),
  });
  const result = await inspect(data);
  expect(result.pages).toHaveLength(3);
  expect(result.images).toHaveLength(0);
  const allText = result.pages.map(page => page.text).join("\n").replace(/\s+/g, " ");
  for (const value of [invoice.number, invoice.supplier.name, invoice.supplier.street, invoice.supplier.city, invoice.supplier.vatId, invoice.customer.name, invoice.customer.street, invoice.customer.city,
    "13.10.2026", "01.09.2026", "30.09.2026", "27.10.2026", "3 %", "19 %", "22.205,00 €", "666,15 €", "21.538,85 €", "4.092,38 €", "25.631,23 €", "Fiktive Geschäftsdaten", "Nicht zur Zahlung bestimmt"]) {
    expect(allText).toContain(value);
  }
  for (const [index, page] of result.pages.entries()) {
    expect(page.dimensions.width).toBeCloseTo(595.2756, 3);
    expect(page.dimensions.height).toBeCloseTo(841.8898, 3);
    expect(page.text).toContain(`Seite ${index + 1} von 3`);
    expect(page.text).toContain(invoice.supplier.register);
    expect(page.text).toContain(invoice.sections[index].title);
    for (const [, name, description] of invoice.sections[index].items) {
      expect(page.text.replace(/\s+/g, " ")).toContain(name);
      expect(page.text.replace(/\s+/g, " ")).toContain(description);
      expect(result.pages.filter(p => p.text.includes(name))).toHaveLength(1);
    }
    const footer = page.items.find(item => item.str.includes("Musterrechnung") && item.str.includes("Seite"))!;
    expect(footer).toBeDefined();
    for (const item of page.items.filter(item => item.str.trim() && item !== footer)) {
      expect(item.transform[5] - footer.transform[5]).toBeGreaterThan(10);
    }
  }
  expect(result.pages[2].text).toContain("Rechnungsbetrag");
  expect(result.pages[2].text).toContain("Zahlungsbedingungen");
  const pdf = await PDFDocument.load(data);
  expect(pdf.catalog.get(PDFName.of("AF"))).toBeUndefined();
  expect(pdf.catalog.get(PDFName.of("Names"))).toBeUndefined();
});

test("invoice data is escaped before being inserted into HTML", () => {
  const html = createInvoiceHtml({ ...invoice, customer: { ...invoice.customer, name: '<script>alert("test")</script> & Co' } });
  expect(html).not.toContain('<script>');
  expect(html).toContain("&lt;script&gt;alert(&quot;test&quot;)&lt;/script&gt; &amp; Co");
});
