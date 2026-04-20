/**
 * Jours disponibles côté intranet : tableau de 7 booléens,
 * index 0 = dimanche (aligné sur Date.getDay()).
 * @param {unknown} raw
 * @returns {boolean[]}
 */
export function normalizeAvailableDays(raw) {
  if (!Array.isArray(raw) || raw.length !== 7) {
    return [true, true, true, true, true, true, true];
  }
  return raw.map((b) => Boolean(b));
}

/**
 * Dates sélectionnables pour les N prochains jours respectant le masque hebdo.
 * @param {boolean[]} normalizedDays
 * @param {number} [maxDaysAhead=120]
 * @returns {{ value: string, label: string }[]}
 */
export function buildSelectableDateOptions(normalizedDays, maxDaysAhead = 120) {
  const allOff = normalizedDays.every((d) => !d);
  if (allOff) return [];

  const formatter = new Intl.DateTimeFormat("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  const out = [];
  const base = new Date();
  base.setHours(12, 0, 0, 0);

  for (let i = 0; i < maxDaysAhead; i++) {
    const dt = new Date(base);
    dt.setDate(base.getDate() + i);
    const dow = dt.getDay();
    if (normalizedDays[dow]) {
      const y = dt.getFullYear();
      const mo = String(dt.getMonth() + 1).padStart(2, "0");
      const da = String(dt.getDate()).padStart(2, "0");
      const value = `${y}-${mo}-${da}`;
      out.push({ value, label: formatter.format(dt) });
    }
  }
  return out;
}
