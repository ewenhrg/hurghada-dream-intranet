/** Affiche une date YYYY-MM-DD en français. */
export function formatHotelStayDate(value) {
  const s = String(value ?? "").trim();
  if (!s) return "—";
  const d = new Date(`${s}T12:00:00`);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
