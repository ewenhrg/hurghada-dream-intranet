/** Contenu affiché sur la fiche activité publique (description + URLs d’images). */

export const MAX_CATALOG_IMAGES = 12;

/**
 * URL autorisée pour la galerie catalogue : HTTPS uniquement, pas de data:/javascript:.
 * @param {unknown} s
 * @returns {boolean}
 */
export function isAllowedCatalogImageUrl(s) {
  if (typeof s !== "string") return false;
  const t = s.trim();
  if (t.length < 12 || t.length > 2048) return false;
  const lower = t.toLowerCase();
  if (lower.startsWith("data:") || lower.startsWith("javascript:")) return false;
  try {
    const u = new URL(t);
    return u.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * @param {unknown} raw — JSONB, tableau ou chaîne JSON
 * @returns {string[]}
 */
export function normalizeCatalogImageUrlsFromDb(raw) {
  if (raw == null) return [];
  let arr = raw;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      arr = parsed;
    } catch {
      return [];
    }
  }
  if (!Array.isArray(arr)) return [];
  return arr
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .filter(isAllowedCatalogImageUrl)
    .slice(0, MAX_CATALOG_IMAGES);
}
