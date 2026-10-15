/** Heure déjà visible dans Mon séjour. */
export function visiblePickupTime(item) {
  if (item?.pickupPublished !== true) return "";
  return String(item.pickupTime || "").trim();
}

export function pickupAwaitingNotify(item) {
  return item?.pickupNotifyPending === true && visiblePickupTime(item).length > 0;
}

/**
 * Enregistre l'heure sans notification.
 * Retourne null si la valeur visible ne change pas.
 */
export function itemWithPickupSchedule(item, rawValue) {
  const next = String(rawValue ?? "").trim();
  if (next === visiblePickupTime(item)) return null;
  return {
    ...item,
    pickupTime: next,
    pickupPublished: Boolean(next),
    pickupNotifyPending: Boolean(next),
  };
}
