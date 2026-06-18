import { isBoatPartyActivity } from "./activityHelpers";

/** Résumé participants pour cartes / modales (ex. historique). */
export function formatQuoteItemParticipantsSummary(item) {
  if (!item) return "—";
  const name = item.activityName || "";
  if (isBoatPartyActivity(name)) {
    const men = Number(item.boatPartyMen || 0);
    const women = Number(item.boatPartyWomen || 0);
    const parts = [];
    if (men > 0) parts.push(`${men} garçon${men > 1 ? "s" : ""}`);
    if (women > 0) parts.push(`${women} fille${women > 1 ? "s" : ""}`);
    return parts.length > 0 ? parts.join(" / ") : "—";
  }
  return `${item.adults ?? 0} adt / ${item.children ?? 0} enf / ${item.babies ?? 0} bébé(s)`;
}

/** Lignes détaillées sous le nom d'activité (devis PDF / impression). */
export function getQuoteItemDetailLines(item) {
  if (!item) return [];
  const lines = [];
  const name = item.activityName || "";

  if (isBoatPartyActivity(name)) {
    const men = Number(item.boatPartyMen || 0);
    const women = Number(item.boatPartyWomen || 0);
    if (men > 0) lines.push(`👨 Garçons : ${men}`);
    if (women > 0) lines.push(`👩 Filles : ${women}`);
  }

  return lines;
}

/** Colonnes Adultes / Enfants / Bébés du tableau devis imprimé. */
export function getQuoteItemParticipantCells(item) {
  if (!item) {
    return { adults: 0, children: 0, babies: 0 };
  }
  if (isBoatPartyActivity(item.activityName)) {
    return {
      adults: Number(item.boatPartyMen || 0),
      children: Number(item.boatPartyWomen || 0),
      babies: "—",
    };
  }
  return {
    adults: item.adults || 0,
    children: item.children || 0,
    babies: item.babies || 0,
  };
}
