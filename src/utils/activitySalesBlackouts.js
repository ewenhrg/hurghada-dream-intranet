/**
 * Stop sales « programmés » par activité (sans saisie manuelle jour par jour).
 * dateStr et dates retournées : AAAA-MM-JJ (comparaison lexicographique).
 */

function normalizeActivityName(name) {
  return String(name || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

export function isLuxorMontgolfiereActivity(activityName) {
  const n = normalizeActivityName(activityName);
  return n.includes("luxor") && n.includes("montgolfiere");
}

/**
 * Première date à laquelle l’activité peut être vendue (incluse).
 * Avant cette date = équivalent stop sale.
 */
export function getFirstSellableDateYmd(activityName, referenceDate = new Date()) {
  if (!isLuxorMontgolfiereActivity(activityName)) return null;
  const year = referenceDate.getFullYear();
  return `${year}-09-01`;
}

export function isBeforeFirstSellableDate(activityName, dateStr) {
  const from = getFirstSellableDateYmd(activityName);
  if (!from || !dateStr) return false;
  return String(dateStr).trim() < from;
}

/** Stop sale automatique (ex. Luxor montgolfière avant le 1er septembre). */
export function isProgrammaticStopSale(activity, dateStr) {
  if (!activity || !dateStr) return false;
  return isBeforeFirstSellableDate(activity.name, dateStr);
}
