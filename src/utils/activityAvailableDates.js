import { isProgrammaticStopSale } from "./activitySalesBlackouts.js";
import { getLocalDateKey } from "./pushSaleExpiry.js";
import { isDateSafeForDiving, isDivingActivityName } from "./divingSafety.js";

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
 * Plus tôt : après-demain (aujourd’hui + 2) — ni aujourd’hui ni demain.
 * @param {Date} [now]
 * @returns {string} YYYY-MM-DD
 */
export function getEarliestBookableActivityDateYmd(now = new Date()) {
  const d = new Date(now);
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + 2);
  return getLocalDateKey(d);
}

/**
 * Fenêtre d’activités pendant le séjour :
 * lendemain d’arrivée → départ (inclus), croisée avec la date mini réservable.
 * @param {string} arrivalDate
 * @param {string} departureDate
 * @param {Date} [now]
 * @param {{ includeArrivalDay?: boolean }} [options]
 *   includeArrivalDay : Zero Tracas — uniquement le jour d’arrivée (ignore J+2 / lendemain).
 * @returns {{ start: string, end: string, empty: boolean }|null}
 */
export function getCatalogueStayActivityBounds(arrivalDate, departureDate, now = new Date(), options = {}) {
  const arrival = String(arrivalDate || "").trim();
  const departure = String(departureDate || "").trim();
  if (!arrival || !departure || arrival > departure) return null;

  if (options.includeArrivalDay) {
    return { start: arrival, end: arrival, empty: false };
  }

  const dayAfterArrival = new Date(`${arrival}T12:00:00`);
  if (Number.isNaN(dayAfterArrival.getTime())) return null;
  dayAfterArrival.setDate(dayAfterArrival.getDate() + 1);
  let start = getLocalDateKey(dayAfterArrival);
  const earliest = getEarliestBookableActivityDateYmd(now);
  if (start < earliest) start = earliest;
  const end = departure;
  return { start, end, empty: start > end };
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
 * @param {string} dateStr
 * @param {{
 *   stayBounds?: { start: string, end: string, empty?: boolean }|null,
 *   earliestYmd?: string,
 *   activity?: object|null,
 *   departureDate?: string,
 *   skipEarliestCheck?: boolean,
 * }} [opts]
 */
export function isPublicCatalogDateSelectable(dateStr, opts = {}) {
  const iso = String(dateStr || "").trim();
  if (!iso) return false;

  if (!opts.skipEarliestCheck) {
    const earliest = opts.earliestYmd || getEarliestBookableActivityDateYmd();
    if (iso < earliest) return false;
  }

  const bounds = opts.stayBounds;
  if (bounds) {
    if (bounds.empty) return false;
    if (iso < bounds.start || iso > bounds.end) return false;
  }

  const activity = opts.activity;
  const departure = String(opts.departureDate || "").trim();
  if (activity && departure && isDivingActivityName(activity.name || activity.activity_name)) {
    if (!isDateSafeForDiving(iso, departure)) return false;
  }

  return true;
}

/**
 * Dates sélectionnables (masque hebdo + stop/push + séjour + délai + plongée).
 * @param {boolean[]} normalizedDays
 * @param {number} [maxDaysAhead=120]
 * @param {{
 *   stopDateSet?: Iterable<string>,
 *   pushDateSet?: Iterable<string>,
 *   activity?: object,
 *   stayBounds?: { start: string, end: string, empty?: boolean }|null,
 *   earliestYmd?: string,
 *   departureDate?: string,
 *   requireStay?: boolean,
 *   skipEarliestCheck?: boolean,
 * }} [options]
 * @returns {{ value: string, label: string, status: string }[]}
 */
export function buildSelectableDateOptions(normalizedDays, maxDaysAhead = 120, options = {}) {
  const allOff = normalizedDays.every((d) => !d);
  const pushes = toDateSet(options.pushDateSet);
  if (allOff && pushes.size === 0) return [];

  const formatter = new Intl.DateTimeFormat("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  const earliest = options.earliestYmd || getEarliestBookableActivityDateYmd();
  const stayBounds = options.stayBounds ?? null;
  // Catalogue public : séjour obligatoire pour proposer des dates
  if (options.requireStay && (!stayBounds || stayBounds.empty)) return [];

  const out = [];
  const base = new Date();
  base.setHours(12, 0, 0, 0);

  // Zero Tracas : une seule date (arrivée), même hors fenêtre « J+2 »
  if (stayBounds && stayBounds.start === stayBounds.end && options.skipEarliestCheck) {
    const value = stayBounds.start;
    const dt = new Date(`${value}T12:00:00`);
    if (!Number.isNaN(dt.getTime())) {
      const dow = dt.getDay();
      if (
        isPublicCatalogDateSelectable(value, {
          stayBounds,
          earliestYmd: earliest,
          activity: options.activity,
          departureDate: options.departureDate,
          skipEarliestCheck: true,
        })
      ) {
        const status = getPublicCatalogDayStatus(value, dow, normalizedDays, options);
        if (status === "available" || status === "push-sale") {
          out.push({ value, label: formatter.format(dt), status });
        }
      }
    }
    return out;
  }

  for (let i = 0; i < maxDaysAhead; i++) {
    const dt = new Date(base);
    dt.setDate(base.getDate() + i);
    const dow = dt.getDay();
    const value = getLocalDateKey(dt);
    if (
      !isPublicCatalogDateSelectable(value, {
        stayBounds,
        earliestYmd: earliest,
        activity: options.activity,
        departureDate: options.departureDate,
        skipEarliestCheck: options.skipEarliestCheck,
      })
    ) {
      continue;
    }
    const status = getPublicCatalogDayStatus(value, dow, normalizedDays, options);
    if (status === "available" || status === "push-sale") {
      out.push({ value, label: formatter.format(dt), status });
    }
  }
  return out;
}
