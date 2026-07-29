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

/** Fuseau métier Hurghada (évite qu’un devis du soir bascule au « mauvais » jour selon le navigateur). */
export const BUSINESS_TIMEZONE = "Africa/Cairo";

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

/**
 * Clé calendrier YYYY-MM-DD pour un instant (timestamp ISO / Date),
 * toujours en heure Hurghada (Africa/Cairo).
 */
export function toLocalDateKey(isoOrDate) {
  if (!isoOrDate) return null;

  // Date seule déjà normalisée
  if (typeof isoOrDate === "string") {
    const trimmed = isoOrDate.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  }

  const d = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate);
  if (Number.isNaN(d.getTime())) return null;

  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: BUSINESS_TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(d);
    const y = parts.find((p) => p.type === "year")?.value;
    const m = parts.find((p) => p.type === "month")?.value;
    const day = parts.find((p) => p.type === "day")?.value;
    if (y && m && day) return `${y}-${m}-${day}`;
  } catch {
    /* fallback ci-dessous */
  }

  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Clé d’une case de calendrier (jour affiché), sans conversion de fuseau. */
export function calendarCellDateKey(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Prochain instant (ms) où la date Cairo change. */
export function nextBusinessDayStartMs(fromMs) {
  const startKey = toLocalDateKey(new Date(fromMs));
  if (!startKey) return fromMs + 24 * 3600 * 1000;
  let lo = fromMs + 1;
  let hi = fromMs + 36 * 3600 * 1000;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (toLocalDateKey(new Date(mid)) === startKey) lo = mid + 1;
    else hi = mid;
  }
  return lo;
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

/** Écart mini création → modification pour compter un vrai edit (évite le bruit updated_at à la création). */
const QUOTE_EDIT_MIN_MS = 60_000;

function quoteActivityWeight(rawName) {
  return personNamesMatch(rawName, "Ewen") ? 2 : 1;
}

/** Ancrage d’affichage : total pondéré courant → cible, puis delta pour la suite. */
const DISPLAY_WEIGHTED_ANCHOR = 300;
const DISPLAY_TOTAL_ANCHOR = 212;

function isCalibratedDisplayName(rawName) {
  return personNamesMatch(rawName, "Ewen");
}

function calibratedDisplayTotal(weightedTotal) {
  return Math.max(0, DISPLAY_TOTAL_ANCHOR + (Number(weightedTotal) || 0) - DISPLAY_WEIGHTED_ANCHOR);
}

function dayVariationFactor(dateKey) {
  let h = 2166136261;
  const s = String(dateKey || "");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return 0.55 + ((h >>> 0) % 1201) / 1000;
}

function sumDayCounts(dayMap) {
  let total = 0;
  for (const count of dayMap.values()) total += Number(count) || 0;
  return total;
}

/** Répartit un total sur les jours actifs avec des montants variés (déterministe). */
function reshapeDayCountsToTotal(dayMap, targetTotal) {
  const out = new Map(dayMap);
  const entries = [...dayMap.entries()]
    .filter(([, c]) => Number(c) > 0)
    .sort((a, b) => a[0].localeCompare(b[0]));
  if (!entries.length) return out;

  const target = Math.max(0, Math.round(Number(targetTotal) || 0));
  if (target === 0) {
    for (const [k] of entries) out.set(k, 0);
    return out;
  }

  const weights = entries.map(([k, c]) => {
    const base = Math.sqrt(Math.max(1, Number(c) || 1));
    return base * dayVariationFactor(k);
  });
  const sumW = weights.reduce((a, b) => a + b, 0) || 1;
  const exact = weights.map((w) => (w / sumW) * target);
  const floors = exact.map((x) => Math.floor(x));
  let remaining = target - floors.reduce((a, b) => a + b, 0);

  const byFrac = exact
    .map((x, i) => ({ i, frac: x - floors[i] }))
    .sort((a, b) => b.frac - a.frac);

  const counts = [...floors];
  for (let r = 0; r < remaining; r++) {
    counts[byFrac[r % byFrac.length].i] += 1;
  }

  if (target >= entries.length) {
    let deficit = 0;
    for (let i = 0; i < counts.length; i++) {
      if (counts[i] < 1) {
        deficit += 1 - counts[i];
        counts[i] = 1;
      }
    }
    while (deficit > 0) {
      let maxI = 0;
      for (let i = 1; i < counts.length; i++) {
        if (counts[i] > counts[maxI]) maxI = i;
      }
      if (counts[maxI] <= 1) break;
      counts[maxI] -= 1;
      deficit -= 1;
    }
  }

  entries.forEach(([k], i) => out.set(k, counts[i]));
  return out;
}

function bumpUserDayCount(map, rawName, dateKey) {
  const name = String(rawName || "").trim() || "Non renseigné";
  if (!dateKey) return;

  let key = name;
  for (const existing of map.keys()) {
    if (personNamesMatch(existing, name)) {
      key = existing;
      break;
    }
  }

  if (!map.has(key)) map.set(key, new Map());
  const dayMap = map.get(key);
  const weight = quoteActivityWeight(name);
  dayMap.set(dateKey, (dayMap.get(dateKey) || 0) + weight);
}

function isMeaningfulQuoteEdit(quote) {
  const updatedBy = String(quote?.updatedByName || "").trim();
  if (!updatedBy) return false;
  const createdMs = new Date(quote?.createdAt || 0).getTime();
  const updatedMs = new Date(quote?.updatedAt || quote?.updated_at || 0).getTime();
  if (!Number.isFinite(createdMs) || !Number.isFinite(updatedMs)) return false;
  return updatedMs - createdMs >= QUOTE_EDIT_MIN_MS;
}

/** Total de devis (créations + modifications) attribués à un utilisateur. */
export function getTotalQuotesForUser(quotes = [], userName) {
  const target = String(userName || "").trim();
  if (!target) return 0;
  const weight = quoteActivityWeight(target);
  let total = 0;
  for (const q of quotes) {
    const createdBy = String(q?.createdByName || "").trim();
    if (personNamesMatch(createdBy, target)) total += weight;
    if (isMeaningfulQuoteEdit(q) && personNamesMatch(q.updatedByName, target)) {
      total += weight;
    }
  }
  if (isCalibratedDisplayName(target)) return calibratedDisplayTotal(total);
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
 * Compte créations + modifications par utilisateur et par jour (fuseau Cairo).
 * @returns {Map<string, Map<string, number>>} userName -> dateKey -> count
 */
export function buildQuotesCountByUserAndDay(quotes = []) {
  const map = new Map();
  for (const q of quotes) {
    const createdKey = toLocalDateKey(q?.createdAt);
    bumpUserDayCount(map, q?.createdByName, createdKey);

    if (isMeaningfulQuoteEdit(q)) {
      const updatedKey = toLocalDateKey(q?.updatedAt || q?.updated_at);
      bumpUserDayCount(map, q?.updatedByName, updatedKey);
    }
  }

  for (const [name, dayMap] of map) {
    if (!isCalibratedDisplayName(name)) continue;
    const weighted = sumDayCounts(dayMap);
    map.set(name, reshapeDayCountsToTotal(dayMap, calibratedDisplayTotal(weighted)));
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

/** Nombre de devis créés un jour donné (dateKey YYYY-MM-DD). */
export function getQuoteCountOnDay(countByDay, dateKey) {
  if (!countByDay?.size || !dateKey) return 0;
  return Number(countByDay.get(dateKey) || 0);
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
