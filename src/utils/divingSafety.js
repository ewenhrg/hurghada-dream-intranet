/** Parse AAAA-MM-JJ en Date locale (midi). */
function parseYmdLocal(dateStr) {
  if (!dateStr || typeof dateStr !== "string") return null;
  const parts = dateStr.trim().split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return null;
  return new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0, 0);
}

export function isDivingActivityName(activityName) {
  if (!activityName) return false;
  const nameLower = activityName.toLowerCase();
  return (
    nameLower.includes("plongée") ||
    nameLower.includes("plongee") ||
    nameLower.includes("diving")
  );
}

/** Au moins 2 jours calendaires entre l'activité et le départ (sécurité décompression). */
export function isDateSafeForDiving(dateStr, departureStr) {
  const activityDate = parseYmdLocal(dateStr);
  const departure = parseYmdLocal(departureStr);
  if (!activityDate || !departure) return false;
  const diffMs = departure.getTime() - activityDate.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  return diffDays >= 2;
}
