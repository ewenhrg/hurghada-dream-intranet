import { SITE_KEY } from "../constants";
import { logger } from "./logger";
import { incrementTicketNumber, normalizeTicketNumberKey } from "./ticketCollections";

/** Carnets actuels = 6 chiffres (ignore concaténations / typos). */
const CARNET_LEN = 6;
/**
 * Fenêtre de densité pour valider un max (outliers isolés type 195998).
 * Au-delà de cet écart sans tickets voisins → outlier.
 */
const SUPPORT_WINDOW = 500;
const MIN_SUPPORT = 5;
/** Petit rattrapage compteur si un paiement vient d’être saisi localement. */
const RAISE_LIMIT = 50;
/**
 * Zone du carnet en cours. Un compteur au-dessus est considéré dérivé
 * (ex. 195998) et peut être recalé ; on ne redescend jamais sous cette zone
 * à cause d’un cache local incomplet (ex. 168051).
 */
const CARNET_ZONE_MIN = 180000;
const CARNET_ZONE_MAX = 189999;

/**
 * @param {unknown} raw
 * @returns {number | null}
 */
function parseCarnetTicketNumber(raw) {
  const s = String(raw || "").trim();
  if (!new RegExp(`^\\d{${CARNET_LEN}}$`).test(s)) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 1) return null;
  return n;
}

function collectCarnetNumbers(quotes) {
  const nums = [];
  for (const quote of quotes || []) {
    for (const item of quote?.items || []) {
      const n = parseCarnetTicketNumber(item?.ticketNumber);
      if (n != null) nums.push(n);
    }
  }
  return nums;
}

function countSupport(nums, center, window = SUPPORT_WINDOW) {
  let c = 0;
  for (const n of nums) {
    if (n >= center - window && n <= center) c += 1;
  }
  return c;
}

/**
 * Plus grand n° de carnet 6 chiffres avec support local (ignore 195998 isolé).
 * @param {Array} quotes
 * @returns {number} 0 si aucun
 */
export function findMaxTicketNumericValue(quotes) {
  const nums = collectCarnetNumbers(quotes);
  if (nums.length === 0) return 0;

  let max = Math.max(...nums);
  // Retire les plateaux hauts isolés (peu de voisins).
  while (max > 0 && countSupport(nums, max) < MIN_SUPPORT) {
    const lower = nums.filter((n) => n < max);
    if (lower.length === 0) break;
    max = Math.max(...lower);
  }
  return max;
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
 * Force le prochain n° (peut baisser — réparation ciblée uniquement).
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

function isInCurrentCarnetZone(n) {
  return n >= CARNET_ZONE_MIN && n <= CARNET_ZONE_MAX;
}

/**
 * Aligne suggestion / compteur sans casser la suite réelle du carnet.
 * - Ne redescend JAMAIS vers un max local bas (cache incomplet → 168051).
 * - Recale seulement un compteur clairement hors zone (ex. 195998).
 */
export async function syncTicketSequenceBaseline(supabase, quotes) {
  const nums = collectCarnetNumbers(quotes);
  const maxExisting = findMaxTicketNumericValue(quotes);
  const expectedNext = Math.max(1, maxExisting + 1);

  let peek = await peekTicketSequence(supabase);
  if (!peek.ok || peek.nextValue == null) {
    const seedAt = isInCurrentCarnetZone(expectedNext) ? expectedNext : CARNET_ZONE_MIN;
    const seed = await ensureTicketSequence(supabase, seedAt);
    return seed.ok
      ? { ok: true, nextValue: seed.nextValue ?? seedAt, error: null }
      : { ok: false, nextValue: null, error: seed.error };
  }

  let next = peek.nextValue;

  // Compteur hors zone haute (dérive type 195998) → recaler sur le max supporté dans la zone.
  if (next > CARNET_ZONE_MAX) {
    const zoneMax = nums.filter((n) => isInCurrentCarnetZone(n));
    const repairTo =
      zoneMax.length > 0
        ? Math.max(...zoneMax) + 1
        : isInCurrentCarnetZone(expectedNext)
          ? expectedNext
          : CARNET_ZONE_MIN;
    const repaired = await setTicketSequenceNext(supabase, repairTo);
    if (repaired.ok) {
      return { ok: true, nextValue: repaired.nextValue ?? repairTo, error: null };
    }
    logger.warn("Réparation compteur hors zone échouée:", repaired.error);
    return { ok: true, nextValue: repairTo, error: null };
  }

  // Compteur trop bas hors zone (ex. 168051 après mauvaise réparation) → remonter dans la zone.
  if (next < CARNET_ZONE_MIN) {
    const zoneMax = nums.filter((n) => isInCurrentCarnetZone(n));
    const raiseTo =
      zoneMax.length > 0
        ? Math.max(...zoneMax) + 1
        : isInCurrentCarnetZone(expectedNext)
          ? expectedNext
          : 185499;
    const repaired = await setTicketSequenceNext(supabase, raiseTo);
    if (repaired.ok) {
      return { ok: true, nextValue: repaired.nextValue ?? raiseTo, error: null };
    }
    return { ok: true, nextValue: raiseTo, error: null };
  }

  // Petit rattrapage si le max local (zone) est juste devant le peek.
  if (
    isInCurrentCarnetZone(expectedNext) &&
    expectedNext > next &&
    expectedNext - next <= RAISE_LIMIT &&
    countSupport(nums, expectedNext - 1) >= MIN_SUPPORT
  ) {
    const raised = await ensureTicketSequence(supabase, expectedNext);
    if (raised.ok && raised.nextValue != null) next = raised.nextValue;
  }

  return { ok: true, nextValue: next, error: null };
}

/**
 * Propose `count` n° suivants SANS consommer le compteur.
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
 * Après validation paiement : avance le compteur juste après le plus grand n° confirmé (zone carnet).
 */
export async function commitTicketSequenceAfterPayment(supabase, ticketNumbers) {
  let maxConfirmed = 0;
  for (const raw of ticketNumbers || []) {
    const n = parseCarnetTicketNumber(raw);
    if (n == null || !isInCurrentCarnetZone(n)) continue;
    if (n > maxConfirmed) maxConfirmed = n;
  }
  if (maxConfirmed < 1) return { ok: true, nextValue: null, error: null };
  return ensureTicketSequence(supabase, maxConfirmed + 1);
}
