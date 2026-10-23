import { HURGHADA_NEIGHBORHOOD_KEYS } from "../constants";

function normalizeActivityName(name) {
  return String(name || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/** Activités Marsa Alam vendables uniquement pour le quartier Autre. */
const MARSA_ALAM_AUTRE_ONLY_ACTIVITIES = [
  { parts: ["marsa alam", "safari mix"], label: "Marsa Alam SAFARI MIX" },
  { parts: ["marsa alam", "seascope"], label: "Marsa Alam SEASCOPE" },
  { parts: ["marsa alam", "super safari"], label: "Marsa Alam SUPER SAFARI" },
];

export const SPA_ROYAL_NEIGHBORHOOD_MESSAGE =
  "SPA ROYAL n'est vendable que pour les quartiers Hurghada (Cora, Kawther, Sheraton, Arabia, Ahyaa).";

export const MARSA_ALAM_SAFARI_MIX_NEIGHBORHOOD_MESSAGE =
  "Marsa Alam SAFARI MIX est réservé aux clients du quartier Autre uniquement.";

function matchesParts(normalizedName, parts) {
  return parts.every((part) => normalizedName.includes(part));
}

export function isMarsaAlamAutreOnlyActivity(activityName) {
  const n = normalizeActivityName(activityName);
  return MARSA_ALAM_AUTRE_ONLY_ACTIVITIES.some((entry) => matchesParts(n, entry.parts));
}

export function getMarsaAlamAutreOnlyActivityLabel(activityName) {
  const n = normalizeActivityName(activityName);
  const entry = MARSA_ALAM_AUTRE_ONLY_ACTIVITIES.find((item) => matchesParts(n, item.parts));
  return entry?.label || "Cette activité Marsa Alam";
}

export function getMarsaAlamAutreOnlyNeighborhoodMessage(activityName) {
  return `${getMarsaAlamAutreOnlyActivityLabel(activityName)} est réservé aux clients du quartier Autre uniquement.`;
}

/** @deprecated Utiliser isMarsaAlamAutreOnlyActivity */
export function isMarsaAlamSafariMixActivity(activityName) {
  return isMarsaAlamAutreOnlyActivity(activityName);
}

export function isSpaRoyalActivity(activityName) {
  const n = normalizeActivityName(activityName);
  return n.includes("spa") && n.includes("royal");
}

export function isHurghadaNeighborhood(neighborhoodKey) {
  const key = String(neighborhoodKey || "").trim();
  return HURGHADA_NEIGHBORHOOD_KEYS.includes(key);
}

/** Supplément aéroport ↔ hôtel pour Makadi, Sahl Hasheesh, El Gouna et Soma Bay. */
export const AIRPORT_OUT_OF_ZONE_FEE_EUR = 10;

const AIRPORT_OUT_OF_ZONE_KEYS = new Set(["makadi", "salh_hasheesh", "el_gouna", "soma_bay"]);

function normalizeNeighborhoodKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_");
}

/** Quartier hors Hurghada ville : Makadi, Sahl Hasheesh, El Gouna, Soma Bay. */
export function isAirportOutOfZoneNeighborhood(neighborhoodKey) {
  const key = normalizeNeighborhoodKey(neighborhoodKey);
  if (!key) return false;
  if (AIRPORT_OUT_OF_ZONE_KEYS.has(key)) return true;
  if (key.includes("makadi")) return true;
  if (key.includes("hasheesh")) return true;
  if (key.includes("gouna") || key.includes("goune")) return true;
  if (key.includes("soma") && key.includes("bay")) return true;
  return false;
}

/**
 * Transfert aéroport ↔ hôtel au tarif Hurghada.
 * Les forfaits Soma Bay et Hors zone ont déjà leur prix.
 */
export function isHurghadaAirportHotelTransfer(activityName) {
  const n = normalizeActivityName(activityName);
  if (!n) return false;
  if (!(n.includes("aeroport") || n.includes("aerport") || n.includes("airport"))) return false;
  if (n.includes("soma")) return false;
  if (n.includes("hors") && n.includes("zone")) return false;
  if (n.includes("caire") || n.includes("louxor") || n.includes("luxor")) return false;
  return true;
}

/** 10 € une fois sur la ligne, aller simple ou aller-retour, si le quartier est hors zone. */
export function getAirportOutOfZoneFee(activityName, neighborhoodKey, line) {
  if (!isHurghadaAirportHotelTransfer(activityName)) return 0;
  if (!isAirportOutOfZoneNeighborhood(neighborhoodKey)) return 0;
  if (!line?.allerSimple && !line?.allerRetour) return 0;
  return AIRPORT_OUT_OF_ZONE_FEE_EUR;
}

export function isAutreNeighborhood(neighborhoodKey) {
  return String(neighborhoodKey || "").trim() === "autre";
}

/** Message d'erreur selon l'activité bloquée pour le quartier. */
export function getActivityNeighborhoodBlockMessage(activity) {
  if (!activity) return SPA_ROYAL_NEIGHBORHOOD_MESSAGE;
  if (isMarsaAlamAutreOnlyActivity(activity.name)) {
    return getMarsaAlamAutreOnlyNeighborhoodMessage(activity.name);
  }
  if (isSpaRoyalActivity(activity.name)) {
    return SPA_ROYAL_NEIGHBORHOOD_MESSAGE;
  }
  return "Cette activité n'est pas disponible pour le quartier sélectionné.";
}

/** Libellé court dans les listes déroulantes d'activités. */
export function getActivityNeighborhoodBlockOptionSuffix(activity) {
  if (isMarsaAlamAutreOnlyActivity(activity?.name)) return "Autre uniquement";
  if (isSpaRoyalActivity(activity?.name)) return "Hurghada uniquement";
  return "quartier incompatible";
}

/** Bloque la vente si l'activité n'est pas autorisée pour le quartier choisi. */
export function isActivityBlockedForNeighborhood(activity, neighborhoodKey) {
  if (!activity || !neighborhoodKey) return false;
  if (isMarsaAlamAutreOnlyActivity(activity.name) && !isAutreNeighborhood(neighborhoodKey)) {
    return true;
  }
  if (isSpaRoyalActivity(activity.name) && !isHurghadaNeighborhood(neighborhoodKey)) {
    return true;
  }
  return false;
}
