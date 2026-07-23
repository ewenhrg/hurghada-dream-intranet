/**
 * Catégories de chambres (interne) — nom + occupation max.
 * Compat : anciennes valeurs = chaînes seules.
 */

function toMaxOrNull(value) {
  if (value === "" || value == null) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.min(20, Math.round(n));
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
      maxAdults: null,
      maxChildren: null,
      maxBabies: null,
    };
  }
  if (typeof raw !== "object") return null;
  const name = String(raw.name || raw.label || "").trim();
  if (!name) return null;
  return {
    name,
    maxAdults: toMaxOrNull(raw.maxAdults ?? raw.max_adults),
    maxChildren: toMaxOrNull(raw.maxChildren ?? raw.max_children),
    maxBabies: toMaxOrNull(raw.maxBabies ?? raw.max_babies),
  };
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
        maxAdults: null,
        maxChildren: null,
        maxBabies: null,
      });
    }
  }
  return [...map.values()];
}

export function setRoomCategoryOccupancy(list, categoryName, occupancy) {
  const name = String(categoryName || "").trim();
  if (!name) return normalizeRoomCategories(list);
  const next = mergeRoomCategoryList(list, [name]);
  return next.map((cat) =>
    cat.name.toLowerCase() === name.toLowerCase()
      ? {
          ...cat,
          maxAdults: toMaxOrNull(occupancy?.maxAdults),
          maxChildren: toMaxOrNull(occupancy?.maxChildren),
          maxBabies: toMaxOrNull(occupancy?.maxBabies),
        }
      : cat
  );
}

export function formatRoomOccupancyLabel(cat) {
  const c = normalizeRoomCategory(cat);
  if (!c) return "";
  const parts = [];
  if (c.maxAdults != null) parts.push(`${c.maxAdults} adulte${c.maxAdults > 1 ? "s" : ""}`);
  if (c.maxChildren != null) parts.push(`${c.maxChildren} enfant${c.maxChildren > 1 ? "s" : ""}`);
  if (c.maxBabies != null) parts.push(`${c.maxBabies} bébé${c.maxBabies > 1 ? "s" : ""}`);
  return parts.length ? `Max ${parts.join(" · ")}` : "";
}
