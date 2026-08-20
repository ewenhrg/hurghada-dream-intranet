import { boardLabelsFromViewModel } from "../constants/hotelRequestBoardOptions";
import { formatHotelStayDate } from "./hotelRequestDates";
import { formatQuoteMoney } from "./hotelQuoteCalc";

/**
 * HTML imprimable : devis hôtel premium (client + propositions tarifaires).
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
  const shortRef = refId.length > 8 ? refId.slice(0, 8).toUpperCase() : refId.toUpperCase();

  const quoteHotels = Array.isArray(request.quoteHotels)
    ? request.quoteHotels
    : Array.isArray(request.responsePayload?.hotels)
      ? request.responsePayload.hotels
      : [];

  const hotelChoicesHtml = wantsOffer
    ? `<p class="soft-note">Offre personnalisée demandée — sans choix d’hôtel préétabli.</p>`
    : hotels.length > 0
      ? `<div class="choice-list">${hotels
          .map(
            (name, i) =>
              `<div class="choice-item"><span class="choice-index">${i + 1}</span><span class="choice-name">${escapeHtml(name)}</span></div>`
          )
          .join("")}</div>`
      : `<p class="muted">Aucun hôtel renseigné.</p>`;

  const adultsLabel =
    request.adultsCount != null && request.adultsCount >= 1
      ? `${request.adultsCount} adulte${request.adultsCount > 1 ? "s" : ""}`
      : "—";
  const childrenLabel =
    request.childrenCount != null && request.childrenCount > 0
      ? `${request.childrenCount} enfant${request.childrenCount > 1 ? "s" : ""}`
      : "Aucun";
  const childAges = request.childAges?.trim() || "";
  const checkIn = formatHotelStayDate(request.arrivalDate);
  const checkOut = formatHotelStayDate(request.departureDate);

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <title>Devis hôtel — ${escapeHtml(fullName)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Outfit:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <style>
    :root {
      --ink: #13212e;
      --ink-soft: #3d4f5f;
      --muted: #6b7c8a;
      --line: #e4e9ee;
      --line-strong: #c9d3dc;
      --paper: #ffffff;
      --wash: #f4f7f9;
      --wash-deep: #eaf0f4;
      --accent: #0e7490;
      --accent-soft: #ecfeff;
      --sand: #c4a574;
      --ok: #0f766e;
      --ok-soft: #f0fdfa;
    }
    @page { margin: 12mm 12mm; size: A4; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body {
      color: var(--ink);
      background: var(--paper);
      font-family: "Outfit", "Segoe UI", system-ui, sans-serif;
      font-size: 13px;
      line-height: 1.45;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .sheet {
      max-width: 860px;
      margin: 0 auto;
      position: relative;
    }

    /* ——— Header ——— */
    .hero {
      position: relative;
      padding: 28px 32px 26px;
      background:
        linear-gradient(135deg, #0b1c28 0%, #163247 55%, #0f4c5c 100%);
      color: #f8fafc;
      overflow: hidden;
    }
    .hero::after {
      content: "";
      position: absolute;
      right: -40px;
      top: -60px;
      width: 280px;
      height: 280px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(196,165,116,0.22) 0%, transparent 68%);
      pointer-events: none;
    }
    .hero-top {
      position: relative;
      z-index: 1;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 20px;
    }
    .brand-mark {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .brand-name {
      font-family: "Cormorant Garamond", Georgia, serif;
      font-size: 28px;
      font-weight: 600;
      letter-spacing: 0.02em;
      line-height: 1.1;
    }
    .brand-tag {
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.28em;
      text-transform: uppercase;
      color: rgba(248,250,252,0.62);
    }
    .doc-badge {
      text-align: right;
    }
    .doc-badge-label {
      display: inline-block;
      padding: 5px 12px;
      border: 1px solid rgba(248,250,252,0.28);
      border-radius: 999px;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.2em;
      text-transform: uppercase;
      color: rgba(248,250,252,0.9);
    }
    .doc-ref {
      margin-top: 10px;
      font-size: 12px;
      color: rgba(248,250,252,0.7);
      font-variant-numeric: tabular-nums;
    }
    .doc-ref strong {
      display: block;
      color: #fff;
      font-size: 14px;
      font-weight: 600;
      letter-spacing: 0.04em;
    }
    .hero-title {
      position: relative;
      z-index: 1;
      margin: 22px 0 0;
      font-family: "Cormorant Garamond", Georgia, serif;
      font-size: 42px;
      font-weight: 600;
      letter-spacing: -0.02em;
      line-height: 1;
    }
    .hero-sub {
      position: relative;
      z-index: 1;
      margin: 8px 0 0;
      font-size: 13px;
      color: rgba(248,250,252,0.72);
      font-weight: 500;
    }

    /* ——— Body ——— */
    .body {
      padding: 28px 32px 20px;
    }
    .section {
      margin-top: 26px;
    }
    .section:first-child { margin-top: 0; }
    .section-head {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 12px;
      padding-bottom: 8px;
      border-bottom: 1px solid var(--line);
    }
    .section-title {
      margin: 0;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: var(--muted);
    }
    .section-aside {
      font-size: 11px;
      color: var(--muted);
      font-weight: 500;
    }

    /* Stay ribbon */
    .stay-ribbon {
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      gap: 12px;
      align-items: stretch;
      padding: 18px 20px;
      background: var(--wash);
      border: 1px solid var(--line);
      border-radius: 14px;
    }
    .stay-point { min-width: 0; }
    .stay-point.out { text-align: right; }
    .stay-label {
      display: block;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--muted);
      margin-bottom: 4px;
    }
    .stay-date {
      font-family: "Cormorant Garamond", Georgia, serif;
      font-size: 22px;
      font-weight: 600;
      letter-spacing: -0.02em;
      color: var(--ink);
      line-height: 1.15;
    }
    .stay-arrow {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 4px;
      min-width: 88px;
      color: var(--muted);
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }
    .stay-arrow-line {
      width: 72px;
      height: 1px;
      background: linear-gradient(90deg, transparent, var(--sand), transparent);
      position: relative;
    }
    .stay-arrow-line::after {
      content: "";
      position: absolute;
      right: 0;
      top: -3px;
      width: 7px;
      height: 7px;
      border-right: 1.5px solid var(--sand);
      border-top: 1.5px solid var(--sand);
      transform: rotate(45deg);
    }

    /* Info grid */
    .info-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 0;
      border: 1px solid var(--line);
      border-radius: 14px;
      overflow: hidden;
      background: var(--paper);
    }
    .info-cell {
      padding: 14px 16px;
      border-right: 1px solid var(--line);
      border-bottom: 1px solid var(--line);
      min-width: 0;
    }
    .info-cell:nth-child(4n) { border-right: none; }
    .info-cell:nth-last-child(-n+4) { border-bottom: none; }
    .info-label {
      display: block;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--muted);
      margin-bottom: 5px;
    }
    .info-value {
      font-size: 13.5px;
      font-weight: 600;
      color: var(--ink);
      word-break: break-word;
    }
    .info-value.muted { color: var(--muted); font-weight: 500; }

    /* Hotel choices */
    .choice-list { display: flex; flex-direction: column; gap: 8px; }
    .choice-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 11px 14px;
      background: var(--wash);
      border-radius: 10px;
      border: 1px solid transparent;
    }
    .choice-index {
      flex-shrink: 0;
      width: 26px;
      height: 26px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 8px;
      background: var(--ink);
      color: #fff;
      font-size: 12px;
      font-weight: 700;
    }
    .choice-name {
      font-size: 14px;
      font-weight: 600;
      color: var(--ink);
    }
    .soft-note {
      margin: 0;
      padding: 12px 14px;
      background: #fffbeb;
      border-radius: 10px;
      color: #92400e;
      font-weight: 600;
      font-size: 13px;
    }
    .muted { color: var(--muted); font-weight: 500; }

    /* Quote proposals */
    .quote-list {
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .quote-card {
      border: 1px solid var(--line);
      border-radius: 16px;
      overflow: hidden;
      page-break-inside: avoid;
      background: var(--paper);
      box-shadow: 0 1px 0 rgba(19, 33, 46, 0.04);
    }
    .quote-card-accent {
      height: 4px;
      background: linear-gradient(90deg, var(--accent), var(--sand));
    }
    .quote-card-main {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 18px;
      padding: 18px 20px 10px;
      align-items: start;
    }
    .quote-hotel {
      margin: 0;
      font-family: "Cormorant Garamond", Georgia, serif;
      font-size: 24px;
      font-weight: 600;
      letter-spacing: -0.01em;
      line-height: 1.15;
      color: var(--ink);
    }
    .quote-room {
      margin: 6px 0 0;
      font-size: 13px;
      font-weight: 500;
      color: var(--ink-soft);
    }
    .quote-price {
      text-align: right;
      padding-left: 12px;
    }
    .quote-price-label {
      display: block;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--muted);
      margin-bottom: 2px;
    }
    .quote-price-value {
      font-family: "Cormorant Garamond", Georgia, serif;
      font-size: 30px;
      font-weight: 600;
      letter-spacing: -0.02em;
      color: var(--ink);
      font-variant-numeric: tabular-nums;
      line-height: 1.1;
    }
    .quote-meta {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 0;
      margin: 4px 20px 0;
      padding: 12px 0;
      border-top: 1px solid var(--line);
    }
    .quote-meta-item {
      padding: 0 12px;
      border-right: 1px solid var(--line);
    }
    .quote-meta-item:first-child { padding-left: 0; }
    .quote-meta-item:last-child { border-right: none; padding-right: 0; }
    .tag-row {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      padding: 0 20px 16px;
    }
    .tag {
      display: inline-flex;
      align-items: center;
      padding: 5px 10px;
      border-radius: 8px;
      font-size: 11px;
      font-weight: 600;
      background: var(--wash-deep);
      color: var(--ink-soft);
      letter-spacing: 0.01em;
    }
    .tag.transfer {
      background: var(--ok-soft);
      color: var(--ok);
    }
    .tag.rooms {
      background: var(--accent-soft);
      color: var(--accent);
    }
    .empty-quote {
      margin: 0;
      padding: 22px 20px;
      border: 1px dashed var(--line-strong);
      border-radius: 14px;
      color: var(--muted);
      text-align: center;
      font-size: 13px;
      background: var(--wash);
    }

    /* Notes */
    .notes-box {
      padding: 16px 18px;
      border-radius: 14px;
      border: 1px solid var(--line);
      background: var(--wash);
      white-space: pre-wrap;
      font-weight: 500;
      color: var(--ink-soft);
      line-height: 1.55;
      min-height: 52px;
    }

    /* Footer */
    .footer {
      margin-top: 28px;
      padding: 18px 32px 24px;
      border-top: 1px solid var(--line);
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      gap: 16px;
    }
    .footer-brand {
      font-family: "Cormorant Garamond", Georgia, serif;
      font-size: 16px;
      font-weight: 600;
      color: var(--ink);
    }
    .footer-note {
      margin: 4px 0 0;
      font-size: 11px;
      color: var(--muted);
      max-width: 420px;
      line-height: 1.45;
    }
    .footer-stamp {
      text-align: right;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: var(--sand);
    }

    @media print {
      body { background: #fff; }
      .sheet { max-width: none; }
      .quote-card { box-shadow: none; }
      .hero { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
    @media screen {
      body {
        background:
          radial-gradient(ellipse at top, #dbe7ef 0%, #eef2f5 45%, #e8eef2 100%);
        padding: 36px 18px 48px;
        min-height: 100vh;
      }
      .sheet {
        background: var(--paper);
        border-radius: 18px;
        overflow: hidden;
        box-shadow:
          0 1px 0 rgba(255,255,255,0.7) inset,
          0 24px 60px -28px rgba(19, 33, 46, 0.45);
      }
    }
    @media (max-width: 640px) {
      .hero, .body, .footer { padding-left: 18px; padding-right: 18px; }
      .hero-title { font-size: 32px; }
      .info-grid { grid-template-columns: 1fr 1fr; }
      .info-cell:nth-child(4n) { border-right: 1px solid var(--line); }
      .info-cell:nth-child(2n) { border-right: none; }
      .info-cell:nth-last-child(-n+4) { border-bottom: 1px solid var(--line); }
      .info-cell:nth-last-child(-n+2) { border-bottom: none; }
      .stay-ribbon { grid-template-columns: 1fr; text-align: center; }
      .stay-point.out { text-align: center; }
      .quote-card-main { grid-template-columns: 1fr; }
      .quote-price { text-align: left; padding-left: 0; }
      .quote-meta { grid-template-columns: 1fr; gap: 10px; }
      .quote-meta-item { border-right: none; padding: 0; }
      .footer { flex-direction: column; align-items: flex-start; }
      .footer-stamp { text-align: left; }
    }
  </style>
</head>
<body>
  <div class="sheet">
    <header class="hero">
      <div class="hero-top">
        <div class="brand-mark">
          <div class="brand-name">Hurghada Dream</div>
          <div class="brand-tag">Travel · Red Sea</div>
        </div>
        <div class="doc-badge">
          <span class="doc-badge-label">Devis hôtel</span>
          <div class="doc-ref">
            <strong>Réf. ${escapeHtml(shortRef)}</strong>
            Émis le ${escapeHtml(issuedLabel)}
          </div>
        </div>
      </div>
      <h1 class="hero-title">DEVIS</h1>
      <p class="hero-sub">Préparé pour ${escapeHtml(fullName)} · Demande du ${escapeHtml(createdLabel)}</p>
    </header>

    <div class="body">
      <section class="section">
        <div class="section-head">
          <h2 class="section-title">Séjour</h2>
          <span class="section-aside">${escapeHtml(boardLabel)}</span>
        </div>
        <div class="stay-ribbon">
          <div class="stay-point">
            <span class="stay-label">Arrivée</span>
            <div class="stay-date">${escapeHtml(checkIn)}</div>
          </div>
          <div class="stay-arrow">
            <span>Séjour</span>
            <span class="stay-arrow-line" aria-hidden="true"></span>
          </div>
          <div class="stay-point out">
            <span class="stay-label">Départ</span>
            <div class="stay-date">${escapeHtml(checkOut)}</div>
          </div>
        </div>
      </section>

      <section class="section">
        <div class="section-head">
          <h2 class="section-title">Coordonnées & voyageurs</h2>
        </div>
        <div class="info-grid">
          <div class="info-cell">
            <span class="info-label">Client</span>
            <div class="info-value">${escapeHtml(fullName)}</div>
          </div>
          <div class="info-cell">
            <span class="info-label">Téléphone</span>
            <div class="info-value">${escapeHtml(request.phone || "—")}</div>
          </div>
          <div class="info-cell">
            <span class="info-label">E-mail</span>
            <div class="info-value">${escapeHtml(request.email || "—")}</div>
          </div>
          <div class="info-cell">
            <span class="info-label">Formule</span>
            <div class="info-value">${escapeHtml(boardLabel)}</div>
          </div>
          <div class="info-cell">
            <span class="info-label">Adultes</span>
            <div class="info-value">${escapeHtml(adultsLabel)}</div>
          </div>
          <div class="info-cell">
            <span class="info-label">Enfants</span>
            <div class="info-value">${escapeHtml(childrenLabel)}</div>
          </div>
          <div class="info-cell">
            <span class="info-label">Âge(s) enfants</span>
            <div class="info-value ${childAges ? "" : "muted"}">${escapeHtml(childAges || "—")}</div>
          </div>
          <div class="info-cell">
            <span class="info-label">Référence</span>
            <div class="info-value">#${escapeHtml(refId)}</div>
          </div>
        </div>
      </section>

      <section class="section">
        <div class="section-head">
          <h2 class="section-title">Hôtels souhaités</h2>
        </div>
        ${hotelChoicesHtml}
      </section>

      ${buildQuoteCardsHTML(quoteHotels, { checkIn, checkOut, boardLabel })}

      <section class="section">
        <div class="section-head">
          <h2 class="section-title">Notes client</h2>
        </div>
        <div class="notes-box">${escapeHtml(request.notes?.trim() ? request.notes : "Aucune note.")}</div>
      </section>

      ${(() => {
        const agentNotes = String(
          request.agentNotes || request.responsePayload?.agentNotes || ""
        ).trim();
        if (!agentNotes) return "";
        return `<section class="section">
        <div class="section-head">
          <h2 class="section-title">Note</h2>
        </div>
        <div class="notes-box">${escapeHtml(agentNotes)}</div>
      </section>`;
      })()}
    </div>

    <footer class="footer">
      <div>
        <div class="footer-brand">Hurghada Dream</div>
        <p class="footer-note">Devis indicatif, sous réserve de disponibilité et de confirmation définitive.</p>
      </div>
      <div class="footer-stamp">Mer Rouge · Égypte</div>
    </footer>
  </div>
</body>
</html>`;
}

function buildQuoteCardsHTML(quoteHotels, { checkIn, checkOut, boardLabel }) {
  const rows = Array.isArray(quoteHotels) ? quoteHotels.filter((h) => h?.hotelName) : [];
  if (!rows.length) {
    return `<section class="section">
      <div class="section-head"><h2 class="section-title">DEVIS</h2></div>
      <p class="empty-quote">Aucune proposition tarifaire pour le moment.</p>
    </section>`;
  }

  const cards = rows
    .map((h, index) => {
      const quote = h.quote || {};
      const totalLabel = formatQuoteMoney(quote.total, quote.currency || "EUR");
      const tags = [];
      if (quote.nights != null && quote.nights > 0) {
        tags.push(
          `<span class="tag">${escapeHtml(String(quote.nights))} nuit${quote.nights > 1 ? "s" : ""}</span>`
        );
      }
      if (Number(quote.roomsNeeded) > 1) {
        const n = Number(quote.roomsNeeded);
        tags.push(
          `<span class="tag rooms">${escapeHtml(String(n))} chambre${n > 1 ? "s" : ""}</span>`
        );
      }
      if (quote.freeChildren > 0) {
        tags.push(
          `<span class="tag">${escapeHtml(String(quote.freeChildren))} enfant(s) gratuit(s)</span>`
        );
      }
      if (quote.transferIncluded) {
        tags.push(`<span class="tag transfer">transfert inclus</span>`);
      }
      const roomLine = [
        h.roomCategory || "Catégorie à confirmer",
        Number(quote.roomsNeeded) > 1 ? `${Number(quote.roomsNeeded)} chambres` : null,
      ]
        .filter(Boolean)
        .join(" · ");

      return `<article class="quote-card">
        <div class="quote-card-accent" aria-hidden="true"></div>
        <div class="quote-card-main">
          <div>
            <p class="section-aside" style="margin:0 0 4px;letter-spacing:0.14em;text-transform:uppercase;font-size:10px;font-weight:700;">Option ${index + 1}</p>
            <h3 class="quote-hotel">${escapeHtml(h.hotelName)}</h3>
            <p class="quote-room">${escapeHtml(roomLine)}</p>
          </div>
          <div class="quote-price">
            <span class="quote-price-label">Total</span>
            <div class="quote-price-value">${escapeHtml(totalLabel)}</div>
          </div>
        </div>
        <div class="quote-meta">
          <div class="quote-meta-item">
            <span class="info-label">Formule</span>
            <div class="info-value">${escapeHtml(boardLabel)}</div>
          </div>
          <div class="quote-meta-item">
            <span class="info-label">Check-in</span>
            <div class="info-value">${escapeHtml(checkIn)}</div>
          </div>
          <div class="quote-meta-item">
            <span class="info-label">Check-out</span>
            <div class="info-value">${escapeHtml(checkOut)}</div>
          </div>
        </div>
        ${tags.length ? `<div class="tag-row">${tags.join("")}</div>` : `<div style="height:12px"></div>`}
      </article>`;
    })
    .join("");

  return `<section class="section">
    <div class="section-head">
      <h2 class="section-title">DEVIS</h2>
      <span class="section-aside">${rows.length} option${rows.length > 1 ? "s" : ""}</span>
    </div>
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
  // Laisse le temps aux polices Google de charger avant l’impression
  setTimeout(() => {
    win.print();
  }, 700);
  return true;
}
