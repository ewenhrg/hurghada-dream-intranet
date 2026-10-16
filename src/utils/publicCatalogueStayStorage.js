/** Séjour client catalogue public (arrivée / départ) — sessionStorage. */
export const PUBLIC_CATALOGUE_STAY_KEY = "hd_public_catalogue_stay_v1";
export const PUBLIC_CATALOGUE_STAY_EVENT = "hd-public-catalogue-stay";

/**
 * @returns {{ arrivalDate: string, departureDate: string }}
 */
export function loadPublicCatalogueStay() {
  try {
    const raw = sessionStorage.getItem(PUBLIC_CATALOGUE_STAY_KEY);
    if (!raw) return { arrivalDate: "", departureDate: "" };
    const parsed = JSON.parse(raw);
    return {
      arrivalDate: String(parsed?.arrivalDate || "").trim(),
      departureDate: String(parsed?.departureDate || "").trim(),
    };
  } catch {
    return { arrivalDate: "", departureDate: "" };
  }
}

/**
 * @param {{ arrivalDate?: string, departureDate?: string }} stay
 * @returns {{ arrivalDate: string, departureDate: string }}
 */
export function savePublicCatalogueStay(stay) {
  const next = {
    arrivalDate: String(stay?.arrivalDate || "").trim(),
    departureDate: String(stay?.departureDate || "").trim(),
  };
  try {
    sessionStorage.setItem(PUBLIC_CATALOGUE_STAY_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota / private mode */
  }
  try {
    window.dispatchEvent(new CustomEvent(PUBLIC_CATALOGUE_STAY_EVENT, { detail: next }));
  } catch {
    /* ignore */
  }
  return next;
}

/**
 * Les activités commencent le lendemain de l’arrivée et s’arrêtent le jour du départ.
 * Un départ le lendemain (arrivée le 18, départ le 19) ne laisse donc aucune date.
 */
export const CATALOGUE_STAY_MIN_SPAN_MESSAGE =
  "Le séjour doit durer au minimum 2 jours. Exemple : arrivée le 18, départ le 20. Un départ le lendemain de l’arrivée n’affiche aucune disponibilité.";

/**
 * Premier départ acceptable : deux jours après l’arrivée (arrivée le 18 → départ le 20).
 * @param {string} arrivalDate YYYY-MM-DD
 * @returns {string} "" si l’arrivée est vide/invalide
 */
export function getMinDepartureDate(arrivalDate) {
  const arrival = String(arrivalDate || "").trim();
  if (!arrival) return "";
  const d = new Date(`${arrival}T12:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  d.setDate(d.getDate() + 2);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Arrivée et départ renseignés, mais le départ est avant le minimum de 2 jours
 * (même jour, lendemain, ou départ avant l’arrivée).
 * @param {{ arrivalDate?: string, departureDate?: string }|null|undefined} stay
 */
export function isCatalogueStayTooShort(stay) {
  const arrival = String(stay?.arrivalDate || "").trim();
  const departure = String(stay?.departureDate || "").trim();
  if (!arrival || !departure) return false;
  const min = getMinDepartureDate(arrival);
  if (!min) return false;
  return departure < min;
}

/** Séjour exploitable : au moins 2 jours (arrivée le 18, départ au plus tôt le 20). */
export function isValidCatalogueStay(stay) {
  const arrival = String(stay?.arrivalDate || "").trim();
  const departure = String(stay?.departureDate || "").trim();
  const min = getMinDepartureDate(arrival);
  return Boolean(arrival && departure && min && departure >= min);
}

/** @param {{ arrivalDate?: string, departureDate?: string }|null|undefined} stay */
export function formatCatalogueStaySummary(stay) {
  if (!isValidCatalogueStay(stay)) return "";
  const fmt = (iso) => {
    try {
      return new Intl.DateTimeFormat("fr-FR", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(new Date(`${iso}T12:00:00`));
    } catch {
      return iso;
    }
  };
  return `${fmt(stay.arrivalDate)} → ${fmt(stay.departureDate)}`;
}
