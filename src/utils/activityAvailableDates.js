import { isProgrammaticStopSale } from "./activitySalesBlackouts.js";

/**
 * Jours disponibles (gestion) : tableau de 7 booléens,
 * index 0 = dimanche (aligné sur Date.getDay()).
 * @param {unknown} raw
 * @returns {boolean[]}
 */
export function normalizeAvailableDays(raw) {
  if (!Array.isArray(raw) || raw.length !== 7) {
    return [true, true, true, true, true, true, true];
  }
  return raw.map((b) => Boolean(b));
}

/**
 * @param {Iterable<string>|Set<string>|null|undefined} dates
 * @returns {Set<string>}
 */
export function toDateSet(dates) {
  if (!dates) return new Set();
  if (dates instanceof Set) return dates;
  return new Set([...dates].map((d) => String(d)));
}

/**
 * Statut d’un jour pour le calendrier public / sélection.
 * Priorité : stop > push > available (jour ouvré) > unavailable.
 * @returns {'stop-sale'|'push-sale'|'available'|'unavailable'}
 */
export function getPublicCatalogDayStatus(dateStr, dayOfWeek, normalizedDays, options = {}) {
  const { stopDateSet, pushDateSet, activity } = options;
  const stops = toDateSet(stopDateSet);
  const pushes = toDateSet(pushDateSet);

  if (activity && isProgrammaticStopSale(activity, dateStr)) {
    return "stop-sale";
  }
  if (stops.has(dateStr)) {
    return "stop-sale";
  }
  if (pushes.has(dateStr)) {
    return "push-sale";
  }

  const days =
    Array.isArray(normalizedDays) && normalizedDays.length === 7
      ? normalizedDays
      : [true, true, true, true, true, true, true];

  if (dayOfWeek != null && dayOfWeek >= 0 && dayOfWeek < 7 && days[dayOfWeek]) {
    return "available";
  }
  return "unavailable";
}

/**
 * Dates sélectionnables pour les N prochains jours (masque hebdo + stop/push).
 * @param {boolean[]} normalizedDays
 * @param {number} [maxDaysAhead=120]
 * @param {{ stopDateSet?: Iterable<string>, pushDateSet?: Iterable<string>, activity?: object }} [options]
 * @returns {{ value: string, label: string, status: string }[]}
 */
export function buildSelectableDateOptions(normalizedDays, maxDaysAhead = 120, options = {}) {
  const allOff = normalizedDays.every((d) => !d);
  const pushes = toDateSet(options.pushDateSet);
  // Si aucun jour ouvré et aucun push : rien à vendre en ligne
  if (allOff && pushes.size === 0) return [];

  const formatter = new Intl.DateTimeFormat("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  const out = [];
  const base = new Date();
  base.setHours(12, 0, 0, 0);

  for (let i = 0; i < maxDaysAhead; i++) {
    const dt = new Date(base);
    dt.setDate(base.getDate() + i);
    const dow = dt.getDay();
    const y = dt.getFullYear();
    const mo = String(dt.getMonth() + 1).padStart(2, "0");
    const da = String(dt.getDate()).padStart(2, "0");
    const value = `${y}-${mo}-${da}`;
    const status = getPublicCatalogDayStatus(value, dow, normalizedDays, options);
    if (status === "available" || status === "push-sale") {
      out.push({ value, label: formatter.format(dt), status });
    }
  }
  return out;
}
