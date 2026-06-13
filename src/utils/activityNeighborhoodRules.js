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

export function isSpaRoyalActivity(activityName) {
  const n = normalizeActivityName(activityName);
  return n.includes("spa") && n.includes("royal");
}

export function isHurghadaNeighborhood(neighborhoodKey) {
  const key = String(neighborhoodKey || "").trim();
  return HURGHADA_NEIGHBORHOOD_KEYS.includes(key);
}

/** Bloque la vente si l'activité n'est pas autorisée pour le quartier choisi. */
export function isActivityBlockedForNeighborhood(activity, neighborhoodKey) {
  if (!activity || !neighborhoodKey) return false;
  if (isSpaRoyalActivity(activity.name) && !isHurghadaNeighborhood(neighborhoodKey)) {
    return true;
  }
  return false;
}
