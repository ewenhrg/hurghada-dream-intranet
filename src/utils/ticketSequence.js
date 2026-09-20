import { SITE_KEY } from "../constants";
import { logger } from "./logger";
import { normalizeTicketNumberKey } from "./ticketCollections";

/** Longueur max d’un n° de carnet (ignore concaténations / typos 8+ chiffres). */
const CARNET_MAX_LEN = 7;
const CARNET_MIN_LEN = 3;
/** Écart max toléré entre le compteur et le max historique avant correction. */
const SEQUENCE_DRIFT_LIMIT = 10_000;

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
 * Plus grand n° de la série dominante (ex. 6 chiffres → 185493).
 * Ignore les concaténations / outliers (9+ chiffres, séries rare 7 chiffres).
 * @param {Array} quotes
 * @returns {number} 0 si aucun
 */
export function findMaxTicketNumericValue(quotes) {
  /** @type {Map<number, { count: number, max: number }>} */
  const byLen = new Map();

  for (const quote of quotes || []) {
    for (const item of quote?.items || []) {
      const parsed = parseCarnetTicketNumber(item?.ticketNumber);
      if (!parsed) continue;
      const cur = byLen.get(parsed.len) || { count: 0, max: 0 };
      cur.count += 1;
      if (parsed.n > cur.max) cur.max = parsed.n;
      byLen.set(parsed.len, cur);
    }
  }

  if (byLen.size === 0) return 0;

  let bestMax = 0;
  let bestCount = -1;
  for (const { count, max } of byLen.values()) {
    if (count > bestCount || (count === bestCount && max > bestMax)) {
      bestCount = count;
      bestMax = max;
    }
  }
  return bestMax;
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
 * Réserve atomiquement `count` numéros consécutifs (safe multi-PC).
 * @returns {{ ok: boolean, numbers: string[], error?: Error, start?: number, next?: number }}
 */
export async function reserveTicketNumbers(supabase, count) {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  if (n === 0) return { ok: true, numbers: [], start: null, next: null };
  if (!supabase) {
    return { ok: false, numbers: [], error: new Error("Supabase non configuré") };
  }
  try {
    const { data, error } = await supabase.rpc("reserve_ticket_numbers", {
      p_site_key: SITE_KEY,
      p_count: n,
    });
    if (error) {
      logger.warn("reserve_ticket_numbers:", error);
      return { ok: false, numbers: [], error };
    }
    const numbers = Array.isArray(data?.numbers)
      ? data.numbers.map((x) => String(x || "").trim()).filter(Boolean)
      : [];
    if (numbers.length !== n) {
      return {
        ok: false,
        numbers: [],
        error: new Error(`Réservation incomplète (${numbers.length}/${n})`),
      };
    }
    return {
      ok: true,
      numbers,
      start: data?.start != null ? Number(data.start) : null,
      next: data?.next != null ? Number(data.next) : null,
      error: null,
    };
  } catch (err) {
    logger.warn("reserve_ticket_numbers exception:", err);
    return { ok: false, numbers: [], error: err };
  }
}

/**
 * Prépare le compteur (max historique + 1) puis réserve `count` tickets.
 */
export async function reserveTicketNumbersForPayment(supabase, quotes, count) {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  if (n === 0) return { ok: true, numbers: [] };

  const maxExisting = findMaxTicketNumericValue(quotes);
  const expectedNext = Math.max(1, maxExisting + 1);
  let seed = await ensureTicketSequence(supabase, expectedNext);
  if (!seed.ok) {
    return { ok: false, numbers: [], error: seed.error };
  }

  // Répare un compteur dérivé (concaténations / outliers) qui ne peut plus baisser via ensure.
  if (
    seed.nextValue != null &&
    seed.nextValue > expectedNext + SEQUENCE_DRIFT_LIMIT
  ) {
    const repaired = await setTicketSequenceNext(supabase, expectedNext);
    if (repaired.ok) {
      seed = repaired;
    } else {
      logger.warn("Réparation compteur tickets échouée:", repaired.error);
    }
  }

  const reserved = await reserveTicketNumbers(supabase, n);
  if (!reserved.ok) return reserved;

  // Filet de sécurité côté client (en plus de l’atomicité SQL)
  const used = new Set();
  for (const quote of quotes || []) {
    for (const item of quote?.items || []) {
      const key = normalizeTicketNumberKey(item?.ticketNumber);
      if (key) used.add(key);
    }
  }
  for (const num of reserved.numbers) {
    const key = normalizeTicketNumberKey(num);
    if (used.has(key)) {
      return {
        ok: false,
        numbers: [],
        error: new Error(`Doublon détecté après réservation (${num}). Réessayez.`),
      };
    }
    used.add(key);
  }

  return reserved;
}
