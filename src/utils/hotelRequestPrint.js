import { boardLabelsFromViewModel } from "../constants/hotelRequestBoardOptions";
import { formatHotelStayDate } from "./hotelRequestDates";
import { formatQuoteMoney } from "./hotelQuoteCalc";

function normalizeZeroTracasForPrint(raw) {
  const z = raw && typeof raw === "object" ? raw : null;
  if (!z || z.enabled !== true) return null;
  const visaCount = Number(z.visaCount || 0);
  const simCount = Number(z.simCount || 0);
  const manualTotal =
    z.manualTotal != null && Number.isFinite(Number(z.manualTotal))
      ? Math.round(Number(z.manualTotal) * 100) / 100
      : null;
  const hasQty =
    (Number.isFinite(visaCount) && visaCount > 0) ||
    (Number.isFinite(simCount) && simCount > 0);
  if (!hasQty && manualTotal == null) return null;
  return {
    visaCount: Number.isFinite(visaCount) && visaCount > 0 ? Math.floor(visaCount) : 0,
    simCount: Number.isFinite(simCount) && simCount > 0 ? Math.floor(simCount) : 0,
    manualTotal,
  };
}

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

  const isConfirmation =
    request.documentKind === "confirmation" ||
    request.isConfirmation === true ||
    Boolean(
      request.responsePayload?.confirmedHotel &&
        typeof request.responsePayload.confirmedHotel === "object" &&
        String(request.responsePayload.confirmedHotel.hotelName || "").trim()
    );
  const docTitle = isConfirmation ? "CONFIRMATION" : "DEVIS";
  const docBadgeLabel = isConfirmation ? "Confirmation hôtel" : "Devis hôtel";
  const pageTitle = isConfirmation
    ? `Confirmation hôtel — ${fullName}`
    : `Devis hôtel — ${fullName}`;
  const footerNote = isConfirmation
    ? "Confirmation de séjour. Merci de votre confiance."
    : "Devis indicatif, sous réserve de disponibilité et de confirmation définitive.";

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
  const flightsRaw =
    request.flights ||
    request.responsePayload?.flights ||
    null;
  const flights =
    flightsRaw && typeof flightsRaw === "object"
      ? {
          arrivalFlightNumber: String(flightsRaw.arrivalFlightNumber || "").trim(),
          arrivalTime: String(flightsRaw.arrivalTime || "").trim(),
          departureFlightNumber: String(flightsRaw.departureFlightNumber || "").trim(),
          departureTime: String(flightsRaw.departureTime || "").trim(),
        }
      : null;
  const hasFlights =
    flights &&
    (flights.arrivalFlightNumber ||
      flights.arrivalTime ||
      flights.departureFlightNumber ||
      flights.departureTime);

  const zeroTracasPrint = normalizeZeroTracasForPrint(
    request.zeroTracas || request.responsePayload?.zeroTracas
  );
  const zeroTracasTotal = zeroTracasPrint?.manualTotal != null ? zeroTracasPrint.manualTotal : 0;
  const zeroTracasDetailParts = [];
  if (zeroTracasPrint?.visaCount > 0) {
    zeroTracasDetailParts.push(
      `${zeroTracasPrint.visaCount} visa${zeroTracasPrint.visaCount > 1 ? "s" : ""}`
    );
  }
  if (zeroTracasPrint?.simCount > 0) {
    zeroTracasDetailParts.push(
      `${zeroTracasPrint.simCount} SIM${zeroTracasPrint.simCount > 1 ? "s" : ""}`
    );
  }
  const zeroTracasDetailLabel = zeroTracasDetailParts.join(" · ");
  const zeroTracasHtml = zeroTracasPrint
    ? `<section class="section">
        <div class="section-head">
          <h2 class="section-title">Zero Tracas</h2>
          <span class="section-aside">${escapeHtml(
            zeroTracasPrint.manualTotal != null
              ? formatQuoteMoney(zeroTracasPrint.manualTotal, "EUR")
              : "—"
          )}</span>
        </div>
        <div class="zt-detail">
          ${
            zeroTracasPrint.visaCount > 0
              ? `<div class="zt-detail-row">
            <span class="zt-detail-label">Nombre de visas</span>
            <span class="zt-detail-value">${escapeHtml(String(zeroTracasPrint.visaCount))}</span>
          </div>`
              : ""
          }
          ${
            zeroTracasPrint.simCount > 0
              ? `<div class="zt-detail-row">
            <span class="zt-detail-label">Nombre de SIM</span>
            <span class="zt-detail-value">${escapeHtml(String(zeroTracasPrint.simCount))}</span>
          </div>`
              : ""
          }
          <div class="zt-detail-row zt-detail-total">
            <span class="zt-detail-label">Montant Zero Tracas</span>
            <span class="zt-detail-value">${escapeHtml(
              zeroTracasPrint.manualTotal != null
                ? formatQuoteMoney(zeroTracasPrint.manualTotal, "EUR")
                : "—"
            )}</span>
          </div>
        </div>
      </section>`
    : "";

  const hotelQuoteRows = Array.isArray(quoteHotels)
    ? quoteHotels.filter((h) => h?.hotelName && h?.quote?.total != null && Number.isFinite(Number(h.quote.total)))
    : [];
  const hotelTotal = hotelQuoteRows.reduce(
    (sum, h) => sum + Number(h.quote.total),
    0
  );
  const hotelCurrency =
    hotelQuoteRows.find((h) => h.quote?.currency)?.quote?.currency || "EUR";
  const showGrandTotal =
    isConfirmation && (hotelQuoteRows.length > 0 || zeroTracasTotal > 0);
  const grandTotal = Math.round((hotelTotal + zeroTracasTotal) * 100) / 100;

  const paymentInfo = (() => {
    if (!isConfirmation || !(grandTotal > 0)) return null;
    const arrivalIso = String(request.arrivalDate || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(arrivalIso)) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [ay, am, ad] = arrivalIso.split("-").map(Number);
    const arrival = new Date(ay, am - 1, ad);
    if (Number.isNaN(arrival.getTime())) return null;
    const msPerDay = 24 * 60 * 60 * 1000;
    const daysUntilArrival = Math.round((arrival.getTime() - today.getTime()) / msPerDay);
    if (daysUntilArrival < 0) return null;

    const formatDue = (date) =>
      date.toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });

    if (daysUntilArrival > 7) {
      const due = new Date(today);
      due.setDate(due.getDate() + 7);
      return {
        mode: "deposit",
        title: "Acompte",
        dueLabel: formatDue(due),
        amount: Math.round(grandTotal * 0.3 * 100) / 100,
      };
    }

    const due = new Date(today);
    due.setDate(due.getDate() + 1);
    return {
      mode: "full",
      title: "Règlement",
      dueLabel: formatDue(due),
      amount: grandTotal,
    };
  })();

  const depositBlockHtml = paymentInfo
    ? paymentInfo.mode === "deposit"
      ? `<div class="deposit-block">
          <p class="deposit-title">${escapeHtml(paymentInfo.title)}</p>
          <p class="deposit-text">
            Arrivée dans plus d’une semaine : vous disposez de <strong>7 jours</strong> pour régler un
            acompte de <strong>30&nbsp;%</strong>, soit
            <strong>${escapeHtml(formatQuoteMoney(paymentInfo.amount, hotelCurrency))}</strong>.
          </p>
          <p class="deposit-deadline">
            Date butoir de l’acompte :
            <strong>${escapeHtml(paymentInfo.dueLabel)}</strong>
          </p>
        </div>`
      : `<div class="deposit-block">
          <p class="deposit-title">${escapeHtml(paymentInfo.title)}</p>
          <p class="deposit-text">
            Arrivée dans moins d’une semaine : vous disposez de <strong>24&nbsp;h</strong> pour régler
            la somme totale, soit
            <strong>${escapeHtml(formatQuoteMoney(paymentInfo.amount, hotelCurrency))}</strong>.
          </p>
          <p class="deposit-deadline">
            Date butoir du règlement :
            <strong>${escapeHtml(paymentInfo.dueLabel)}</strong>
          </p>
        </div>`
    : "";

  const totalBlockHtml = showGrandTotal
    ? `<section class="section total-section">
        <div class="total-block">
          <div class="total-lines">
            ${
              hotelQuoteRows.length > 0
                ? `<div class="total-line">
              <span>Hôtel${hotelQuoteRows.length > 1 ? "s" : ""}</span>
              <strong>${escapeHtml(formatQuoteMoney(hotelTotal, hotelCurrency))}</strong>
            </div>`
                : ""
            }
            ${
              zeroTracasTotal > 0
                ? `<div class="total-line">
              <span>Zero Tracas${
                zeroTracasDetailLabel
                  ? ` <span class="total-line-sub">(${escapeHtml(zeroTracasDetailLabel)})</span>`
                  : ""
              }</span>
              <strong>${escapeHtml(formatQuoteMoney(zeroTracasTotal, "EUR"))}</strong>
            </div>`
                : ""
            }
          </div>
          <div class="total-grand">
            <span class="total-grand-label">Montant total</span>
            <span class="total-grand-value">${escapeHtml(
              formatQuoteMoney(grandTotal, hotelCurrency)
            )}</span>
          </div>
          ${depositBlockHtml}
        </div>
      </section>`
    : "";

  const bankDetailsHtml = isConfirmation
    ? `<section class="section">
        <div class="section-head">
          <h2 class="section-title">Coordonnées bancaires</h2>
          <span class="section-aside">EUR · Hdreamco Ltd</span>
        </div>
        <div class="bank-box">
          <p class="bank-intro">Coordonnées bancaires en EUR de Hdreamco Ltd :</p>
          <div class="bank-rows">
            <div class="bank-row">
              <span class="bank-label">Propriétaire du compte</span>
              <span class="bank-value">Hdreamco Ltd</span>
            </div>
            <div class="bank-row">
              <span class="bank-label">BIC</span>
              <span class="bank-value bank-mono">TRWIBEB1XXX</span>
            </div>
            <div class="bank-row">
              <span class="bank-label">IBAN</span>
              <span class="bank-value bank-mono">BE80 9676 1729 9777</span>
            </div>
            <div class="bank-row">
              <span class="bank-label">Banque</span>
              <span class="bank-value">Wise, Rue du Trône 100, 3rd floor, Brussels, 1050, Belgium</span>
            </div>
          </div>
        </div>
      </section>`
    : "";

  const staySectionHtml = `<section class="section">
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
      </section>`;

  const flightsSectionHtml = hasFlights
    ? `<section class="section">
        <div class="section-head">
          <h2 class="section-title">Vols</h2>
        </div>
        <div class="info-grid">
          <div class="info-cell">
            <span class="info-label">Vol arrivée</span>
            <div class="info-value">${escapeHtml(flights.arrivalFlightNumber || "—")}</div>
          </div>
          <div class="info-cell">
            <span class="info-label">Heure d’arrivée</span>
            <div class="info-value">${escapeHtml(formatFlightTime(flights.arrivalTime) || "—")}</div>
          </div>
          <div class="info-cell">
            <span class="info-label">Vol départ</span>
            <div class="info-value">${escapeHtml(flights.departureFlightNumber || "—")}</div>
          </div>
          <div class="info-cell">
            <span class="info-label">Heure de départ</span>
            <div class="info-value">${escapeHtml(formatFlightTime(flights.departureTime) || "—")}</div>
          </div>
        </div>
      </section>`
    : "";

  const clientSectionHtml = `<section class="section">
        <div class="section-head">
          <h2 class="section-title">${isConfirmation ? "Informations client" : "Coordonnées & voyageurs"}</h2>
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
          ${
            isConfirmation
              ? `<div class="info-cell">
            <span class="info-label">Arrivée</span>
            <div class="info-value">${escapeHtml(checkIn)}</div>
          </div>
          <div class="info-cell">
            <span class="info-label">Départ</span>
            <div class="info-value">${escapeHtml(checkOut)}</div>
          </div>`
              : ""
          }
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
      </section>`;

  const hotelChoicesSectionHtml = `<section class="section">
        <div class="section-head">
          <h2 class="section-title">Hôtels souhaités</h2>
        </div>
        ${hotelChoicesHtml}
      </section>`;

  const hotelQuoteSectionHtml = buildQuoteCardsHTML(quoteHotels, {
    checkIn,
    checkOut,
    boardLabel,
    docTitle,
    isConfirmation,
  });

  const notesSectionHtml = `<section class="section">
        <div class="section-head">
          <h2 class="section-title">Notes client</h2>
        </div>
        <div class="notes-box">${escapeHtml(request.notes?.trim() ? request.notes : "Aucune note.")}</div>
      </section>`;

  const agentNotesText = String(
    request.agentNotes || request.responsePayload?.agentNotes || ""
  ).trim();
  const agentNotesSectionHtml = agentNotesText
    ? `<section class="section">
        <div class="section-head">
          <h2 class="section-title">Note</h2>
        </div>
        <div class="notes-box">${escapeHtml(agentNotesText)}</div>
      </section>`
    : "";

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(pageTitle)}</title>
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

    /* Montant total */
    .total-section { margin-top: 8px; }
    .total-block {
      border-radius: 16px;
      border: 1px solid var(--line-strong);
      background: linear-gradient(165deg, #f8fafc 0%, #eef6f8 100%);
      padding: 18px 20px;
    }
    .total-lines { display: grid; gap: 8px; margin-bottom: 14px; }
    .total-line {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 12px;
      font-size: 13px;
      font-weight: 500;
      color: var(--ink-soft);
    }
    .total-line strong {
      font-weight: 700;
      color: var(--ink);
      font-variant-numeric: tabular-nums;
    }
    .total-line-sub {
      font-weight: 500;
      color: var(--muted);
    }
    .zt-detail {
      border: 1px solid var(--line);
      border-radius: 14px;
      background: var(--wash);
      overflow: hidden;
    }
    .zt-detail-row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 12px;
      padding: 12px 16px;
      border-bottom: 1px solid var(--line);
      font-size: 13px;
    }
    .zt-detail-row:last-child { border-bottom: none; }
    .zt-detail-label {
      font-weight: 600;
      color: var(--ink-soft);
    }
    .zt-detail-value {
      font-weight: 700;
      color: var(--ink);
      font-variant-numeric: tabular-nums;
    }
    .zt-detail-total {
      background: #fff;
    }
    .zt-detail-total .zt-detail-label,
    .zt-detail-total .zt-detail-value {
      font-size: 14px;
      color: var(--ink);
    }

    .total-grand {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 12px;
      padding-top: 14px;
      border-top: 1px solid var(--line-strong);
    }
    .total-grand-label {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--muted);
    }
    .total-grand-value {
      font-family: "Cormorant Garamond", Georgia, serif;
      font-size: 32px;
      font-weight: 700;
      line-height: 1;
      color: var(--ink);
      font-variant-numeric: tabular-nums;
    }
    .deposit-block {
      margin-top: 16px;
      padding-top: 14px;
      border-top: 1px dashed var(--line-strong);
    }
    .deposit-title {
      margin: 0 0 6px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--accent);
    }
    .deposit-text {
      margin: 0;
      font-size: 13px;
      font-weight: 500;
      line-height: 1.5;
      color: var(--ink-soft);
    }
    .deposit-text strong { color: var(--ink); font-weight: 700; }
    .deposit-deadline {
      margin: 10px 0 0;
      font-size: 13px;
      font-weight: 600;
      color: var(--ink);
    }
    .deposit-deadline strong {
      font-weight: 800;
      color: var(--accent);
    }

    .bank-box {
      border: 1px solid var(--line);
      border-radius: 14px;
      background: var(--wash);
      padding: 16px 18px;
    }
    .bank-intro {
      margin: 0 0 12px;
      font-size: 13px;
      font-weight: 600;
      color: var(--ink-soft);
    }
    .bank-rows { display: grid; gap: 10px; }
    .bank-row {
      display: grid;
      grid-template-columns: minmax(120px, 160px) 1fr;
      gap: 10px 14px;
      align-items: start;
    }
    .bank-label {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--muted);
      padding-top: 2px;
    }
    .bank-value {
      font-size: 13px;
      font-weight: 600;
      color: var(--ink);
      line-height: 1.45;
    }
    .bank-mono {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 12.5px;
      letter-spacing: 0.02em;
      font-weight: 700;
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
      .bank-row { grid-template-columns: 1fr; gap: 2px; }
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
          <span class="doc-badge-label">${escapeHtml(docBadgeLabel)}</span>
          <div class="doc-ref">
            <strong>Réf. ${escapeHtml(shortRef)}</strong>
            Émis le ${escapeHtml(issuedLabel)}
          </div>
        </div>
      </div>
      <h1 class="hero-title">${escapeHtml(docTitle)}</h1>
      <p class="hero-sub">Préparé pour ${escapeHtml(fullName)} · Demande du ${escapeHtml(createdLabel)}</p>
    </header>

    <div class="body">
      ${
        isConfirmation
          ? `${clientSectionHtml}
      ${flightsSectionHtml}
      ${hotelQuoteSectionHtml}
      ${zeroTracasHtml}
      ${notesSectionHtml}
      ${agentNotesSectionHtml}
      ${totalBlockHtml}
      ${bankDetailsHtml}`
          : `${staySectionHtml}
      ${flightsSectionHtml}
      ${zeroTracasHtml}
      ${clientSectionHtml}
      ${hotelChoicesSectionHtml}
      ${hotelQuoteSectionHtml}
      ${notesSectionHtml}
      ${agentNotesSectionHtml}
      ${totalBlockHtml}`
      }
    </div>

    <footer class="footer">
      <div>
        <div class="footer-brand">Hurghada Dream</div>
        <p class="footer-note">${escapeHtml(footerNote)}</p>
      </div>
      <div class="footer-stamp">Mer Rouge · Égypte</div>
    </footer>
  </div>
</body>
</html>`;
}

function buildQuoteCardsHTML(quoteHotels, { checkIn, checkOut, boardLabel, docTitle = "DEVIS", isConfirmation = false }) {
  const rows = Array.isArray(quoteHotels) ? quoteHotels.filter((h) => h?.hotelName) : [];
  if (!rows.length) {
    return `<section class="section">
      <div class="section-head"><h2 class="section-title">${escapeHtml(docTitle)}</h2></div>
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

      const optionLabel = isConfirmation ? "Hôtel confirmé" : `Option ${index + 1}`;

      return `<article class="quote-card">
        <div class="quote-card-accent" aria-hidden="true"></div>
        <div class="quote-card-main">
          <div>
            <p class="section-aside" style="margin:0 0 4px;letter-spacing:0.14em;text-transform:uppercase;font-size:10px;font-weight:700;">${escapeHtml(optionLabel)}</p>
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
      <h2 class="section-title">${escapeHtml(docTitle)}</h2>
      <span class="section-aside">${
        isConfirmation
          ? "1 hôtel"
          : `${rows.length} option${rows.length > 1 ? "s" : ""}`
      }</span>
    </div>
    <div class="quote-list">${cards}</div>
  </section>`;
}

function formatFlightTime(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const m = raw.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return raw;
  return `${m[1].padStart(2, "0")}:${m[2]}`;
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
