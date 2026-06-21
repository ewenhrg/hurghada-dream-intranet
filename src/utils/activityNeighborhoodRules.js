import { HURGHADA_NEIGHBORHOOD_KEYS } from "../constants";

function normalizeActivityName(name) {
  return String(name || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

export const SPA_ROYAL_NEIGHBORHOOD_MESSAGE =
  "SPA ROYAL n'est vendable que pour les quartiers Hurghada (Cora, Kawther, Sheraton, Arabia, Ahyaa).";

export const MARSA_ALAM_SAFARI_MIX_NEIGHBORHOOD_MESSAGE =
  "Marsa Alam SAFARI MIX est réservé aux clients du quartier Autre uniquement.";

export function isSpaRoyalActivity(activityName) {
  const n = normalizeActivityName(activityName);
  return n.includes("spa") && n.includes("royal");
}

export function isMarsaAlamSafariMixActivity(activityName) {
  const n = normalizeActivityName(activityName);
  return n.includes("marsa alam") && n.includes("safari mix");
}

export function isHurghadaNeighborhood(neighborhoodKey) {
  const key = String(neighborhoodKey || "").trim();
  return HURGHADA_NEIGHBORHOOD_KEYS.includes(key);
}

export function isAutreNeighborhood(neighborhoodKey) {
  return String(neighborhoodKey || "").trim() === "autre";
}

/** Message d'erreur selon l'activité bloquée pour le quartier. */
export function getActivityNeighborhoodBlockMessage(activity) {
  if (!activity) return SPA_ROYAL_NEIGHBORHOOD_MESSAGE;
  if (isMarsaAlamSafariMixActivity(activity.name)) {
    return MARSA_ALAM_SAFARI_MIX_NEIGHBORHOOD_MESSAGE;
  }
  if (isSpaRoyalActivity(activity.name)) {
    return SPA_ROYAL_NEIGHBORHOOD_MESSAGE;
  }
  return "Cette activité n'est pas disponible pour le quartier sélectionné.";
}

/** Libellé court dans les listes déroulantes d'activités. */
export function getActivityNeighborhoodBlockOptionSuffix(activity) {
  if (isMarsaAlamSafariMixActivity(activity?.name)) return "Autre uniquement";
  if (isSpaRoyalActivity(activity?.name)) return "Hurghada uniquement";
  return "quartier incompatible";
}

/** Bloque la vente si l'activité n'est pas autorisée pour le quartier choisi. */
export function isActivityBlockedForNeighborhood(activity, neighborhoodKey) {
  if (!activity || !neighborhoodKey) return false;
  if (isMarsaAlamSafariMixActivity(activity.name) && !isAutreNeighborhood(neighborhoodKey)) {
    return true;
  }
  if (isSpaRoyalActivity(activity.name) && !isHurghadaNeighborhood(neighborhoodKey)) {
    return true;
  }
  return false;
}
