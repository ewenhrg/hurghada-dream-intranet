function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function formatQuoteEuro(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "—";
  const hasCents = Math.round(amount * 100) % 100 !== 0;
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function generateEventQuoteHTML(quote) {
  const esc = escapeHtml;
  const lines = Array.isArray(quote?.lines) ? quote.lines : [];
  const rows = lines
    .map(
      (line) => `<tr>
        <td>${esc(line.label)}</td>
        <td class="money">${esc(line.priceLabel)}</td>
      </tr>`
    )
    .join("");
  const message = String(quote?.message || "").trim();

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>Devis ${esc(quote?.number || "")}</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 24px; background: #f4efe6; color: #0f2a33; font-family: "Segoe UI", Tahoma, sans-serif; }
    .sheet { max-width: 820px; margin: 0 auto; background: #fff; border: 1px solid #e7dcc8; }
    .band { display: flex; justify-content: space-between; gap: 24px; padding: 28px 32px 22px; background: #0b4f5c; color: #fff; }
    .brand { margin: 0; font-size: 13px; letter-spacing: 0.22em; text-transform: uppercase; font-weight: 700; }
    .doc { margin: 8px 0 0; font-size: 32px; letter-spacing: -0.04em; }
    .meta { text-align: right; font-size: 13px; line-height: 1.6; }
    .meta strong { font-size: 16px; }
    .body { padding: 28px 32px 32px; }
    .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
    .card { border: 1px solid #eadfce; border-radius: 12px; padding: 14px 16px; }
    h2 { margin: 0 0 10px; font-size: 11px; letter-spacing: 0.16em; text-transform: uppercase; color: #0e7c86; }
    p { margin: 0; }
    .name { font-size: 18px; font-weight: 800; }
    .muted { margin-top: 4px; color: #3d5560; font-size: 13px; line-height: 1.45; }
    .facts { width: 100%; border-collapse: collapse; font-size: 13px; }
    .facts th { width: 46%; padding: 4px 8px 4px 0; text-align: left; color: #5c7280; font-weight: 650; }
    .facts td { padding: 4px 0; font-weight: 700; }
    .note { margin-top: 18px; }
    .note p { white-space: pre-wrap; font-size: 14px; line-height: 1.5; }
    table.lines { width: 100%; border-collapse: collapse; margin-top: 18px; }
    table.lines th, table.lines td { padding: 10px 12px; border-bottom: 1px solid #eadfce; text-align: left; font-size: 14px; }
    table.lines th { background: #faf6ef; font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: #0b4f5c; }
    td.money, th.money { text-align: right; white-space: nowrap; }
    .total { display: flex; justify-content: flex-end; margin-top: 8px; }
    .total div { min-width: 240px; display: flex; justify-content: space-between; gap: 24px; padding: 14px 12px; background: #0b4f5c; color: #fff; font-size: 18px; font-weight: 800; }
    .foot { margin-top: 28px; padding-top: 14px; border-top: 1px solid #eadfce; color: #5c7280; font-size: 12px; line-height: 1.5; }
    .print-btn { margin: 0 0 16px; padding: 10px 16px; border: 0; border-radius: 10px; background: #0b4f5c; color: #fff; font-weight: 700; cursor: pointer; }
    @media print {
      body { background: #fff; padding: 0; }
      .sheet { border: 0; }
      .print-btn { display: none; }
      .band, .total div, table.lines th { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
    @page { size: A4 portrait; margin: 12mm; }
  </style>
</head>
<body>
  <button class="print-btn" onclick="window.print()">Imprimer / Enregistrer en PDF</button>
  <article class="sheet">
    <header class="band">
      <div>
        <p class="brand">Hurghada Dream</p>
        <h1 class="doc">Devis</h1>
      </div>
      <div class="meta">
        <div><strong>${esc(quote?.number || "")}</strong></div>
        <div>${esc(quote?.issuedAt || "")}</div>
      </div>
    </header>
    <div class="body">
      <div class="cols">
        <section class="card">
          <h2>Client</h2>
          <p class="name">${esc(quote?.clientName || "—")}</p>
          <p class="muted">${esc(quote?.phone || "—")}<br>${esc(quote?.email || "—")}<br>${esc(quote?.hotel || "—")}</p>
          <p class="muted">Séjour : ${esc(quote?.stay || "—")}</p>
        </section>
        <section class="card">
          <h2>Événement</h2>
          <table class="facts">
            <tr><th>Type</th><td>${esc(quote?.eventType || "—")}</td></tr>
            <tr><th>Date</th><td>${esc(quote?.eventDate || "—")}</td></tr>
            <tr><th>Personnes</th><td>${esc(quote?.guestCount || "—")}</td></tr>
            <tr><th>Budget indiqué</th><td>${esc(quote?.budget || "—")}</td></tr>
            <tr><th>Photographe / vidéaste</th><td>${esc(quote?.photographer || "—")}</td></tr>
          </table>
        </section>
      </div>
      ${
        message
          ? `<section class="note card"><h2>Demande du client</h2><p>${esc(message)}</p></section>`
          : ""
      }
      <table class="lines">
        <thead>
          <tr>
            <th>Prestation proposée</th>
            <th class="money">Prix</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="total"><div><span>Total</span><span>${esc(quote?.total || "")}</span></div></div>
      <p class="foot">Hurghada Dream · Esplanada mall, Hurghada · Réservation +20 10 62002850</p>
    </div>
  </article>
  <script>window.addEventListener("load", function () { setTimeout(function () { window.print(); }, 250); });</script>
</body>
</html>`;
}
