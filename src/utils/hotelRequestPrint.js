import { boardLabelsFromViewModel } from "../constants/hotelRequestBoardOptions";
import { formatHotelStayDate } from "./hotelRequestDates";
import { formatQuoteMoney } from "./hotelQuoteCalc";

/**
 * HTML imprimable : devis hôtel propre (client + propositions tarifaires).
 */
export function generateHotelRequestHTML(request) {
  const fullName = [request.firstName, request.lastName].filter(Boolean).join(" ").trim() || "—";
  const wantsOffer = request.wantsCustomOffer === true;
  const hotels = wantsOffer
    ? []
    : [request.hotelOption1, request.hotelOption2, request.hotelOption3].filter((h) =>
        String(h || "").trim()
      );
  const issuedLabel = new Date().toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const createdLabel = request.createdAt
    ? new Date(request.createdAt).toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "—";
  const boardLabels = boardLabelsFromViewModel(request);
  const boardLabel = boardLabels.length > 0 ? boardLabels.join(" · ") : "All inclusive";
  const refId = String(request.id || "").trim() || "—";

  const quoteHotels = Array.isArray(request.quoteHotels)
    ? request.quoteHotels
    : Array.isArray(request.responsePayload?.hotels)
      ? request.responsePayload.hotels
      : [];

  const hotelChoicesHtml = wantsOffer
    ? `<p class="choice-note">Offre personnalisée demandée — sans choix d’hôtel préétabli.</p>`
    : hotels.length > 0
      ? `<ol class="hotel-choices">${hotels
          .map((name) => `<li>${escapeHtml(name)}</li>`)
          .join("")}</ol>`
      : `<p class="muted">Aucun hôtel renseigné.</p>`;

  const travelers = [
    request.adultsCount != null && request.adultsCount >= 1
      ? `${request.adultsCount} adulte${request.adultsCount > 1 ? "s" : ""}`
      : null,
    request.childrenCount != null && request.childrenCount > 0
      ? `${request.childrenCount} enfant${request.childrenCount > 1 ? "s" : ""}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const childAges = request.childAges?.trim() || "";

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <title>Devis hôtel — ${escapeHtml(fullName)}</title>
  <style>
    @page { margin: 16mm 14mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: #0f172a;
      background: #fff;
      font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
      font-size: 13.5px;
      line-height: 1.5;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .sheet {
      max-width: 820px;
      margin: 0 auto;
      padding: 8px 4px 24px;
    }
    .topbar {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 24px;
      padding-bottom: 20px;
      border-bottom: 2px solid #0f172a;
    }
    .brand {
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.22em;
      text-transform: uppercase;
      color: #0f172a;
    }
    .doc-title {
      margin: 6px 0 0;
      font-size: 26px;
      font-weight: 700;
      letter-spacing: -0.03em;
      color: #0f172a;
    }
    .meta-block {
      text-align: right;
      font-size: 12px;
      color: #64748b;
      line-height: 1.55;
    }
    .meta-block strong {
      display: block;
      color: #0f172a;
      font-size: 13px;
      font-weight: 700;
    }
    .section {
      margin-top: 28px;
    }
    .section-title {
      margin: 0 0 12px;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: #64748b;
    }
    .card {
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 16px 18px;
      background: #fff;
    }
    .grid-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 14px 28px;
    }
    .field-label {
      display: block;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #94a3b8;
      margin-bottom: 2px;
    }
    .field-value {
      font-size: 14px;
      font-weight: 600;
      color: #0f172a;
    }
    .field-value.muted,
    .muted {
      color: #64748b;
      font-weight: 500;
    }
    .hotel-choices {
      margin: 0;
      padding-left: 1.15rem;
      color: #0f172a;
      font-weight: 600;
    }
    .hotel-choices li { margin: 0.2rem 0; }
    .choice-note {
      margin: 0;
      font-weight: 600;
      color: #92400e;
    }
    .quote-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .quote-card {
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      overflow: hidden;
      page-break-inside: avoid;
    }
    .quote-card-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
      padding: 14px 16px;
      background: #f8fafc;
      border-bottom: 1px solid #e2e8f0;
    }
    .quote-hotel {
      margin: 0;
      font-size: 16px;
      font-weight: 700;
      letter-spacing: -0.02em;
      color: #0f172a;
    }
    .quote-room {
      margin: 4px 0 0;
      font-size: 13px;
      font-weight: 500;
      color: #475569;
    }
    .quote-price {
      text-align: right;
      white-space: nowrap;
    }
    .quote-price-label {
      display: block;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #94a3b8;
    }
    .quote-price-value {
      font-size: 20px;
      font-weight: 700;
      letter-spacing: -0.02em;
      color: #0f172a;
      font-variant-numeric: tabular-nums;
    }
    .quote-card-body {
      padding: 12px 16px 14px;
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px 16px;
    }
    .pill-row {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 10px;
      padding: 0 16px 14px;
    }
    .pill {
      display: inline-flex;
      align-items: center;
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 700;
      background: #f1f5f9;
      color: #334155;
    }
    .pill.transfer {
      background: #ecfdf5;
      color: #065f46;
    }
    .empty-quote {
      margin: 0;
      padding: 16px 18px;
      border: 1px dashed #cbd5e1;
      border-radius: 12px;
      color: #64748b;
      font-size: 13px;
    }
    .notes {
      white-space: pre-wrap;
      font-weight: 500;
      color: #334155;
      line-height: 1.55;
    }
    .footer {
      margin-top: 32px;
      padding-top: 14px;
      border-top: 1px solid #e2e8f0;
      font-size: 11px;
      color: #94a3b8;
      text-align: center;
    }
    @media print {
      .sheet { padding: 0; max-width: none; }
    }
    @media screen {
      body { background: #f1f5f9; padding: 28px 16px; }
      .sheet {
        background: #fff;
        padding: 36px 40px 40px;
        border-radius: 16px;
        box-shadow: 0 18px 50px -28px rgba(15, 23, 42, 0.35);
      }
    }
  </style>
</head>
<body>
  <div class="sheet">
    <header class="topbar">
      <div>
        <div class="brand">Hurghada Dream</div>
        <h1 class="doc-title">Devis hôtel</h1>
      </div>
      <div class="meta-block">
        <strong>Réf. #${escapeHtml(refId)}</strong>
        Émis le ${escapeHtml(issuedLabel)}<br />
        Demande du ${escapeHtml(createdLabel)}
      </div>
    </header>

    <section class="section">
      <h2 class="section-title">Client & séjour</h2>
      <div class="card grid-2">
        <div>
          <span class="field-label">Client</span>
          <div class="field-value">${escapeHtml(fullName)}</div>
        </div>
        <div>
          <span class="field-label">Formule</span>
          <div class="field-value">${escapeHtml(boardLabel)}</div>
        </div>
        <div>
          <span class="field-label">Téléphone</span>
          <div class="field-value">${escapeHtml(request.phone || "—")}</div>
        </div>
        <div>
          <span class="field-label">E-mail</span>
          <div class="field-value">${escapeHtml(request.email || "—")}</div>
        </div>
        <div>
          <span class="field-label">Arrivée</span>
          <div class="field-value">${escapeHtml(formatHotelStayDate(request.arrivalDate))}</div>
        </div>
        <div>
          <span class="field-label">Départ</span>
          <div class="field-value">${escapeHtml(formatHotelStayDate(request.departureDate))}</div>
        </div>
        <div>
          <span class="field-label">Voyageurs</span>
          <div class="field-value">${escapeHtml(travelers || "—")}</div>
        </div>
        <div>
          <span class="field-label">Âge(s) enfants</span>
          <div class="field-value ${childAges ? "" : "muted"}">${escapeHtml(childAges || "—")}</div>
        </div>
      </div>
    </section>

    <section class="section">
      <h2 class="section-title">Hôtels souhaités</h2>
      <div class="card">${hotelChoicesHtml}</div>
    </section>

    ${buildQuoteCardsHTML(quoteHotels, {
      checkIn: formatHotelStayDate(request.arrivalDate),
      checkOut: formatHotelStayDate(request.departureDate),
      boardLabel,
    })}

    <section class="section">
      <h2 class="section-title">Notes client</h2>
      <div class="card notes">${escapeHtml(request.notes?.trim() ? request.notes : "—")}</div>
    </section>

    <p class="footer">Hurghada Dream — devis indicatif, sous réserve de disponibilité.</p>
  </div>
</body>
</html>`;
}

function buildQuoteCardsHTML(quoteHotels, { checkIn, checkOut, boardLabel }) {
  const rows = Array.isArray(quoteHotels) ? quoteHotels.filter((h) => h?.hotelName) : [];
  if (!rows.length) {
    return `<section class="section">
      <h2 class="section-title">Proposition</h2>
      <p class="empty-quote">Aucune proposition tarifaire pour le moment.</p>
    </section>`;
  }

  const cards = rows
    .map((h) => {
      const quote = h.quote || {};
      const totalLabel = formatQuoteMoney(quote.total, quote.currency || "EUR");
      const pills = [];
      if (quote.nights != null && quote.nights > 0) {
        pills.push(
          `<span class="pill">${escapeHtml(String(quote.nights))} nuit${quote.nights > 1 ? "s" : ""}</span>`
        );
      }
      if (quote.freeChildren > 0) {
        pills.push(
          `<span class="pill">${escapeHtml(String(quote.freeChildren))} enfant(s) gratuit(s)</span>`
        );
      }
      if (quote.transferIncluded) {
        pills.push(`<span class="pill transfer">transfert inclus</span>`);
      }
      return `<article class="quote-card">
        <div class="quote-card-head">
          <div>
            <h3 class="quote-hotel">${escapeHtml(h.hotelName)}</h3>
            <p class="quote-room">${escapeHtml(h.roomCategory || "Catégorie à confirmer")}</p>
          </div>
          <div class="quote-price">
            <span class="quote-price-label">Total</span>
            <div class="quote-price-value">${escapeHtml(totalLabel)}</div>
          </div>
        </div>
        <div class="quote-card-body">
          <div>
            <span class="field-label">Formule</span>
            <div class="field-value">${escapeHtml(boardLabel)}</div>
          </div>
          <div>
            <span class="field-label">Check-in</span>
            <div class="field-value">${escapeHtml(checkIn)}</div>
          </div>
          <div>
            <span class="field-label">Check-out</span>
            <div class="field-value">${escapeHtml(checkOut)}</div>
          </div>
        </div>
        ${pills.length ? `<div class="pill-row">${pills.join("")}</div>` : ""}
      </article>`;
    })
    .join("");

  return `<section class="section">
    <h2 class="section-title">Proposition</h2>
    <div class="quote-list">${cards}</div>
  </section>`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Ouvre la fenêtre d’impression navigateur. */
export function printHotelRequest(request) {
  const html = generateHotelRequestHTML(request);
  const win = window.open("", "_blank");
  if (!win) return false;
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => {
    win.print();
  }, 400);
  return true;
}
