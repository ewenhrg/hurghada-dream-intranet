import {
  isBoatPartyActivity,
  allowsSpeedBoatDolphinExtra,
  allowsSpeedBoatIslandExtras,
} from "./activityHelpers";
import { SPEED_BOAT_EXTRAS } from "../constants/activityExtras";
import { getPrivateTransferLabel } from "./transferPricing";

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
    const men = Number(item.boatPartyMen || 0);
    const women = Number(item.boatPartyWomen || 0);
    return {
      adults: men + women,
      children: 0,
      babies: 0,
    };
  }
  return {
    adults: Number(item.adults || 0),
    children: Number(item.children || 0),
    babies: Number(item.babies || 0),
  };
}

/** Trois premières lettres du prénom (style Excel : Yac, Adam, Sof). */
export function getClientFirstNameShort(name, length = 3) {
  const first = String(name || "")
    .trim()
    .split(/\s+/)[0] || "";
  if (!first) return "";
  const short = first.slice(0, length);
  return short.charAt(0).toUpperCase() + short.slice(1).toLowerCase();
}

/** Cellule Excel : AAA + téléphone. */
export function formatClientShortWithPhone(name, phone) {
  const short = getClientFirstNameShort(name);
  const tel = String(phone || "").trim();
  if (short && tel) return `${short} ${tel}`;
  if (short) return short;
  return tel || "";
}

function normalizeSpeedBoatExtras(item) {
  const raw = item?.speedBoatExtra;
  if (Array.isArray(raw)) return raw.filter(Boolean);
  if (raw && typeof raw === "string" && raw.trim()) return [raw.trim()];
  return [];
}

/** Options / extras d'une ligne devis (libellés courts pour Excel). */
export function getQuoteItemExtraLabels(item) {
  if (!item || typeof item !== "object") return [];
  const labels = [];
  const activityName = item.activityName || "";

  if (allowsSpeedBoatDolphinExtra(activityName) && item.extraDolphin) {
    labels.push("Dauphin");
  }
  if (allowsSpeedBoatIslandExtras(activityName)) {
    for (const id of normalizeSpeedBoatExtras(item)) {
      const ex = SPEED_BOAT_EXTRAS.find((e) => e.id === id);
      if (ex?.id) labels.push(ex.label);
      else if (id) labels.push(String(id));
    }
  }

  const bs = Number(item.buggySimple) || 0;
  const bf = Number(item.buggyFamily) || 0;
  if (bs > 0) labels.push(`Buggy 2p ×${bs}`);
  if (bf > 0) labels.push(`Buggy 4p ×${bf}`);

  const y250 = Number(item.yamaha250) || 0;
  const k640 = Number(item.ktm640) || 0;
  const k530 = Number(item.ktm530) || 0;
  if (y250 > 0) labels.push(`Yamaha 250 ×${y250}`);
  if (k640 > 0) labels.push(`KTM 640 ×${k640}`);
  if (k530 > 0) labels.push(`KTM 530 ×${k530}`);

  if (item.cairePrivatif4pax) labels.push("Caire 4pax");
  if (item.cairePrivatif5pax) labels.push("Caire 5pax");
  if (item.cairePrivatif6pax) labels.push("Caire 6pax");
  if (item.louxorPrivatif4pax) labels.push("Louxor 4pax");
  if (item.louxorPrivatif5pax) labels.push("Louxor 5pax");
  if (item.louxorPrivatif6pax) labels.push("Louxor 6pax");

  if (item.allerSimple && !item.allerRetour) labels.push("Aller simple");
  if (item.allerRetour) labels.push("Aller-retour");

  const zt = [
    [item.zeroTracasTransfertVisaSim, "ZT visa+SIM+transfert"],
    [item.zeroTracasTransfertVisa, "ZT visa+transfert"],
    [item.zeroTracasTransfertSim, "ZT SIM+transfert"],
    [item.zeroTracasTransfert3Personnes, "ZT transfert ≤3"],
    [item.zeroTracasTransfertPlus3Personnes, "ZT transfert >3"],
    [item.zeroTracasVisaSim, "ZT visa+SIM"],
    [item.zeroTracasVisaSeul, "ZT visa"],
  ];
  for (const [val, label] of zt) {
    const n = Number(val);
    if (Number.isFinite(n) && n > 0) labels.push(`${label} ×${n}`);
  }

  const privateLabel = getPrivateTransferLabel(item.privateTransferTier);
  if (privateLabel) labels.push(privateLabel);

  const written = String(item.extraNote || item.extraText || item.optionExtra || "").trim();
  if (written) labels.push(written);

  return labels;
}

/**
 * Activité + extras (colonne Excel).
 * Speed Boat avec île : on privilégie le nom d’île (comme sur ton tableau : « Eden Island », « Orange bay »).
 */
export function formatActivityWithExtras(item) {
  const name = String(item?.activityName || "").trim() || "—";
  const extras = getQuoteItemExtraLabels(item);
  if (!extras.length) return name;

  const isSpeedBoat =
    name.toLowerCase().includes("speed boat") || name.toLowerCase().includes("speedboat");
  if (isSpeedBoat) {
    const islands = extras.filter((e) => e !== "Dauphin" && !String(e).startsWith("Transfert privé"));
    const rest = extras.filter((e) => e === "Dauphin" || String(e).startsWith("Transfert privé"));
    if (islands.length > 0) {
      return [...islands, ...rest].join(" · ");
    }
  }

  return `${name} · ${extras.join(" · ")}`;
}
