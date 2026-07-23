/**
 * Gratuités enfants par hôtel (contrat) — hors saisie Tarifs.
 * Les enfants non gratuits utilisent les prix bébé/enfant de Tarifs hôtel.
 */

export const HILTON_PLAZA_SLUG = "hilton-plaza";

/** Hilton Plaza : 1 enfant < 12 ans gratuit + 1 enfant < 6 ans gratuit. */
export const HILTON_CHILD_FREE_POLICY = {
  slug: HILTON_PLAZA_SLUG,
  freeUnder12: true,
  freeUnder6: true,
  under12MaxAge: 12, // strictement < 12
  under6MaxAge: 6, // strictement < 6
  summary:
    "1er enfant de moins de 12 ans gratuit · 1er enfant de moins de 6 ans gratuit · les autres au prix Tarifs hôtel (bébé / enfant).",
};

export function isHiltonPlazaHotel(hotelOrSlugOrName) {
  if (hotelOrSlugOrName == null) return false;
  if (typeof hotelOrSlugOrName === "string") {
    const s = hotelOrSlugOrName.trim().toLowerCase();
    return (
      s === HILTON_PLAZA_SLUG ||
      s.includes("hilton plaza") ||
      (s.includes("hilton") && s.includes("plaza"))
    );
  }
  const slug = String(hotelOrSlugOrName.slug || hotelOrSlugOrName.id || "")
    .trim()
    .toLowerCase();
  const name = String(hotelOrSlugOrName.name || "").trim().toLowerCase();
  return isHiltonPlazaHotel(slug) || isHiltonPlazaHotel(name);
}

export function getHotelChildFreePolicy(hotelOrSlugOrName) {
  if (isHiltonPlazaHotel(hotelOrSlugOrName)) return HILTON_CHILD_FREE_POLICY;
  return null;
}

/**
 * Répartit les gratuités Hilton :
 * - 1 place gratuite pour un enfant < 6 ans (si présent)
 * - 1 place gratuite pour un autre enfant < 12 ans (si présent)
 * Les autres paient le tarif bébé/enfant de la page Tarifs.
 *
 * @param {Array<number|string>} ages
 * @returns {{ age: number, free: boolean, reason: string|null }[]}
 */
export function allocateHiltonChildCharges(ages) {
  const list = (Array.isArray(ages) ? ages : [])
    .map((raw, index) => {
      const age = Number(raw);
      return {
        index,
        age: Number.isFinite(age) ? age : null,
      };
    })
    .filter((row) => row.age != null && row.age >= 0);

  const reasons = new Map();
  const under12 = list
    .filter((row) => row.age < 12)
    .sort((a, b) => a.age - b.age || a.index - b.index);

  const under6 = under12.filter((row) => row.age < 6);
  if (under6.length > 0) {
    reasons.set(under6[0].index, "gratuit (< 6 ans)");
  }

  const remainingUnder12 = under12.filter((row) => !reasons.has(row.index));
  if (remainingUnder12.length > 0) {
    reasons.set(remainingUnder12[0].index, "gratuit (< 12 ans)");
  }

  return list
    .slice()
    .sort((a, b) => a.index - b.index)
    .map((row) => {
      const reason = reasons.get(row.index) || null;
      return {
        age: row.age,
        free: Boolean(reason),
        reason: reason || "tarif page Tarifs hôtel",
      };
    });
}

/** Parse "4, 8, 2" / "4;8" / "4 8" → nombres. */
export function parseChildAgesInput(raw) {
  if (raw == null) return [];
  return String(raw)
    .split(/[,;/\s]+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => Number(p.replace(",", ".")))
    .filter((n) => Number.isFinite(n) && n >= 0);
}
