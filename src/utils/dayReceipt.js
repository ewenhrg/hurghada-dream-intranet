import {
  buildActivitiesByIdMap,
  currencyNoCents,
  normalizeTicketsPaymentMethods,
  resolveTicketActivityName,
} from "../utils.js";
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

/**
 * Tickets for one activity date, with cash (euro or Egyptian) and Stripe.
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
      if (!ticketNumber || item?.ticketKind === "modification" || String(item?.date || "").trim() !== key) return;
      lines.push({ item, itemIndex, ticketNumber });
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

  groups.forEach(({ id, quote, lines }) => {
    const client = quote?.client || {};
    const allTicketed = (quote?.items || []).filter((item) => String(item?.ticketNumber || "").trim());
    const allSum = allTicketed.reduce((sum, item) => sum + lineCash(item), 0);
    const dayItems = lines.map((line) => line.item);
    const daySum = dayItems.reduce((sum, item) => sum + lineCash(item), 0);
    const flags = paymentFlags(quote, dayItems);
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

    const dayRest = dayItems.reduce((sum, item) => sum + roundMoney(item?.restAmount), 0);
    rest += dayRest;
    tariffTotal += daySum;

    const label = paymentLabel(cashOn, stripeOn, currency);
    const sorted = [...lines].sort((a, b) =>
      a.ticketNumber.localeCompare(b.ticketNumber, "fr", { numeric: true, sensitivity: "base" })
    );

    sorted.forEach((line, index) => {
      const tariff = lineCash(line.item);
      const activityName = resolveTicketActivityName(line.item, activitiesById);
      let collectedLabel = "—";
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

      rows.push({
        key: `${id}-${line.itemIndex}-${line.ticketNumber}`,
        ticketNumber: line.ticketNumber,
        hotel: String(client.hotel || "").trim() || "—",
        room: String(client.room || "").trim(),
        activity: formatActivityWithExtras({
          ...line.item,
          activityName,
          activityNameFr: String(line.item?.activityName || "").trim(),
        }),
        pax: paxLabel(line.item),
        tariff,
        tariffLabel: currencyNoCents(tariff, quote?.currency || "EUR"),
        paymentLabel: label,
        collectedLabel,
        rest: roundMoney(line.item?.restAmount),
        restLabel: roundMoney(line.item?.restAmount) > 0
          ? currencyNoCents(roundMoney(line.item.restAmount), quote?.currency || "EUR")
          : "—",
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
    },
  };
}
