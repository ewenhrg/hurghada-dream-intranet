/**
 * Référence courte d’une demande hôtel — toujours préfixée par « H ».
 * Ex. id UUID → HA1B2C3D
 */
export function formatHotelRequestShortRef(id) {
  const raw = String(id ?? "")
    .trim()
    .replace(/-/g, "");
  if (!raw || raw === "—") return "";
  const core = raw.replace(/^h/i, "").toUpperCase().slice(0, 7);
  if (!core) return "H";
  return `H${core}`;
}

/** Normalise une saisie recherche (retire Réf. / H / tirets). */
export function normalizeHotelRequestRefQuery(q) {
  return String(q || "")
    .trim()
    .toLowerCase()
    .replace(/^réf\.?\s*/i, "")
    .replace(/^ref\.?\s*/i, "")
    .replace(/^h\s*/i, "")
    .replace(/[-\s]/g, "");
}
