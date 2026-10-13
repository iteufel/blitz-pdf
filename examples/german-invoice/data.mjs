// Entirely fictitious demonstration data. No invoice is issued by this example.
export const invoice = {
  number: "RE-2026-1042",
  issueDate: "2026-10-13",
  dueDate: "2026-10-27",
  serviceFrom: "2026-09-01",
  serviceTo: "2026-09-30",
  customerNumber: "KD-2087",
  orderNumber: "EW-2026-0831",
  project: "Kundenportal und Bestellverwaltung",
  supplier: {
    name: "Musterwerk Digital GmbH", street: "Musterstraße 14", city: "10115 Berlin", country: "Deutschland",
    vatId: "DE123456788", managingDirector: "Clara Muster", register: "Amtsgericht Charlottenburg, HRB 999999 B",
    email: "rechnung@musterwerk.example", website: "musterwerk.example",
    bank: "Beispielbank (Musterdaten)", iban: "DE36 0000 0000 0000 0000 00", bic: "TESTDE00XXX",
  },
  customer: { name: "Elbwiese Handels GmbH", department: "Finanzbuchhaltung", street: "Beispielweg 8", city: "20457 Hamburg", country: "Deutschland" },
  // All services in this domestic B2B example use the standard 19% VAT rate.
  vatBasisPoints: 1900,
  discountBasisPoints: 300,
  sections: [
    { title: "Konzeption und Gestaltung", subtitle: "Anforderungen, Abläufe und verbindliche Gestaltungsvorlagen", items: [
      ["01", "Projektauftakt und Zielbild", "Workshop mit Vertrieb, Service und IT; dokumentierte Ziele und Abnahmekriterien.", 400, 13500],
      ["02", "Anforderungsanalyse", "Aufnahme von Rollen, Bestellabläufen und Freigaben; abgestimmter Anforderungskatalog.", 650, 13500],
      ["03", "Informationsarchitektur", "Struktur für Kundenkonten, Bestellungen, Dokumente und interne Bearbeitung.", 500, 12500],
      ["04", "Prozessmodellierung", "Abläufe für Angebot, Bestellung und Statusmeldungen inklusive Sonderfällen.", 550, 12500],
      ["05", "Interaktiver Prototyp", "Klickbarer Entwurf der zentralen Ansichten für Desktop und Mobilgeräte.", 800, 12500],
      ["06", "Gestaltung der Oberfläche", "Ausarbeitung von Navigation, Formularen und Tabellen im vereinbarten Erscheinungsbild.", 900, 12500],
    ] },
    { title: "Umsetzung und Integration", subtitle: "Designsystem, Funktionen und Anbindung an bestehende Abläufe", items: [
      ["07", "Komponentenbibliothek", "Wiederverwendbare Schaltflächen, Eingaben, Hinweise und Statusanzeigen.", 700, 12500],
      ["08", "Designabstimmung", "Zwei gemeinsame Durchsprachen einschließlich dokumentierter Korrekturen.", 350, 12500],
      ["09", "Projektgrundlage und Entwicklungsumgebung", "Repository, Build-Prozess sowie getrennte Entwicklungs- und Testumgebungen.", 500, 13500],
      ["10", "Anmeldung und Rollenverwaltung", "Geschützte Anmeldung, Passwortzurücksetzung und abgestimmte Rollenrechte.", 1050, 13500],
      ["11", "Kundenstammdaten", "Pflege von Kontaktdaten und Lieferadressen einschließlich Eingabeprüfung.", 800, 12500],
      ["12", "Produkt- und Preisdaten", "Übernahme des vereinbarten Artikelsortiments und kundenspezifischer Preise.", 950, 13500],
      ["13", "Bestellerfassung", "Warenkorb, Mengenprüfung und Erfassung interner Bestellreferenzen.", 1200, 13500],
      ["14", "Freigabeprozess", "Mehrstufige Freigaben, Rückfragen und nachvollziehbare Statusübergänge.", 1000, 13500],
      ["15", "Schnittstelle zur Warenwirtschaft", "Übertragung von Bestellungen und Rückübernahme vereinbarter Statusdaten.", 1400, 15000],
      ["16", "Dokumentenübersicht", "Zuordnung und geschützter Abruf von Angeboten, Auftragsbestätigungen und Rechnungen.", 750, 12500],
      ["17", "Benachrichtigungen", "Vorlagen und Versandlogik für Bestelleingang, Rückfragen und Freigaben.", 550, 12500],
      ["18", "Responsive Umsetzung", "Anpassung der freigegebenen Ansichten an Smartphone, Tablet und Desktop.", 800, 12500],
    ] },
    { title: "Qualitätssicherung und Übergabe", subtitle: "Prüfung, Abnahme und Einführung des vereinbarten Lieferumfangs", items: [
      ["19", "Automatisierte Funktionstests", "Tests der zentralen Bestell-, Freigabe- und Berechtigungsabläufe.", 850, 12500],
      ["20", "Barrierearme Bedienung", "Prüfung von Tastaturbedienung, Fokusführung und Formularbeschriftungen.", 450, 11000],
      ["21", "Leistungs- und Sicherheitstests", "Abgestimmte Lastfälle sowie Prüfung von Zugriffsschutz und Fehlermeldungen.", 600, 13500],
      ["22", "Abnahme und Nacharbeiten", "Begleitung der fachlichen Abnahme und Bearbeitung des vereinbarten Prüfprotokolls.", 550, 12500],
      ["23", "Dokumentation und Schulung", "Betriebshandbuch und gemeinsame Einführung der zuständigen Mitarbeitenden.", 400, 11000],
      ["24", "Produktivsetzung und Übergabe", "Bereitstellung, Funktionskontrolle und dokumentierte Übergabe am 30.09.2026.", 350, 13500],
    ] },
  ],
};

// Tuple columns: position, name, description, hundredths of an hour, net unit price in cents.
// Integer arithmetic and half-up rounding keep amounts deterministic in Node, Bun and browsers.
function roundedRatio(amount, numerator, denominator) {
  const result = (BigInt(amount) * BigInt(numerator) + BigInt(denominator) / 2n) / BigInt(denominator);
  if (result > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError("Example invoice amount is too large");
  return Number(result);
}

export function calculateInvoice(data = invoice) {
  let subtotalCents = 0;
  const sections = data.sections.map(section => {
    const carriedCents = subtotalCents;
    const items = section.items.map(([position, name, description, quantityHundredths, unitPriceCents]) => {
      if (!Number.isSafeInteger(quantityHundredths) || quantityHundredths <= 0 || !Number.isSafeInteger(unitPriceCents) || unitPriceCents < 0) throw new TypeError("Invoice quantities and prices must be non-negative fixed-point integers");
      const netCents = roundedRatio(quantityHundredths, unitPriceCents, 100);
      subtotalCents += netCents;
      if (!Number.isSafeInteger(subtotalCents)) throw new RangeError("Example invoice amount is too large");
      return { position, name, description, quantityHundredths, unitPriceCents, netCents };
    });
    return { ...section, items, carriedCents, cumulativeCents: subtotalCents };
  });
  for (const rate of [data.discountBasisPoints, data.vatBasisPoints]) {
    if (!Number.isInteger(rate) || rate < 0 || rate > 10000) throw new RangeError("Invoice rates must be between 0 and 10000 basis points");
  }
  const discountCents = roundedRatio(subtotalCents, data.discountBasisPoints, 10000);
  const netCents = subtotalCents - discountCents;
  const vatCents = roundedRatio(netCents, data.vatBasisPoints, 10000);
  return { sections, subtotalCents, discountCents, netCents, vatCents, totalCents: netCents + vatCents };
}
