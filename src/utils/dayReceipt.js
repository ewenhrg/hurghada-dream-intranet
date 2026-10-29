import {
  buildActivitiesByIdMap,
  currencyNoCents,
  normalizeTicketsPaymentMethods,
  resolveTicketActivityName,
} from "../utils.js";
import { getLocalDateKey } from "./pushSaleExpiry.js";
import { parseItemPaymentFlags } from "./ticketCollections.js";
import {
  formatActivityWithExtras,
  getQuoteItemParticipantCells,
} from "./quoteItemDisplay.js";

function roundMoney(value) {
  return Math.round(Number(value) || 0);
}

function lineCash(item) {
  return roundMoney(item?.lineTotal);
}

function isModificationLine(item) {
  return item?.ticketKind === "modification";
}

function isCancellationLine(item) {
  if (item?.isCancelled === true) return true;
  if (!isModificationLine(item)) return false;
  return (
    item?.cancellation === true ||
    String(item?.newActivityName || "").trim().toLowerCase().startsWith("annul")
  );
}

function paxLabel(item) {
  const cells = getQuoteItemParticipantCells(item);
  const parts = [];
  if (cells.adults > 0) parts.push(`${cells.adults} adult${cells.adults > 1 ? "s" : ""}`);
  if (cells.children > 0) parts.push(`${cells.children} ${cells.children > 1 ? "children" : "child"}`);
  if (cells.babies > 0) parts.push(`${cells.babies} ${cells.babies > 1 ? "babies" : "baby"}`);
  return parts.join(" · ") || "—";
}

function shareAmount(amount, daySum, allSum) {
  const value = roundMoney(amount);
  if (!(value > 0)) return 0;
  if (!(allSum > 0) || daySum >= allSum) return value;
  return Math.round((value * daySum) / allSum);
}

function paymentFlags(quote, dayItems) {
  const withMethod = dayItems.find((item) => {
    const flags = parseItemPaymentFlags(item?.paymentMethod);
    return flags.cash || flags.stripe;
  });
  if (withMethod) return parseItemPaymentFlags(withMethod.paymentMethod);
  const quoteFlags = normalizeTicketsPaymentMethods(quote);
  if (quoteFlags.cash || quoteFlags.stripe) return quoteFlags;
  return { cash: true, stripe: false };
}

function cashSnapshot(quote) {
  const items = Array.isArray(quote?.items) ? quote.items : [];
  const typed = items.find((item) => roundMoney(item?.cashPaidAmount) > 0);
  const currency = String(typed?.cashPaidCurrency || quote?.paidCashCurrency || "").toUpperCase();
  return {
    currency: currency === "EGP" ? "EGP" : "EUR",
    amount: typed ? roundMoney(typed.cashPaidAmount) : roundMoney(quote?.paidCash),
  };
}

function paymentLabel(cashOn, stripeOn, currency) {
  if (cashOn && stripeOn) return currency === "EGP" ? "Cash EGP + Stripe" : "Cash + Stripe";
  if (stripeOn) return "Stripe";
  if (currency === "EGP") return "Cash EGP";
  return "Cash";
}

function stampMatchesDay(stamp, dateKey) {
  const raw = String(stamp || "").trim();
  if (!raw) return false;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return false;
  return getLocalDateKey(date) === dateKey;
}

function validatedOnDay(item, quote, dateKey) {
  if (stampMatchesDay(item?.ticketsEnteredAt || item?.tickets_entered_at, dateKey)) return true;
  if (stampMatchesDay(item?.createdAt || item?.created_at, dateKey)) return true;
  // Anciennes lignes modif / annulation sans horodatage : jour de mise à jour du devis.
  if (isModificationLine(item)) {
    return stampMatchesDay(quote?.updated_at || quote?.updatedAt, dateKey);
  }
  return stampMatchesDay(quote?.ticketsEnteredAt, dateKey);
}

function formatActivityDay(dateKey) {
  const day = String(dateKey || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return "";
  return new Date(`${day}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function activityLabel(item, activitiesById) {
  if (isCancellationLine(item)) {
    const previous = String(item?.previousActivityName || "").trim();
    const named = String(item?.activityName || "").trim();
    if (previous) return `Cancellation · ${previous}`;
    return named || "Cancellation";
  }
  if (isModificationLine(item)) {
    const named = String(item?.activityName || "").trim();
    if (named) return named;
    const before = String(item?.previousActivityName || "").trim();
    const after = String(item?.newActivityName || "").trim();
    if (before || after) return `Modification · ${before || "—"} → ${after || "—"}`;
  }
  const activityName = resolveTicketActivityName(item, activitiesById);
  return formatActivityWithExtras({
    ...item,
    activityName,
    activityNameFr: String(item?.activityName || "").trim(),
  });
}

/**
 * Tickets validated on one calendar day, whatever the activity date.
 * Includes cancellation / modification lines created that day.
 * Stripe is the tariff total, without the 3% card fee.
 */
export function buildDayReceipt(quotes, dateKey, activities = []) {
  const key = String(dateKey || "").trim();
  const activitiesById = buildActivitiesByIdMap(activities);
  const groups = [];

  (quotes || []).forEach((quote, quoteIndex) => {
    const items = Array.isArray(quote?.items) ? quote.items : [];
    const lines = [];
    items.forEach((item, itemIndex) => {
      const ticketNumber = String(item?.ticketNumber || "").trim();
      if (!ticketNumber) return;
      if (!validatedOnDay(item, quote, key)) return;
      lines.push({
        item,
        itemIndex,
        ticketNumber,
        modification: isModificationLine(item),
        cancellation: isCancellationLine(item),
      });
    });
    if (!lines.length) return;
    groups.push({
      id: String(quote?.id || quote?.supabase_id || `quote-${quoteIndex}`),
      quote,
      lines,
    });
  });

  const rows = [];
  let tariffTotal = 0;
  let cashEur = 0;
  let cashEgp = 0;
  let stripe = 0;
  let rest = 0;
  let refund = 0;

  groups.forEach(({ id, quote, lines }) => {
    const client = quote?.client || {};
    const billableDay = lines.filter((line) => !line.modification && !line.cancellation);
    const dayItems = billableDay.map((line) => line.item);
    const allTicketed = (quote?.items || []).filter(
      (item) => String(item?.ticketNumber || "").trim() && !isModificationLine(item) && item?.isCancelled !== true
    );
    const allSum = allTicketed.reduce((sum, item) => sum + lineCash(item), 0);
    const daySum = dayItems.reduce((sum, item) => sum + lineCash(item), 0);
    const flags = paymentFlags(quote, dayItems.length ? dayItems : lines.map((line) => line.item));
    const cashOn = flags.cash === true;
    const stripeOn = flags.stripe === true;
    const cash = cashSnapshot(quote);
    const stripeBase = roundMoney(quote?.paidStripe);
    const currency = cashOn && cash.currency === "EGP" ? "EGP" : "EUR";
    const dayCash = cashOn ? shareAmount(cash.amount, daySum, allSum) : 0;
    const dayStripeBase = stripeOn ? shareAmount(stripeBase, daySum, allSum) : 0;
    const dayStripe = stripeOn && !cashOn
      ? daySum
      : dayStripeBase > 0
        ? dayStripeBase
        : 0;

    if (billableDay.length > 0) {
      if (cashOn && !stripeOn) {
        if (currency === "EGP" && dayCash > 0) cashEgp += dayCash;
        else cashEur += daySum > 0 ? daySum : dayCash;
      } else if (stripeOn && !cashOn) {
        stripe += dayStripe;
      } else if (cashOn && stripeOn) {
        if (currency === "EGP" && dayCash > 0) cashEgp += dayCash;
        else if (dayCash > 0) cashEur += dayCash;
        stripe += dayStripe;
      }
    }

    const dayRest = dayItems.reduce((sum, item) => sum + roundMoney(item?.restAmount), 0);
    rest += dayRest;
    tariffTotal += daySum;

    const label = paymentLabel(cashOn, stripeOn, currency);
    const sorted = [...lines].sort((a, b) =>
      a.ticketNumber.localeCompare(b.ticketNumber, "fr", { numeric: true, sensitivity: "base" })
    );

    let billableIndex = 0;
    sorted.forEach((line) => {
      const tariff = lineCash(line.item);
      const refundAmount = roundMoney(line.item?.refundAmount);
      if (refundAmount > 0) refund += refundAmount;

      let collectedLabel = "—";
      let rowPaymentLabel = label;
      if (line.cancellation) {
        rowPaymentLabel = refundAmount > 0 ? "Cancellation · Refund" : "Cancellation";
        collectedLabel = "—";
      } else if (line.modification) {
        rowPaymentLabel =
          refundAmount > 0 ? "Modification · Refund" : line.item?.restAmount > 0 ? "Modification · Due" : "Modification";
        collectedLabel = "—";
      } else {
        const index = billableIndex;
        billableIndex += 1;
        if (cashOn && !stripeOn && currency === "EGP") {
          collectedLabel = index === 0 && dayCash > 0 ? currencyNoCents(dayCash, "EGP") : "—";
        } else if (cashOn && !stripeOn) {
          collectedLabel = currencyNoCents(tariff, "EUR");
        } else if (stripeOn && !cashOn) {
          collectedLabel = "Stripe";
        } else if (index === 0) {
          const parts = [];
          if (currency === "EGP" && dayCash > 0) parts.push(`Cash ${currencyNoCents(dayCash, "EGP")}`);
          else if (dayCash > 0) parts.push(`Cash ${currencyNoCents(dayCash, "EUR")}`);
          if (dayStripe > 0) parts.push(`Stripe ${currencyNoCents(dayStripe, "EUR")}`);
          collectedLabel = parts.join(" · ") || label;
        }
      }

      const restAmount = roundMoney(line.item?.restAmount);
      rows.push({
        key: `${id}-${line.itemIndex}-${line.ticketNumber}`,
        ticketNumber: line.ticketNumber,
        hotel: String(client.hotel || "").trim() || "—",
        room: String(client.room || "").trim(),
        activity: activityLabel(line.item, activitiesById),
        activityDate: formatActivityDay(line.item?.date),
        pax: line.modification ? "—" : paxLabel(line.item),
        tariff: line.modification ? 0 : tariff,
        tariffLabel: line.cancellation
          ? "—"
          : line.modification
            ? currencyNoCents(tariff, quote?.currency || "EUR")
            : currencyNoCents(tariff, quote?.currency || "EUR"),
        paymentLabel: rowPaymentLabel,
        collectedLabel,
        rest: restAmount,
        restLabel: restAmount > 0 ? currencyNoCents(restAmount, quote?.currency || "EUR") : "—",
        refund: refundAmount,
        refundLabel: refundAmount > 0 ? currencyNoCents(refundAmount, quote?.currency || "EUR") : "—",
        cancellation: line.cancellation,
        modification: line.modification,
      });
    });
  });

  rows.sort((a, b) =>
    a.ticketNumber.localeCompare(b.ticketNumber, "fr", { numeric: true, sensitivity: "base" })
  );

  return {
    dateKey: key,
    rows,
    totals: {
      ticketCount: rows.length,
      tariffTotal,
      tariffLabel: currencyNoCents(tariffTotal, "EUR"),
      cashEur,
      cashEurLabel: currencyNoCents(cashEur, "EUR"),
      cashEgp,
      cashEgpLabel: currencyNoCents(cashEgp, "EGP"),
      stripe,
      stripeLabel: currencyNoCents(stripe, "EUR"),
      rest,
      restLabel: currencyNoCents(rest, "EUR"),
      refund,
      refundLabel: currencyNoCents(refund, "EUR"),
    },
  };
}
