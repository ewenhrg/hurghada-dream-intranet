import { calculateCardPrice, normalizeTicketsPaymentMethods } from "../utils";
import { toLocalDateKey } from "./quoteUserStats";

/** Parse cash / stripe depuis paymentMethod d’une ligne. */
export function parseItemPaymentFlags(paymentMethod) {
  const m = String(paymentMethod || "").toLowerCase();
  return {
    cash:
      m.includes("cash") ||
      m.includes("espece") ||
      m.includes("espèce") ||
      m.includes("espèces"),
    stripe: m.includes("stripe") || m.includes("card") || m.includes("carte"),
  };
}

/** Lignes avec un n° de ticket renseigné. */
export function getTicketedItems(quote) {
  return (quote?.items || []).filter((it) => String(it?.ticketNumber || "").trim() !== "");
}

export function sumItemsLineCash(items = []) {
  return (items || []).reduce((sum, it) => sum + Math.round(Number(it?.lineTotal) || 0), 0);
}

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

/** Total espèces : somme des lignes ticketées, sinon toutes les lignes, sinon total devis. */
export function getQuoteCashTotal(quote) {
  const ticketed = getTicketedItems(quote);
  if (ticketed.length > 0) {
    const sum = sumItemsLineCash(ticketed);
    if (sum > 0) return sum;
  }
  const allSum = sumItemsLineCash(quote?.items);
  if (allSum > 0) return allSum;
  return Math.round(Number(quote?.totalCash ?? quote?.total) || 0);
}

/** Total carte (+3 %) à partir du total espèces précis. */
export function getQuoteCardTotal(quote) {
  return calculateCardPrice(getQuoteCashTotal(quote));
}

/**
 * Instant d’encaissement (clic Payer) — uniquement ticketsEnteredAt.
 * Pas de fallback sur updated_at (trop imprécis après une modification ultérieure).
 */
export function resolveQuoteTicketsEnteredAt(quote) {
  const times = [];
  const top = String(quote?.ticketsEnteredAt || "").trim();
  if (top && !Number.isNaN(Date.parse(top))) times.push(top);

  for (const it of getTicketedItems(quote)) {
    const t = String(it?.ticketsEnteredAt || it?.tickets_entered_at || "").trim();
    if (t && !Number.isNaN(Date.parse(t))) times.push(t);
  }

  if (!times.length) return null;
  times.sort();
  // Plus ancienne date = premier enregistrement des tickets (Pay)
  return times[0];
}

/**
 * Répartition cash / stripe / mixte — uniquement les lignes avec n° ticket.
 * Stripe = prix carte ligne par ligne (ceil(+3%)).
 * Mixte (cash+stripe sur la même ligne) = montant espèces (pas de split inventé).
 */
export function getQuoteCollectionBreakdown(quote) {
  const ticketed = getTicketedItems(quote);
  if (!ticketed.length) return null;

  let cash = 0;
  let stripe = 0;
  let mixed = 0;
  let linesWithMethod = 0;

  for (const it of ticketed) {
    const lineCash = Math.round(Number(it.lineTotal) || 0);
    const { cash: isCash, stripe: isStripe } = parseItemPaymentFlags(it.paymentMethod);

    if (!isCash && !isStripe) continue;
    linesWithMethod += 1;

    if (isCash && isStripe) {
      mixed += lineCash;
    } else if (isStripe) {
      stripe += calculateCardPrice(lineCash);
    } else {
      cash += lineCash;
    }
  }

  if (linesWithMethod > 0) {
    const mode =
      mixed > 0 && cash === 0 && stripe === 0
        ? "mixed"
        : cash > 0 && stripe === 0 && mixed === 0
          ? "cash"
          : stripe > 0 && cash === 0 && mixed === 0
            ? "stripe"
            : "split";
    return { cash, stripe, mixed, mode, ticketedLines: ticketed.length };
  }

  // Aucun paymentMethod sur les lignes → flags devis / colonnes paid_*
  const methods = normalizeTicketsPaymentMethods(quote);
  const cashPrice = sumItemsLineCash(ticketed) || getQuoteCashTotal(quote);
  const cardPrice = calculateCardPrice(cashPrice);
  const paidCash = Math.round(Number(quote?.paidCash) || 0);
  const paidStripe = Math.round(Number(quote?.paidStripe) || 0);

  if (methods.cash && methods.stripe) {
    return {
      cash: 0,
      stripe: 0,
      mixed: paidCash > 0 ? paidCash : cashPrice,
      mode: "mixed",
      ticketedLines: ticketed.length,
    };
  }
  if (methods.stripe && !methods.cash) {
    return {
      cash: 0,
      stripe: paidStripe > 0 ? paidStripe : cardPrice,
      mixed: 0,
      mode: "stripe",
      ticketedLines: ticketed.length,
    };
  }
  if (methods.cash && !methods.stripe) {
    return {
      cash: paidCash > 0 ? paidCash : cashPrice,
      stripe: 0,
      mixed: 0,
      mode: "cash",
      ticketedLines: ticketed.length,
    };
  }
  if (paidStripe > 0 && paidCash <= 0) {
    return {
      cash: 0,
      stripe: paidStripe,
      mixed: 0,
      mode: "stripe",
      ticketedLines: ticketed.length,
    };
  }
  if (paidCash > 0 && paidStripe <= 0) {
    return {
      cash: paidCash,
      stripe: 0,
      mixed: 0,
      mode: "cash",
      ticketedLines: ticketed.length,
    };
  }
  if (paidCash > 0 && paidStripe > 0) {
    return {
      cash: paidCash,
      stripe: paidStripe,
      mixed: 0,
      mode: "split",
      ticketedLines: ticketed.length,
    };
  }

  // Tickets sans mode de paiement ni paid_* → exclu (évite de compter du cash « inventé »)
  return null;
}

/**
 * Montants paid_cash / paid_stripe à persister d’après les lignes ticketées.
 * Mixte → paid_cash (base espèces) ; Stripe seul → paid_stripe (prix carte).
 */
export function computePaidColumnsFromItems(items = []) {
  const ticketed = (items || []).filter((it) => String(it?.ticketNumber || "").trim() !== "");
  let paidCash = 0;
  let paidStripe = 0;

  for (const it of ticketed) {
    const lineCash = Math.round(Number(it.lineTotal) || 0);
    const { cash: isCash, stripe: isStripe } = parseItemPaymentFlags(it.paymentMethod);
    if (isCash && isStripe) {
      paidCash += lineCash;
    } else if (isStripe) {
      paidStripe += calculateCardPrice(lineCash);
    } else if (isCash) {
      paidCash += lineCash;
    }
  }

  return { paidCash, paidStripe };
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
    splitCount: 0,
  };
}

/**
 * Agrège les encaissements par jour (Africa/Cairo).
 * @returns {{ byDay: Map, undatedPaidQuotes: number }}
 */
export function buildCollectionsByDay(quotes = []) {
  const byDay = new Map();
  let undatedPaidQuotes = 0;

  for (const quote of quotes || []) {
    const breakdown = getQuoteCollectionBreakdown(quote);
    if (!breakdown) continue;

    const enteredAt = resolveQuoteTicketsEnteredAt(quote);
    const dateKey = toLocalDateKey(enteredAt);
    if (!dateKey) {
      undatedPaidQuotes += 1;
      continue;
    }

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
    else if (breakdown.mode === "split") bucket.splitCount += 1;
  }

  return { byDay, undatedPaidQuotes };
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
    out.splitCount += bucket.splitCount || 0;
  }
  return out;
}
