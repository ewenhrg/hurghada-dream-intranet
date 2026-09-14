import {
  isBoatPartyActivity,
  isCairePrivatifActivity,
  isLouxorPrivatifActivity,
  isMotoCrossActivity,
  isZeroTracasActivity,
  isZeroTracasHorsZoneActivity,
} from "./activityHelpers";

/** Transfert privé — forfait en plus du supplément transfert quartier. */
export const PRIVATE_TRANSFER_UP_TO_4_PAX = 25;
export const PRIVATE_TRANSFER_OVER_4_PAX = 35;

/** @typedef {"upTo4"|"over4"|""} PrivateTransferTier */

export function computePrivateTransferSurcharge(tier, activityName = "") {
  if (!tier || isTransferExcludedActivity(activityName)) return 0;
  if (tier === "upTo4") return PRIVATE_TRANSFER_UP_TO_4_PAX;
  if (tier === "over4") return PRIVATE_TRANSFER_OVER_4_PAX;
  return 0;
}

export function getPrivateTransferLabel(tier) {
  if (tier === "upTo4") return `Transfert privé ≤4 pax (${PRIVATE_TRANSFER_UP_TO_4_PAX}€)`;
  if (tier === "over4") return `Transfert privé +4 pax (${PRIVATE_TRANSFER_OVER_4_PAX}€)`;
  return "";
}

export function isMarsaAlamCategory(category) {
  return category === "marsa_alam";
}

export function countTransferGuests(counts = {}) {
  return Number(counts.adults || 0) + Number(counts.children || 0);
}

function isTransferExcludedActivity(activityName) {
  return (
    isZeroTracasActivity(activityName) ||
    isZeroTracasHorsZoneActivity(activityName) ||
    isCairePrivatifActivity(activityName) ||
    isLouxorPrivatifActivity(activityName)
  );
}

function countParticipantsForTransfer(activityName, counts = {}) {
  if (isMotoCrossActivity(activityName)) {
    return (
      Number(counts.yamaha250 || 0) +
      Number(counts.ktm640 || 0) +
      Number(counts.ktm530 || 0)
    );
  }
  if (isBoatPartyActivity(activityName)) {
    return Number(counts.boatPartyMen || 0) + Number(counts.boatPartyWomen || 0);
  }
  return countTransferGuests(counts);
}

/**
 * Calcule le supplément transfert pour une ligne de devis (quartier + activité).
 */
export function computeActivityTransferSurcharge(transferInfo, activity, counts = {}) {
  if (!transferInfo || !activity) return 0;
  const activityName = activity.name || "";
  if (isTransferExcludedActivity(activityName)) return 0;

  if (isMarsaAlamCategory(activity.category)) {
    const upTo2 = Number(transferInfo.surchargeUpTo2 || 0);
    const over2 = Number(transferInfo.surchargeOver2 || 0);
    if (!upTo2 && !over2) return 0;
    const guests = countParticipantsForTransfer(activityName, counts);
    if (guests <= 0) return 0;
    return guests <= 2 ? upTo2 : over2;
  }

  const surcharge = Number(transferInfo.surcharge || 0);
  if (!surcharge) return 0;
  const participants = countParticipantsForTransfer(activityName, counts);
  return surcharge * participants;
}

/** Champs à enregistrer sur un item de devis pour recalculer le transfert à l'affichage. */
export function getTransferSurchargeFieldsForQuoteItem(activity, transferInfo) {
  if (!transferInfo) {
    return { transferSurchargePerAdult: 0 };
  }
  if (isMarsaAlamCategory(activity?.category)) {
    return {
      transferSurchargePerAdult: 0,
      transferSurchargeUpTo2: Number(transferInfo.surchargeUpTo2 || 0),
      transferSurchargeOver2: Number(transferInfo.surchargeOver2 || 0),
    };
  }
  return {
    transferSurchargePerAdult: Number(transferInfo.surcharge || 0),
    transferSurchargeUpTo2: undefined,
    transferSurchargeOver2: undefined,
  };
}

/** Recalcule le supplément transfert quartier (hors transfert privé) à partir d'un item de devis enregistré. */
export function calculateStandardTransferSurchargeFromItem(item) {
  if (!item) return 0;

  const usesMarsaFlat =
    item.transferSurchargeUpTo2 != null || item.transferSurchargeOver2 != null;

  if (usesMarsaFlat) {
    const guests = countParticipantsForTransfer(item.activityName, item);
    if (guests <= 0) return 0;
    return guests <= 2
      ? Number(item.transferSurchargeUpTo2 || 0)
      : Number(item.transferSurchargeOver2 || 0);
  }

  if (!item.transferSurchargePerAdult || item.transferSurchargePerAdult === 0) {
    return 0;
  }

  const surchargePerAdult = Number(item.transferSurchargePerAdult || 0);
  const participants = countParticipantsForTransfer(item.activityName, item);
  return surchargePerAdult * participants;
}

export function calculatePrivateTransferSurchargeFromItem(item) {
  if (!item) return 0;
  return computePrivateTransferSurcharge(item.privateTransferTier, item.activityName);
}

/** Recalcule le montant transfert total (quartier + privé) à partir d'un item de devis enregistré. */
export function calculateTransferSurchargeFromItem(item) {
  return (
    calculateStandardTransferSurchargeFromItem(item) +
    calculatePrivateTransferSurchargeFromItem(item)
  );
}

const PICKUP_SLOT_LABELS = {
  morning: "Matin",
  afternoon: "Après-midi",
  evening: "Soir",
};

/**
 * Créneaux / heures de prise en charge disponibles pour un quartier (transfers activité).
 * @returns {{ slot: string, time: string, value: string, label: string }[]}
 */
export function getTransferPickupOptions(transferInfo) {
  if (!transferInfo) return [];
  const options = [];
  for (const slot of ["morning", "afternoon", "evening"]) {
    const enabledKey = `${slot}Enabled`;
    const timeKey = `${slot}Time`;
    if (!transferInfo[enabledKey]) continue;
    const time = String(transferInfo[timeKey] || "").trim();
    const slotLabel = PICKUP_SLOT_LABELS[slot] || slot;
    options.push({
      slot,
      time,
      value: time || slot,
      label: time ? `${slotLabel} (${time})` : slotLabel,
    });
  }
  return options;
}

export function getActivityPickupOptions(activity, neighborhoodKey) {
  const nb = String(neighborhoodKey || "").trim();
  if (!activity || !nb) return [];
  return getTransferPickupOptions(activity?.transfers?.[nb]);
}

/** Plusieurs créneaux possibles → le choix d’une heure / créneau est obligatoire. */
export function requiresPickupTimeChoice(transferInfoOrOptions) {
  const options = Array.isArray(transferInfoOrOptions)
    ? transferInfoOrOptions
    : getTransferPickupOptions(transferInfoOrOptions);
  return options.length > 1;
}

export function resolveActivityFromList(item, activities = []) {
  if (!item || !Array.isArray(activities) || activities.length === 0) return null;
  const id = item.activityId ?? item.activity_id;
  if (id != null && String(id).trim() !== "") {
    const idStr = String(id);
    const byId = activities.find(
      (a) => a && (String(a.id) === idStr || String(a.supabase_id) === idStr)
    );
    if (byId) return byId;
  }
  const name = String(item.activityName || "").trim();
  if (!name) return null;
  return activities.find((a) => a && String(a.name || "").trim() === name) || null;
}

/** Valeur à enregistrer dans pickupTime (préfère l’heure HH:MM). */
export function pickupTimeFromOptionValue(options, selectedValue) {
  const raw = String(selectedValue || "").trim();
  if (!raw) return "";
  const match = (options || []).find((o) => o.value === raw || o.time === raw || o.slot === raw);
  if (!match) return raw;
  return match.time || match.label || raw;
}
