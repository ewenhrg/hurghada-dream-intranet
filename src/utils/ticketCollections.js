import { calculateCardPrice, normalizeTicketsPaymentMethods } from "../utils";
import { toLocalDateKey } from "./quoteUserStats";

/**
 * Incrémente la partie numérique en fin de n° ticket (préfixe + padding conservés).
 * Ex. "T-1042" + 2 → "T-1044", "0099" + 1 → "0100".
 * @returns {string|null}
 */
export function incrementTicketNumber(base, delta = 1) {
  const s = String(base || "").trim();
  if (!s) return null;
  const match = s.match(/^(.*?)(\d+)$/);
  if (!match) return null;
  const [, prefix, digits] = match;
  const step = Number(delta);
  if (!Number.isFinite(step)) return null;
  try {
    const next = (BigInt(digits) + BigInt(Math.trunc(step))).toString();
    const padded = next.length >= digits.length ? next : next.padStart(digits.length, "0");
    return `${prefix}${padded}`;
  } catch {
    return null;
  }
}

/**
 * Propose les n° suivants à partir d’un premier ticket (longueur = count, index 0 = base).
 * @returns {string[]}
 */
export function suggestSequentialTicketNumbers(base, count) {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  if (n === 0) return [];
  const first = String(base || "").trim();
  if (!first) return Array(n).fill("");
  const out = [first];
  for (let i = 1; i < n; i++) {
    const next = incrementTicketNumber(first, i);
    if (!next) return out;
    out.push(next);
  }
  return out;
}

/** Clé normalisée pour comparer deux n° de ticket (insensible à la casse). */
export function normalizeTicketNumberKey(value) {
  return String(value || "").trim().toLowerCase();
}

/** Identifiant de devis normalisé (évite les écarts string / number). */
export function normalizeQuoteId(id) {
  if (id == null || id === "") return "";
  return String(id).trim();
}

/** Clé logique pour regrouper les doublons local / Supabase du même devis. */
export function getQuoteIdentityKey(quote) {
  if (!quote) return "";
  const supabaseId = quote.supabase_id ?? quote.supabaseId;
  if (supabaseId != null && normalizeQuoteId(supabaseId)) {
    return `sb:${normalizeQuoteId(supabaseId)}`;
  }
  const phone = String(quote.client?.phone || "").trim();
  const createdAt = String(quote.createdAt || quote.created_at || "").trim();
  if (phone && createdAt) return `ph:${phone}|${createdAt}`;
  return `id:${normalizeQuoteId(quote.id)}`;
}

/** Même devis malgré des ids locaux / Supabase différents. */
export function isSameQuote(a, b) {
  if (!a || !b) return false;
  const idA = normalizeQuoteId(a.id);
  const idB = normalizeQuoteId(b.id);
  if (idA && idB && idA === idB) return true;

  const supabaseA = normalizeQuoteId(a.supabase_id ?? a.supabaseId);
  const supabaseB = normalizeQuoteId(b.supabase_id ?? b.supabaseId);
  if (supabaseA && supabaseB && supabaseA === supabaseB) return true;
  if (supabaseA && idB && supabaseA === idB) return true;
  if (supabaseB && idA && supabaseB === idA) return true;

  const phoneA = String(a.client?.phone || "").trim();
  const phoneB = String(b.client?.phone || "").trim();
  const createdA = String(a.createdAt || a.created_at || "").trim();
  const createdB = String(b.createdAt || b.created_at || "").trim();
  return Boolean(phoneA && createdA && phoneA === phoneB && createdA === createdB);
}

function quoteCanonicalScore(quote) {
  let score = 0;
  if (quote?.supabase_id ?? quote?.supabaseId) score += 1_000_000;
  const ticketCount = (quote?.items || []).filter((it) =>
    String(it?.ticketNumber || "").trim()
  ).length;
  score += ticketCount * 1_000;
  const updated = new Date(quote?.updated_at || quote?.updatedAt || quote?.createdAt || 0).getTime();
  if (Number.isFinite(updated)) score += updated / 1_000_000_000_000;
  return score;
}

/** Un seul exemplaire par devis logique (évite les doublons local + Supabase). */
function pickCanonicalQuotes(quotes) {
  const byKey = new Map();
  for (const quote of quotes || []) {
    const key = getQuoteIdentityKey(quote);
    const prev = byKey.get(key);
    if (!prev || quoteCanonicalScore(quote) > quoteCanonicalScore(prev)) {
      byKey.set(key, quote);
    }
  }
  return [...byKey.values()];
}

function findQuoteByAnyId(quotes, quoteId) {
  const nid = normalizeQuoteId(quoteId);
  if (!nid) return null;
  return (
    (quotes || []).find(
      (q) =>
        normalizeQuoteId(q.id) === nid ||
        normalizeQuoteId(q.supabase_id ?? q.supabaseId) === nid
    ) || null
  );
}

/** Trouve un devis par id local ou Supabase. */
export function resolveQuoteById(quotes, quoteId) {
  return findQuoteByAnyId(quotes, quoteId);
}

/**
 * Index des n° déjà utilisés dans les devis.
 * @param {object[]} quotes
 * @param {{ excludeQuoteId?: string, excludeItemIndex?: number }} [opts]
 */
export function buildUsedTicketNumberMap(quotes, opts = {}) {
  const map = new Map();
  const excludeQuote = opts.excludeQuoteId ? findQuoteByAnyId(quotes, opts.excludeQuoteId) : null;
  const canonicalQuotes = pickCanonicalQuotes(quotes);

  for (const quote of canonicalQuotes) {
    const skipQuote = Boolean(excludeQuote && isSameQuote(quote, excludeQuote));
    (quote.items || []).forEach((item, itemIndex) => {
      if (skipQuote) {
        if (opts.excludeItemIndex == null) return;
        if (itemIndex === opts.excludeItemIndex) return;
      }
      const ticketNumber = String(item?.ticketNumber || "").trim();
      if (!ticketNumber) return;
      const key = normalizeTicketNumberKey(ticketNumber);
      if (!map.has(key)) {
        map.set(key, { quoteId: quote.id, ticketNumber, activityName: item.activityName || "" });
      }
    });
  }
  return map;
}

/**
 * Conflit pour un seul n° (édition Situation, contrôle à la volée).
 * @returns {{ ticketNumber: string, quoteId: string, activityName: string } | null}
 */
export function findTicketNumberConflict(quotes, ticketNumber, opts = {}) {
  const trimmed = String(ticketNumber || "").trim();
  if (!trimmed) return null;
  const key = normalizeTicketNumberKey(trimmed);
  const used = buildUsedTicketNumberMap(quotes, opts);
  const hit = used.get(key);
  return hit ? { ...hit, ticketNumber: trimmed } : null;
}

/**
 * Erreurs par index de ligne (doublons dans le formulaire + n° déjà pris ailleurs).
 * @param {Record<number, string>|string[]} drafts
 * @returns {Record<number, string>}
 */
export function getTicketNumberFieldErrors(quotes, quoteId, drafts, itemCount) {
  /** @type {Record<number, string>} */
  const errors = {};
  const values = [];
  for (let i = 0; i < itemCount; i++) {
    values[i] = String(Array.isArray(drafts) ? drafts[i] : drafts?.[i] ?? "").trim();
  }

  const currentQuote = findQuoteByAnyId(quotes, quoteId);
  const ownedOnQuote = new Set();
  if (currentQuote) {
    (currentQuote.items || []).forEach((item) => {
      const num = String(item?.ticketNumber || "").trim();
      if (num) ownedOnQuote.add(normalizeTicketNumberKey(num));
    });
  }

  const usedElsewhere = buildUsedTicketNumberMap(quotes, { excludeQuoteId: quoteId });
  const seenInForm = new Map();

  for (let i = 0; i < values.length; i++) {
    const num = values[i];
    if (!num) continue;
    const key = normalizeTicketNumberKey(num);
    if (seenInForm.has(key)) {
      errors[i] = `Numéro en double dans le devis : ${num}`;
      continue;
    }
    seenInForm.set(key, i);
    if (usedElsewhere.has(key) && !ownedOnQuote.has(key)) {
      errors[i] = `Numéro déjà utilisé : ${num}`;
    }
  }
  return errors;
}

/**
 * Valide tous les n° d’un devis avant enregistrement.
 * @returns {{ ok: true } | { ok: false, message: string }}
 */
export function validateQuoteTicketNumbers(quotes, quoteId, ticketNumbers) {
  const list = Array.isArray(ticketNumbers) ? ticketNumbers : [];
  for (let i = 0; i < list.length; i++) {
    const num = String(list[i] || "").trim();
    if (!num) continue;
    const key = normalizeTicketNumberKey(num);
    for (let j = i + 1; j < list.length; j++) {
      const other = String(list[j] || "").trim();
      if (other && normalizeTicketNumberKey(other) === key) {
        return { ok: false, message: `Numéro en double dans le devis : ${num}` };
      }
    }
  }

  const currentQuote = findQuoteByAnyId(quotes, quoteId);
  const ownedOnQuote = new Set();
  if (currentQuote) {
    (currentQuote.items || []).forEach((item) => {
      const num = String(item?.ticketNumber || "").trim();
      if (num) ownedOnQuote.add(normalizeTicketNumberKey(num));
    });
  }

  const usedElsewhere = buildUsedTicketNumberMap(quotes, { excludeQuoteId: quoteId });
  for (const raw of list) {
    const num = String(raw || "").trim();
    if (!num) continue;
    const key = normalizeTicketNumberKey(num);
    if (usedElsewhere.has(key) && !ownedOnQuote.has(key)) {
      return { ok: false, message: `Numéro déjà utilisé : ${num}` };
    }
  }
  return { ok: true };
}

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
 * Instant d’encaissement :
 * 1) ticketsEnteredAt (Pay)
 * 2) sinon updated_at / createdAt si des tickets existent (anciens devis — jour approx.)
 */
export function resolveQuoteTicketsEnteredAt(quote) {
  const times = [];
  const top = String(quote?.ticketsEnteredAt || "").trim();
  if (top && !Number.isNaN(Date.parse(top))) times.push(top);

  for (const it of getTicketedItems(quote)) {
    const t = String(it?.ticketsEnteredAt || it?.tickets_entered_at || "").trim();
    if (t && !Number.isNaN(Date.parse(t))) times.push(t);
  }

  if (times.length) {
    times.sort();
    return { at: times[0], approximate: false };
  }

  // Anciens devis payés avant la date d’encaissement : dernière MAJ / création
  if (getTicketedItems(quote).length > 0) {
    const fallback = String(
      quote?.updated_at || quote?.updatedAt || quote?.createdAt || quote?.created_at || ""
    ).trim();
    if (fallback && !Number.isNaN(Date.parse(fallback))) {
      return { at: fallback, approximate: true };
    }
  }

  return { at: null, approximate: false };
}

/**
 * Répartition cash / stripe / mixte — uniquement les lignes avec n° ticket.
 * Stripe = +3 % une seule fois sur la somme espèces des lignes Stripe
 * (pas de Math.ceil par ligne, sinon écart vs total devis).
 * Sans mode de paiement : compté en cash (historique / tickets saisis).
 */
export function getQuoteCollectionBreakdown(quote) {
  const ticketed = getTicketedItems(quote);
  if (!ticketed.length) return null;

  let cash = 0;
  let stripeCashBase = 0;
  let mixed = 0;
  let linesWithMethod = 0;
  let linesWithoutMethodCash = 0;

  for (const it of ticketed) {
    const lineCash = Math.round(Number(it.lineTotal) || 0);
    const { cash: isCash, stripe: isStripe } = parseItemPaymentFlags(it.paymentMethod);

    if (!isCash && !isStripe) {
      linesWithoutMethodCash += lineCash;
      continue;
    }
    linesWithMethod += 1;

    if (isCash && isStripe) {
      mixed += lineCash;
    } else if (isStripe) {
      stripeCashBase += lineCash;
    } else {
      cash += lineCash;
    }
  }

  const stripe = stripeCashBase > 0 ? calculateCardPrice(stripeCashBase) : 0;

  if (linesWithMethod > 0) {
    // Lignes sans mode sur le même devis → cash (reste)
    cash += linesWithoutMethodCash;
    // Si tous les lineTotal sont 0, basculer sur le total devis
    if (cash + stripe + mixed === 0) {
      const fallback = getQuoteCashTotal(quote);
      const methods = normalizeTicketsPaymentMethods(quote);
      if (methods.stripe && !methods.cash) {
        return {
          cash: 0,
          stripe: calculateCardPrice(fallback),
          mixed: 0,
          mode: "stripe",
          ticketedLines: ticketed.length,
        };
      }
      if (methods.cash && methods.stripe) {
        return {
          cash: 0,
          stripe: 0,
          mixed: fallback,
          mode: "mixed",
          ticketedLines: ticketed.length,
        };
      }
      return {
        cash: fallback,
        stripe: 0,
        mixed: 0,
        mode: "cash",
        ticketedLines: ticketed.length,
      };
    }
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

  // Aucun paymentMethod sur les lignes → flags devis / colonnes paid_* / défaut cash
  const methods = normalizeTicketsPaymentMethods(quote);
  const cashPrice =
    sumItemsLineCash(ticketed) > 0 ? sumItemsLineCash(ticketed) : getQuoteCashTotal(quote);
  const cardPrice = calculateCardPrice(cashPrice);
  const paidCash = Math.round(Number(quote?.paidCash) || 0);
  const paidStripe = Math.round(Number(quote?.paidStripe) || 0);

  if (methods.cash && methods.stripe) {
    // Mixte : utiliser les montants saisis si dispo, sinon fallback total cash en « mixed »
    if (paidCash > 0 || paidStripe > 0) {
      return {
        cash: paidCash,
        stripe: paidStripe,
        mixed: 0,
        mode: "split",
        ticketedLines: ticketed.length,
      };
    }
    return {
      cash: 0,
      stripe: 0,
      mixed: cashPrice,
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

  // Tickets saisis sans mode → cash (comportement historique)
  if (cashPrice > 0) {
    return {
      cash: cashPrice,
      stripe: 0,
      mixed: 0,
      mode: "cash",
      ticketedLines: ticketed.length,
    };
  }

  return null;
}

/**
 * Montants paid_cash / paid_stripe à persister d’après les lignes ticketées.
 * Mixte → paid_cash (base espèces) ; Stripe seul → paid_stripe = ceil(+3 %) une fois
 * sur la somme des lignes Stripe (aligné sur le total carte du devis).
 */
export function computePaidColumnsFromItems(items = []) {
  const ticketed = (items || []).filter((it) => String(it?.ticketNumber || "").trim() !== "");
  let paidCash = 0;
  let stripeCashBase = 0;

  for (const it of ticketed) {
    const lineCash = Math.round(Number(it.lineTotal) || 0);
    const { cash: isCash, stripe: isStripe } = parseItemPaymentFlags(it.paymentMethod);
    if (isCash && isStripe) {
      paidCash += lineCash;
    } else if (isStripe) {
      stripeCashBase += lineCash;
    } else if (isCash) {
      paidCash += lineCash;
    }
  }

  return {
    paidCash,
    paidStripe: stripeCashBase > 0 ? calculateCardPrice(stripeCashBase) : 0,
  };
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
 * @returns {{ byDay: Map, undatedPaidQuotes: number, approximateDateQuotes: number }}
 */
export function buildCollectionsByDay(quotes = []) {
  const byDay = new Map();
  let undatedPaidQuotes = 0;
  let approximateDateQuotes = 0;

  for (const quote of quotes || []) {
    const breakdown = getQuoteCollectionBreakdown(quote);
    if (!breakdown) continue;

    const resolved = resolveQuoteTicketsEnteredAt(quote);
    const enteredAt = resolved?.at || null;
    const dateKey = toLocalDateKey(enteredAt);
    if (!dateKey) {
      undatedPaidQuotes += 1;
      continue;
    }
    if (resolved.approximate) approximateDateQuotes += 1;

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

  return { byDay, undatedPaidQuotes, approximateDateQuotes };
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
