/**
 * Catégories de chambres (interne) — nom + jusqu’à 4 options d’occupation max.
 * Compat : anciennes valeurs = chaînes ou { maxAdults, maxChildren, maxBabies }.
 */

export const ROOM_OCCUPANCY_OPTION_KEYS = ["option1", "option2", "option3", "option4"];

function toMaxOrNull(value) {
  if (value === "" || value == null) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.min(20, Math.round(n));
}

function emptyOccupancyOption() {
  return { maxAdults: null, maxChildren: null, maxBabies: null };
}

function emptyOccupancyOptionsMap() {
  return {
    option1: emptyOccupancyOption(),
    option2: emptyOccupancyOption(),
    option3: emptyOccupancyOption(),
    option4: emptyOccupancyOption(),
  };
}

function normalizeOccupancyOption(raw) {
  if (!raw || typeof raw !== "object") return emptyOccupancyOption();
  return {
    maxAdults: toMaxOrNull(raw.maxAdults ?? raw.max_adults),
    maxChildren: toMaxOrNull(raw.maxChildren ?? raw.max_children),
    maxBabies: toMaxOrNull(raw.maxBabies ?? raw.max_babies),
  };
}

function occupancyFromLegacyFlat(raw) {
  if (!raw || typeof raw !== "object") return emptyOccupancyOption();
  return normalizeOccupancyOption(raw);
}

export function roomCategoryLabel(cat) {
  if (cat == null) return "";
  if (typeof cat === "string") return cat.trim();
  return String(cat.name || cat.label || "").trim();
}

export function normalizeRoomCategory(raw) {
  if (raw == null) return null;
  if (typeof raw === "string") {
    const name = raw.trim();
    if (!name) return null;
    return { name, ...emptyOccupancyOptionsMap() };
  }
  if (typeof raw !== "object") return null;
  const name = String(raw.name || raw.label || "").trim();
  if (!name) return null;

  const hasNested =
    raw.option1 != null ||
    raw.option2 != null ||
    raw.option3 != null ||
    raw.option4 != null ||
    raw.occupancy1 != null ||
    raw.occupancy2 != null ||
    raw.occupancy3 != null ||
    raw.occupancy4 != null;

  const options = emptyOccupancyOptionsMap();
  if (hasNested) {
    options.option1 = normalizeOccupancyOption(raw.option1 ?? raw.occupancy1);
    options.option2 = normalizeOccupancyOption(raw.option2 ?? raw.occupancy2);
    options.option3 = normalizeOccupancyOption(raw.option3 ?? raw.occupancy3);
    options.option4 = normalizeOccupancyOption(raw.option4 ?? raw.occupancy4);
  } else {
    options.option1 = occupancyFromLegacyFlat(raw);
  }

  return { name, ...options };
}

export function normalizeRoomCategories(raw) {
  let list = raw;
  if (typeof raw === "string") {
    try {
      list = JSON.parse(raw);
    } catch {
      list = String(raw)
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
    }
  }
  if (!Array.isArray(list)) return [];
  return list.map(normalizeRoomCategory).filter(Boolean);
}

export function roomCategoryNames(raw) {
  return normalizeRoomCategories(raw).map((c) => c.name);
}

export function findRoomCategory(raw, name) {
  const n = String(name || "").trim().toLowerCase();
  if (!n) return null;
  return (
    normalizeRoomCategories(raw).find((c) => c.name.toLowerCase() === n) || null
  );
}

/** Fusionne noms issus des tarifs + catégories hôtel (conserve occupation). */
export function mergeRoomCategoryList(hotelCategories, extraNames = []) {
  const map = new Map();
  for (const cat of normalizeRoomCategories(hotelCategories)) {
    map.set(cat.name.toLowerCase(), { ...cat });
  }
  for (const name of extraNames) {
    const label = String(name || "").trim();
    if (!label) continue;
    const key = label.toLowerCase();
    if (!map.has(key)) {
      map.set(key, {
        name: label,
        ...emptyOccupancyOptionsMap(),
      });
    }
  }
  return [...map.values()];
}

/**
 * @param {object} occupancy — { option1..option4 } ou legacy flat
 */
export function setRoomCategoryOccupancy(list, categoryName, occupancy) {
  const name = String(categoryName || "").trim();
  if (!name) return normalizeRoomCategories(list);
  const next = mergeRoomCategoryList(list, [name]);

  const options = emptyOccupancyOptionsMap();
  if (occupancy?.option1 != null || occupancy?.option2 != null || occupancy?.option3 != null || occupancy?.option4 != null) {
    for (const key of ROOM_OCCUPANCY_OPTION_KEYS) {
      options[key] = normalizeOccupancyOption(occupancy?.[key]);
    }
  } else {
    options.option1 = normalizeOccupancyOption(occupancy);
  }

  return next.map((cat) =>
    cat.name.toLowerCase() === name.toLowerCase() ? { ...cat, ...options } : cat
  );
}

function formatOneOption(opt, label) {
  if (!opt) return "";
  const parts = [];
  if (opt.maxAdults != null) parts.push(`${opt.maxAdults}A`);
  if (opt.maxChildren != null) parts.push(`${opt.maxChildren}E`);
  if (opt.maxBabies != null) parts.push(`${opt.maxBabies}B`);
  return parts.length ? `${label} ${parts.join("+")}` : "";
}

export function formatRoomOccupancyLabel(cat) {
  const c = normalizeRoomCategory(cat);
  if (!c) return "";
  return ROOM_OCCUPANCY_OPTION_KEYS.map((key, i) =>
    formatOneOption(c[key], `Opt.${i + 1}`)
  )
    .filter(Boolean)
    .join(" · ");
}

/** Capacité adultes max parmi les options renseignées (null si aucune). */
export function getMaxAdultsForRoomCategory(cat) {
  const c = normalizeRoomCategory(cat);
  if (!c) return null;
  let max = null;
  for (const key of ROOM_OCCUPANCY_OPTION_KEYS) {
    const n = c[key]?.maxAdults;
    if (n == null) continue;
    max = max == null ? n : Math.max(max, n);
  }
  return max;
}

/**
 * Nombre de chambres nécessaires si les adultes dépassent la capacité max.
 * Ex. 4 adultes / max 2 → 2 chambres. Sans capacité saisie → 1.
 */
export function resolveRoomsNeededForAdults(adultsCount, cat) {
  const adults = Math.max(0, Number(adultsCount) || 0);
  const maxAdults = getMaxAdultsForRoomCategory(cat);
  if (!adults || maxAdults == null || maxAdults <= 0) return 1;
  if (adults <= maxAdults) return 1;
  return Math.ceil(adults / maxAdults);
}

/** Draft UI : chaînes vides pour les inputs. */
export function occupancyDraftFromCategory(cat) {
  const c = normalizeRoomCategory(cat) || emptyOccupancyOptionsMap();
  const toInput = (v) => (v == null ? "" : String(v));
  const draft = {};
  for (const key of ROOM_OCCUPANCY_OPTION_KEYS) {
    const opt = c[key] || emptyOccupancyOption();
    draft[key] = {
      maxAdults: toInput(opt.maxAdults),
      maxChildren: toInput(opt.maxChildren),
      maxBabies: toInput(opt.maxBabies),
    };
  }
  return draft;
}

export function emptyOccupancyDraft() {
  const draft = {};
  for (const key of ROOM_OCCUPANCY_OPTION_KEYS) {
    draft[key] = { maxAdults: "", maxChildren: "", maxBabies: "" };
  }
  return draft;
}
