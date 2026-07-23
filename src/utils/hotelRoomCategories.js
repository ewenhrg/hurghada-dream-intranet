/**
 * Catégories de chambres (interne) — nom + 2 options d’occupation max.
 * Compat : anciennes valeurs = chaînes ou { maxAdults, maxChildren, maxBabies }.
 */

function toMaxOrNull(value) {
  if (value === "" || value == null) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.min(20, Math.round(n));
}

function emptyOccupancyOption() {
  return { maxAdults: null, maxChildren: null, maxBabies: null };
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
    return {
      name,
      option1: emptyOccupancyOption(),
      option2: emptyOccupancyOption(),
    };
  }
  if (typeof raw !== "object") return null;
  const name = String(raw.name || raw.label || "").trim();
  if (!name) return null;

  const hasNested =
    raw.option1 != null ||
    raw.option2 != null ||
    raw.occupancy1 != null ||
    raw.occupancy2 != null;

  const option1 = hasNested
    ? normalizeOccupancyOption(raw.option1 ?? raw.occupancy1)
    : occupancyFromLegacyFlat(raw);
  const option2 = hasNested
    ? normalizeOccupancyOption(raw.option2 ?? raw.occupancy2)
    : emptyOccupancyOption();

  return { name, option1, option2 };
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
        option1: emptyOccupancyOption(),
        option2: emptyOccupancyOption(),
      });
    }
  }
  return [...map.values()];
}

/**
 * @param {object} occupancy — { option1: {...}, option2: {...} } ou legacy flat
 */
export function setRoomCategoryOccupancy(list, categoryName, occupancy) {
  const name = String(categoryName || "").trim();
  if (!name) return normalizeRoomCategories(list);
  const next = mergeRoomCategoryList(list, [name]);

  const option1 =
    occupancy?.option1 != null
      ? normalizeOccupancyOption(occupancy.option1)
      : normalizeOccupancyOption(occupancy);
  const option2 =
    occupancy?.option2 != null
      ? normalizeOccupancyOption(occupancy.option2)
      : emptyOccupancyOption();

  return next.map((cat) =>
    cat.name.toLowerCase() === name.toLowerCase()
      ? { ...cat, option1, option2 }
      : cat
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
  const a = formatOneOption(c.option1, "Opt.1");
  const b = formatOneOption(c.option2, "Opt.2");
  return [a, b].filter(Boolean).join(" · ") || "";
}

/** Draft UI : chaînes vides pour les inputs. */
export function occupancyDraftFromCategory(cat) {
  const c = normalizeRoomCategory(cat) || {
    option1: emptyOccupancyOption(),
    option2: emptyOccupancyOption(),
  };
  const toInput = (v) => (v == null ? "" : String(v));
  return {
    option1: {
      maxAdults: toInput(c.option1.maxAdults),
      maxChildren: toInput(c.option1.maxChildren),
      maxBabies: toInput(c.option1.maxBabies),
    },
    option2: {
      maxAdults: toInput(c.option2.maxAdults),
      maxChildren: toInput(c.option2.maxChildren),
      maxBabies: toInput(c.option2.maxBabies),
    },
  };
}

export function emptyOccupancyDraft() {
  return {
    option1: { maxAdults: "", maxChildren: "", maxBabies: "" },
    option2: { maxAdults: "", maxChildren: "", maxBabies: "" },
  };
}
