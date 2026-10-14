export const defaultExampleOptions = Object.freeze({
  format: "A4",
  landscape: false,
  margin: "15mm",
  pageNumbers: true,
  preferCSSPageSize: false,
});

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
  ticket: {
    name: "night-frequency-ticket",
    options: { format: "A5", landscape: true, margin: "10mm", pageNumbers: false },
    html: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; font: 11px/1.45 sans-serif; color: #172f35; }
    .masthead { display: flex; justify-content: space-between;
      margin-bottom: 16px; font-size: 9px; letter-spacing: 1.5px; }
    .ticket { display: grid; grid-template-columns: 1fr 180px;
      border: 1px solid #c9d8d2; border-radius: 12px; overflow: hidden; }
    .main { background: #132e34; color: #f7fbf8; padding: 26px; }
    .eyebrow { color: #b9df91; font-size: 10px; letter-spacing: 2px; margin: 0; }
    h1 { margin: 18px 0 6px; font-size: 39px; line-height: 1.03;
      letter-spacing: -1px; }
    .subtitle { color: #b8ccc9; margin: 12px 0 16px; }
    .wave { display: block; width: 100%; height: 42px; margin-bottom: 20px; }
    .details { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
    .label { display: block; font-size: 8px; letter-spacing: 1.4px;
      color: #8facaa; margin-bottom: 4px; }
    .value { font-size: 13px; font-weight: bold; }
    .stub { background: #edf4e7; border-left: 2px dashed #a8bdae;
      padding: 25px 20px; }
    .pass { display: inline-block; background: #d5e8bd; padding: 5px 9px;
      font-size: 8px; letter-spacing: 1px; margin-bottom: 23px; }
    .stub .label { color: #5c7a73; }
    .guest { font-size: 17px; line-height: 1.3; margin: 7px 0 21px; }
    .seat { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .seat strong { font-size: 23px; }
    .barcode { display: block; width: 136px; height: 40px; margin: 25px 0 6px; }
    .serial { font: 9px monospace; }
    .footer { display: flex; justify-content: space-between; gap: 16px;
      margin-top: 16px; color: #708580; font-size: 9px; }
  </style>
</head>
<body>
  <div class="masthead"><strong>NORTH HALL PRESENTS</strong><span>LIVE / 2026</span></div>
  <article class="ticket">
    <section class="main">
      <p class="eyebrow">ONE NIGHT. ALL FREQUENCIES.</p>
      <h1>NIGHT<br>FREQUENCY</h1>
      <p class="subtitle">Electronic sounds. An unforgettable room.</p>
      <svg class="wave" viewBox="0 0 400 42" xmlns="http://www.w3.org/2000/svg" aria-label="Sound wave illustration">
        <path d="M0 21H20L28 10L36 32L44 3L52 39L60 14L68 28L76 21H110L118 5L126 37L134 11L142 31L150 21H178L186 12L194 30L202 2L210 40L218 8L226 34L234 21H270L278 4L286 38L294 13L302 29L310 21H344L352 8L360 34L368 16L376 26L384 21H400" fill="none" stroke="#b9df91" stroke-width="2"/>
      </svg>
      <div class="details">
        <div><span class="label">DATE</span><span class="value">24 October 2026</span></div>
        <div><span class="label">DOORS / START</span><span class="value">19:00 / 20:00</span></div>
        <div><span class="label">VENUE</span><span class="value">North Hall, Berlin</span></div>
        <div><span class="label">ADMISSION</span><span class="value">Main floor</span></div>
      </div>
    </section>
    <aside class="stub">
      <span class="pass">ALL ACCESS</span>
      <span class="label">GUEST</span><h2 class="guest">Alex Morgan</h2>
      <div class="seat"><div><span class="label">GATE</span><strong>04</strong></div>
        <div><span class="label">ZONE</span><strong>A</strong></div></div>
      <svg class="barcode" viewBox="0 0 136 40" xmlns="http://www.w3.org/2000/svg" aria-label="Decorative sample barcode">
        <path d="M2 0v40M8 0v40M13 0v40M22 0v40M28 0v40M33 0v40M42 0v40M49 0v40M55 0v40M63 0v40M69 0v40M78 0v40M85 0v40M92 0v40M98 0v40M107 0v40M114 0v40M122 0v40M131 0v40" stroke="#172f35" stroke-width="2"/>
        <path d="M17 0v40M37 0v40M59 0v40M73 0v40M103 0v40M126 0v40" stroke="#172f35" stroke-width="4"/>
      </svg>
      <span class="serial">NF-2026-0104</span>
    </aside>
  </article>
  <div class="footer"><span>A5 landscape / Grid, SVG, and a detachable stub.</span>
    <span>Sample layout - not an entry ticket.</span></div>
</body>
</html>`
  },
  flight: {
    name: "flight-simulator-dashboard",
    options: { landscape: true, margin: "10mm", pageNumbers: false },
    html: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; font: 11px/1.4 sans-serif; color: #25374d; }
    .dashboard { border: 1px solid #dce4ec; background: #f3f6fa; }
    .topbar { display: flex; align-items: center; justify-content: space-between;
      padding: 20px 24px; background: #15283e; color: white; }
    .eyebrow { font-size: 8px; letter-spacing: 2px; margin: 0 0 5px; color: #94b1cc; }
    h1 { margin: 0; font-size: 24px; letter-spacing: -.5px; }
    .session { text-align: right; color: #b8ccde; font-size: 10px; }
    .badge { display: inline-block; background: #24473f; color: #b4e4c1;
      padding: 4px 9px; font-size: 9px; margin-bottom: 6px; }
    .metrics { display: grid; grid-template-columns: repeat(4, 1fr);
      gap: 12px; padding: 18px 20px 0; }
    .metric { background: white; border: 1px solid #dce4ec; padding: 13px 16px; }
    .label { font-size: 8px; color: #718398; letter-spacing: 1px; }
    .value { display: block; font-size: 27px; font-weight: bold; margin: 3px 0; }
    .value small { font-size: 11px; font-weight: normal; color: #7a8ca0; }
    .delta { color: #327b62; font-size: 9px; }
    .workspace { display: grid; grid-template-columns: 1.5fr 1fr;
      gap: 14px; padding: 16px 20px; }
    .panel { min-width: 0; background: white; border: 1px solid #dce4ec; padding: 16px; }
    .panel-title { display: flex; justify-content: space-between; align-items: center;
      margin-bottom: 12px; }
    h2 { margin: 0; font-size: 12px; }
    .muted { color: #8191a4; font-size: 9px; }
    .chart { display: block; width: 100%; height: 145px; }
    .axis { display: flex; justify-content: space-between; font: 8px monospace;
      color: #8797a9; margin-top: 7px; }
    .route { display: flex; justify-content: space-between; margin-top: 8px; }
    .route strong { font-size: 10px; }
    .lower { display: grid; grid-template-columns: 1fr 1.25fr;
      gap: 14px; padding: 0 20px 18px; }
    .conditions { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px 10px; }
    .conditions strong { display: block; margin-top: 4px; font-size: 12px; }
    table { width: 100%; border-collapse: collapse; font-size: 9px; }
    th { text-align: left; font-size: 8px; color: #8291a3; font-weight: normal; }
    th, td { padding: 8px 5px; border-bottom: 1px solid #edf0f5; }
    .ok { color: #327b62; }
    .footer { display: flex; justify-content: space-between; color: #7d8c9f;
      font-size: 9px; padding: 0 22px 16px; }
  </style>
</head>
<body>
  <main class="dashboard">
    <header class="topbar"><div><p class="eyebrow">AEROLAB / FLIGHT SIMULATOR</p>
      <h1>Flight telemetry</h1></div><div class="session"><span class="badge">SESSION COMPLETE</span><br>RUN FL-042 / 00:38:24</div></header>
    <section class="metrics">
      <div class="metric"><span class="label">ALTITUDE</span><strong class="value">18,500 <small>ft</small></strong><span class="delta">Target band reached</span></div>
      <div class="metric"><span class="label">AIRSPEED</span><strong class="value">242 <small>kt</small></strong><span class="delta">Cruise configuration</span></div>
      <div class="metric"><span class="label">VERTICAL SPEED</span><strong class="value">+620 <small>ft/min</small></strong><span class="delta">Climb segment</span></div>
      <div class="metric"><span class="label">HEADING</span><strong class="value">071 <small>deg</small></strong><span class="delta">Route deviation +0.2 NM</span></div>
    </section>
    <section class="workspace">
      <div class="panel"><div class="panel-title"><h2>Altitude profile</h2><span class="muted">0 - 24,000 ft</span></div>
        <svg class="chart" viewBox="0 0 540 145" xmlns="http://www.w3.org/2000/svg" aria-label="Altitude rising then stabilizing near cruise">
          <path d="M0 15H540M0 50H540M0 85H540M0 120H540M90 0V135M180 0V135M270 0V135M360 0V135M450 0V135" stroke="#e9eef5" fill="none"/>
          <path d="M0 133L45 128L90 113L135 90L180 68L225 47L270 36L315 33L360 35L405 32L450 28L495 26L540 24V140H0Z" fill="#e3eefb"/>
          <path d="M0 133L45 128L90 113L135 90L180 68L225 47L270 36L315 33L360 35L405 32L450 28L495 26L540 24" fill="none" stroke="#3079c5" stroke-width="3"/>
          <path d="M0 30H540" stroke="#90b9d5" stroke-dasharray="5 5"/>
          <circle cx="495" cy="26" r="5" fill="#3079c5" stroke="white" stroke-width="2"/>
        </svg>
        <div class="axis"><span>00:00</span><span>00:10</span><span>00:20</span><span>00:30</span><span>00:38</span></div>
      </div>
      <div class="panel"><div class="panel-title"><h2>Route overview</h2><span class="muted">241 NM planned</span></div>
        <svg class="chart" viewBox="0 0 340 145" xmlns="http://www.w3.org/2000/svg" aria-label="Illustrative route from Northfield to Coastport">
          <rect width="340" height="145" fill="#edf4f8"/>
          <path d="M0 0H220L195 25L214 45L174 68L198 92L162 116L171 145H0Z" fill="#dce8de"/>
          <path d="M0 36H340M0 72H340M0 108H340M68 0V145M136 0V145M204 0V145M272 0V145" stroke="#cedfe5" stroke-width="1" fill="none"/>
          <path d="M45 112L99 85L158 77L216 43L295 28" stroke="#2e7daf" stroke-width="2" stroke-dasharray="5 4" fill="none"/>
          <circle cx="45" cy="112" r="5" fill="#246d9d"/>
          <circle cx="295" cy="28" r="5" fill="#246d9d"/>
          <path d="M211 34L232 37L217 53L218 43Z" fill="#15283e"/>
        </svg>
        <div class="route"><strong>Northfield</strong><span class="muted">4 waypoints</span><strong>Coastport</strong></div>
      </div>
    </section>
    <section class="lower">
      <div class="panel"><div class="panel-title"><h2>Scenario conditions</h2><span class="muted">Preset: coastal climb</span></div>
        <div class="conditions">
          <div><span class="label">WIND</span><strong>260 deg / 12 kt</strong></div>
          <div><span class="label">VISIBILITY</span><strong>8 km</strong></div>
          <div><span class="label">TEMPERATURE</span><strong>12 C</strong></div>
          <div><span class="label">PRESSURE</span><strong>1,013 hPa</strong></div>
          <div><span class="label">TURBULENCE</span><strong>Light</strong></div>
          <div><span class="label">FUEL REMAINING</span><strong>74%</strong></div>
        </div>
      </div>
      <div class="panel"><div class="panel-title"><h2>Event log</h2><span class="muted">Selected events</span></div>
        <table><thead><tr><th>Time</th><th>Event</th><th>State</th></tr></thead><tbody>
          <tr><td>00:04:12</td><td>Climb profile established</td><td class="ok">COMPLETE</td></tr>
          <tr><td>00:18:40</td><td>Waypoint NORTH-02 crossed</td><td class="ok">ON ROUTE</td></tr>
          <tr><td>00:32:08</td><td>Altitude target band reached</td><td class="ok">STABLE</td></tr>
        </tbody></table>
      </div>
    </section>
    <footer class="footer"><span>Illustrative simulator data / static session snapshot</span><span>A4 landscape / CSS Grid + vector SVG charts</span></footer>
  </main>
</body>
</html>`
  },
  energy: {
    name: "energy-simulation-report",
    html: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; font: 11px/16px sans-serif; color: #243c37; }
    .masthead { display: flex; justify-content: space-between;
      border-bottom: 2px solid #357d64; padding-bottom: 12px; }
    .brand { font-weight: bold; letter-spacing: 1px; }
    .muted { color: #7e928a; font-size: 9px; }
    .eyebrow { color: #357d64; font-size: 9px; letter-spacing: 1.8px; margin: 20px 0 8px; }
    h1 { font-size: 32px; line-height: 1.15; letter-spacing: -.6px; margin: 0 0 13px; }
    .lead { font-size: 12px; color: #758c82; margin: 0 0 16px; }
    h2 { font-size: 14px; margin: 0 0 13px; }
    h3 { font-size: 11px; margin: 0 0 9px; }
    .metrics { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 18px; }
    .metric { background: #eff5f0; border-top: 3px solid #72a287; padding: 11px; }
    .label { color: #698778; font-size: 8px; letter-spacing: 1px; }
    .number { display: block; font-size: 26px; line-height: 1.25; font-weight: bold; margin: 6px 0; }
    .number small { font-size: 11px; font-weight: normal; }
    .panel { border: 1px solid #dbe6df; padding: 14px; margin-bottom: 16px; }
    .panel-heading { display: flex; justify-content: space-between; align-items: center; margin-bottom: 13px; }
    .panel-heading h2 { margin: 0; }
    .legend { display: flex; gap: 15px; font-size: 9px; }
    .legend span { border-left: 9px solid #4a9471; padding-left: 5px; }
    .legend .demand { border-color: #d3a45d; }
    .chart { display: block; width: 100%; height: 140px; }
    .axis { display: flex; justify-content: space-between; font-size: 8px; color: #84958c; }
    .columns { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin: 16px 0; }
    .note { background: #f4f7f3; padding: 14px; }
    .note p { margin: 0; color: #6c8176; font-size: 10px; }
    dl { display: grid; grid-template-columns: 1fr auto; gap: 7px; margin: 0; font-size: 10px; }
    dt { color: #728779; } dd { margin: 0; font-weight: bold; }
    table { border-collapse: collapse; width: 100%; font-size: 10px; }
    th { font-size: 8px; color: #7e9186; text-align: left; background: #f2f6f2; }
    th, td { padding: 7px 8px; border-bottom: 1px solid #dfe8e1; }
    .num { text-align: right; }
    .positive { color: #367c59; }
    .next-page { break-before: page; }
    .comparison { display: grid; grid-template-columns: 108px 1fr 40px;
      gap: 11px; align-items: center; margin: 14px 0; font-size: 10px; }
    .track { height: 18px; background: #edf2ed; }
    .bar { height: 18px; background: #72a58a; }
    .bar.selected { background: #357d64; }
    .caption { color: #809186; font-size: 9px; line-height: 14px; margin: 12px 0 0; }
    .callout { border-left: 3px solid #357d64; background: #eff5f0; padding: 15px 17px; margin-top: 22px; }
    .callout p { margin: 5px 0 0; font-size: 10px; color: #658071; }
  </style>
</head>
<body>
  <section>
    <header class="masthead"><span class="brand">GRIDLAB</span><span class="muted">ENERGY SIMULATOR / RUN EN-018</span></header>
    <p class="eyebrow">SCENARIO 02 / BALANCED STORAGE</p>
    <h1>A clearer view of energy.</h1>
    <p class="lead">A simulated day of solar generation, household demand, and battery dispatch.</p>
    <div class="metrics">
      <div class="metric"><span class="label">SOLAR CAPACITY</span><span class="number">9.6 <small>kWp</small></span><span class="muted">South-facing roof</span></div>
      <div class="metric"><span class="label">DAILY GENERATION</span><span class="number">38.4 <small>kWh</small></span><span class="muted">Illustrative clear day</span></div>
      <div class="metric"><span class="label">GRID IMPORT</span><span class="number">4.8 <small>kWh</small></span><span class="muted">Balanced scenario</span></div>
    </div>
    <div class="panel"><div class="panel-heading"><h2>Daily power profile</h2>
      <div class="legend"><span>Solar</span><span class="demand">Demand</span></div></div>
      <svg class="chart" viewBox="0 0 620 180" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" aria-label="Solar production peaks at midday; household demand peaks in the evening">
        <path d="M0 20H620M0 60H620M0 100H620M0 140H620M103 0V160M207 0V160M310 0V160M413 0V160M517 0V160" stroke="#e5ede6" fill="none"/>
        <path d="M0 160H130L155 150L181 128L207 90L233 62L259 35L285 22L310 18L336 28L362 42L388 70L413 106L439 134L465 153L491 160H620Z" fill="#deecdf"/>
        <path d="M0 160H130L155 150L181 128L207 90L233 62L259 35L285 22L310 18L336 28L362 42L388 70L413 106L439 134L465 153L491 160H620" stroke="#4a9471" stroke-width="3" fill="none"/>
        <path d="M0 142L52 148L103 148L155 118L181 100L207 129L259 138L310 132L362 140L413 115L465 78L491 67L517 88L568 116L620 139" stroke="#c79a57" stroke-width="3" fill="none"/>
      </svg>
      <div class="axis"><span>00:00</span><span>04:00</span><span>08:00</span><span>12:00</span><span>16:00</span><span>20:00</span><span>24:00</span></div>
      <p class="caption">Illustrative power curves, normalized to the chart height.</p>
    </div>
    <h2>Model inputs</h2>
    <div class="columns">
      <div class="note"><h3>Generation &amp; storage</h3><dl><dt>PV array</dt><dd>24 x 400 W</dd><dt>Battery capacity</dt><dd>10.0 kWh</dd><dt>Charge limit</dt><dd>3.0 kW</dd><dt>Round-trip efficiency</dt><dd>92%</dd></dl></div>
      <div class="note"><h3>Demand &amp; control</h3><dl><dt>Household demand</dt><dd>26.0 kWh</dd><dt>Time step</dt><dd>15 minutes</dd><dt>Reserve threshold</dt><dd>20%</dd><dt>Strategy</dt><dd>Self-consumption</dd></dl></div>
    </div>
    <h2>Energy balance</h2>
    <table><thead><tr><th>Flow</th><th class="num">Energy</th><th>Interpretation</th></tr></thead><tbody>
      <tr><td>Solar generation</td><td class="num">38.4 kWh</td><td>Total modeled production</td></tr>
      <tr><td>Grid import</td><td class="num">4.8 kWh</td><td>Energy supplied from the grid</td></tr>
      <tr><td>Household consumption</td><td class="num">26.0 kWh</td><td>Daily electricity demand</td></tr>
      <tr><td>Grid export</td><td class="num">16.2 kWh</td><td>Surplus after demand and charging</td></tr>
      <tr><td>Storage losses</td><td class="num">1.0 kWh</td><td>Opening and closing charge are equal</td></tr>
    </tbody></table>
  </section>
  <section class="next-page">
    <header class="masthead"><span class="brand">GRIDLAB</span><span class="muted">SCENARIO COMPARISON / RUN EN-018</span></header>
    <p class="eyebrow">COMPARE / INSPECT / REFINE</p>
    <h1>One model. Three approaches.</h1>
    <p class="lead">Compare an unbuffered baseline with two illustrative storage strategies.</p>
    <table><thead><tr><th>Scenario</th><th class="num">Demand covered locally</th><th class="num">Grid import</th><th class="num">Peak grid draw</th></tr></thead><tbody>
      <tr><td>01 / No storage</td><td class="num">63%</td><td class="num">9.6 kWh</td><td class="num">5.8 kW</td></tr>
      <tr><td><strong>02 / Balanced</strong></td><td class="num positive"><strong>82%</strong></td><td class="num"><strong>4.8 kWh</strong></td><td class="num"><strong>3.6 kW</strong></td></tr>
      <tr><td>03 / Storage first</td><td class="num">88%</td><td class="num">3.1 kWh</td><td class="num">2.5 kW</td></tr>
    </tbody></table>
    <div class="panel" style="margin-top: 24px"><h2>Demand covered by local energy</h2>
      <div class="comparison"><span>No storage</span><div class="track"><div class="bar" style="width: 63%"></div></div><strong>63%</strong></div>
      <div class="comparison"><span>Balanced</span><div class="track"><div class="bar selected" style="width: 82%"></div></div><strong>82%</strong></div>
      <div class="comparison"><span>Storage first</span><div class="track"><div class="bar" style="width: 88%"></div></div><strong>88%</strong></div>
      <p class="caption">Rounded share of the 26.0 kWh daily demand supplied without grid imports.</p>
    </div>
    <h2>Dispatch snapshots / balanced scenario</h2>
    <table><thead><tr><th>Time</th><th class="num">Solar</th><th class="num">Demand</th><th class="num">Battery charge</th><th>Mode</th></tr></thead><tbody>
      <tr><td>00:00</td><td class="num">0.0 kW</td><td class="num">0.6 kW</td><td class="num">42%</td><td>Discharging</td></tr>
      <tr><td>06:00</td><td class="num">0.3 kW</td><td class="num">1.5 kW</td><td class="num">20%</td><td>Reserve / import</td></tr>
      <tr><td>10:00</td><td class="num">5.8 kW</td><td class="num">0.9 kW</td><td class="num">63%</td><td>Charging / export</td></tr>
      <tr><td>14:00</td><td class="num">5.2 kW</td><td class="num">0.8 kW</td><td class="num">100%</td><td>Exporting</td></tr>
      <tr><td>18:00</td><td class="num">0.2 kW</td><td class="num">3.1 kW</td><td class="num">76%</td><td>Discharging</td></tr>
      <tr><td>24:00</td><td class="num">0.0 kW</td><td class="num">0.7 kW</td><td class="num">42%</td><td>Discharging</td></tr>
    </tbody></table>
    <div class="callout"><strong>Explore your own scenario.</strong><p>These values are static example data, not a live calculation. Edit the inputs, tables, and chart coordinates to build your own simulation report.</p></div>
    <p class="caption">Layout features: nested grids, SVG curves, CSS bars, comparison tables, explicit page breaks, and automatic page numbers.</p>
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
