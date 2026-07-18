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

/**
 * Compare deux noms de personne en ignorant casse et accents (José ≡ Jose ≡ JOSE).
 * `sensitivity: "base"` = accents ignorés ; `"accent"` les rendrait significatifs.
 */
export function personNamesMatch(a, b) {
  const na = String(a || "").trim();
  const nb = String(b || "").trim();
  if (!na || !nb) return false;
  return na.localeCompare(nb, "fr", { sensitivity: "base" }) === 0;
}

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

/**
 * Noms des utilisateurs encore présents dans le répertoire (page Utilisateurs).
 * Ne réintroduit pas d’anciens créateurs de devis absents de la liste.
 * @param {Array<{ name?: string }>} users
 */
export function collectQuoteUserNames(users = []) {
  const names = new Set();
  for (const u of users) {
    const name = String(u?.name || "").trim();
    if (name) names.add(name);
  }
  return [...names].sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" }));
}

/** Total de devis créés par un utilisateur (tous temps). */
export function getTotalQuotesForUser(quotes = [], userName) {
  const target = String(userName || "").trim();
  if (!target) return 0;
  let total = 0;
  for (const q of quotes) {
    const name = String(q?.createdByName || "").trim();
    if (personNamesMatch(name, target)) total += 1;
  }
  return total;
}

/** Nombre de jours (parmi les devis) avec au moins un devis pour cet utilisateur. */
export function getActiveQuoteDaysCount(countByDay) {
  if (!countByDay?.size) return 0;
  let n = 0;
  for (const count of countByDay.values()) {
    if (count > 0) n += 1;
  }
  return n;
}

/**
 * Fusionne les buckets de noms équivalents (casse / accents) sous une seule clé d’affichage.
 * @returns {Map<string, Map<string, number>>} userName -> dateKey -> count
 */
export function buildQuotesCountByUserAndDay(quotes = []) {
  const map = new Map();
  for (const q of quotes) {
    const rawName = String(q?.createdByName || "").trim() || "Non renseigné";
    const dateKey = toLocalDateKey(q?.createdAt);
    if (!dateKey) continue;

    let key = rawName;
    for (const existing of map.keys()) {
      if (personNamesMatch(existing, rawName)) {
        key = existing;
        break;
      }
    }

    if (!map.has(key)) map.set(key, new Map());
    const dayMap = map.get(key);
    dayMap.set(dateKey, (dayMap.get(dateKey) || 0) + 1);
  }
  return map;
}

/**
 * Jours de devis pour un utilisateur, en fusionnant toutes les variantes de nom.
 * @returns {Map<string, number>} dateKey -> count
 */
export function getQuoteDaysForUser(quotesByUser, userName) {
  const merged = new Map();
  const target = String(userName || "").trim();
  if (!target || !quotesByUser?.size) return merged;

  for (const [name, dayMap] of quotesByUser) {
    if (!personNamesMatch(name, target)) continue;
    for (const [dateKey, count] of dayMap) {
      merged.set(dateKey, (merged.get(dateKey) || 0) + Number(count || 0));
    }
  }
  return merged;
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
