import { NEIGHBORHOODS } from "./constants";
import { isBuggyActivity, isMotoCrossActivity } from "./utils/activityHelpers";

// Options d'extra pour Speed Boat uniquement
const SPEED_BOAT_EXTRAS = [
  { id: "", label: "— Aucun extra —", priceAdult: 0, priceChild: 0 },
  { id: "hula_hula", label: "HULA HULA", priceAdult: 10, priceChild: 5 },
  { id: "orange_bay", label: "ORANGE BAY", priceAdult: 10, priceChild: 5 },
  { id: "eden_beach", label: "EDEN BEACH", priceAdult: 15, priceChild: 10 },
  { id: "eden_lunch", label: "EDEN + LUNCH", priceAdult: 30, priceChild: 15 },
  { id: "ozeria", label: "OZERIA", priceAdult: 25, priceChild: 15 },
  { id: "ozeria_lunch", label: "OZERIA + LUNCH", priceAdult: 45, priceChild: 25 },
];

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

// Nettoyer un numéro de téléphone : garder uniquement les chiffres
export function cleanPhoneNumber(phone) {
  if (!phone) return "";
  // Supprimer tous les caractères sauf les chiffres
  return phone.replace(/\D+/g, "");
}

// Sanitizer pour protéger contre XSS (échapper les caractères HTML)
export function sanitizeInput(input) {
  if (typeof input !== 'string') return input;
  const div = document.createElement('div');
  div.textContent = input;
  return div.innerHTML;
}

// Valider et nettoyer un email
export function sanitizeEmail(email) {
  if (!email || typeof email !== 'string') return '';
  // Retirer les espaces et convertir en minuscules
  const cleaned = email.trim().toLowerCase();
  // Validation basique
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(cleaned) ? cleaned : '';
}

// Valider et nettoyer un nom (enlever les caractères dangereux)
export function sanitizeName(name) {
  if (!name || typeof name !== 'string') return '';
  // Garder uniquement lettres, espaces, tirets, apostrophes et caractères accentués
  return name.trim().replace(/[^a-zA-ZÀ-ÿ\s'-]/g, '').slice(0, 100);
}

// Générer le lien de paiement Jotform avec les informations pré-remplies
// IMPORTANT: Vous devez adapter les noms de champs (q3_name, q4_email, etc.) selon votre formulaire Jotform
// Pour trouver les noms de vos champs dans Jotform:
// 1. Ouvrez votre formulaire dans Jotform
// 2. Cliquez sur "Settings" > "Form Options" > "Pre-fill"
// 3. Les noms de champs sont affichés (format: q[N]_[fieldName])
// 4. Adaptez les noms ci-dessous selon vos champs réels
export function generateJotformPaymentLink(quote, jotformBaseUrl) {
  if (!jotformBaseUrl || !quote) return "";
  
  try {
    const url = new URL(jotformBaseUrl);
    
    // Ajouter les paramètres pour pré-remplir le formulaire
    // ⚠️ ADAPTEZ CES NOMS DE CHAMPS selon votre formulaire Jotform réel
    
    // Informations client (exemples de noms de champs - à adapter)
    if (quote.client?.name) {
      url.searchParams.set("q3_name", quote.client.name); // Adaptez "q3_name" selon votre formulaire
    }
    if (quote.client?.email) {
      url.searchParams.set("q4_email", quote.client.email); // Adaptez "q4_email" selon votre formulaire
    }
    if (quote.client?.phone) {
      url.searchParams.set("q5_phone", quote.client.phone); // Adaptez "q5_phone" selon votre formulaire
    }
    if (quote.client?.hotel) {
      url.searchParams.set("q6_hotel", quote.client.hotel); // Adaptez "q6_hotel" selon votre formulaire
    }
    
    // Montant total (utiliser totalCard si disponible, sinon calculer)
    const totalCard = quote.totalCard || (quote.total ? Math.ceil(quote.total * 1.03) : 0);
    url.searchParams.set("q7_amount", totalCard.toString()); // Adaptez "q7_amount" selon votre formulaire
    
    // Informations supplémentaires (optionnel)
    if (quote.id) {
      url.searchParams.set("q8_quoteId", quote.id); // Adaptez "q8_quoteId" selon votre formulaire
    }
    if (quote.notes) {
      url.searchParams.set("q9_notes", quote.notes); // Adaptez "q9_notes" selon votre formulaire
    }
    
    return url.toString();
  } catch (error) {
    console.error("Erreur lors de la génération du lien Jotform:", error);
    return jotformBaseUrl; // Retourner l'URL de base si erreur
  }
}

// Copier du texte dans le presse-papiers
export async function copyToClipboard(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    } else {
      // Fallback pour les navigateurs plus anciens
      const textArea = document.createElement("textarea");
      textArea.value = text;
      textArea.style.position = "fixed";
      textArea.style.left = "-999999px";
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      return true;
    }
  } catch (error) {
    console.error("Erreur lors de la copie dans le presse-papiers:", error);
    return false;
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
  } catch (error) {
    // localStorage peut échouer (mode privé, quota, etc.)
    console.warn("saveLS: impossible d'écrire dans localStorage", error);
  }
}

export function loadLS(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

// Calculer le montant total du supplément transfert pour un item
export function calculateTransferSurcharge(item) {
  if (!item || !item.transferSurchargePerAdult || item.transferSurchargePerAdult === 0) {
    return 0;
  }
  
  const surchargePerAdult = Number(item.transferSurchargePerAdult || 0);
  
  // Pour Buggy : multiplier par le nombre total de buggys (simple + family)
  if (isBuggyActivity(item.activityName)) {
    const buggySimple = Number(item.buggySimple || 0);
    const buggyFamily = Number(item.buggyFamily || 0);
    const totalBuggys = buggySimple + buggyFamily;
    return surchargePerAdult * totalBuggys;
  }
  
  // Pour MotoCross : multiplier par le nombre total de motos (yamaha250 + ktm640 + ktm530)
  if (isMotoCrossActivity(item.activityName)) {
    const yamaha250 = Number(item.yamaha250 || 0);
    const ktm640 = Number(item.ktm640 || 0);
    const ktm530 = Number(item.ktm530 || 0);
    const totalMotos = yamaha250 + ktm640 + ktm530;
    return surchargePerAdult * totalMotos;
  }
  
  // Pour les autres activités : multiplier par le nombre d'adultes
  const adults = Number(item.adults || 0);
  return surchargePerAdult * adults;
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
    
    // Calculer le montant du supplément transfert
    const transferSurchargeAmount = calculateTransferSurcharge(item);
    
    // Vérifier si c'est Speed Boat et récupérer les extras
    const isSpeedBoat = item.activityName && item.activityName.toLowerCase().includes("speed boat");
    let extrasInfo = [];
    
    if (isSpeedBoat) {
      // Extra dauphin
      if (item.extraDolphin) {
        extrasInfo.push("🐬 Extra dauphin (+20€)");
      }
      
      // Extra Speed Boat (plusieurs extras possibles)
      if (item.speedBoatExtra) {
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
    if (transferSurchargeAmount > 0) {
      extrasInfo.push(`🚗 Transfert: ${currencyNoCents(transferSurchargeAmount, quote.currency)}`);
    }
    
    const extrasHTML = extrasInfo.length > 0 
      ? `<div style="margin-top: 5px; font-size: 11px; color: #2563eb; font-weight: 500;">${extrasInfo.join("<br>")}</div>`
      : "";
    
    return `
      <tr>
        <td>${idx + 1}</td>
        <td>
          <strong>${item.activityName || "—"}</strong>
          ${extrasHTML}
        </td>
        <td>${itemDate}</td>
        <td class="text-center">${item.pickupTime || "—"}</td>
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
          ${quote.client?.email ? `<p><strong>Email:</strong> ${quote.client.email}</p>` : ""}
          <p><strong>Hôtel:</strong> ${quote.client?.hotel || "—"}</p>
          <p><strong>Chambre:</strong> ${quote.client?.room || "—"}</p>
          <p><strong>Quartier:</strong> ${quote.client?.neighborhood ? quote.client.neighborhood.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase()) : "—"}</p>
          ${quote.client?.arrivalDate ? `<p><strong>Date d'arrivée:</strong> ${new Date(quote.client.arrivalDate + "T12:00:00").toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })}</p>` : ""}
          ${quote.client?.departureDate ? `<p><strong>Date de départ:</strong> ${new Date(quote.client.departureDate + "T12:00:00").toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })}</p>` : ""}
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
            <th class="text-center">Heure prise en charge</th>
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

    <div style="margin-top: 40px; padding-top: 20px; border-top: 2px solid #e5e7eb; text-align: center;">
      <p style="font-size: 13px; color: #6b7280; font-style: italic;">
        Ce devis est fourni à titre informatif. Les horaires sont approximatifs et seront confirmés la veille de votre départ.
      </p>
    </div>
    </div>
</body>
</html>
  `.trim();
}

// Exporter des devis en CSV (compatible Excel)
export function exportQuotesToCSV(quotes) {
  if (!quotes || quotes.length === 0) {
    return;
  }

  // En-têtes du CSV
  const headers = [
    "Date devis",
    "Nom client",
    "Téléphone",
    "Hôtel",
    "Chambre",
    "Quartier",
    "Activité",
    "Date activité",
    "Heure prise en charge",
    "Adultes",
    "Enfants",
    "Bébés",
    "Ticket",
    "Prix",
    "Total Espèces",
    "Total Carte",
    "Statut",
    "Créé par",
    "Notes"
  ];

  // Créer les lignes de données
  const rows = [];
  
  quotes.forEach(quote => {
    const quoteDate = new Date(quote.createdAt).toLocaleDateString("fr-FR");
    const statut = quote.items?.every(item => item.ticketNumber?.trim()) ? "Payé" : "En attente";
    
    quote.items?.forEach((item, idx) => {
      const line = [
        idx === 0 ? quoteDate : "", // Date du devis seulement sur la première ligne
        idx === 0 ? quote.client?.name || "" : "",
        idx === 0 ? quote.client?.phone || "" : "",
        idx === 0 ? quote.client?.hotel || "" : "",
        idx === 0 ? quote.client?.room || "" : "",
        idx === 0 ? (quote.client?.neighborhood ? quote.client.neighborhood.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase()) : "") : "",
        item.activityName || "",
        new Date(item.date + "T12:00:00").toLocaleDateString("fr-FR"),
        item.pickupTime || "",
        item.adults || 0,
        item.children || 0,
        item.babies || 0,
        item.ticketNumber || "",
        currencyNoCents(Math.round(item.lineTotal), quote.currency),
        idx === 0 ? currencyNoCents(quote.totalCash || Math.round(quote.total), quote.currency) : "",
        idx === 0 ? currencyNoCents(quote.totalCard || calculateCardPrice(quote.total), quote.currency) : "",
        idx === 0 ? statut : "",
        idx === 0 ? quote.createdByName || "" : "",
        idx === 0 ? quote.notes || "" : ""
      ];
      rows.push(line);
    });
  });

  // Convertir en CSV
  const csvContent = [
    headers.join(","),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(","))
  ].join("\n");

  // Créer le fichier et le télécharger
  const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8;" }); // BOM UTF-8 pour Excel
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  
  link.setAttribute("href", url);
  link.setAttribute("download", `Devis_Hurghada_${new Date().toISOString().slice(0, 10)}.csv`);
  link.style.visibility = "hidden";
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  URL.revokeObjectURL(url);
}

// Exporter les tickets en CSV (compatible Excel)
export function exportTicketsToCSV(ticketRows) {
  if (!ticketRows || ticketRows.length === 0) {
    return;
  }

  // En-têtes du CSV (même structure que le tableau TicketPage)
  const headers = [
    "Ticket",
    "Date",
    "Prénom + Téléphone",
    "Hôtel",
    "Chambre",
    "Adultes",
    "Enfants",
    "Bébés",
    "Activité",
    "Heure prise en charge",
    "Commentaire",
    "Prix activité",
    "Prix transfert",
    "Méthode de paiement",
    "Vendeur"
  ];

  // Créer les lignes de données
  const rows = ticketRows.map(row => [
    row.ticket || "",
    row.date ? new Date(row.date + "T12:00:00").toLocaleDateString("fr-FR") : "",
    `${row.clientName || ""}${row.clientName && row.clientPhone ? " " : ""}${row.clientPhone ? `+${row.clientPhone}` : ""}`,
    row.hotel || "",
    row.room || "",
    row.adults || 0,
    row.children || 0,
    row.babies || 0,
    row.activityName || "",
    row.pickupTime || "",
    row.comment || "",
    row.activityPrice ? Math.round(row.activityPrice) + "€" : "",
    row.transferTotal ? Math.round(row.transferTotal) + "€" : "",
    row.paymentMethod || "",
    row.sellerName || ""
  ]);

  // Convertir en CSV
  const csvContent = [
    headers.join(","),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(","))
  ].join("\n");

  // Créer le fichier et le télécharger
  const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8;" }); // BOM UTF-8 pour Excel
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  
  link.setAttribute("href", url);
  link.setAttribute("download", `Tickets_Hurghada_${new Date().toISOString().slice(0, 10)}.csv`);
  link.style.visibility = "hidden";
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  URL.revokeObjectURL(url);
}

