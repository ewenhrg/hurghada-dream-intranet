import { SITE_KEY } from "../constants";
import { logger } from "./logger";
import { incrementTicketNumber, normalizeTicketNumberKey } from "./ticketCollections";

/** Longueur max d’un n° de carnet (ignore concaténations / typos 8+ chiffres). */
const CARNET_MAX_LEN = 7;
const CARNET_MIN_LEN = 3;
/**
 * Écart max toléré entre compteur et max historique.
 * Au-delà : on répare vers le bas, on ne remonte JAMAIS le compteur depuis un cache local pollué.
 */
const SEQUENCE_DRIFT_LIMIT = 50;

/**
 * Parse un n° de carnet pur (chiffres uniquement, longueur raisonnable).
 * @param {unknown} raw
 * @returns {{ n: number, len: number } | null}
 */
function parseCarnetTicketNumber(raw) {
  const s = String(raw || "").trim();
  if (!new RegExp(`^\\d{${CARNET_MIN_LEN},${CARNET_MAX_LEN}}$`).test(s)) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 1) return null;
  return { n, len: s.length };
}

/**
 * Plus grand n° de la série dominante (ex. 6 chiffres → 185498).
 * Ignore outliers isolés en haut de plage (ex. 195997 restés dans le cache local).
 * @param {Array} quotes
 * @returns {number} 0 si aucun
 */
export function findMaxTicketNumericValue(quotes) {
  /** @type {Map<number, number[]>} */
  const byLen = new Map();

  for (const quote of quotes || []) {
    for (const item of quote?.items || []) {
      const parsed = parseCarnetTicketNumber(item?.ticketNumber);
      if (!parsed) continue;
      const list = byLen.get(parsed.len) || [];
      list.push(parsed.n);
      byLen.set(parsed.len, list);
    }
  }

  if (byLen.size === 0) return 0;

  let bestLen = 0;
  let bestCount = -1;
  for (const [len, list] of byLen) {
    if (list.length > bestCount) {
      bestCount = list.length;
      bestLen = len;
    }
  }

  const values = (byLen.get(bestLen) || []).slice().sort((a, b) => a - b);
  if (values.length === 0) return 0;

  // Chaînes sans trou > DRIFT : on garde le max de la chaîne la plus longue
  // (évite qu’un plateau 19599x pollué en cache local écrase 185498).
  const unique = [];
  for (const n of values) {
    if (unique.length === 0 || unique[unique.length - 1] !== n) unique.push(n);
  }

  let bestChainMax = unique[0];
  let bestChainLen = 1;
  let chainStart = 0;
  for (let i = 1; i <= unique.length; i++) {
    const broken = i === unique.length || unique[i] - unique[i - 1] > SEQUENCE_DRIFT_LIMIT;
    if (!broken) continue;
    const len = i - chainStart;
    const chainMax = unique[i - 1];
    if (len > bestChainLen || (len === bestChainLen && chainMax > bestChainMax)) {
      bestChainLen = len;
      bestChainMax = chainMax;
    }
    chainStart = i;
  }
  return bestChainMax;
}

function buildUsedTicketKeys(quotes) {
  const used = new Set();
  for (const quote of quotes || []) {
    for (const item of quote?.items || []) {
      const key = normalizeTicketNumberKey(item?.ticketNumber);
      if (key) used.add(key);
    }
  }
  return used;
}

/**
 * Lit le prochain n° sans le consommer.
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 */
export async function peekTicketSequence(supabase) {
  if (!supabase) return { ok: false, error: new Error("Supabase non configuré"), nextValue: null };
  try {
    const { data, error } = await supabase
      .from("ticket_sequence")
      .select("next_value")
      .eq("site_key", SITE_KEY)
      .maybeSingle();
    if (error) {
      logger.warn("peek ticket_sequence:", error);
      return { ok: false, error, nextValue: null };
    }
    const nextValue = Number(data?.next_value);
    return {
      ok: true,
      error: null,
      nextValue: Number.isFinite(nextValue) && nextValue >= 1 ? nextValue : null,
    };
  } catch (err) {
    logger.warn("peek ticket_sequence exception:", err);
    return { ok: false, error: err, nextValue: null };
  }
}

/**
 * Monte le compteur partagé au minimum `minNext` (sans jamais le baisser).
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 */
export async function ensureTicketSequence(supabase, minNext = 1) {
  if (!supabase) return { ok: false, error: new Error("Supabase non configuré"), nextValue: null };
  try {
    const { data, error } = await supabase.rpc("ensure_ticket_sequence", {
      p_site_key: SITE_KEY,
      p_min_next: Math.max(1, Math.floor(Number(minNext) || 1)),
    });
    if (error) {
      logger.warn("ensure_ticket_sequence:", error);
      return { ok: false, error, nextValue: null };
    }
    const nextValue = Number(data?.next_value);
    return {
      ok: true,
      error: null,
      nextValue: Number.isFinite(nextValue) ? nextValue : null,
    };
  } catch (err) {
    logger.warn("ensure_ticket_sequence exception:", err);
    return { ok: false, error: err, nextValue: null };
  }
}

/**
 * Force le prochain n° (peut baisser — réparation / reprise de carnet).
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {number} nextValue
 */
export async function setTicketSequenceNext(supabase, nextValue) {
  if (!supabase) return { ok: false, error: new Error("Supabase non configuré"), nextValue: null };
  const n = Math.max(1, Math.floor(Number(nextValue) || 1));
  try {
    const { data, error } = await supabase.rpc("set_ticket_sequence_next", {
      p_site_key: SITE_KEY,
      p_next: n,
    });
    if (error) {
      logger.warn("set_ticket_sequence_next:", error);
      return { ok: false, error, nextValue: null };
    }
    const value = Number(data?.next_value);
    return {
      ok: true,
      error: null,
      nextValue: Number.isFinite(value) ? value : n,
    };
  } catch (err) {
    logger.warn("set_ticket_sequence_next exception:", err);
    return { ok: false, error: err, nextValue: null };
  }
}

/**
 * Aligne le compteur sur le max historique réel, sans consommer de n°.
 * Ne remonte jamais le compteur à partir d’un max local aberrant (cache pollué).
 * @returns {{ ok: boolean, nextValue: number|null, error?: Error }}
 */
export async function syncTicketSequenceBaseline(supabase, quotes) {
  const maxExisting = findMaxTicketNumericValue(quotes);
  const expectedNext = Math.max(1, maxExisting + 1);

  let peek = await peekTicketSequence(supabase);
  if (!peek.ok || peek.nextValue == null) {
    const seed = await ensureTicketSequence(supabase, expectedNext);
    return seed.ok
      ? { ok: true, nextValue: seed.nextValue ?? expectedNext, error: null }
      : { ok: false, nextValue: null, error: seed.error };
  }

  // Compteur trop haut (réservations annulées / cache) → forcer la suite réelle.
  if (peek.nextValue > expectedNext + SEQUENCE_DRIFT_LIMIT) {
    const repaired = await setTicketSequenceNext(supabase, expectedNext);
    if (repaired.ok) {
      return { ok: true, nextValue: repaired.nextValue ?? expectedNext, error: null };
    }
    logger.warn("Réparation compteur tickets échouée:", repaired.error);
    // Propose quand même le bon n° même si l’écriture RPC a échoué.
    return { ok: true, nextValue: expectedNext, error: null };
  }

  // Remonter seulement d’un petit écart (paiement frais pas encore reflété en base).
  if (
    peek.nextValue < expectedNext &&
    expectedNext - peek.nextValue <= SEQUENCE_DRIFT_LIMIT
  ) {
    const raised = await ensureTicketSequence(supabase, expectedNext);
    if (raised.ok) {
      return { ok: true, nextValue: raised.nextValue ?? expectedNext, error: null };
    }
  }

  // Si le max local est aberrant (expected >> peek), on ignore et on garde le peek.
  return { ok: true, nextValue: peek.nextValue, error: null };
}

/**
 * Propose `count` n° suivants SANS consommer le compteur.
 * Le compteur n’avance qu’à la validation via commitTicketSequenceAfterPayment.
 */
export async function suggestTicketNumbersForPayment(supabase, quotes, count) {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  if (n === 0) return { ok: true, numbers: [] };

  const baseline = await syncTicketSequenceBaseline(supabase, quotes);
  if (!baseline.ok || baseline.nextValue == null) {
    return { ok: false, numbers: [], error: baseline.error };
  }

  const used = buildUsedTicketKeys(quotes);
  const numbers = [];
  let cursor = String(baseline.nextValue);
  let guard = 0;
  while (numbers.length < n && guard < n + 500) {
    guard += 1;
    const key = normalizeTicketNumberKey(cursor);
    if (!key || used.has(key)) {
      const bumped = incrementTicketNumber(cursor, 1);
      if (!bumped) break;
      cursor = bumped;
      continue;
    }
    numbers.push(cursor);
    used.add(key);
    const bumped = incrementTicketNumber(cursor, 1);
    if (!bumped) break;
    cursor = bumped;
  }

  if (numbers.length !== n) {
    return {
      ok: false,
      numbers: [],
      error: new Error(`Suggestion incomplète (${numbers.length}/${n})`),
    };
  }

  return { ok: true, numbers, error: null };
}

/**
 * Après validation paiement : avance le compteur juste après le plus grand n° confirmé.
 * Ignore les n° aberrants (hors série carnet) pour ne pas re-polluer le compteur.
 */
export async function commitTicketSequenceAfterPayment(supabase, ticketNumbers) {
  let maxConfirmed = 0;
  for (const raw of ticketNumbers || []) {
    const parsed = parseCarnetTicketNumber(raw);
    if (!parsed) continue;
    // Garde-fou : ne pas committer un saut énorme (typo / ancien bug).
    if (maxConfirmed > 0 && parsed.n > maxConfirmed + SEQUENCE_DRIFT_LIMIT) continue;
    if (parsed.n > maxConfirmed) maxConfirmed = parsed.n;
  }
  if (maxConfirmed < 1) return { ok: true, nextValue: null, error: null };

  const peek = await peekTicketSequence(supabase);
  const peekVal = peek.nextValue;
  // Si on validerait un n° déjà largement dépassé / aberrant vs compteur, ramener d’abord.
  if (peekVal != null && maxConfirmed + 1 < peekVal - SEQUENCE_DRIFT_LIMIT) {
    // Validation d’un n° « normal » alors que le compteur a dérivé : réparer puis ensure.
    await setTicketSequenceNext(supabase, maxConfirmed + 1);
    return { ok: true, nextValue: maxConfirmed + 1, error: null };
  }
  if (peekVal != null && maxConfirmed > peekVal + SEQUENCE_DRIFT_LIMIT) {
    // N° saisi aberrant : ne pas monter le compteur jusque-là.
    logger.warn("commit ticket ignoré (n° trop éloigné du compteur):", maxConfirmed, "peek", peekVal);
    return { ok: true, nextValue: peekVal, error: null };
  }

  return ensureTicketSequence(supabase, maxConfirmed + 1);
}
