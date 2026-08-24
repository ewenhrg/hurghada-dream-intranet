import { calculateCardPrice, isQuoteFullyPaid, normalizeTicketsPaymentMethods } from "../utils";
import { toLocalDateKey } from "./quoteUserStats";

/** Remonte ticketsEnteredAt + flags cash/stripe depuis les items (rechargement Supabase). */
export function attachTicketPaymentMetaFromItems(quote) {
  if (!quote) return quote;
  const items = Array.isArray(quote.items) ? quote.items : [];
  let ticketsEnteredAt = String(quote.ticketsEnteredAt || "").trim();
  if (!ticketsEnteredAt) {
    for (const it of items) {
      const t = String(it?.ticketsEnteredAt || it?.tickets_entered_at || "").trim();
      if (t && (!ticketsEnteredAt || t > ticketsEnteredAt)) ticketsEnteredAt = t;
    }
  }
  const methods = normalizeTicketsPaymentMethods({
    ...quote,
    ticketsPaymentCash: quote.ticketsPaymentCash,
    ticketsPaymentStripe: quote.ticketsPaymentStripe,
    items,
  });
  return {
    ...quote,
    ticketsEnteredAt: ticketsEnteredAt || quote.ticketsEnteredAt || "",
    ticketsPaymentCash: methods.cash,
    ticketsPaymentStripe: methods.stripe,
  };
}

/** Total espèces d’un devis (fallback somme des lignes). */
export function getQuoteCashTotal(quote) {
  const fromField = Math.round(Number(quote?.totalCash ?? quote?.total) || 0);
  if (fromField > 0) return fromField;
  return (quote?.items || []).reduce((sum, it) => sum + Math.round(Number(it?.lineTotal) || 0), 0);
}

/** Total carte d’un devis (+3 %). */
export function getQuoteCardTotal(quote) {
  const fromField = Math.round(Number(quote?.totalCard) || 0);
  if (fromField > 0) return fromField;
  return calculateCardPrice(getQuoteCashTotal(quote));
}

/**
 * Instant d’encaissement (clic Payer) :
 * ticketsEnteredAt devis / items, sinon updated_at si devis payé.
 */
export function resolveQuoteTicketsEnteredAt(quote) {
  const top = String(quote?.ticketsEnteredAt || "").trim();
  if (top) return top;

  let best = "";
  for (const it of quote?.items || []) {
    const t = String(it?.ticketsEnteredAt || it?.tickets_entered_at || "").trim();
    if (t && (!best || t > best)) best = t;
  }
  if (best) return best;

  if (isQuoteFullyPaid(quote)) {
    return String(quote?.updated_at || quote?.updatedAt || quote?.createdAt || "").trim() || null;
  }
  return null;
}

/**
 * Répartition cash / stripe / mixte pour un devis payé (tous les n° ticket renseignés).
 * @returns {{ cash: number, stripe: number, mixed: number, mode: 'cash'|'stripe'|'mixed'|'none' } | null}
 */
export function getQuoteCollectionBreakdown(quote) {
  if (!isQuoteFullyPaid(quote)) return null;

  const methods = normalizeTicketsPaymentMethods(quote);
  const cashPrice = getQuoteCashTotal(quote);
  const cardPrice = getQuoteCardTotal(quote);
  const paidCash = Math.round(Number(quote?.paidCash) || 0);
  const paidStripe = Math.round(Number(quote?.paidStripe) || 0);

  if (methods.cash && methods.stripe) {
    const mixed = paidCash > 0 ? paidCash : cashPrice;
    return { cash: 0, stripe: 0, mixed, mode: "mixed" };
  }

  if (methods.stripe && !methods.cash) {
    const stripe = paidStripe > 0 ? paidStripe : cardPrice;
    return { cash: 0, stripe, mixed: 0, mode: "stripe" };
  }

  if (methods.cash && !methods.stripe) {
    const cash = paidCash > 0 ? paidCash : cashPrice;
    return { cash, stripe: 0, mixed: 0, mode: "cash" };
  }

  // Anciens devis payés sans mode : compter en cash
  if (paidStripe > 0 && paidCash <= 0) {
    return { cash: 0, stripe: paidStripe, mixed: 0, mode: "stripe" };
  }
  if (paidCash > 0) {
    return { cash: paidCash, stripe: 0, mixed: 0, mode: "cash" };
  }
  return { cash: cashPrice, stripe: 0, mixed: 0, mode: "cash" };
}

function emptyDayBucket() {
  return {
    cash: 0,
    stripe: 0,
    mixed: 0,
    total: 0,
    quotesCount: 0,
    cashCount: 0,
    stripeCount: 0,
    mixedCount: 0,
  };
}

/**
 * Agrège les encaissements par jour (Africa/Cairo via toLocalDateKey).
 * @returns {Map<string, ReturnType<typeof emptyDayBucket>>}
 */
export function buildCollectionsByDay(quotes = []) {
  const byDay = new Map();

  for (const quote of quotes || []) {
    const breakdown = getQuoteCollectionBreakdown(quote);
    if (!breakdown) continue;

    const enteredAt = resolveQuoteTicketsEnteredAt(quote);
    const dateKey = toLocalDateKey(enteredAt);
    if (!dateKey) continue;

    if (!byDay.has(dateKey)) byDay.set(dateKey, emptyDayBucket());
    const bucket = byDay.get(dateKey);
    bucket.cash += breakdown.cash;
    bucket.stripe += breakdown.stripe;
    bucket.mixed += breakdown.mixed;
    bucket.total += breakdown.cash + breakdown.stripe + breakdown.mixed;
    bucket.quotesCount += 1;
    if (breakdown.mode === "cash") bucket.cashCount += 1;
    else if (breakdown.mode === "stripe") bucket.stripeCount += 1;
    else if (breakdown.mode === "mixed") bucket.mixedCount += 1;
  }

  return byDay;
}

export function getCollectionsForDay(byDay, dateKey) {
  if (!dateKey || !byDay?.has(dateKey)) return emptyDayBucket();
  return byDay.get(dateKey);
}

/** Totaux du mois pour pastilles calendrier. */
export function getMonthCollectionsTotal(byDay, year, month) {
  if (!byDay?.size) return emptyDayBucket();
  const prefix = `${year}-${String(month + 1).padStart(2, "0")}-`;
  const out = emptyDayBucket();
  for (const [key, bucket] of byDay) {
    if (!key.startsWith(prefix)) continue;
    out.cash += bucket.cash;
    out.stripe += bucket.stripe;
    out.mixed += bucket.mixed;
    out.total += bucket.total;
    out.quotesCount += bucket.quotesCount;
    out.cashCount += bucket.cashCount;
    out.stripeCount += bucket.stripeCount;
    out.mixedCount += bucket.mixedCount;
  }
  return out;
}
