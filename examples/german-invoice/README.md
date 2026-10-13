# German invoice example

Run `npm run example:german-invoice` from the project root, or
`bun examples/german-invoice.mjs`. Output: `output/pdf/german-invoice.pdf`.

The sample contains three A4 pages and 24 software project services. It uses
the public `renderPdf` API, an async stylesheet loader, CSS page breaks between
project sections, protected table rows, and automatic page-number footers.
No PDF editing step is needed after rendering. Numbers, invoice text, and
amounts remain selectable; the output targets PDF/A-3u without XML attachments.

Edit `data.mjs` for invoice data, `template.mjs` for HTML, and `invoice.css`
for appearance. `invoiceOptions()` configures margins and page numbers.
Page totals are computed by the renderer; they are never hard-coded in the
HTML. Longer content can add pages automatically. Each project section starts
on a new page; table headings are authored once per section. Automatic repeated
table headers across additional overflow pages are not currently supported.

Amounts are integer cents. Quantities are hundredths of an hour, and rates are
basis points (1900 = 19%). Each line is rounded half-up, then the discount is
rounded on the subtotal and VAT on the discounted net amount. The generated
`german-invoice-totals.json` contains every line and intermediate value.

| Amount | EUR |
| --- | ---: |
| Services before discount | 22.205,00 |
| Agreed project discount, 3% | -666,15 |
| Taxable net, 19% rate | 21.538,85 |
| VAT, 19% | 4.092,38 |
| Amount payable | **25.631,23** |

## Scope of the sample

All companies, people, addresses, tax and register identifiers, and bank details
are fictitious demonstration data. The PDF is marked “Musterrechnung” and
“Nicht zur Zahlung bestimmt”; it does not issue a real invoice. Replace the
sample identifiers with the actual supplier's registered details in a real
application. The demonstration bank details do not identify a payable account.

The scenario is an ordinary domestic German B2B service invoice dated
13 October 2026, covering services performed from 1 to 30 September 2026, with
19% standard VAT and a previously agreed discount. It demonstrates the relevant
mandatory information: full supplier/customer names and addresses, supplier
VAT ID, issue date, a sample unique invoice number, type and extent of services,
performance period, discounted taxable net, tax rate and tax amount.
[§ 14(4) UStG](https://www.gesetze-im-internet.de/ustg_1980/__14.html),
[§ 12(1) UStG](https://www.gesetze-im-internet.de/ustg_1980/__12.html).

The supplier block also includes the GmbH's seat, register court and number,
and managing director. The fictitious company has no supervisory board.
[§ 35a GmbHG](https://www.gesetze-im-internet.de/gmbhg/__35a.html).

PDF/A describes the file's archival format. This example contains no structured
invoice XML and makes no ZUGFeRD, XRechnung or EN 16931 claim. For the stated
2026 scenario, PDF delivery assumes the recipient's consent under the transition
rule. That assumption is not an exemption for every future invoice. Different
transactions, including reverse charge, exemptions and advance payments, need
their applicable invoice treatment.
[§ 27(38) UStG](https://www.gesetze-im-internet.de/ustg_1980/__27.html).

## Verification

`bun test` checks the arithmetic, required sample fields, all 24 rows on their
intended pages, correct footers, selectable text, absence of raster pages and
XML attachments, and spacing between body text and footers.

`npm run test:pdfa` captures the invoice along with the other integration PDFs
and validates them using veraPDF's PDF/A-3u profile. The validation reports are
under `output/pdfa-validation/`. The content tests check this example's fields
and calculations; the archival validator does not certify tax-law compliance.
