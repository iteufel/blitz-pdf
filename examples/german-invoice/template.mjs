import { invoice, calculateInvoice } from "./data.mjs";

export const money = cents => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(cents / 100);
const quantity = hundredths => new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(hundredths / 100);
const percent = basisPoints => new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 }).format(basisPoints / 100) + " %";
const date = value => value.split("-").reverse().join(".");
const escape = value => String(value).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
const e = escape;

export function invoiceOptions(data = invoice) {
  return {
    format: "A4", margin: { top: "16mm", right: "17mm", bottom: "12mm", left: "17mm" },
    title: `Musterrechnung ${data.number} - ${data.customer.name}`,
    pageNumbers: { template: `${data.number} · Musterrechnung · Seite {page} von {pages}`, fontSize: "8pt", align: "right" },
  };
}

export function createInvoiceHtml(data = invoice) {
  const totals = calculateInvoice(data);
  const s = data.supplier;
  const c = data.customer;
  const identity = `<div class="company-details"><strong>${e(s.name)}</strong> · Sitz: Berlin · Geschäftsführung: ${e(s.managingDirector)}<br>${e(s.register)} · USt-IdNr.: ${e(s.vatId)}</div>`;
  const sections = totals.sections.map((section, index) => {
    const first = index === 0;
    const last = index === totals.sections.length - 1;
    return `<section class="invoice-section ${first ? "first" : "continuation"}">
      ${first ? `
        <header class="masthead"><div class="brand"><span class="brand-mark">M</span><div><strong>MUSTERWERK</strong><small>Digitalprodukte. Klar umgesetzt.</small></div></div><div class="contact">${e(s.email)}<br>${e(s.website)}</div></header>
        <div class="sample-note">MUSTERRECHNUNG · Fiktive Geschäftsdaten · Nicht zur Zahlung bestimmt</div>
        <div class="address-row"><div><p class="sender-line">${e(s.name)} · ${e(s.street)} · ${e(s.city)}</p><address><strong>${e(c.name)}</strong><br>${e(c.department)}<br>${e(c.street)}<br>${e(c.city)}<br>${e(c.country)}</address></div>
        <div class="supplier-address"><strong>Rechnungssteller</strong><br>${e(s.name)}<br>${e(s.street)}<br>${e(s.city)}<br>${e(s.country)}<br>USt-IdNr. ${e(s.vatId)}</div></div>
        <div class="title-row"><h1>Rechnung</h1><span>${e(data.number)}</span></div>
        <div class="invoice-meta"><div><span>Rechnungsdatum</span><strong>${date(data.issueDate)}</strong></div><div><span>Kundennummer</span><strong>${e(data.customerNumber)}</strong></div><div><span>Ihre Bestellung</span><strong>${e(data.orderNumber)}</strong></div><div><span>Zahlbar bis</span><strong>${date(data.dueDate)}</strong></div></div>
        <p class="project"><strong>${e(data.project)}</strong><br>Leistungszeitraum: ${date(data.serviceFrom)} bis ${date(data.serviceTo)}.<br>Wir berechnen die folgenden vereinbarten und erbrachten Leistungen.</p>
      ` : `<header class="continuation-header"><strong>MUSTERWERK <span>Digital GmbH</span></strong><div>Rechnung ${e(data.number)}<br>${e(c.name)}</div></header>`}
      <div class="section-heading"><span class="section-index">${String(index + 1).padStart(2, "0")}</span><div><h2>${e(section.title)}</h2><p>${e(section.subtitle)}</p></div></div>
      ${!first ? `<div class="carry"><span>Bisherige Leistungen netto</span><strong>${money(section.carriedCents)}</strong></div>` : ""}
      <table class="items"><colgroup><col class="col-position"><col class="col-description"><col class="col-quantity"><col class="col-unit"><col class="col-total"></colgroup>
      <thead><tr><th>Pos.</th><th>Leistung</th><th class="numeric">Std.</th><th class="numeric">Preis / Std.</th><th class="numeric">Netto</th></tr></thead>
      <tbody>${section.items.map(item => `<tr><td class="position">${e(item.position)}</td><td><strong>${e(item.name)}</strong><div class="description">${e(item.description)}</div></td><td class="numeric">${quantity(item.quantityHundredths)}</td><td class="numeric">${money(item.unitPriceCents)}</td><td class="numeric amount">${money(item.netCents)}</td></tr>`).join("")}</tbody></table>
      ${last ? `<div class="settlement"><div class="tax-note"><strong>Abrechnung</strong><p>Alle Positionen netto in EUR.<br>Alle Leistungen unterliegen ${percent(data.vatBasisPoints)} Umsatzsteuer.</p><p>Vereinbarter Projektrabatt: ${percent(data.discountBasisPoints)} auf sämtliche Positionen.</p></div>
        <table class="totals"><tr><td>Summe Leistungen netto</td><td>${money(totals.subtotalCents)}</td></tr><tr><td>Projektrabatt ${percent(data.discountBasisPoints)}</td><td>-${money(totals.discountCents)}</td></tr><tr class="net"><td>Entgelt netto (${percent(data.vatBasisPoints)} USt.)</td><td>${money(totals.netCents)}</td></tr><tr><td>Umsatzsteuer ${percent(data.vatBasisPoints)}</td><td>${money(totals.vatCents)}</td></tr><tr class="grand-total"><td>Rechnungsbetrag</td><td>${money(totals.totalCents)}</td></tr></table></div>
        <div class="payment"><h3>Zahlungsbedingungen</h3><p>Zahlbar bis zum <strong>${date(data.dueDate)}</strong> ohne Abzug per Überweisung.<br>Verwendungszweck: <strong>${e(data.number)} / ${e(data.customerNumber)}</strong></p><div class="bank"><div><span>Kontoinhaber</span><strong>${e(s.name)}</strong></div><div><span>IBAN (Musterdaten)</span><strong>${e(s.iban)}</strong></div><div><span>BIC</span><strong>${e(s.bic)}</strong></div></div></div>
        <p class="closing">Vielen Dank für die vertrauensvolle Zusammenarbeit.</p>${identity}
      ` : `<div class="carry after-table"><span>Kumulierte Leistungen netto</span><strong>${money(section.cumulativeCents)}</strong></div><p class="continuation-note">Fortsetzung im folgenden Abschnitt. Rabatt, Umsatzsteuer und Rechnungsbetrag am Ende der Rechnung.</p>${identity}`}
    </section>`;
  }).join("");
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${e(data.number)}</title><link rel="stylesheet" href="invoice.css"></head><body>${sections}</body></html>`;
}
