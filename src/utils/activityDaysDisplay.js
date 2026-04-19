/** Libellés courts alignés sur WEEKDAYS dans constants.js (0 = dimanche). */
const DAY_LABELS = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];

/**
 * Résumé des jours disponibles pour affichage (Maj prix, /tarifs).
 * @param {object} activityLike activité avec availableDays (camelCase) ou available_days (Supabase)
 */
export function formatActivityAvailableDaysSummary(activityLike) {
  const days = activityLike?.availableDays ?? activityLike?.available_days;
  if (!Array.isArray(days) || days.length !== 7) return "—";
  const parts = [];
  for (let i = 0; i < 7; i += 1) {
    if (days[i]) parts.push(DAY_LABELS[i]);
  }
  return parts.length > 0 ? parts.join(" · ") : "Aucun jour";
}
