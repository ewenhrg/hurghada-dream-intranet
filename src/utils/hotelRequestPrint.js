import { boardLabelsFromViewModel } from "../constants/hotelRequestBoardOptions";
import { formatHotelStayDate } from "./hotelRequestDates";
import { formatQuoteMoney } from "./hotelQuoteCalc";

/**
 * HTML imprimable : demande + devis calculé (tarifs hôtel).
 */
export function generateHotelRequestHTML(request) {
  const fullName = [request.firstName, request.lastName].filter(Boolean).join(" ").trim() || "—";
  const wantsOffer = request.wantsCustomOffer === true;
  const hotels = wantsOffer
    ? []
    : [request.hotelOption1, request.hotelOption2, request.hotelOption3].filter((h) =>
        String(h || "").trim()
      );
  const createdLabel = request.createdAt
    ? new Date(request.createdAt).toLocaleString("fr-FR")
    : "—";
  const boardLabels = boardLabelsFromViewModel(request);
  const boardHtml =
    boardLabels.length > 0
      ? boardLabels.map((l) => escapeHtml(l)).join(", ")
      : "All inclusive";
  const boardLabel = boardLabels.length > 0 ? boardLabels.join(" · ") : "All inclusive";

  const quoteHotels = Array.isArray(request.quoteHotels)
    ? request.quoteHotels
    : Array.isArray(request.responsePayload?.hotels)
      ? request.responsePayload.hotels
      : [];

  const hotelRows = wantsOffer
    ? `<tr><td colspan="2" style="padding:8px 12px;border:1px solid #fde68a;background:#fffbeb;font-weight:600;">Je n'ai pas de choix d'hôtel — faites-moi une offre</td></tr>`
    : hotels.length > 0
      ? hotels
          .map(
            (name, i) =>
              `<tr><td style="padding:8px 12px;border:1px solid #e2e8f0;font-weight:600;">Choix ${i + 1}</td><td style="padding:8px 12px;border:1px solid #e2e8f0;">${escapeHtml(name)}</td></tr>`
          )
          .join("")
      : `<tr><td colspan="2" style="padding:8px 12px;border:1px solid #e2e8f0;">—</td></tr>`;

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <title>Devis hôtel — ${escapeHtml(fullName)}</title>
  <style>
    body { font-family: "Segoe UI", system-ui, sans-serif; color: #0f172a; margin: 24px; line-height: 1.45; }
    h1 { font-size: 22px; margin: 0 0 8px; color: #312e81; }
    h2 { font-size: 16px; margin: 20px 0 8px; color: #4338ca; }
    .meta { font-size: 13px; color: #64748b; margin-bottom: 20px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 14px; }
    .notes { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 14px; white-space: pre-wrap; }
    .quote-section { margin-top: 28px; page-break-inside: avoid; }
    table.quote-grid { width: 100%; border-collapse: collapse; font-size: 13px; }
    table.quote-grid th,
    table.quote-grid td { border: 1px solid #cbd5e1; padding: 10px 8px; vertical-align: middle; }
    table.quote-grid th { background: #eef2ff; font-weight: 700; text-align: left; color: #312e81; }
    table.quote-grid td.num { text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; }
    table.quote-grid tr.total td { background: #f8fafc; font-weight: 700; }
    .warn { color: #9a3412; font-size: 12px; margin-top: 6px; }
    @media print {
      body { margin: 12px; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  <h1>Devis hôtel — Hurghada Dream</h1>
  <p class="meta">Émis le ${escapeHtml(new Date().toLocaleString("fr-FR"))} · Demande du ${escapeHtml(createdLabel)} · Réf. #${escapeHtml(String(request.id || ""))}</p>

  <table>
    <tbody>
      <tr><td style="padding:8px 12px;border:1px solid #e2e8f0;font-weight:600;width:32%;">Client</td><td style="padding:8px 12px;border:1px solid #e2e8f0;">${escapeHtml(fullName)}</td></tr>
      <tr><td style="padding:8px 12px;border:1px solid #e2e8f0;font-weight:600;">Téléphone</td><td style="padding:8px 12px;border:1px solid #e2e8f0;">${escapeHtml(request.phone || "—")}</td></tr>
      <tr><td style="padding:8px 12px;border:1px solid #e2e8f0;font-weight:600;">E-mail</td><td style="padding:8px 12px;border:1px solid #e2e8f0;">${escapeHtml(request.email || "—")}</td></tr>
      <tr><td style="padding:8px 12px;border:1px solid #e2e8f0;font-weight:600;">Arrivée</td><td style="padding:8px 12px;border:1px solid #e2e8f0;">${escapeHtml(formatHotelStayDate(request.arrivalDate))}</td></tr>
      <tr><td style="padding:8px 12px;border:1px solid #e2e8f0;font-weight:600;">Départ</td><td style="padding:8px 12px;border:1px solid #e2e8f0;">${escapeHtml(formatHotelStayDate(request.departureDate))}</td></tr>
      <tr><td style="padding:8px 12px;border:1px solid #e2e8f0;font-weight:600;">Adultes</td><td style="padding:8px 12px;border:1px solid #e2e8f0;">${escapeHtml(request.adultsCount != null && request.adultsCount >= 1 ? String(request.adultsCount) : "—")}</td></tr>
      <tr><td style="padding:8px 12px;border:1px solid #e2e8f0;font-weight:600;">Enfants</td><td style="padding:8px 12px;border:1px solid #e2e8f0;">${escapeHtml(request.childrenCount != null && request.childrenCount >= 0 ? String(request.childrenCount) : "—")}</td></tr>
      <tr><td style="padding:8px 12px;border:1px solid #e2e8f0;font-weight:600;">Âge(s) enfants</td><td style="padding:8px 12px;border:1px solid #e2e8f0;">${escapeHtml(request.childAges?.trim() ? request.childAges : "—")}</td></tr>
      <tr><td style="padding:8px 12px;border:1px solid #e2e8f0;font-weight:600;">Formule</td><td style="padding:8px 12px;border:1px solid #e2e8f0;">${boardHtml}</td></tr>
    </tbody>
  </table>

  <h2>Hôtels souhaités</h2>
  <table>
    <tbody>${hotelRows}</tbody>
  </table>

  ${buildQuoteTablesHTML(quoteHotels, {
    checkIn: formatHotelStayDate(request.arrivalDate),
    checkOut: formatHotelStayDate(request.departureDate),
    boardLabel,
  })}

  <h2>Notes client</h2>
  <div class="notes">${escapeHtml(request.notes?.trim() ? request.notes : "—")}</div>
</body>
</html>`;
}

function buildQuoteTablesHTML(quoteHotels, { checkIn, checkOut, boardLabel }) {
  const rows = Array.isArray(quoteHotels) ? quoteHotels.filter((h) => h?.hotelName) : [];
  if (!rows.length) {
    return `<div class="quote-section"><p style="font-size:13px;color:#64748b;">Aucune réponse tarifaire enregistrée — ouvrez <strong>Réponse</strong>, choisissez une catégorie, enregistrez, puis imprimez.</p></div>`;
  }

  const body = rows
    .map((h) => {
      const quote = h.quote || {};
      const totalLabel = formatQuoteMoney(quote.total, quote.currency || "EUR");
      const warn =
        Array.isArray(quote.warnings) && quote.warnings.length
          ? `<div class="warn">${escapeHtml(quote.warnings.join(" · "))}</div>`
          : "";
      const detail = [
        quote.nights != null ? `${quote.nights} nuit(s)` : null,
        quote.freeChildren > 0 ? `${quote.freeChildren} enfant(s) gratuit(s)` : null,
      ]
        .filter(Boolean)
        .join(" · ");
      return `<tr>
        <td>${escapeHtml(h.hotelName)}</td>
        <td>${escapeHtml(h.roomCategory || "—")}${detail ? `<div style="font-size:11px;color:#64748b;margin-top:4px;">${escapeHtml(detail)}</div>` : ""}${warn}</td>
        <td>${escapeHtml(boardLabel)}</td>
        <td>${escapeHtml(checkIn)}</td>
        <td>${escapeHtml(checkOut)}</td>
        <td class="num">${escapeHtml(totalLabel)}</td>
      </tr>`;
    })
    .join("");

  return `
  <div class="quote-section">
    <h2>Devis proposé</h2>
    <table class="quote-grid" aria-label="Devis hôtel">
      <thead>
        <tr>
          <th>Hôtel</th>
          <th>Type de chambre</th>
          <th>Formule</th>
          <th>Check-in</th>
          <th>Check-out</th>
          <th>Prix total</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>
  </div>`;
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
