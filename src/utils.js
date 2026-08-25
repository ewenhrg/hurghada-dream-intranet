// Les gabarits d'impression (generateQuoteHTML / generateTicketsHTML) vivent
// désormais dans ./utils/printTemplates.js — voir l'en-tête de ce fichier.
// Les imports qu'ils étaient seuls à utiliser sont partis avec eux : ce module
// est chargé au démarrage, il doit rester léger.
import { NEIGHBORHOODS, LS_KEYS } from "./constants";
import { logger } from "./utils/logger";
import { calculateTransferSurchargeFromItem } from "./utils/transferPricing.js";

// Options d'extra pour Speed Boat uniquement (gardé pour compatibilité)
const SPEED_BOAT_EXTRAS_LOCAL = [
  { id: "", label: "— Aucun extra —", priceAdult: 0, priceChild: 0 },
  { id: "hula_hula", label: "HULA HULA", priceAdult: 15, priceChild: 10 },
  { id: "orange_bay", label: "ORANGE BAY", priceAdult: 10, priceChild: 5 },
  { id: "eden_beach", label: "EDEN BEACH", priceAdult: 10, priceChild: 5 },
  { id: "eden_lunch", label: "EDEN + LUNCH", priceAdult: 30, priceChild: 15 },
  { id: "ozeria", label: "OZERIA", priceAdult: 25, priceChild: 15 },
  { id: "ozeria_lunch", label: "OZERIA + LUNCH", priceAdult: 45, priceChild: 25 },
];

/** Normalise les lignes d'activité lues depuis Supabase (camelCase + compat snake_case). */
export function normalizeQuoteItemsFromDb(items) {
  let list = items;
  if (typeof list === "string") {
    try {
      list = JSON.parse(list);
    } catch {
      return [];
    }
  }
  // Anciennes écritures JSON.stringify dans une colonne JSONB → string encore une fois
  if (typeof list === "string") {
    try {
      list = JSON.parse(list);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(list)) return [];
  return list.map((item) => ({
    ...item,
    activityId: item.activityId ?? item.activity_id ?? "",
    activityName: item.activityName ?? item.activity_name ?? "",
    activityNameEn: String(item.activityNameEn ?? item.activity_name_en ?? "").trim(),
    ticketNumber: String(item.ticketNumber ?? item.ticket_number ?? "").trim(),
    ticketEnteredByName: String(
      item.ticketEnteredByName ?? item.ticket_entered_by_name ?? ""
    ).trim(),
    ticketsEnteredAt: String(
      item.ticketsEnteredAt ?? item.tickets_entered_at ?? ""
    ).trim(),
    paymentMethod: item.paymentMethod ?? item.payment_method ?? "",
    pickupTime: item.pickupTime ?? item.pickup_time ?? "",
    extraLabel: item.extraLabel ?? item.extra_label ?? "",
    extraAmount: item.extraAmount ?? item.extra_amount ?? 0,
    extraDolphin: item.extraDolphin ?? item.extra_dolphin ?? false,
    divingVisitor: Boolean(item.divingVisitor ?? item.diving_visitor),
    divingVisitorCount: Number(item.divingVisitorCount ?? item.diving_visitor_count ?? 0) || 0,
    finSizes: Array.isArray(item.finSizes)
      ? item.finSizes.map((s) => String(s ?? "").trim())
      : Array.isArray(item.fin_sizes)
        ? item.fin_sizes.map((s) => String(s ?? "").trim())
        : [],
    speedBoatExtra: item.speedBoatExtra ?? item.speed_boat_extra ?? [],
    lineTotal: item.lineTotal ?? item.line_total ?? 0,
    zeroTracasTransfertVisaSim:
      item.zeroTracasTransfertVisaSim ?? item.zero_tracas_transfert_visa_sim ?? 0,
    zeroTracasTransfertVisa:
      item.zeroTracasTransfertVisa ?? item.zero_tracas_transfert_visa ?? 0,
    zeroTracasTransfertSim:
      item.zeroTracasTransfertSim ?? item.zero_tracas_transfert_sim ?? 0,
    zeroTracasTransfert3Personnes:
      item.zeroTracasTransfert3Personnes ?? item.zero_tracas_transfert_3_personnes ?? 0,
    zeroTracasTransfertPlus3Personnes:
      item.zeroTracasTransfertPlus3Personnes ??
      item.zero_tracas_transfert_plus_3_personnes ??
      0,
    zeroTracasVisaSim: item.zeroTracasVisaSim ?? item.zero_tracas_visa_sim ?? 0,
    zeroTracasVisaSeul: item.zeroTracasVisaSeul ?? item.zero_tracas_visa_seul ?? 0,
  }));
}

/** Devis payé = au moins 1 activité et chaque ligne a un n° de ticket. */
export function isQuoteFullyPaid(quote) {
  const items = Array.isArray(quote?.items) ? quote.items : [];
  if (items.length === 0) return false;
  return items.every((item) => String(item?.ticketNumber || "").trim() !== "");
}

export function quoteHasAnyTicket(quote) {
  const items = Array.isArray(quote?.items) ? quote.items : [];
  return items.some((item) => String(item?.ticketNumber || "").trim() !== "");
}

/** Nom affiché sur les tickets : anglais si renseigné, sinon français. */
export function resolveTicketActivityName(item, activitiesById = null) {
  const fromItem = String(item?.activityNameEn || "").trim();
  if (fromItem) return fromItem;
  const rawId = item?.activityId ?? item?.activity_id;
  if (rawId != null && activitiesById) {
    const act =
      activitiesById.get(String(rawId)) ||
      activitiesById.get(rawId) ||
      null;
    const fromAct = String(act?.nameEn || "").trim();
    if (fromAct) return fromAct;
  }
  return String(item?.activityName || "").trim() || "—";
}

export function buildActivitiesByIdMap(activities = []) {
  const map = new Map();
  (activities || []).forEach((a) => {
    if (!a) return;
    if (a.id != null) map.set(String(a.id), a);
    if (a.supabase_id != null) map.set(String(a.supabase_id), a);
  });
  return map;
}

/** Modes de paiement tickets (Cash / Stripe) — les deux peuvent être cochés.
 * Priorité aux paymentMethod des lignes (plus fiables après édition / sync).
 */
export function normalizeTicketsPaymentMethods(quote) {
  const items = Array.isArray(quote?.items) ? quote.items : [];
  const anyItemMethod = items.some((it) => String(it?.paymentMethod || "").trim() !== "");
  if (anyItemMethod) {
    let cash = false;
    let stripe = false;
    items.forEach((it) => {
      const m = String(it?.paymentMethod || "").toLowerCase();
      if (m.includes("cash") || m.includes("espece") || m.includes("espèce")) cash = true;
      if (m.includes("stripe") || m.includes("card") || m.includes("carte")) stripe = true;
    });
    return { cash, stripe };
  }
  if (quote?.ticketsPaymentCash === true || quote?.ticketsPaymentStripe === true) {
    return {
      cash: quote.ticketsPaymentCash === true,
      stripe: quote.ticketsPaymentStripe === true,
    };
  }
  return { cash: false, stripe: false };
}

export function formatTicketsPaymentMethodsLabel(quote) {
  const { cash, stripe } = normalizeTicketsPaymentMethods(quote);
  const parts = [];
  if (cash) parts.push("Cash");
  if (stripe) parts.push("Stripe");
  return parts.join(" + ");
}

export function uuid() {
  return "hd-" + Math.random().toString(36).slice(2) + "-" + Date.now().toString(36);
}

/**
 * Génère un numéro de ticket lisible et (pratiquement) unique : HD-AAMMJJ-XXXX.
 * Passez un Set de numéros déjà utilisés pour garantir l'unicité stricte.
 */
export function generateTicketNumber(usedSet) {
  const d = new Date();
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const makeRand = () =>
    Math.random().toString(36).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4).padEnd(4, "0");
  let candidate = `HD-${yy}${mm}${dd}-${makeRand()}`;
  if (usedSet && typeof usedSet.has === "function") {
    let guard = 0;
    while (usedSet.has(candidate) && guard < 1000) {
      candidate = `HD-${yy}${mm}${dd}-${makeRand()}`;
      guard += 1;
    }
  }
  return candidate;
}

// Formater le prix avec centimes (optimisé avec cache)
export function currency(n, curr = "EUR") {
  if (n === undefined || n === null) n = 0;
  const num = Number(n) || 0;
  
  // Utiliser le cache pour éviter de recréer les formatters
  const cacheKey = `${curr}_withCents`;
  let formatter = numberFormatterCache.get(cacheKey);
  if (!formatter) {
    try {
      formatter = new Intl.NumberFormat("fr-FR", { style: "currency", currency: curr });
      numberFormatterCache.set(cacheKey, formatter);
    } catch {
      return `${num.toFixed(2)} ${curr}`;
    }
  }
  
  try {
    return formatter.format(num);
  } catch {
    return `${num.toFixed(2)} ${curr}`;
  }
}

// Calculer le prix carte (prix espèces + 3 %, arrondi à l'euro supérieur).
// Toujours appliquer sur le TOTAL (devis / somme Stripe), jamais ligne par ligne
// (sinon chaque Math.ceil ajoute des euros en trop).
export function calculateCardPrice(cashPrice) {
  const priceWithFees = Number(cashPrice) * 1.03;
  // Arrondir à l'euro supérieur
  return Math.ceil(priceWithFees);
}

// Cache pour les formatters de nombres (évite de recréer les formatters)
const numberFormatterCache = new Map();

// Formater le prix sans centimes (optimisé avec cache)
export function currencyNoCents(n, curr = "EUR") {
  if (n === undefined || n === null) n = 0;
  const num = Math.round(Number(n) || 0);
  
  // Utiliser le cache pour éviter de recréer les formatters
  const cacheKey = `${curr}_noCents`;
  let formatter = numberFormatterCache.get(cacheKey);
  if (!formatter) {
    try {
      formatter = new Intl.NumberFormat("fr-FR", { 
        style: "currency", 
        currency: curr, 
        minimumFractionDigits: 0, 
        maximumFractionDigits: 0 
      });
      numberFormatterCache.set(cacheKey, formatter);
    } catch {
      return `${num} ${curr}`;
    }
  }
  
  try {
    return formatter.format(num);
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
    logger.error("Erreur lors de la copie dans le presse-papiers:", error);
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
      surchargeUpTo2: 0,
      surchargeOver2: 0,
    };
  });
  return obj;
}

/**
 * Fusionne les transfers venant de Supabase avec la structure complète (emptyTransfers).
 * Évite de perdre les heures de prise en charge quand la DB renvoie un objet vide ou partiel.
 */
export function mergeTransfers(fromDb) {
  const base = emptyTransfers();
  if (!fromDb || typeof fromDb !== "object") return base;
  NEIGHBORHOODS.forEach((n) => {
    const key = n.key;
    if (fromDb[key] && typeof fromDb[key] === "object") {
      base[key] = {
        morningEnabled: fromDb[key].morningEnabled ?? base[key].morningEnabled,
        morningTime: fromDb[key].morningTime ?? base[key].morningTime,
        afternoonEnabled: fromDb[key].afternoonEnabled ?? base[key].afternoonEnabled,
        afternoonTime: fromDb[key].afternoonTime ?? base[key].afternoonTime,
        eveningEnabled: fromDb[key].eveningEnabled ?? base[key].eveningEnabled,
        eveningTime: fromDb[key].eveningTime ?? base[key].eveningTime,
        surcharge: Number(fromDb[key].surcharge) || base[key].surcharge,
        surchargeUpTo2: Number(fromDb[key].surchargeUpTo2) || base[key].surchargeUpTo2,
        surchargeOver2: Number(fromDb[key].surchargeOver2) || base[key].surchargeOver2,
      };
    }
  });
  return base;
}

export function saveLS(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    // localStorage peut échouer (mode privé, quota, etc.)
    logger.warn("saveLS: impossible d'écrire dans localStorage", error);
  }
}

/**
 * Nombre maximum de devis conservés dans le cache localStorage.
 *
 * Le cache sert à afficher immédiatement l'historique au démarrage, avant que
 * la synchro Supabase réponde. Sans plafond, `JSON.stringify` portait sur
 * plusieurs milliers de devis à chaque modification (coût synchrone sur le
 * thread principal) et dépassait le quota (~5 Mo) : l'écriture échouait alors
 * en silence et le cache restait figé. Les devis plus anciens reviennent de
 * toute façon avec la synchro.
 */
export const QUOTES_CACHE_LIMIT = 1200;

/**
 * Écrit le cache local des devis (le plus récent d'abord), plafonné.
 * @param {Array} list
 */
export function saveQuotesCache(list) {
  const capped =
    Array.isArray(list) && list.length > QUOTES_CACHE_LIMIT
      ? list.slice(0, QUOTES_CACHE_LIMIT)
      : list;
  saveLS(LS_KEYS.quotes, capped);
}

export function loadLS(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Convertit une valeur en entier base 10 de façon sûre.
 * - Accepte number/string (ex: "08", "8", 8)
 * - Refuse NaN / Infinity / "8e2" (retourne fallback)
 */
export function toInt10(value, fallback = 0) {
  if (value === "" || value === null || value === undefined) return fallback;
  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.trunc(value) : fallback;
  }
  if (typeof value === "string") {
    const s = value.trim();
    if (s === "") return fallback;
    // Autoriser uniquement un entier +/- en base 10 (pas d'exponentiel, pas de décimal)
    if (!/^[+-]?\d+$/.test(s)) return fallback;
    const n = Number.parseInt(s, 10);
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
}

/**
 * Normalise un compteur (adultes/enfants/bébés, etc.)
 * - entier
 * - borné (min/max)
 * - fallback si valeur invalide
 */
export function toBoundedInt10(value, { min = 0, max = 999, fallback = 0 } = {}) {
  const n = toInt10(value, fallback);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

// Calculer le montant total du supplément transfert pour un item
export function calculateTransferSurcharge(item) {
  return calculateTransferSurchargeFromItem(item);
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


