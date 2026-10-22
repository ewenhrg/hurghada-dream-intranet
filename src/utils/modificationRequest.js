import { isProgrammaticStopSale } from "./activitySalesBlackouts";

const CAIRO = "Africa/Cairo";

export function cairoTodayKey(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: CAIRO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function addDays(dateKey, days) {
  const date = new Date(`${String(dateKey).slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return "";
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Une modification n’est pas acceptée le jour même ni la veille pour le lendemain. */
export function modificationTooLate(activityDate, now = new Date()) {
  const day = String(activityDate || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return true;
  return day <= addDays(cairoTodayKey(now), 1);
}

function cairoDateTime(dateKey, timeValue) {
  const day = String(dateKey || "").slice(0, 10);
  const match = String(timeValue || "08:00").match(/^(\d{1,2}):(\d{2})/);
  const hour = match ? Number(match[1]) : 8;
  const minute = match ? Number(match[2]) : 0;
  const utcGuess = Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)), hour, minute, 0);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: CAIRO,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(utcGuess))
      .map((part) => [part.type, part.value])
  );
  const zonedAsUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute)
  );
  return new Date(utcGuess - (zonedAsUtc - utcGuess));
}

/** 100 au-delà de 72 h, 50 entre 48 h et 72 h, 0 en dessous de 48 h. */
export function refundPercent(activityDate, pickupTime, now = new Date()) {
  const day = String(activityDate || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return 0;
  const hours = (cairoDateTime(day, pickupTime).getTime() - now.getTime()) / 36e5;
  if (hours > 72) return 100;
  if (hours >= 48) return 50;
  return 0;
}

export function refundLabel(percent) {
  if (percent >= 100) return "Remboursement intégral";
  if (percent >= 50) return "Remboursement de 50 %";
  return "Aucun remboursement";
}

export function formatStayDay(value) {
  const day = String(value || "").slice(0, 10);
  const date = new Date(`${day}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value || "—";
  return date.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
}

export function upcomingOpenDates(activity, blockedDates, now = new Date(), limit = 18, pushedDates = []) {
  const days = Array.isArray(activity?.availableDays) ? activity.availableDays : [];
  const blocked = blockedDates instanceof Set ? blockedDates : new Set(blockedDates || []);
  const pushed = pushedDates instanceof Set ? pushedDates : new Set(pushedDates || []);
  const found = [];
  let cursor = addDays(cairoTodayKey(now), 2);
  for (let step = 0; step < 120 && found.length < limit; step += 1) {
    const weekday = new Date(`${cursor}T12:00:00Z`).getUTCDay();
    const normallyOpen = days[weekday] === true || pushed.has(cursor);
    if (normallyOpen && !blocked.has(cursor) && !isProgrammaticStopSale(activity, cursor)) found.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return found;
}

export function paxLabel(adults, children, babies) {
  const parts = [];
  const a = Math.max(0, Math.round(Number(adults) || 0));
  const c = Math.max(0, Math.round(Number(children) || 0));
  const b = Math.max(0, Math.round(Number(babies) || 0));
  if (a) parts.push(`${a} adulte${a > 1 ? "s" : ""}`);
  if (c) parts.push(`${c} enfant${c > 1 ? "s" : ""}`);
  if (b) parts.push(`${b} bébé${b > 1 ? "s" : ""}`);
  return parts.join(", ") || "0 personne";
}
