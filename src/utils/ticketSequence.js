import { SITE_KEY } from "../constants";
import { logger } from "./logger";
import { normalizeTicketNumberKey } from "./ticketCollections";

/**
 * Plus grand suffixe numérique trouvé dans les tickets déjà enregistrés.
 * Sert à initialiser le compteur partagé sans recoller sur d’anciens carnets.
 * @param {Array} quotes
 * @returns {number} 0 si aucun
 */
export function findMaxTicketNumericValue(quotes) {
  let max = 0;
  for (const quote of quotes || []) {
    for (const item of quote?.items || []) {
      const raw = String(item?.ticketNumber || "").trim();
      if (!raw) continue;
      const match = raw.match(/(\d+)$/);
      if (!match) continue;
      try {
        const n = Number(match[1]);
        if (Number.isFinite(n) && n > max) max = n;
      } catch {
        // ignore
      }
    }
  }
  return max;
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
  const seed = await ensureTicketSequence(supabase, maxExisting + 1);
  if (!seed.ok) {
    return { ok: false, numbers: [], error: seed.error };
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
