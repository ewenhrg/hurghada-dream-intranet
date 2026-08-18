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

/** Supplément visiteur plongée (accompagnant qui ne plonge pas). */
export const DIVING_VISITOR_UNIT_PRICE = 15;

export function getDivingVisitorCount(item) {
  if (!item) return 0;
  const n = Number(item.divingVisitorCount ?? item.diving_visitor_count ?? 0);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n);
}

export function computeDivingVisitorSurcharge(item, activityName) {
  const name = activityName || item?.activityName || "";
  if (!isDivingActivityName(name)) return 0;
  return getDivingVisitorCount(item) * DIVING_VISITOR_UNIT_PRICE;
}

export function formatDivingVisitorLabel(item, activityName) {
  const count = getDivingVisitorCount(item);
  if (count <= 0) return "";
  const name = activityName || item?.activityName || "";
  if (!isDivingActivityName(name)) return "";
  const total = count * DIVING_VISITOR_UNIT_PRICE;
  const word = count > 1 ? "Visiteurs" : "Visiteur";
  return `${word} × ${count} (+${total}€)`;
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
