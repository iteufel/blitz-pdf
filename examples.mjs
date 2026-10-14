export const examples = {
  hello: {
    name: "hello-world",
    html: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <style>
    body { margin: 0; font-family: sans-serif;
      color: #25334a; font-size: 12px; }
    .eyebrow { color: #2563eb; font-size: 10px;
      letter-spacing: 2px; margin-top: 30px; }
    h1 { font-size: 42px; line-height: 1.15;
      margin: 20px 0; letter-spacing: -1px; }
    .intro { color: #6b7890; line-height: 1.8;
      max-width: 420px; font-size: 14px; }
    .rule { height: 3px; background: #2563eb;
      width: 46px; margin: 28px 0; }
    .card { background: #f1f5fc; padding: 24px;
      border-radius: 8px; margin-top: 32px; }
    h2 { font-size: 15px; margin: 0 0 12px; }
    .card p { line-height: 1.8; margin: 0;
      color: #5d6e88; }
    .footer { font-size: 10px; color: #8b96a8;
      margin-top: 48px; }
  </style>
</head>
<body>
  <p class="eyebrow">A SMALL IDEA, ON PAPER.</p>
  <h1>Hello, world.<br>Hello, PDF.</h1>
  <div class="rule"></div>
  <p class="intro">Beautiful documents start with
    a little markup. This one was made entirely
    in your browser.</p>
  <div class="card">
    <h2>Make something worth sharing.</h2>
    <p>Edit the HTML. Add your own styles.
      Try an invoice or a two-page report.<br>
      Your next document is a few keystrokes away.</p>
  </div>
  <p class="footer">MADE WITH BLITZ-PDF · HTML TO PDF</p>
</body>
</html>`
  },
  invoice: {
    name: "sample-invoice",
    html: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <style>
    body { margin: 0; font: 12px/1.6 sans-serif; color: #263650; }
    .brand { color: #2563eb; font-size: 14px; font-weight: bold; }
    h1 { font-size: 36px; margin: 25px 0 0; }
    .muted { color: #7b879b; }
    .address { margin: 28px 0; }
    table { width: 100%; border-collapse: collapse; margin-top: 28px; }
    th { text-align: left; font-size: 10px; color: #7b879b;
      border-bottom: 2px solid #2563eb; }
    th, td { padding: 14px 8px; }
    td { border-bottom: 1px solid #e5e9f1; }
    .amount { text-align: right; }
    .total { text-align: right; font-size: 22px; margin-top: 24px; }
    .note { background: #f1f5fc; padding: 20px; margin-top: 40px; }
  </style>
</head>
<body>
  <p class="brand">NORTH STUDIO</p>
  <h1>Invoice</h1>
  <p class="muted">INV-0042 · 14 October 2026 · Sample document</p>
  <div class="address"><strong>Bill to</strong><br>
    Example Company<br>24 Garden Street<br>Berlin, Germany</div>
  <table>
    <thead><tr><th>Description</th><th>Qty</th><th class="amount">Amount</th></tr></thead>
    <tbody>
      <tr><td>Brand direction</td><td>1</td><td class="amount">€1,200.00</td></tr>
      <tr><td>Website design</td><td>1</td><td class="amount">€2,400.00</td></tr>
      <tr><td>Design handoff</td><td>1</td><td class="amount">€400.00</td></tr>
    </tbody>
  </table>
  <p class="total"><strong>Total &nbsp; €4,000.00</strong></p>
  <div class="note">Thank you for creating with us.<br>
    This is an example, not a payment request.</div>
</body>
</html>`
  },
  report: {
    name: "project-report",
    html: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <style>
    body { margin: 0; font: 13px/1.8 sans-serif; color: #263650; }
    .label { color: #2563eb; font-size: 10px; letter-spacing: 2px; }
    h1 { font-size: 38px; line-height: 1.2; margin-top: 22px; }
    h2 { font-size: 23px; }
    .lead { color: #73819a; font-size: 16px; }
    .callout { background: #f1f5fc; border-left: 3px solid #2563eb;
      padding: 20px; margin-top: 30px; }
    .next-page { break-before: page; }
    li { margin-bottom: 14px; }
  </style>
</head>
<body>
  <p class="label">FIELD NOTES / 001</p>
  <h1>Small steps.<br>Thoughtful outcomes.</h1>
  <p class="lead">A two-page project report.</p>
  <h2>The starting point</h2>
  <p>A useful document gives an idea room to breathe.
    Clear typography, generous spacing, and a few
    thoughtful details make it easy to follow.</p>
  <div class="callout"><strong>Built for the page.</strong><br>
    Use CSS page breaks to give each section its own space.
    The text in this PDF remains selectable and searchable.</div>
  <section class="next-page">
    <p class="label">WHAT COMES NEXT</p>
    <h2>From idea to action.</h2>
    <ol>
      <li><strong>Make it clear.</strong><br>Start with the one thing your reader needs to know.</li>
      <li><strong>Make it yours.</strong><br>Adjust the markup, colors, and page settings.</li>
      <li><strong>Make it real.</strong><br>Export a PDF and share your work.</li>
    </ol>
    <p class="lead">A little markup. A document worth keeping.</p>
  </section>
</body>
</html>`
  },
  blank: {
    name: "document",
    html: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <style>
    body { margin: 0; font-family: sans-serif; }
  </style>
</head>
<body>
  <h1>Your document</h1>
  <p>Start something here.</p>
</body>
</html>`
  }
};
