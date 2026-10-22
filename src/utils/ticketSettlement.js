import {
  computeActivityTransferSurcharge,
  computePrivateTransferSurcharge,
  getTransferSurchargeFieldsForQuoteItem,
} from "./transferPricing.js";
import { computeDivingVisitorSurcharge } from "./divingSafety.js";

/** Montant déjà encaissé sur une ligne ticket (hors reste à payer). */
export function getLineAmountPaid(item) {
  const stored = Math.round(Number(item?.amountPaid) || 0);
  if (stored > 0) return stored;
  const total = Math.round(Number(item?.lineTotal) || 0);
  const rest = Math.round(Number(item?.restAmount) || 0);
  return Math.max(0, total - rest);
}

export function hoursUntilActivityDate(dateKey, now = new Date()) {
  const day = String(dateKey || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const start = new Date(`${day}T00:00:00`);
  if (Number.isNaN(start.getTime())) return null;
  return (start.getTime() - now.getTime()) / (1000 * 60 * 60);
}

function activityNameKey(name) {
  return String(name || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function isCairoByPlaneActivity(activityName) {
  const key = activityNameKey(activityName);
  return key.includes("caire") && key.includes("avion");
}

export function isCairoOrLuxorExcursion(activityName) {
  const key = activityNameKey(activityName);
  if (isCairoByPlaneActivity(activityName)) return false;
  return key.includes("caire") || key.includes("louxor") || key.includes("luxor");
}

/**
 * Barème public de remboursement / modification.
 * @returns {{ rate: number, label: string, reason: string }}
 */
export function getModificationRefundPolicy({
  activityName,
  activityDate,
  alreadyModified = false,
  now = new Date(),
} = {}) {
  if (isCairoByPlaneActivity(activityName)) {
    return {
      rate: 0,
      label: "Aucun remboursement",
      reason: "Le Caire en avion : aucune modification ni remboursement après réservation.",
    };
  }
  if (alreadyModified) {
    return {
      rate: 0,
      label: "Aucun remboursement",
      reason: "Une activité déjà modifiée ne peut plus être remboursée.",
    };
  }

  const hours = hoursUntilActivityDate(activityDate, now);
  if (hours == null) {
    return {
      rate: 0,
      label: "Aucun remboursement",
      reason: "Date d’activité manquante : remboursement non calculable.",
    };
  }

  if (isCairoOrLuxorExcursion(activityName) && hours < 48) {
    return {
      rate: 0,
      label: "Aucun remboursement",
      reason: "Caire / Louxor : moins de 48 h avant, aucun remboursement.",
    };
  }

  if (hours >= 72) {
    return {
      rate: 1,
      label: "Remboursement intégral",
      reason: "Plus de 72 h avant l’activité.",
    };
  }
  if (hours >= 48) {
    return {
      rate: 0.5,
      label: "Remboursement de 50 %",
      reason: "Entre 48 h et 72 h avant l’activité.",
    };
  }
  return {
    rate: 0,
    label: "Aucun remboursement",
    reason: "Moins de 48 h avant l’activité.",
  };
}

/**
 * Après changement d’activité / pax : compare le déjà payé au nouveau prix.
 */
export function settleTicketAfterChange({
  previousItem,
  nextLineTotal,
  activityName,
  activityDate,
  alreadyModified = false,
  now = new Date(),
} = {}) {
  const amountPaid = getLineAmountPaid(previousItem);
  const lineTotal = Math.max(0, Math.round(Number(nextLineTotal) || 0));
  const policy = getModificationRefundPolicy({
    activityName,
    activityDate,
    alreadyModified,
    now,
  });

  const overpay = amountPaid - lineTotal;
  if (overpay > 0) {
    const refundAmount = Math.round(overpay * policy.rate);
    return {
      amountPaid,
      lineTotal,
      restAmount: 0,
      refundGross: overpay,
      refundAmount,
      refundRate: policy.rate,
      refundLabel: policy.label,
      refundReason: policy.reason,
    };
  }

  return {
    amountPaid,
    lineTotal,
    restAmount: Math.max(0, lineTotal - amountPaid),
    refundGross: 0,
    refundAmount: 0,
    refundRate: policy.rate,
    refundLabel: policy.label,
    refundReason: policy.reason,
  };
}

/** Nouveau prix de ligne (activité + pax + transfert + extras déjà sur la ligne). */
export function computeModifiedLineTotal({
  activity,
  adults = 0,
  children = 0,
  babies = 0,
  neighborhood = "",
  privateTransferTier = "",
  originalItem = null,
} = {}) {
  if (!activity) return Math.round(Number(originalItem?.lineTotal) || 0);

  let lineTotal = 0;
  lineTotal += Number(adults || 0) * Number(activity.priceAdult || 0);
  lineTotal += Number(children || 0) * Number(activity.priceChild || 0);
  lineTotal += activity.babiesForbidden
    ? 0
    : Number(babies || 0) * Number(activity.priceBaby || 0);

  const nb = String(neighborhood || originalItem?.neighborhood || "").trim();
  const transferInfo = activity.transfers?.[nb];
  const counts = { adults, children, babies };
  if (transferInfo) {
    lineTotal += computeActivityTransferSurcharge(transferInfo, activity, counts);
  }
  lineTotal += computePrivateTransferSurcharge(
    privateTransferTier || originalItem?.privateTransferTier,
    activity.name
  );

  const draft = {
    ...(originalItem || {}),
    adults,
    children,
    babies,
    activityName: activity.name,
  };
  lineTotal += computeDivingVisitorSurcharge(draft, activity.name);

  const extraAmountStr = String(originalItem?.extraAmount || "").trim();
  if (extraAmountStr !== "" && extraAmountStr !== "0" && extraAmountStr !== "0.00") {
    const extraAmountValue = Number(extraAmountStr);
    if (!Number.isNaN(extraAmountValue) && extraAmountValue !== 0) {
      lineTotal += extraAmountValue;
    }
  }

  return Math.max(0, Math.round(lineTotal));
}

export function getTransferFieldsForModifiedActivity(activity, neighborhood, originalItem) {
  const nb = String(neighborhood || originalItem?.neighborhood || "").trim();
  const transferInfo = activity?.transfers?.[nb];
  return getTransferSurchargeFieldsForQuoteItem(activity, transferInfo);
}

/** Historique visible sur la page Modifications (mods + annulations). */
export function collectTicketChangeLog(quotes = []) {
  const rows = [];
  for (const quote of quotes || []) {
    const clientName = String(quote?.client?.name || "").trim();
    const phone = String(quote?.client?.phone || "").trim();
    (quote.items || []).forEach((item, itemIndex) => {
      const ticketLive = String(item?.ticketNumber || "").trim();
      const ticketCancelled = String(item?.cancelledTicketNumber || "").trim();
      if (item?.isCancelled === true) {
        const last = Array.isArray(item.modifications)
          ? item.modifications[item.modifications.length - 1]
          : null;
        rows.push({
          key: `cancel-${quote.id}-${itemIndex}-${ticketCancelled || ticketLive}`,
          type: "cancelled",
          at: String(item.cancelledAt || last?.date || quote.updated_at || "").trim(),
          ticketNumber: ticketCancelled || ticketLive || "—",
          clientName,
          phone,
          activityName: String(item.activityName || last?.oldActivity || "—").trim(),
          detail: "Activité annulée · numéro mort",
          modifiedBy: String(item.cancelledBy || last?.modifiedBy || "").trim(),
          quoteId: quote.id,
        });
      }
      for (const mod of item?.modifications || []) {
        if (!mod || mod.type === "cancelled") continue;
        const oldAct = String(mod.oldActivity || "").trim();
        const newAct = String(mod.newActivity || "").trim();
        const detailParts = [];
        if (oldAct && newAct && oldAct !== newAct) detailParts.push(`${oldAct} → ${newAct}`);
        else if (newAct) detailParts.push(newAct);
        if (mod.restAmount > 0) detailParts.push(`Rest ${Math.round(Number(mod.restAmount) || 0)}€`);
        if (mod.refundAmount > 0) detailParts.push(`Remboursement ${Math.round(Number(mod.refundAmount) || 0)}€`);
        rows.push({
          key: `mod-${quote.id}-${itemIndex}-${mod.date || ""}-${ticketLive}`,
          type: "modified",
          at: String(mod.date || "").trim(),
          ticketNumber: String(mod.ticketNumber || ticketLive || "—").trim(),
          clientName,
          phone,
          activityName: newAct || oldAct || String(item.activityName || "—").trim(),
          detail: detailParts.join(" · ") || "Ticket modifié",
          modifiedBy: String(mod.modifiedBy || "").trim(),
          quoteId: quote.id,
        });
      }
    });
  }
  rows.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  return rows;
}

function formatChangeLogWhen(iso) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export { formatChangeLogWhen };

/** Résumé prêt pour l’impression du ticket. */
export function getTicketSettlementDisplay(item) {
  const amountPaid = getLineAmountPaid(item);
  const restAmount = Math.round(Number(item?.restAmount) || 0);
  const refundAmount = Math.round(Number(item?.refundAmount) || 0);
  const refundGross = Math.round(Number(item?.refundGross) || 0);
  const refundLabel = String(item?.refundLabel || "").trim();
  const refundReason = String(item?.refundReason || "").trim();
  return {
    amountPaid,
    restAmount,
    refundAmount,
    refundGross,
    refundLabel,
    refundReason,
    hasSettlement: amountPaid > 0 || restAmount > 0 || refundAmount > 0 || refundGross > 0,
  };
}
