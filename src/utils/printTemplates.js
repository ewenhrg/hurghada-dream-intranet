/**
 * Gabarits HTML d'impression (devis / facture et tickets d'excursion).
 *
 * Extraits de `src/utils.js` : ces deux fonctions pèsent ~39 Ko de source et
 * `utils.js` est importé par `App.jsx`, donc elles atterrissaient dans le chunk
 * d'entrée — téléchargées par tout le monde, y compris sur l'écran de connexion.
 * Isolées ici, elles ne sont chargées qu'avec les pages qui impriment
 * (Devis, Historique, Tickets).
 */
import {
  isSpeedBoatActivity,
  allowsSpeedBoatIslandExtras,
  includesSpeedBoatDolphinSearch,
  formatTurtleFinSizesLabel,
  isZeroTracasActivity,
  isZeroTracasHorsZoneActivity,
} from "./activityHelpers";
import { SPEED_BOAT_EXTRAS } from "../constants/activityExtras";
import {
  formatTransferTripLabel,
  getQuoteItemDetailLines,
  getQuoteItemParticipantCells,
  getZeroTracasServiceCounts,
} from "./quoteItemDisplay.js";
import { getDivingTicketBreakdown } from "./divingSafety.js";
import {
  calculateTransferSurchargeFromItem,
  calculateStandardTransferSurchargeFromItem,
  calculatePrivateTransferSurchargeFromItem,
  getPrivateTransferLabel,
  formatStaffPickupLabel,
  formatTicketPickupLabel,
} from "./transferPricing.js";
import { getTicketSettlementDisplay } from "./ticketSettlement.js";
import {
  currencyNoCents,
  formatPhoneWithPlus,
  calculateCardPrice,
  formatTicketsPaymentMethodsLabel,
  normalizeTicketsPaymentMethods,
  resolveTicketActivityName,
  buildActivitiesByIdMap,
} from "../utils.js";
import { getQuoteCollectionBreakdown } from "./ticketCollections.js";

/**
 * @param {object} quote
 * @param {{ variant?: "devis" | "facture" }} [options] — `facture` : titre FACTURE, libellés Total HT / Total TTC (mêmes montants que devis espèces / carte).
 */
export function generateQuoteHTML(quote, options = {}) {
  const variant = options.variant === "facture" ? "facture" : "devis";
  const docTitleUpper = variant === "facture" ? "FACTURE" : "DEVIS";
  const windowTitlePrefix = variant === "facture" ? "Facture" : "Devis";
  const detailsHeading = variant === "facture" ? "Détails de la facture" : "Détails du Devis";
  const totalCashLabel = variant === "facture" ? "Total HT :" : "Total Espèces:";
  const totalCardLabel =
    variant === "facture" ? "Total TTC :" : "Total Carte (avec frais 3%):";
  const finePrint =
    variant === "facture"
      ? "Cette facture est fournie à titre informatif. Les horaires sont approximatifs et seront confirmés la veille de votre départ."
      : "Ce devis est fourni à titre informatif. Les horaires sont approximatifs et seront confirmés la veille de votre départ.";

  const date = new Date(quote.createdAt).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric"
  });
  
  // Trier les activités par date (ordre croissant)
  const sortedItems = [...(quote?.items || [])].sort((a, b) => {
    const dateA = a.date ? new Date(a.date + "T12:00:00").getTime() : 0;
    const dateB = b.date ? new Date(b.date + "T12:00:00").getTime() : 0;
    return dateA - dateB;
  });
  
  const showStaffPickup = sortedItems.some((item) => item?.staffPickup);
  const itemsHTML = sortedItems.map((item, idx) => {
    const itemDate = new Date(item.date + "T12:00:00").toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "long",
      year: "numeric"
    });
    
    // Calculer le montant du supplément transfert
    const transferStandardAmount = calculateStandardTransferSurchargeFromItem(item);
    const transferPrivateAmount = calculatePrivateTransferSurchargeFromItem(item);
    
    // Vérifier si c'est Speed Boat et récupérer les extras
    const isSpeedBoat = item.activityName && isSpeedBoatActivity(item.activityName);
    let extrasInfo = [];
    
    if (isSpeedBoat) {
      if (includesSpeedBoatDolphinSearch(item.activityName)) {
        extrasInfo.push("Recherche dauphins incluse (sous réserve des conditions)");
      }

      // Extra Speed Boat îles (pas pour Speedboat Sunset)
      if (allowsSpeedBoatIslandExtras(item.activityName) && item.speedBoatExtra) {
        // Gérer le nouveau format (array) et l'ancien format (string) pour compatibilité
        const extrasArray = Array.isArray(item.speedBoatExtra) 
          ? item.speedBoatExtra 
          : (typeof item.speedBoatExtra === "string" && item.speedBoatExtra !== "" 
            ? [item.speedBoatExtra] 
            : []);
        
        extrasArray.forEach((extraId) => {
          if (extraId) { // Ignorer les valeurs vides
            const selectedExtra = SPEED_BOAT_EXTRAS.find((e) => e.id === extraId);
            if (selectedExtra && selectedExtra.id !== "") {
              extrasInfo.push(`${selectedExtra.label} (+${selectedExtra.priceAdult}€/adt + ${selectedExtra.priceChild}€/enfant)`);
            }
          }
        });
      }
    }
    
    // Ajouter le supplément transfert s'il existe
    if (transferStandardAmount > 0) {
      extrasInfo.push(`🚗 Transfert: ${currencyNoCents(transferStandardAmount, quote.currency)}`);
    }
    if (transferPrivateAmount > 0) {
      const label = getPrivateTransferLabel(item.privateTransferTier) || "Transfert privé";
      extrasInfo.push(`🚐 ${label}: ${currencyNoCents(transferPrivateAmount, quote.currency)}`);
    }

    // Extra libre (onglet Devis) : intitulé + montant
    const extraLabelText = item.extraLabel != null ? String(item.extraLabel).trim() : "";
    const extraAmountRaw = item.extraAmount != null ? String(item.extraAmount).trim() : "";
    const extraAmountValue = extraAmountRaw === "" ? 0 : Number(extraAmountRaw);
    const hasExtraAmount = Number.isFinite(extraAmountValue) && extraAmountValue !== 0;
    if (extraLabelText || hasExtraAmount) {
      const label = extraLabelText || "Extra";
      const amountPart = hasExtraAmount ? `: ${currencyNoCents(extraAmountValue, quote.currency)}` : "";
      extrasInfo.push(`➕ ${label}${amountPart}`);
    }

    getQuoteItemDetailLines(item).forEach((line) => extrasInfo.push(line));
    
    const extrasHTML = extrasInfo.length > 0 
      ? `<div style="margin-top: 5px; font-size: 11px; color: #2563eb; font-weight: 500;">${extrasInfo.join("<br>")}</div>`
      : "";
    
    const participantCells = getQuoteItemParticipantCells(item);
    
    return `
      <tr>
        <td>${idx + 1}</td>
        <td>
          <strong>${item.activityName || "—"}</strong>
          ${extrasHTML}
        </td>
        <td>${itemDate}</td>
        ${showStaffPickup ? `<td class="text-center">${formatStaffPickupLabel(item) || "—"}</td>` : ""}
        <td class="text-center">${participantCells.adults}</td>
        <td class="text-center">${participantCells.children}</td>
        <td class="text-center">${participantCells.babies}</td>
        <td class="text-right">${currencyNoCents(Math.round(item.lineTotal), quote.currency)}</td>
        ${item.ticketNumber ? `<td class="text-center"><span class="ticket-badge">🎫 ${item.ticketNumber}</span></td>` : '<td class="text-center">—</td>'}
      </tr>
    `;
  }).join("");

  return `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${windowTitlePrefix} - ${quote.client?.name || quote.client?.phone || "Client"}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      color: #333;
      line-height: 1.6;
      background: #f5f5f5;
      padding: 20px;
    }
    .quote-container {
      max-width: 900px;
      margin: 0 auto;
      background: white;
      padding: 40px;
      box-shadow: 0 0 20px rgba(0,0,0,0.1);
      border-radius: 8px;
    }
    .header {
      border-bottom: 3px solid #2563eb;
      padding-bottom: 20px;
      margin-bottom: 30px;
    }
    .logo-section {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
    }
    .logo-wrapper {
      width: 120px;
      height: 120px;
      flex-shrink: 0;
      position: relative;
    }
    .logo-img {
      max-width: 120px;
      max-height: 120px;
      object-fit: contain;
      display: block;
    }
    .logo-fallback {
      width: 120px;
      height: 120px;
      background: linear-gradient(to bottom right, #2563eb, #1e40af);
      border-radius: 12px;
      display: none;
      flex-direction: row;
      align-items: center;
      justify-content: center;
      color: white;
      font-weight: bold;
      font-size: 24px;
    }
    .logo-fallback[style*="flex"] {
      display: flex !important;
    }
    .company-info {
      flex: 1;
      margin-left: 20px;
    }
    .company-info h1 {
      color: #2563eb;
      font-size: 32px;
      margin-bottom: 5px;
    }
    .company-info p {
      color: #666;
      font-size: 14px;
    }
    .quote-title {
      text-align: right;
      align-self: flex-start;
      color: #1e40af;
      font-size: 28px;
      font-weight: bold;
      margin-top: 0;
      white-space: nowrap;
    }
    .quote-info {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
      margin-top: 30px;
    }
    .info-box {
      background: #f8fafc;
      padding: 15px;
      border-radius: 6px;
      border-left: 4px solid #2563eb;
    }
    .info-box h3 {
      color: #2563eb;
      font-size: 12px;
      text-transform: uppercase;
      margin-bottom: 8px;
      letter-spacing: 1px;
    }
    .info-box p {
      font-size: 14px;
      color: #333;
      font-weight: 500;
    }
    .activities-section {
      margin-top: 30px;
    }
    .activities-section h2 {
      color: #1e40af;
      font-size: 20px;
      margin-bottom: 15px;
      padding-bottom: 10px;
      border-bottom: 2px solid #e5e7eb;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 15px;
    }
    thead {
      background: #2563eb;
      color: white;
    }
    thead th {
      padding: 12px;
      text-align: left;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      font-weight: 600;
    }
    thead th.text-center {
      text-align: center;
    }
    thead th.text-right {
      text-align: right;
    }
    tbody td {
      padding: 12px;
      border-bottom: 1px solid #e5e7eb;
      font-size: 14px;
    }
    tbody tr:hover {
      background: #f8fafc;
    }
    .text-center {
      text-align: center;
    }
    .text-right {
      text-align: right;
    }
    .ticket-badge {
      background: #10b981;
      color: white;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
    }
    .totals-section {
      margin-top: 30px;
      padding-top: 20px;
      border-top: 2px solid #e5e7eb;
    }
    .total-row {
      display: flex;
      justify-content: space-between;
      padding: 12px 0;
      font-size: 16px;
    }
    .total-row.cash {
      font-weight: 600;
      font-size: 20px;
      color: #1e40af;
      border-top: 2px solid #2563eb;
      padding-top: 15px;
      margin-top: 10px;
    }
    .total-row.card {
      font-weight: 500;
      font-size: 18px;
      color: #4b5563;
      margin-top: 5px;
    }
    .notes-section {
      margin-top: 30px;
      padding: 15px;
      background: #fef3c7;
      border-left: 4px solid #f59e0b;
      border-radius: 6px;
    }
    .notes-section h3 {
      color: #92400e;
      font-size: 14px;
      text-transform: uppercase;
      margin-bottom: 8px;
      letter-spacing: 1px;
    }
    .notes-section p {
      color: #78350f;
      font-size: 14px;
      white-space: pre-wrap;
    }
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #e5e7eb;
      text-align: center;
      color: #6b7280;
      font-size: 12px;
    }
    .created-by {
      text-align: right;
      font-size: 11px;
      color: #9ca3af;
      margin-top: 5px;
    }
    @media print {
      body {
        background: white;
        padding: 0;
      }
      .quote-container {
        box-shadow: none;
        padding: 20px;
      }
    }
  </style>
</head>
<body>
  <div class="quote-container">
      <div class="header">
      <div class="logo-section">
        <div class="logo-wrapper">
          <img src="/logo.png" alt="Hurghada Dream Logo" class="logo-img" onerror="this.onerror=null; this.style.display='none'; this.parentElement.querySelector('.logo-fallback').style.display='flex';">
          <div class="logo-fallback" style="display:none;">HD</div>
        </div>
        <div class="company-info">
          <h1>HURGHADA DREAM</h1>
          <p>Votre partenaire pour des excursions inoubliables</p>
        </div>
        <div class="quote-title">${docTitleUpper}</div>
      </div>
      
      <div class="quote-info">
        <div class="info-box">
          <h3>Informations Client</h3>
          <p><strong>Nom:</strong> ${quote.client?.name || "—"}</p>
          <p><strong>Téléphone:</strong> ${formatPhoneWithPlus(quote.client?.phone) || "—"}</p>
          ${quote.client?.emergencyPhone ? `<p><strong>Numéro d'urgence:</strong> ${formatPhoneWithPlus(quote.client.emergencyPhone)}</p>` : ""}
          ${quote.client?.email ? `<p><strong>Email:</strong> ${quote.client.email}</p>` : ""}
          <p><strong>Hôtel:</strong> ${
            quote.client?.isAirbnb
              ? `Airbnb${quote.client?.hotel ? ` — ${quote.client.hotel}` : ""}`
              : quote.client?.hotel || "—"
          }</p>
          ${
            quote.client?.isAirbnb && quote.client?.airbnbMapsUrl
              ? `<p><strong>Lien Maps:</strong> <a href="${String(quote.client.airbnbMapsUrl).replace(/"/g, "&quot;")}" target="_blank" rel="noopener noreferrer">${String(quote.client.airbnbMapsUrl).replace(/</g, "&lt;")}</a></p>`
              : ""
          }
          <p><strong>Chambre:</strong> ${quote.client?.room || "—"}</p>
          <p><strong>Quartier:</strong> ${quote.client?.neighborhood ? quote.client.neighborhood.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase()) : "—"}</p>
          ${quote.client?.arrivalDate ? `<p><strong>Date d'arrivée:</strong> ${new Date(quote.client.arrivalDate + "T12:00:00").toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })}</p>` : ""}
          ${quote.client?.departureDate ? `<p><strong>Date de départ:</strong> ${new Date(quote.client.departureDate + "T12:00:00").toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })}</p>` : ""}
        </div>
        
        <div class="info-box">
          <h3>${detailsHeading}</h3>
          <p><strong>Date:</strong> ${date}</p>
          ${quote.createdByName ? `<p><strong>Créé par:</strong> ${quote.createdByName}</p>` : ""}
          ${quote.updatedByName ? `<p><strong>Modifié par:</strong> ${quote.updatedByName}</p>` : ""}
        </div>
      </div>
    </div>

    <div class="activities-section">
      <h2>Activités</h2>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Activité</th>
            <th>Date</th>
            ${showStaffPickup ? `<th class="text-center">Prise en charge</th>` : ""}
            <th class="text-center">Adultes</th>
            <th class="text-center">Enfants</th>
            <th class="text-center">Bébés</th>
            <th class="text-right">Prix</th>
            <th class="text-center">Ticket</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHTML}
        </tbody>
      </table>
    </div>

    <div class="totals-section">
      <div class="total-row cash">
        <span>${totalCashLabel}</span>
        <span><strong>${currencyNoCents(quote.totalCash || Math.round(quote.total), quote.currency)}</strong></span>
      </div>
      <div class="total-row card">
        <span>${totalCardLabel}</span>
        <span><strong>${currencyNoCents(quote.totalCard || calculateCardPrice(quote.total), quote.currency)}</strong></span>
      </div>
    </div>

    ${quote.notes ? `
    <div class="notes-section">
      <h3>Notes</h3>
      <p>${quote.notes}</p>
    </div>
    ` : ""}

    <div class="footer">
      <p>Merci pour votre confiance !</p>
      <p>Pour toute question, n'hésitez pas à nous contacter.</p>
    </div>

    <div style="margin-top: 40px; padding-top: 20px; border-top: 2px solid #e5e7eb; text-align: center;">
      <p style="font-size: 13px; color: #6b7280; font-style: italic;">
        ${finePrint}
      </p>
    </div>
    </div>
</body>
</html>
  `.trim();
}

/**
 * Génère une page HTML imprimable contenant un « ticket » (bon d'excursion) par activité du devis.
 * Chaque ticket affiche : prénom/nom, téléphone, e-mail, hôtel, chambre, activité, date, nombre de personnes,
 * heure de prise en charge (pick up) et prix.
 */
export function generateTicketsHTML(quote, options = {}) {
  const esc = (v) =>
    String(v == null ? "" : v)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const activitiesById =
    options.activitiesById ||
    (Array.isArray(options.activities) ? buildActivitiesByIdMap(options.activities) : null);

  const origin =
    typeof window !== "undefined" && window.location?.origin
      ? String(window.location.origin).replace(/\/$/, "")
      : "";
  const logoSrc = esc(origin ? `${origin}/logo-ticket.jpg` : "/logo-ticket.jpg");
  const baseHref = esc(origin ? `${origin}/` : "/");

  const formatTicketExtraLines = (item) => {
    const lines = [];
    const isSpeedBoat = item.activityName && isSpeedBoatActivity(item.activityName);

    if (isSpeedBoat) {
      if (includesSpeedBoatDolphinSearch(item.activityName)) {
        lines.push("Recherche dauphins incluse (sous réserve des conditions)");
      }
      if (allowsSpeedBoatIslandExtras(item.activityName) && item.speedBoatExtra) {
        const extrasArray = Array.isArray(item.speedBoatExtra)
          ? item.speedBoatExtra
          : typeof item.speedBoatExtra === "string" && item.speedBoatExtra !== ""
            ? [item.speedBoatExtra]
            : [];
        extrasArray.forEach((extraId) => {
          if (!extraId) return;
          const selectedExtra = SPEED_BOAT_EXTRAS.find((e) => e.id === extraId);
          if (selectedExtra && selectedExtra.id !== "") {
            lines.push(
              `${selectedExtra.label} (+${selectedExtra.priceAdult}€/adt + ${selectedExtra.priceChild}€/enfant)`
            );
          }
        });
      }
    }

    const extraLabelText = item.extraLabel != null ? String(item.extraLabel).trim() : "";
    const extraAmountRaw = item.extraAmount != null ? String(item.extraAmount).trim() : "";
    const extraAmountValue = extraAmountRaw === "" ? 0 : Number(extraAmountRaw);
    const hasExtraAmount = Number.isFinite(extraAmountValue) && extraAmountValue !== 0;
    if (extraLabelText || hasExtraAmount) {
      const isDiscount = hasExtraAmount && extraAmountValue < 0;
      const label =
        extraLabelText ||
        (isDiscount ? "Réduction" : "Extra / ajustement");
      const amountPart = hasExtraAmount
        ? `: ${currencyNoCents(extraAmountValue, quote.currency)}`
        : "";
      lines.push(`${label}${amountPart}`);
    }

    const tripLabel = formatTransferTripLabel(item);
    getQuoteItemDetailLines(item).forEach((line) => {
      if (tripLabel && line === `🚗 ${tripLabel}`) return;
      lines.push(line);
    });
    return lines;
  };

  const client = quote.client || {};
  const clientName = esc(client.name || "—");
  const reservationCode = esc(String(quote.reservationCode || "").trim());
  const clientPhone = esc(formatPhoneWithPlus(client.phone) || "—");
  const clientEmail = esc(String(client.email || "").trim());
  const clientHotel = esc(
    client.isAirbnb
      ? `Airbnb${client.hotel ? ` — ${client.hotel}` : ""}`
      : client.hotel || "—"
  );
  const clientRoom = esc(client.room || "—");
  const clientAirbnbMaps = client.isAirbnb && client.airbnbMapsUrl
    ? esc(String(client.airbnbMapsUrl))
    : "";
  const quoteTicketsBy = String(quote.ticketsEnteredByName || "").trim();
  // Sur le ticket imprimé : toujours le prix espèces (sans +3 % carte).
  const ticketCashTotal = (item) => Math.round(Number(item?.lineTotal) || 0);
  const ticketTransferAmount = (item) =>
    Math.round(calculateTransferSurchargeFromItem(item) || 0);
  /** Prix affiché sur le ticket (cash), éventuellement décomposé avec le transfert. */
  const formatTicketPriceDisplay = (item) => {
    const total = ticketCashTotal(item);
    const transfer = ticketTransferAmount(item);
    if (transfer > 0 && total > 0) {
      const base = Math.max(0, total - transfer);
      return `${base}+${transfer}=${total} (transfert)`;
    }
    return currencyNoCents(total, quote.currency || "EUR");
  };

  const buildDivingVisitorTicketBlock = (item) => {
    const breakdown = getDivingTicketBreakdown(item);
    if (!breakdown) return "";
    const curr = quote.currency || "EUR";
    const diversWord =
      breakdown.divers <= 1 ? "Client tarif normal (plongeur)" : "Clients tarif normal (plongeurs)";
    const visitorsWord =
      breakdown.visitors <= 1 ? "Visiteur (ne plonge pas)" : "Visiteurs (ne plongent pas)";
    const visitorPriceRow =
      breakdown.visitors > 0
        ? `<div class="ticket-diving-visitor-stat ticket-diving-visitor-stat-price">
                <span class="ticket-diving-visitor-num">${esc(
                  currencyNoCents(breakdown.visitorTotal, curr)
                )}</span>
                <span class="ticket-diving-visitor-lab">suppl. visiteurs (${esc(
                  String(breakdown.visitors)
                )} × ${esc(currencyNoCents(breakdown.unitPrice, curr))})</span>
              </div>`
        : "";

    return `
          <div class="ticket-diving-visitor" role="note" aria-label="Répartition plongée">
            <div class="ticket-diving-visitor-head">
              <span class="ticket-diving-visitor-icon" aria-hidden="true">🤿</span>
              <span class="ticket-diving-visitor-title">Répartition plongée</span>
            </div>
            <div class="ticket-diving-visitor-stats${
              breakdown.visitors > 0 ? " ticket-diving-visitor-stats--3" : ""
            }">
              <div class="ticket-diving-visitor-stat">
                <span class="ticket-diving-visitor-num">${esc(String(breakdown.divers))}</span>
                <span class="ticket-diving-visitor-lab">${esc(diversWord)}</span>
              </div>
              <div class="ticket-diving-visitor-stat">
                <span class="ticket-diving-visitor-num">${esc(String(breakdown.visitors))}</span>
                <span class="ticket-diving-visitor-lab">${esc(visitorsWord)}</span>
              </div>
              ${visitorPriceRow}
            </div>
          </div>`;
  };

  const sortedItems = [...(quote.items || [])]
    .filter((item) => item?.isCancelled !== true && String(item?.ticketNumber || "").trim())
    .sort((a, b) => {
    const na = String(a?.ticketNumber || "").trim();
    const nb = String(b?.ticketNumber || "").trim();
    if (na && nb) {
      const byTicket = na.localeCompare(nb, "fr", { numeric: true, sensitivity: "base" });
      if (byTicket !== 0) return byTicket;
    } else if (na && !nb) {
      return -1;
    } else if (!na && nb) {
      return 1;
    }
    const dateA = a.date ? new Date(a.date + "T12:00:00").getTime() : 0;
    const dateB = b.date ? new Date(b.date + "T12:00:00").getTime() : 0;
    return dateA - dateB;
  });

  const ticketsHTML = sortedItems
    .map((item) => {
      const isZeroTracas =
        isZeroTracasActivity(item.activityName) ||
        isZeroTracasHorsZoneActivity(item.activityName);

      if (isZeroTracas) {
        const isHorsZone = isZeroTracasHorsZoneActivity(item.activityName);
        const receiptTitle = isHorsZone
          ? "Recu de paiement de zero Tracas Hors zone"
          : "Recu de paiement de zero Tracas";
        const ticketNo = String(item.ticketNumber || "").trim();
        const cells = getQuoteItemParticipantCells(item);
        const paxParts = [];
        if (cells.adults > 0) paxParts.push(`${cells.adults} adulte${cells.adults > 1 ? "s" : ""}`);
        if (cells.children > 0)
          paxParts.push(`${cells.children} enfant${cells.children > 1 ? "s" : ""}`);
        if (cells.babies > 0) paxParts.push(`${cells.babies} bébé${cells.babies > 1 ? "s" : ""}`);
        const paxText = paxParts.length > 0 ? paxParts.join(" · ") : "";
        const arrivalDate = item.date
          ? new Date(item.date + "T12:00:00").toLocaleDateString("fr-FR")
          : "";
        const hotelText = client.isAirbnb
          ? `Airbnb${client.hotel ? ` — ${client.hotel}` : ""}`
          : client.hotel || "";
        const priceHint =
          item.lineTotal != null && Number.isFinite(Number(item.lineTotal))
            ? formatTicketPriceDisplay(item)
            : "";
        const ztCounts = getZeroTracasServiceCounts(item);
        // Toujours 3 cases distinctes : Transfert / Visa / SIM
        const ztServicesRow = `<div class="zt-row zt-row-services">
            <div class="zt-field zt-third"><span class="zt-lab">Transfert :</span><span class="zt-write zt-write-qty">${esc(String(ztCounts.transfers))}</span></div>
            <div class="zt-field zt-third"><span class="zt-lab">Visa :</span><span class="zt-write zt-write-qty">${esc(String(ztCounts.visas))}</span></div>
            <div class="zt-field zt-third"><span class="zt-lab">SIM :</span><span class="zt-write zt-write-qty">${esc(String(ztCounts.sims))}</span></div>
          </div>`;

        // Formulaire type reçu papier : valeurs connues préremplies, le reste = lignes à écrire à la main.
        return `
      <div class="zt-receipt">
        <div class="zt-head">
          <div class="zt-logo">
            <img src="${logoSrc}" alt="Hurghada Dream" class="zt-logo-img" />
          </div>
          <div class="zt-titles">
            <div class="zt-brand">Fayed Travel</div>
            <div class="zt-sub">( Hurghada Dream Tour )</div>
            <div class="zt-receipt-title">${esc(receiptTitle)}</div>
          </div>
          <div class="zt-meta">
            <div class="zt-no">Nº <span class="zt-no-value">${esc(ticketNo || "…………")}</span></div>
            <div class="zt-date-line">Date : <span class="zt-write zt-write-sm"></span> / <span class="zt-write zt-write-sm"></span> / 20<span class="zt-write zt-write-xs"></span></div>
          </div>
        </div>

        <div class="zt-rows">
          <div class="zt-row">
            <div class="zt-field zt-grow"><span class="zt-lab">Nom :</span><span class="zt-write">${esc(client.name || "")}</span></div>
            <div class="zt-field zt-grow"><span class="zt-lab">Ph.Numero :</span><span class="zt-write">${esc(formatPhoneWithPlus(client.phone))}</span></div>
          </div>
          <div class="zt-row">
            <div class="zt-field zt-grow"><span class="zt-lab">Hotel :</span><span class="zt-write">${esc(hotelText)}</span></div>
            <div class="zt-field zt-grow"><span class="zt-lab">Date d'arrivee :</span><span class="zt-write">${esc(arrivalDate)}</span></div>
          </div>
          <div class="zt-row">
            <div class="zt-field zt-grow"><span class="zt-lab">Pax :</span><span class="zt-write">${esc(paxText)}</span></div>
            <div class="zt-field zt-grow"><span class="zt-lab">Heure d'arrivee :</span><span class="zt-write"></span></div>
          </div>
          ${ztServicesRow}
          <div class="zt-row">
            <div class="zt-field zt-grow"><span class="zt-lab">Special request :</span><span class="zt-write"></span></div>
            <div class="zt-field zt-grow"><span class="zt-lab">Numero de vol :</span><span class="zt-write"></span></div>
          </div>
          <div class="zt-row zt-row-money">
            <div class="zt-field zt-third"><span class="zt-lab">Price :</span><span class="zt-write">${esc(priceHint)}</span></div>
            <div class="zt-field zt-third"><span class="zt-lab">Paid :</span><span class="zt-write"></span></div>
            <div class="zt-field zt-third"><span class="zt-lab">Rest :</span><span class="zt-write"></span></div>
          </div>
          <div class="zt-row">
            <div class="zt-field zt-full"><span class="zt-lab">Receiver :</span><span class="zt-write"></span></div>
          </div>
        </div>

        <div class="zt-footer">
          <div class="zt-footer-col">
            <div>Agence : +201062002850</div>
            <div>Hotel : +201271756017</div>
          </div>
          <div class="zt-footer-col zt-footer-right">
            <div>✉ Hurghadadreamtour.fr@gmail.com</div>
            <div>Hurghada Dream Tours</div>
          </div>
        </div>
      </div>`;
      }

      const itemDate = item.date
        ? new Date(item.date + "T12:00:00").toLocaleDateString("fr-FR", {
            weekday: "long",
            day: "2-digit",
            month: "long",
            year: "numeric",
          })
        : "—";

      const cells = getQuoteItemParticipantCells(item);
      const paxParts = [];
      if (cells.adults > 0) paxParts.push(`${cells.adults} adulte${cells.adults > 1 ? "s" : ""}`);
      if (cells.children > 0) paxParts.push(`${cells.children} enfant${cells.children > 1 ? "s" : ""}`);
      if (cells.babies > 0) paxParts.push(`${cells.babies} bébé${cells.babies > 1 ? "s" : ""}`);
      const divingBreakdown = getDivingTicketBreakdown(item);
      let paxText = paxParts.length > 0 ? paxParts.join(" · ") : "—";
      if (divingBreakdown) {
        const diversParts = [];
        const diverAdults = Math.max(0, Math.round(Number(item.adults) || 0));
        const diverChildren = Math.max(0, Math.round(Number(item.children) || 0));
        const diverBabies = Math.max(0, Math.round(Number(item.babies) || 0));
        if (diverAdults > 0) diversParts.push(`${diverAdults} adulte${diverAdults > 1 ? "s" : ""}`);
        if (diverChildren > 0)
          diversParts.push(`${diverChildren} enfant${diverChildren > 1 ? "s" : ""}`);
        if (diverBabies > 0) diversParts.push(`${diverBabies} bébé${diverBabies > 1 ? "s" : ""}`);
        const diversText =
          diversParts.length > 0
            ? diversParts.join(" · ")
            : `${divingBreakdown.divers} plongeur${divingBreakdown.divers > 1 ? "s" : ""}`;
        const visitorsText =
          divingBreakdown.visitors > 0
            ? ` · ${divingBreakdown.visitors} visiteur${divingBreakdown.visitors > 1 ? "s" : ""}`
            : "";
        paxText = `${diversText} (tarif normal)${visitorsText}`;
      }
      const paxTotal = (cells.adults || 0) + (cells.children || 0) + (cells.babies || 0);

      const pickupText = formatTicketPickupLabel(item);
      const pickup = pickupText ? esc(pickupText) : "";
      const tripLabel = formatTransferTripLabel(item);

      const isModification = item.ticketKind === "modification";
      const modificationAmount = Math.round(Number(item.restAmount) || Number(item.lineTotal) || 0);
      const priceText = esc(
        isModification
          ? currencyNoCents(modificationAmount, quote.currency || "EUR")
          : formatTicketPriceDisplay(item)
      );
      const extraLines = formatTicketExtraLines(item);
      const divingVisitorBlock = buildDivingVisitorTicketBlock(item);
      const extrasHTML =
        extraLines.length > 0
          ? `<div class="ticket-extras">${extraLines
              .map((line) => `<div class="ticket-extra-line">${esc(line)}</div>`)
              .join("")}</div>`
          : "";
      const enteredBy = String(item.ticketEnteredByName || quoteTicketsBy || "").trim();
      const settlement = getTicketSettlementDisplay(item);
      const curr = quote.currency || "EUR";
      const settlementRows = [
        `<div class="ticket-settle-row"><span class="ticket-settle-l">Déjà payé</span><span class="ticket-settle-v">${esc(
          currencyNoCents(settlement.amountPaid, curr)
        )}</span></div>`,
        `<div class="ticket-settle-row ticket-settle-row--rest"><span class="ticket-settle-l">Rest</span><span class="ticket-settle-v">${esc(
          currencyNoCents(settlement.restAmount, curr)
        )}</span></div>`,
      ];
      if (settlement.refundAmount > 0 || settlement.refundGross > 0) {
        settlementRows.push(
          `<div class="ticket-settle-row ticket-settle-row--refund"><span class="ticket-settle-l">À rembourser</span><span class="ticket-settle-v">${esc(
            currencyNoCents(settlement.refundAmount, curr)
          )}</span></div>`
        );
        const note = [settlement.refundLabel, settlement.refundReason].filter(Boolean).join(" · ");
        if (note) settlementRows.push(`<div class="ticket-settle-note">${esc(note)}</div>`);
      }

      const activityHtml = isModification
        ? `<div class="ticket-activity ticket-activity-mod">
            <div class="ticket-mod-kicker">Ticket modification</div>
            <div class="ticket-mod-old">Avant : ${esc(item.previousActivityName || "—")}</div>
            <div class="ticket-mod-new">Maintenant : ${esc(item.newActivityName || "—")}</div>
          </div>`
        : `<div class="ticket-activity">${esc(resolveTicketActivityName(item, activitiesById))}${formatTurtleFinSizesLabel(item) ? `<div class="ticket-visitor">${esc(formatTurtleFinSizesLabel(item))}</div>` : ""}${extrasHTML}</div>`;

      return `
      <div class="ticket${isModification ? " ticket-modification" : ""}">
        <div class="ticket-accent"></div>
        <div class="ticket-body">
          <div class="ticket-head">
            <div class="ticket-brand">
              <img src="${logoSrc}" alt="Hurghada Dream" class="ticket-logo" />
              <div class="ticket-brand-text">
                <span class="ticket-brand-name">HURGHADA DREAM</span>
                <span class="ticket-brand-sub">${isModification ? "Modification" : "Bon d'excursion"}</span>
              </div>
            </div>
            <div class="ticket-price">
              <span class="ticket-price-label">${isModification ? "Reste à payer" : "Prix"}</span>
              <span class="ticket-price-value">${priceText}</span>
            </div>
          </div>
          ${activityHtml}
          ${divingVisitorBlock}
          <div class="ticket-grid">
            <div class="tf"><span class="tf-l">👤 Nom</span><span class="tf-v">${clientName}</span></div>
            ${reservationCode ? `<div class="tf"><span class="tf-l">🔑 N° réservation</span><span class="tf-v">${reservationCode}</span></div>` : ""}
            <div class="tf"><span class="tf-l">📞 Téléphone</span><span class="tf-v">${clientPhone}</span></div>
            ${clientEmail ? `<div class="tf"><span class="tf-l">✉️ Email</span><span class="tf-v">${clientEmail}</span></div>` : ""}
            <div class="tf"><span class="tf-l">🏨 Hôtel</span><span class="tf-v">${clientHotel}</span></div>
            ${clientAirbnbMaps ? `<div class="tf"><span class="tf-l">📍 Maps</span><span class="tf-v"><a href="${clientAirbnbMaps}" target="_blank" rel="noopener noreferrer">${clientAirbnbMaps}</a></span></div>` : ""}
            <div class="tf"><span class="tf-l">🚪 Chambre</span><span class="tf-v">${clientRoom}</span></div>
            <div class="tf"><span class="tf-l">📅 Date</span><span class="tf-v">${esc(itemDate)}</span></div>
            ${tripLabel ? `<div class="tf"><span class="tf-l">🚗 Trajet</span><span class="tf-v">${esc(tripLabel)}</span></div>` : ""}
            <div class="tf"><span class="tf-l">⏰ Prise en charge</span><span class="tf-v">${pickup}</span></div>
            <div class="tf"><span class="tf-l">👥 Personnes</span><span class="tf-v">${esc(paxText)}${paxTotal > 0 ? ` (total ${paxTotal})` : ""}</span></div>
            ${item.ticketNumber ? `<div class="tf"><span class="tf-l">🎫 N° Ticket</span><span class="tf-v">${esc(item.ticketNumber)}</span></div>` : `<div class="tf"><span class="tf-l">🎫 N° Ticket</span><span class="tf-v">—</span></div>`}
            ${enteredBy ? `<div class="tf"><span class="tf-l">✍️ Tickets saisis par</span><span class="tf-v">${esc(enteredBy)}</span></div>` : ""}
          </div>
          <div class="ticket-balance ticket-balance--filled ticket-settle">${settlementRows.join("")}</div>
        </div>
      </div>`;
    })
    .join("");

  const ticketCount = sortedItems.length;
  const onlyModifications =
    sortedItems.length > 0 && sortedItems.every((item) => item.ticketKind === "modification");
  // Toujours la somme des tickets imprimés (prix espèces, sans +3 %).
  // Un ticket de modification seul affiche le reste à payer comme total.
  const totalPrice = sortedItems.reduce((sum, item) => {
    if (item.ticketKind === "modification") {
      return onlyModifications ? sum + Math.round(Number(item.restAmount) || 0) : sum;
    }
    return sum + ticketCashTotal(item);
  }, 0);
  const paymentLabel = formatTicketsPaymentMethodsLabel(quote);
  const paymentMethods = normalizeTicketsPaymentMethods(quote);
  const breakdown = getQuoteCollectionBreakdown(quote);
  const paidCash = Math.round(Number(quote?.paidCash) || 0);
  const restTotal = onlyModifications
    ? 0
    : Math.round(Number(quote?.paymentRestAmount) || 0) > 0
      ? Math.round(Number(quote.paymentRestAmount) || 0)
      : sortedItems.reduce((sum, item) => sum + Math.round(Number(item?.restAmount) || 0), 0);
  const isSingleTicket = ticketCount === 1;

  const cashPaidItem = (sortedItems || []).find((item) => Number(item?.cashPaidAmount) > 0);
  const cashPaidCurrency = String(
    cashPaidItem?.cashPaidCurrency || quote?.paidCashCurrency || ""
  ).toUpperCase();
  const cashAmount =
    Number(cashPaidItem?.cashPaidAmount) > 0
      ? Math.round(Number(cashPaidItem.cashPaidAmount))
      : paidCash > 0
        ? paidCash
        : breakdown?.cash > 0
          ? breakdown.cash
          : paymentMethods.cash && !paymentMethods.stripe
            ? totalPrice
            : 0;
  const cashCurrencyCode = cashPaidCurrency === "EGP" ? "EGP" : quote.currency || "EUR";

  const amountSummaryRows = [
    {
      label: "Total",
      value: currencyNoCents(totalPrice, quote.currency || "EUR"),
      tone: "total",
    },
  ];
  if (paymentMethods.cash && cashAmount > 0) {
    amountSummaryRows.push({
      label: "Cash",
      value: currencyNoCents(cashAmount, cashCurrencyCode),
      tone: "cash",
    });
  }
  if (paymentMethods.stripe) {
    amountSummaryRows.push({
      label: "Stripe",
      value: currencyNoCents(calculateCardPrice(totalPrice), quote.currency || "EUR"),
      tone: "stripe",
    });
  }
  if (restTotal > 0) {
    amountSummaryRows.push({
      label: "Reste à payer",
      value: currencyNoCents(restTotal, quote.currency),
      tone: "rest",
    });
  }

  const summaryHTML = `
    <div class="tickets-summary">
      <div class="tickets-summary-row">
        <span class="tickets-summary-label">Mode de paiement</span>
        <span class="tickets-summary-value">${esc(paymentLabel || "—")}</span>
      </div>
      ${
        isSingleTicket
          ? ""
          : `<div class="tickets-summary-row">
        <span class="tickets-summary-label">Nombre total de tickets</span>
        <span class="tickets-summary-value">${ticketCount}</span>
      </div>`
      }
      ${amountSummaryRows
        .map(
          (row, idx) => `
      <div class="tickets-summary-row tickets-summary-amount tickets-summary-${row.tone}${
        idx === amountSummaryRows.length - 1 ? " tickets-summary-total" : ""
      }">
        <span class="tickets-summary-label">${esc(row.label)}</span>
        <span class="tickets-summary-value">${esc(row.value)}</span>
      </div>`
        )
        .join("")}
    </div>
  `;

  return `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <base href="${baseHref}">
  <title>Tickets - ${clientName}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      color: #1e293b;
      background: #eef2ff;
      padding: 12px;
    }
    .tickets-wrap { max-width: 420px; margin: 0 auto; }
    .ticket {
      display: flex;
      background: #fff;
      border: 1.5px dashed #6366f1;
      border-radius: 10px;
      overflow: hidden;
      margin-bottom: 10px;
      box-shadow: 0 4px 12px rgba(30, 41, 59, 0.07);
      page-break-inside: avoid;
    }
    .ticket-accent {
      width: 6px;
      background: linear-gradient(180deg, #6366f1, #06b6d4);
      flex-shrink: 0;
    }
    .ticket-modification {
      background: #fffbeb;
      border-color: #d97706;
    }
    .ticket-modification .ticket-accent {
      background: linear-gradient(180deg, #d97706, #f59e0b);
    }
    .ticket-modification .ticket-brand-name,
    .ticket-modification .ticket-price-value,
    .ticket-mod-kicker { color: #b45309; }
    .ticket-mod-kicker {
      font-size: 9px;
      font-weight: 800;
      letter-spacing: 0.14em;
      text-transform: uppercase;
    }
    .ticket-mod-old {
      margin-top: 3px;
      font-size: 11px;
      font-weight: 700;
      text-transform: none;
      text-decoration: line-through;
      color: #92400e;
    }
    .ticket-mod-new {
      margin-top: 2px;
      font-size: 13px;
      font-weight: 800;
      text-transform: uppercase;
      color: #9a3412;
    }
    .ticket-body { flex: 1; padding: 10px 12px; }
    .ticket-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 6px;
      margin-bottom: 6px;
    }
    .ticket-brand { display: flex; align-items: center; gap: 8px; min-width: 0; }
    .ticket-logo {
      height: 42px;
      width: auto;
      max-width: 72px;
      object-fit: contain;
      flex-shrink: 0;
    }
    .ticket-brand-text { display: flex; flex-direction: column; min-width: 0; }
    .ticket-brand-name { font-size: 12px; font-weight: 800; color: #4338ca; letter-spacing: 0.3px; line-height: 1.15; }
    .ticket-brand-sub { font-size: 8px; text-transform: uppercase; letter-spacing: 1px; color: #64748b; }
    .ticket-price { text-align: right; display: flex; flex-direction: column; flex-shrink: 0; }
    .ticket-price-label { font-size: 8px; text-transform: uppercase; letter-spacing: 0.8px; color: #64748b; }
    .ticket-price-value { font-size: 13px; font-weight: 800; color: #0e7490; line-height: 1.15; max-width: 11rem; text-align: right; word-break: break-word; }
    .ticket-activity {
      font-size: 13px;
      font-weight: 800;
      color: #1e293b;
      text-transform: uppercase;
      margin-bottom: 6px;
      line-height: 1.2;
    }
    .ticket-visitor {
      margin-top: 2px;
      font-size: 10px;
      font-weight: 600;
      text-transform: none;
      color: #0e7490;
    }
    .ticket-diving-visitor {
      margin: 8px 0 10px;
      padding: 10px 12px;
      border-radius: 10px;
      border: 2px solid #0891b2;
      background: linear-gradient(135deg, #ecfeff 0%, #cffafe 55%, #a5f3fc 100%);
      box-shadow: 0 2px 8px rgba(8, 145, 178, 0.18);
    }
    .ticket-diving-visitor-head {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 8px;
    }
    .ticket-diving-visitor-icon { font-size: 18px; line-height: 1; }
    .ticket-diving-visitor-title {
      font-size: 11px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #0e7490;
    }
    .ticket-diving-visitor-stats {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }
    .ticket-diving-visitor-stats--3 {
      grid-template-columns: 1fr 1fr 1fr;
    }
    .ticket-diving-visitor-stat {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 2px;
      padding: 8px 6px;
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.85);
      border: 1px solid rgba(8, 145, 178, 0.25);
    }
    .ticket-diving-visitor-stat-price {
      background: #fff;
      border-color: #0891b2;
    }
    .ticket-diving-visitor-num {
      font-size: 22px;
      font-weight: 900;
      line-height: 1;
      color: #0f172a;
      letter-spacing: -0.02em;
    }
    .ticket-diving-visitor-stat-price .ticket-diving-visitor-num {
      color: #0e7490;
    }
    .ticket-diving-visitor-lab {
      font-size: 9px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      color: #64748b;
    }
    .ticket-diving-visitor-detail {
      margin-top: 8px;
      text-align: center;
      font-size: 11px;
      font-weight: 700;
      color: #155e75;
    }
    .ticket-extras { margin-top: 4px; text-transform: none; }
    .ticket-extra-line {
      font-size: 9px;
      font-weight: 600;
      color: #2563eb;
      line-height: 1.25;
    }
    .ticket-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 5px 10px;
    }
    .tf { display: flex; flex-direction: column; gap: 0; }
    .tf-l { font-size: 8px; text-transform: uppercase; letter-spacing: 0.6px; color: #64748b; font-weight: 600; }
    .tf-v { font-size: 11px; font-weight: 600; color: #0f172a; line-height: 1.25; word-break: break-word; }
    .ticket-balance {
      margin-top: 8px;
      padding-top: 6px;
      border-top: 1px dashed #cbd5e1;
    }
    .ticket-settle {
      display: grid;
      gap: 3px;
    }
    .ticket-settle-row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 8px;
    }
    .ticket-settle-l {
      font-size: 9px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.7px;
      color: #475569;
    }
    .ticket-settle-row--rest .ticket-settle-l,
    .ticket-settle-row--rest .ticket-settle-v {
      color: #b45309;
    }
    .ticket-settle-row--refund .ticket-settle-l,
    .ticket-settle-row--refund .ticket-settle-v {
      color: #be123c;
    }
    .ticket-settle-v {
      font-size: 12px;
      font-weight: 800;
      color: #0f172a;
      letter-spacing: 0.2px;
    }
    .ticket-settle-note {
      font-size: 8px;
      font-weight: 600;
      color: #64748b;
      line-height: 1.3;
    }
    .tickets-summary {
      margin-top: 6px;
      margin-bottom: 6px;
      background: #fff;
      border: 1.5px solid #4338ca;
      border-radius: 10px;
      padding: 10px 12px;
      box-shadow: 0 4px 12px rgba(30, 41, 59, 0.07);
      page-break-inside: avoid;
    }
    .tickets-summary-row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 10px;
      padding: 4px 0;
      border-bottom: 1px solid #e2e8f0;
    }
    .tickets-summary-row:last-child { border-bottom: none; }
    .tickets-summary-label {
      font-size: 9px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      color: #64748b;
    }
    .tickets-summary-value {
      font-size: 12px;
      font-weight: 800;
      color: #0f172a;
      text-align: right;
    }
    .tickets-summary-total .tickets-summary-value {
      font-size: 15px;
      color: #0e7490;
    }
    .tickets-summary-cash .tickets-summary-value {
      color: #047857;
    }
    .tickets-summary-stripe .tickets-summary-value {
      color: #4338ca;
    }
    .tickets-summary-rest .tickets-summary-value {
      color: #b45309;
    }
    .zt-receipt {
      background: #d7eef8;
      border: 1.5px solid #334155;
      border-radius: 6px;
      padding: 8px 10px;
      margin-bottom: 10px;
      color: #0f172a;
      font-family: Georgia, 'Times New Roman', Times, serif;
      page-break-inside: avoid;
      max-width: 420px;
    }
    .zt-head {
      display: grid;
      grid-template-columns: 64px 1fr auto;
      gap: 6px;
      align-items: start;
      margin-bottom: 8px;
    }
    .zt-logo { display: flex; align-items: center; justify-content: center; }
    .zt-logo-img {
      width: 58px;
      height: auto;
      max-height: 58px;
      object-fit: contain;
    }
    .zt-titles { text-align: center; }
    .zt-brand {
      font-size: 15px;
      font-weight: 800;
      text-decoration: underline;
      text-underline-offset: 2px;
      line-height: 1.1;
    }
    .zt-sub { margin-top: 1px; font-size: 10px; font-weight: 600; }
    .zt-receipt-title {
      margin-top: 3px;
      font-size: 11px;
      font-weight: 700;
      text-decoration: underline;
      text-underline-offset: 2px;
      line-height: 1.2;
    }
    .zt-meta { text-align: right; min-width: 110px; }
    .zt-no { font-size: 11px; font-weight: 700; margin-bottom: 4px; }
    .zt-no-value { color: #b91c1c; font-size: 13px; font-weight: 800; }
    .zt-date-line {
      font-size: 10px;
      font-weight: 600;
      display: inline-flex;
      align-items: flex-end;
      gap: 3px;
      justify-content: flex-end;
    }
    .zt-rows { display: flex; flex-direction: column; gap: 6px; }
    .zt-row { display: flex; gap: 10px; align-items: flex-end; }
    .zt-field { display: flex; align-items: flex-end; gap: 4px; min-width: 0; }
    .zt-grow { flex: 1; }
    .zt-full { flex: 1 1 100%; }
    .zt-third { flex: 1; }
    .zt-write-qty {
      font-weight: 800;
      color: #0f172a;
      min-width: 1.5rem;
      text-align: center;
    }
    .zt-row-services .zt-write {
      border-bottom-color: #334155;
    }
    .zt-lab {
      flex-shrink: 0;
      font-size: 10px;
      font-weight: 700;
      padding-bottom: 1px;
      white-space: nowrap;
    }
    .zt-write {
      flex: 1;
      min-width: 36px;
      min-height: 16px;
      border-bottom: 1.5px dotted #334155;
      font-family: 'Segoe UI', sans-serif;
      font-size: 10px;
      font-weight: 600;
      line-height: 1.2;
      padding: 0 1px 1px;
    }
    .zt-write-sm { display: inline-block; width: 22px; min-width: 22px; flex: 0 0 22px; }
    .zt-write-xs { display: inline-block; width: 18px; min-width: 18px; flex: 0 0 18px; }
    .zt-footer {
      margin-top: 8px;
      border: 1px solid #334155;
      border-radius: 6px;
      padding: 5px 8px;
      display: flex;
      justify-content: space-between;
      gap: 8px;
      font-family: 'Segoe UI', sans-serif;
      font-size: 8px;
      font-weight: 600;
      line-height: 1.35;
    }
    .zt-footer-right { text-align: right; }
    .print-btn {
      display: block;
      margin: 0 auto 12px;
      padding: 8px 16px;
      background: linear-gradient(135deg, #4338ca, #06b6d4);
      color: #fff;
      border: none;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
      box-shadow: 0 6px 14px rgba(67, 56, 202, 0.3);
    }
    @media print {
      body { background: #fff; padding: 0; }
      .print-btn { display: none; }
      .ticket { box-shadow: none; margin-bottom: 8px; }
      .tickets-summary { box-shadow: none; }
      .zt-receipt { box-shadow: none; -webkit-print-color-adjust: exact; print-color-adjust: exact; margin-bottom: 8px; }
      .ticket-logo, .zt-logo-img { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .ticket-diving-visitor { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div class="tickets-wrap">
    <button class="print-btn" onclick="window.print()">🖨️ Imprimer / Enregistrer en PDF</button>
    ${ticketsHTML || '<p style="text-align:center;color:#64748b;">Aucune activité dans ce devis.</p>'}
    ${ticketCount > 0 ? summaryHTML : ""}
  </div>
</body>
</html>
  `.trim();
}

function escapeReceiptText(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Reçu du jour : une ligne par ticket, puis le total sans 3 % et chaque mode de paiement.
 */
export function generateDayReceiptHTML(receipt, options = {}) {
  const esc = escapeReceiptText;
  const dateLabel = esc(options.dateLabel || receipt?.dateKey || "");
  const rows = Array.isArray(receipt?.rows) ? receipt.rows : [];
  const totals = receipt?.totals || {};
  const amountRows = [
    { label: "Total", value: totals.tariffLabel || "0 €", strong: true },
  ];
  if (totals.cashEur > 0) amountRows.push({ label: "Cash", value: totals.cashEurLabel });
  if (totals.cashEgp > 0) amountRows.push({ label: "Cash", value: totals.cashEgpLabel });
  if (totals.stripe > 0) amountRows.push({ label: "Stripe", value: totals.stripeLabel });
  if (totals.rest > 0) amountRows.push({ label: "Balance due", value: totals.restLabel });
  if (totals.refund > 0) amountRows.push({ label: "Refunds", value: totals.refundLabel });

  const body = rows.length
    ? rows
        .map(
          (row) => `<tr class="${row.cancellation ? "row-cancel" : row.modification ? "row-mod" : ""}">
        <td class="num">${esc(row.ticketNumber)}</td>
        <td>${esc(row.hotel)}${row.room ? `<div class="sub">Room ${esc(row.room)}</div>` : ""}</td>
        <td>${esc(row.activity)}${row.activityDate ? `<div class="sub">${esc(row.activityDate)}</div>` : ""}</td>
        <td>${esc(row.pax)}</td>
        <td class="money">${esc(row.tariffLabel)}</td>
        <td>${esc(row.paymentLabel)}</td>
        <td class="money">${esc(row.collectedLabel)}</td>
        <td class="money">${esc(row.restLabel)}</td>
        <td class="money${row.refund > 0 ? " refund" : ""}">${esc(row.refundLabel)}</td>
      </tr>`
        )
        .join("")
    : `<tr><td colspan="9" class="empty">No tickets validated today.</td></tr>`;

  const amounts = amountRows
    .map(
      (row) => `<div class="sum-row${row.strong ? " sum-strong" : ""}">
        <span>${esc(row.label)}</span>
        <span>${esc(row.value)}</span>
      </div>`
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Receipt ${dateLabel}</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 16px; color: #0f172a; font-family: "Segoe UI", Tahoma, sans-serif; background: #f8fafc; }
    .sheet { max-width: 1100px; margin: 0 auto; background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 18px; }
    h1 { margin: 0; font-size: 22px; letter-spacing: -0.03em; }
    .meta { margin-top: 4px; color: #475569; font-size: 13px; }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 12px; }
    th, td { border: 1px solid #cbd5e1; padding: 6px 7px; vertical-align: top; text-align: left; }
    th { background: #0f172a; color: #fff; font-size: 10px; letter-spacing: 0.04em; text-transform: uppercase; }
    td.money, th.money { text-align: right; white-space: nowrap; }
    td.num { font-weight: 700; white-space: nowrap; }
    td.refund { color: #be123c; font-weight: 700; }
    tr.row-cancel { background: #fff1f2; }
    tr.row-mod { background: #fffbeb; }
    .sub { color: #64748b; font-size: 11px; margin-top: 2px; }
    .empty { text-align: center; color: #64748b; padding: 18px; }
    .foot { margin-top: 18px; display: flex; justify-content: flex-end; }
    .sums { width: 280px; border-top: 2px solid #0f172a; }
    .sum-row { display: flex; justify-content: space-between; gap: 16px; padding: 7px 2px; border-bottom: 1px solid #e2e8f0; font-size: 14px; }
    .sum-strong { font-size: 16px; font-weight: 800; }
    .print-btn { margin: 0 0 12px; padding: 8px 14px; border: 0; border-radius: 8px; background: #0f172a; color: #fff; font-weight: 700; cursor: pointer; }
    @media print {
      body { background: #fff; padding: 0; }
      .sheet { border: 0; border-radius: 0; padding: 0; max-width: none; }
      .print-btn { display: none; }
      th { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
    @page { size: A4 landscape; margin: 12mm; }
  </style>
</head>
<body>
  <div class="sheet">
    <button class="print-btn" onclick="window.print()">Print / Save as PDF</button>
    <h1>Receipt</h1>
    <p class="meta">${dateLabel} · ${rows.length} ticket${rows.length > 1 ? "s" : ""}</p>
    <table>
      <thead>
        <tr>
          <th>Ticket no.</th>
          <th>Hotel</th>
          <th>Activity</th>
          <th>Guests</th>
          <th class="money">Price</th>
          <th>Payment</th>
          <th class="money">Collected</th>
          <th class="money">Balance</th>
          <th class="money">Refund</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>
    <div class="foot">
      <div class="sums">${amounts}</div>
    </div>
  </div>
</body>
</html>`;
}
