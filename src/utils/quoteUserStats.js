const WEEK_HEADERS = ["Lu", "Ma", "Me", "Je", "Ve", "Sa", "Di"];

const MONTH_NAMES = [
  "Janvier",
  "Février",
  "Mars",
  "Avril",
  "Mai",
  "Juin",
  "Juillet",
  "Août",
  "Septembre",
  "Octobre",
  "Novembre",
  "Décembre",
];

export { WEEK_HEADERS, MONTH_NAMES };

/** @param {string|Date} isoOrDate */
export function toLocalDateKey(isoOrDate) {
  if (!isoOrDate) return null;
  const d = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** @param {Array<{ name?: string }>} users */
export function collectQuoteUserNames(users = [], quotes = []) {
  const names = new Set();
  for (const u of users) {
    const name = String(u?.name || "").trim();
    if (name) names.add(name);
  }
  for (const q of quotes) {
    const name = String(q?.createdByName || "").trim();
    if (name) names.add(name);
  }
  return [...names].sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" }));
}

/**
 * @returns {Map<string, Map<string, number>>} userName -> dateKey -> count
 */
export function buildQuotesCountByUserAndDay(quotes = []) {
  const map = new Map();
  for (const q of quotes) {
    const userName = String(q?.createdByName || "").trim() || "Non renseigné";
    const dateKey = toLocalDateKey(q?.createdAt);
    if (!dateKey) continue;
    if (!map.has(userName)) map.set(userName, new Map());
    const dayMap = map.get(userName);
    dayMap.set(dateKey, (dayMap.get(dateKey) || 0) + 1);
  }
  return map;
}

/** Grille calendrier (lundi = 1ère colonne). */
export function buildMonthCellsMondayFirst(year, month) {
  const cells = [];
  const first = new Date(year, month, 1);
  const startWeekDay = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const lastPrev = new Date(year, month, 0).getDate();

  for (let i = 0; i < startWeekDay; i++) {
    const day = lastPrev - startWeekDay + 1 + i;
    cells.push({ date: new Date(year, month - 1, day), inCurrentMonth: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: new Date(year, month, d), inCurrentMonth: true });
  }
  let n = 1;
  while (cells.length % 7 !== 0) {
    cells.push({ date: new Date(year, month + 1, n), inCurrentMonth: false });
    n += 1;
  }
  return cells;
}

export function getMonthQuoteTotal(countByDay, year, month) {
  if (!countByDay?.size) return 0;
  const prefix = `${year}-${String(month + 1).padStart(2, "0")}-`;
  let total = 0;
  for (const [key, count] of countByDay) {
    if (key.startsWith(prefix)) total += count;
  }
  return total;
}
