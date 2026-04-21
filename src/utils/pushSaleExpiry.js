/** Date locale au format YYYY-MM-DD (évite les décalages UTC). */
export function getLocalDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Push sale : considéré comme expiré à partir de la veille de la date prévue, à 20h00 (heure locale).
 * Pas avant ce moment.
 */
export function isPushSaleExpired(pushDateStr) {
  if (!pushDateStr || typeof pushDateStr !== "string") return false;
  const parts = pushDateStr.trim().split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return false;
  const [y, m, d] = parts;
  const eveAt20 = new Date(y, m - 1, d);
  eveAt20.setDate(eveAt20.getDate() - 1);
  eveAt20.setHours(20, 0, 0, 0);
  return Date.now() >= eveAt20.getTime();
}
