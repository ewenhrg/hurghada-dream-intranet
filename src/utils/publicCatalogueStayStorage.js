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
 * Message affiché quand arrivée et départ tombent le même jour :
 * les activités démarrent au lendemain de l’arrivée, donc aucune date ne sortirait.
 */
export const CATALOGUE_STAY_SAME_DAY_MESSAGE =
  "Merci d’indiquer votre vraie date de départ : avec une arrivée et un départ le même jour, aucune activité n’est disponible. Les excursions commencent le lendemain de votre arrivée.";

/**
 * Lendemain de l’arrivée : premier départ acceptable (séjour d’au moins une nuit).
 * @param {string} arrivalDate YYYY-MM-DD
 * @returns {string} "" si l’arrivée est vide/invalide
 */
export function getMinDepartureDate(arrivalDate) {
  const arrival = String(arrivalDate || "").trim();
  if (!arrival) return "";
  const d = new Date(`${arrival}T12:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  d.setDate(d.getDate() + 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** @param {{ arrivalDate?: string, departureDate?: string }|null|undefined} stay */
export function isSameDayCatalogueStay(stay) {
  const arrival = String(stay?.arrivalDate || "").trim();
  const departure = String(stay?.departureDate || "").trim();
  return Boolean(arrival && departure && arrival === departure);
}

/** Séjour exploitable : au moins une nuit (départ strictement après l’arrivée). */
export function isValidCatalogueStay(stay) {
  const arrival = String(stay?.arrivalDate || "").trim();
  const departure = String(stay?.departureDate || "").trim();
  return Boolean(arrival && departure && arrival < departure);
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
