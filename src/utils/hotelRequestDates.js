/** Extrait YYYY-MM-DD (accepte aussi les timestamps ISO Supabase). */
export function normalizeStayDate(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : "";
}

/** Affiche une date YYYY-MM-DD en français. */
export function formatHotelStayDate(value) {
  const s = normalizeStayDate(value);
  if (!s) {
    const fallback = String(value ?? "").trim();
    return fallback || "—";
  }
  const d = new Date(`${s}T12:00:00`);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
