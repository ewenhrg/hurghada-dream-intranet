import { NEIGHBORHOODS } from "./constants";

export function uuid() {
  return "hd-" + Math.random().toString(36).slice(2) + "-" + Date.now().toString(36);
}

export function currency(n, curr = "EUR") {
  if (n === undefined || n === null) n = 0;
  const num = Number(n) || 0;
  try {
    return new Intl.NumberFormat("fr-FR", { style: "currency", currency: curr }).format(num);
  } catch {
    return `${num.toFixed(2)} ${curr}`;
  }
}

// Calculer le prix carte (prix espèces + 3% arrondi à l'euro supérieur)
export function calculateCardPrice(cashPrice) {
  const priceWithFees = cashPrice * 1.03;
  // Arrondir à l'euro supérieur
  return Math.ceil(priceWithFees);
}

// Formater le prix sans centimes
export function currencyNoCents(n, curr = "EUR") {
  if (n === undefined || n === null) n = 0;
  const num = Math.round(Number(n) || 0);
  try {
    return new Intl.NumberFormat("fr-FR", { style: "currency", currency: curr, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(num);
  } catch {
    return `${num} ${curr}`;
  }
}

export function emptyTransfers() {
  const obj = {};
  NEIGHBORHOODS.forEach((n) => {
    obj[n.key] = {
      morningEnabled: false,
      morningTime: "",
      afternoonEnabled: false,
      afternoonTime: "",
      eveningEnabled: false,
      eveningTime: "",
      surcharge: 0,
    };
  });
  return obj;
}

export function saveLS(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

export function loadLS(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

// Générer un template HTML professionnel pour le devis
export function generateQuoteHTML(quote) {
  const date = new Date(quote.createdAt).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric"
  });
  const itemsHTML = quote.items.map((item, idx) => {
    const itemDate = new Date(item.date + "T12:00:00").toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "long",
      year: "numeric"
    });
    return `
      <tr>
        <td>${idx + 1}</td>
        <td><strong>${item.activityName || "—"}</strong></td>
        <td>${itemDate}</td>
        <td class="text-center">${item.adults || 0}</td>
        <td class="text-center">${item.children || 0}</td>
        <td class="text-center">${item.babies || 0}</td>
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
  <title>Devis - ${quote.client?.name || quote.client?.phone || "Client"}</title>
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
      text-align: center;
      color: #1e40af;
      font-size: 28px;
      font-weight: bold;
      margin-top: 20px;
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
        <div class="quote-title">DEVIS</div>
      </div>
      
      <div class="quote-info">
        <div class="info-box">
          <h3>Informations Client</h3>
          <p><strong>Nom:</strong> ${quote.client?.name || "—"}</p>
          <p><strong>Téléphone:</strong> ${quote.client?.phone || "—"}</p>
          <p><strong>Hôtel:</strong> ${quote.client?.hotel || "—"}</p>
          <p><strong>Chambre:</strong> ${quote.client?.room || "—"}</p>
          <p><strong>Quartier:</strong> ${quote.client?.neighborhood ? quote.client.neighborhood.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase()) : "—"}</p>
        </div>
        
        <div class="info-box">
          <h3>Détails du Devis</h3>
          <p><strong>Date:</strong> ${date}</p>
          ${quote.createdByName ? `<p><strong>Créé par:</strong> ${quote.createdByName}</p>` : ""}
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
        <span>Total Espèces:</span>
        <span><strong>${currencyNoCents(quote.totalCash || Math.round(quote.total), quote.currency)}</strong></span>
      </div>
      <div class="total-row card">
        <span>Total Carte (avec frais 3%):</span>
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
  </div>
</body>
</html>
  `.trim();
}

