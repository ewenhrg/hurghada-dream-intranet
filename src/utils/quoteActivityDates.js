import { getLocalDateKey } from "./pushSaleExpiry.js";
import { normalizeAvailableDays } from "./activityAvailableDates.js";
import { isProgrammaticStopSale } from "./activitySalesBlackouts.js";

/** Parse AAAA-MM-JJ en Date locale (midi) — évite les décalages UTC. */
export function parseYmdLocal(dateStr) {
  if (!dateStr || typeof dateStr !== "string") return null;
  const parts = dateStr.trim().split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return null;
  return new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0, 0);
}

export function isDivingActivityName(activityName) {
  if (!activityName) return false;
  const nameLower = activityName.toLowerCase();
  return (
    nameLower.includes("plongée") ||
    nameLower.includes("plongee") ||
    nameLower.includes("diving")
  );
}

/** Au moins 2 jours calendaires entre l'activité et le départ (sécurité décompression). */
export function isDateSafeForDiving(dateStr, departureStr) {
  const activityDate = parseYmdLocal(dateStr);
  const departure = parseYmdLocal(departureStr);
  if (!activityDate || !departure) return false;
  const diffMs = departure.getTime() - activityDate.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  return diffDays >= 2;
}

export function isStopSaleForActivity(activity, dateStr, stopSalesMap) {
  if (!activity || !dateStr) return false;
  if (isProgrammaticStopSale(activity, dateStr)) return true;
  if (!stopSalesMap) return false;
  const keyId = `${activity.id}_${dateStr}`;
  const keySupabaseId = activity.supabase_id ? `${activity.supabase_id}_${dateStr}` : null;
  return stopSalesMap.has(keyId) || (keySupabaseId && stopSalesMap.has(keySupabaseId));
}

export function isPushSaleForActivity(activity, dateStr, pushSalesMap) {
  if (!activity || !dateStr || !pushSalesMap) return false;
  const keyId = `${activity.id}_${dateStr}`;
  const keySupabaseId = activity.supabase_id ? `${activity.supabase_id}_${dateStr}` : null;
  return pushSalesMap.has(keyId) || (keySupabaseId && pushSalesMap.has(keySupabaseId));
}

/**
 * Jours du séjour candidats pour Auto-dates :
 * - à partir du lendemain de l'arrivée (jamais le jour d'arrivée)
 * - jusqu'au départ (borne inclusive)
 * - pas aujourd'hui ni le passé (à partir de demain)
 */
export function buildStayActivityCandidateDates(arrivalStr, departureStr, now = new Date()) {
  const arrival = parseYmdLocal(arrivalStr);
  const departure = parseYmdLocal(departureStr);
  if (!arrival || !departure || arrival > departure) return [];

  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  // Pas d'activité le jour d'arrivée : démarrer au lendemain
  const dayAfterArrival = new Date(arrival);
  dayAfterArrival.setDate(dayAfterArrival.getDate() + 1);
  dayAfterArrival.setHours(0, 0, 0, 0);

  const start = new Date(dayAfterArrival > tomorrow ? dayAfterArrival : tomorrow);
  start.setHours(0, 0, 0, 0);

  const end = new Date(departure);
  end.setHours(0, 0, 0, 0);

  if (start > end) return [];

  const out = [];
  const cur = new Date(start);
  while (cur <= end) {
    out.push({
      date: getLocalDateKey(cur),
      dayOfWeek: cur.getDay(),
    });
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

/**
 * Disponible si push sale OU (jour ouvré de l'activité ET pas de stop sale).
 * Si aucun jour n'est coché en gestion (tous false), on considère tous les jours possibles (anciennes fiches).
 */
export function isDateAvailableForActivity(activity, dateStr, dayOfWeek, stopSalesMap, pushSalesMap) {
  if (!activity || !dateStr) return false;

  if (isProgrammaticStopSale(activity, dateStr)) {
    return false;
  }

  if (isPushSaleForActivity(activity, dateStr, pushSalesMap)) {
    return true;
  }

  if (isStopSaleForActivity(activity, dateStr, stopSalesMap)) {
    return false;
  }

  const rawDays = activity.availableDays;
  const hasExplicitMask =
    Array.isArray(rawDays) && rawDays.length === 7 && rawDays.some((d) => d === true || d === false);
  const availableDays = hasExplicitMask ? rawDays.map((d) => Boolean(d)) : normalizeAvailableDays(rawDays);
  const hasAtLeastOneDay = availableDays.some((d) => d === true);

  if (!hasAtLeastOneDay) {
    return true;
  }

  if (dayOfWeek != null && dayOfWeek >= 0 && dayOfWeek < 7) {
    return availableDays[dayOfWeek] === true;
  }

  return false;
}
