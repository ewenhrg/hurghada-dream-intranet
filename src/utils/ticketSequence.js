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
/**
 * Zone du carnet en cours. Un compteur au-dessus est considéré dérivé
 * (ex. 195998) et peut être recalé ; on ne redescend jamais sous cette zone
 * à cause d’un cache local incomplet (ex. 168051).
 */
const CARNET_ZONE_MIN = 180000;
const CARNET_ZONE_MAX = 189999;
/** Avance max en tête de compteur pour sauter des n° déjà utilisés (pas un jump vers max). */
const ADVANCE_PAST_USED_LIMIT = 200;

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

function usedKeysToExcludeArray(used) {
  if (!used || typeof used[Symbol.iterator] !== "function") return [];
  return [...used].filter(Boolean);
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
      .select("next_value, updated_at")
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
 * Avance le compteur uniquement tant que la tête pointe un n° déjà distribué.
 * Ne saute JAMAIS un bloc jusqu’à max(historique) (source classique de trous).
 */
async function advancePastUsedHead(supabase, nextValue, used) {
  let next = Math.max(1, Math.floor(Number(nextValue) || 1));
  let guard = 0;
  while (guard < ADVANCE_PAST_USED_LIMIT && used.has(normalizeTicketNumberKey(String(next)))) {
    next += 1;
    guard += 1;
  }
  if (guard === 0) {
    return { ok: true, nextValue: nextValue, error: null };
  }
  const raised = await ensureTicketSequence(supabase, next);
  return raised.ok
    ? { ok: true, nextValue: raised.nextValue ?? next, error: null }
    : { ok: false, nextValue: next, error: raised.error };
}

/**
 * Aligne suggestion / compteur sans casser la suite réelle du carnet.
 * - Ne redescend JAMAIS vers un max local bas (cache incomplet → 168051).
 * - Recale seulement un compteur clairement hors zone (ex. 195998).
 * - N’avance la tête que n° par n° s’ils sont déjà utilisés (pas de jump max+1).
 */
export async function syncTicketSequenceBaseline(supabase, quotes) {
  const nums = collectCarnetNumbers(quotes);
  const maxExisting = findMaxTicketNumericValue(quotes);
  const expectedNext = Math.max(1, maxExisting + 1);
  const used = buildUsedTicketKeys(quotes);

  let peek = await peekTicketSequence(supabase);
  if (!peek.ok || peek.nextValue == null) {
    const seedAt = isInCurrentCarnetZone(expectedNext) ? expectedNext : CARNET_ZONE_MIN;
    const seed = await ensureTicketSequence(supabase, seedAt);
    if (!seed.ok) {
      return { ok: false, nextValue: null, error: seed.error };
    }
    const advanced = await advancePastUsedHead(supabase, seed.nextValue ?? seedAt, used);
    return {
      ok: advanced.ok,
      nextValue: advanced.nextValue,
      error: advanced.error,
    };
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
      const advanced = await advancePastUsedHead(supabase, repaired.nextValue ?? repairTo, used);
      return { ok: true, nextValue: advanced.nextValue ?? repairTo, error: null };
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
      const advanced = await advancePastUsedHead(supabase, repaired.nextValue ?? raiseTo, used);
      return { ok: true, nextValue: advanced.nextValue ?? raiseTo, error: null };
    }
    return { ok: true, nextValue: raiseTo, error: null };
  }

  // Uniquement : avancer la tête tant qu’elle pointe un n° déjà distribué.
  // (Plus de jump RAISE_LIMIT vers max+1 — ça sautait des n° non distribués.)
  const advanced = await advancePastUsedHead(supabase, next, used);
  return {
    ok: advanced.ok,
    nextValue: advanced.nextValue ?? next,
    error: advanced.error,
  };
}

/**
 * Réserve atomiquement `count` numéros (safe multi-PC). À utiliser uniquement à la validation.
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {number} count
 * @param {{ exclude?: Iterable<string>|string[] }} [options]
 */
export async function reserveTicketNumbers(supabase, count, options = {}) {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  if (n === 0) {
    return { ok: true, numbers: [], start: null, next: null, restoreNext: null };
  }
  if (!supabase) {
    return { ok: false, numbers: [], error: new Error("Supabase non configuré") };
  }
  const exclude = usedKeysToExcludeArray(options.exclude);
  try {
    const payload = {
      p_site_key: SITE_KEY,
      p_count: n,
    };
    if (exclude.length > 0) {
      payload.p_exclude = exclude;
    }
    const { data, error } = await supabase.rpc("reserve_ticket_numbers", payload);
    if (error) {
      // Ancienne signature SQL (sans p_exclude) : réessayer sans exclusion.
      if (exclude.length > 0 && /p_exclude|function.*reserve_ticket_numbers/i.test(String(error.message || ""))) {
        logger.warn("reserve_ticket_numbers sans p_exclude (SQL à mettre à jour):", error);
        const fallback = await supabase.rpc("reserve_ticket_numbers", {
          p_site_key: SITE_KEY,
          p_count: n,
        });
        if (fallback.error) {
          return { ok: false, numbers: [], error: fallback.error };
        }
        return parseReserveResult(fallback.data, n);
      }
      logger.warn("reserve_ticket_numbers:", error);
      return { ok: false, numbers: [], error };
    }
    return parseReserveResult(data, n);
  } catch (err) {
    logger.warn("reserve_ticket_numbers exception:", err);
    return { ok: false, numbers: [], error: err };
  }
}

function parseReserveResult(data, expectedCount) {
  const numbers = Array.isArray(data?.numbers)
    ? data.numbers.map((x) => String(x || "").trim()).filter(Boolean)
    : [];
  if (numbers.length !== expectedCount) {
    return {
      ok: false,
      numbers: [],
      error: new Error(`Réservation incomplète (${numbers.length}/${expectedCount})`),
    };
  }
  const start = data?.start != null ? Number(data.start) : null;
  const next = data?.next != null ? Number(data.next) : null;
  const firstNumeric = parseCarnetTicketNumber(numbers[0]);
  const restoreNext =
    Number.isFinite(start) && start >= 1
      ? start
      : firstNumeric != null
        ? firstNumeric
        : null;
  return {
    ok: true,
    numbers,
    start: Number.isFinite(start) ? start : null,
    next: Number.isFinite(next) ? next : null,
    restoreNext,
    error: null,
  };
}

/**
 * Annule une réservation : remet les n° en released (réutilisables) + CAS compteur si possible.
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {{ expectedNext?: number|null, restoreNext?: number|null, next?: number|null, start?: number|null, numbers?: string[] }} reservation
 */
export async function rollbackTicketReservation(supabase, reservation) {
  if (!supabase || !reservation) {
    return { ok: false, restored: false, error: new Error("Rollback impossible") };
  }
  const numbers = Array.isArray(reservation.numbers)
    ? reservation.numbers.map((x) => String(x || "").trim()).filter(Boolean)
    : [];
  const expectedNext = Number(reservation.expectedNext ?? reservation.next);
  const restoreNext = Number(reservation.restoreNext ?? reservation.start);
  try {
    const payload = {
      p_site_key: SITE_KEY,
      p_expected_next: Number.isFinite(expectedNext) ? expectedNext : null,
      p_restore_next: Number.isFinite(restoreNext) && restoreNext >= 1 ? restoreNext : null,
    };
    if (numbers.length > 0) payload.p_numbers = numbers;

    const { data, error } = await supabase.rpc("rollback_ticket_reservation", payload);
    if (error) {
      // Fallback : au moins relâcher les n° dans le registre.
      if (numbers.length > 0) {
        await releaseTicketAllocations(supabase, numbers);
      }
      logger.warn("rollback_ticket_reservation:", error);
      return { ok: false, restored: false, error };
    }
    return {
      ok: true,
      restored: data?.restored === true,
      nextValue: data?.next_value != null ? Number(data.next_value) : null,
      error: null,
    };
  } catch (err) {
    if (numbers.length > 0) {
      try {
        await releaseTicketAllocations(supabase, numbers);
      } catch {
        /* ignore */
      }
    }
    logger.warn("rollback_ticket_reservation exception:", err);
    return { ok: false, restored: false, error: err };
  }
}

/**
 * Confirme des n° held → assigned (après sync devis OK).
 */
export async function confirmTicketAllocations(supabase, ticketNumbers, quoteId = null) {
  const numbers = [...(ticketNumbers || [])].map((x) => String(x || "").trim()).filter(Boolean);
  if (!supabase || numbers.length === 0) return { ok: true, confirmed: 0 };
  try {
    const payload = {
      p_site_key: SITE_KEY,
      p_numbers: numbers,
    };
    if (quoteId != null && Number.isFinite(Number(quoteId))) {
      payload.p_quote_id = Number(quoteId);
    }
    const { data, error } = await supabase.rpc("confirm_ticket_allocations", payload);
    if (error) {
      logger.warn("confirm_ticket_allocations:", error);
      return { ok: false, confirmed: 0, error };
    }
    return { ok: true, confirmed: Number(data?.confirmed) || 0, error: null };
  } catch (err) {
    logger.warn("confirm_ticket_allocations exception:", err);
    return { ok: false, confirmed: 0, error: err };
  }
}

/**
 * Remet des n° dans le pool (released) pour réutilisation — suppression / échec sync.
 */
export async function releaseTicketAllocations(supabase, ticketNumbers) {
  const numbers = [...(ticketNumbers || [])].map((x) => String(x || "").trim()).filter(Boolean);
  if (!supabase || numbers.length === 0) return { ok: true, released: 0 };
  try {
    const { data, error } = await supabase.rpc("release_ticket_allocations", {
      p_site_key: SITE_KEY,
      p_numbers: numbers,
    });
    if (error) {
      logger.warn("release_ticket_allocations:", error);
      return { ok: false, released: 0, error };
    }
    return { ok: true, released: Number(data?.released) || 0, error: null };
  } catch (err) {
    logger.warn("release_ticket_allocations exception:", err);
    return { ok: false, released: 0, error: err };
  }
}

/**
 * Claim exclusif serveur de TOUS les n° d’un devis (anti-doublon multi-PC).
 * Doit être appelé AVANT le persist, pour auto ET manuel.
 * @returns {{ ok: boolean, claimed?: string[], conflicts?: string[], error?: Error }}
 */
export async function claimTicketNumbersForQuote(supabase, quoteId, ticketNumbers) {
  const numbers = [...(ticketNumbers || [])].map((x) => String(x || "").trim()).filter(Boolean);
  if (!supabase) {
    return { ok: false, claimed: [], conflicts: [], error: new Error("Supabase non configuré") };
  }
  if (numbers.length === 0) return { ok: true, claimed: [], conflicts: [] };

  const quoteDbId =
    quoteId != null && Number.isFinite(Number(quoteId)) ? Number(quoteId) : null;

  try {
    const { data, error } = await supabase.rpc("claim_ticket_numbers_for_quote", {
      p_site_key: SITE_KEY,
      p_quote_id: quoteDbId,
      p_numbers: numbers,
    });
    if (error) {
      logger.warn("claim_ticket_numbers_for_quote:", error);
      return { ok: false, claimed: [], conflicts: [], error };
    }
    const conflicts = Array.isArray(data?.conflicts)
      ? data.conflicts.map((x) => String(x || "")).filter(Boolean)
      : [];
    const claimed = Array.isArray(data?.claimed)
      ? data.claimed.map((x) => String(x || "")).filter(Boolean)
      : [];
    if (data?.ok === false || conflicts.length > 0) {
      return {
        ok: false,
        claimed,
        conflicts,
        error: new Error(
          conflicts.length
            ? `Numéro(s) déjà utilisés : ${conflicts.join(", ")}`
            : "Conflit de numéros de ticket"
        ),
      };
    }
    return { ok: true, claimed, conflicts: [], error: null };
  } catch (err) {
    logger.warn("claim_ticket_numbers_for_quote exception:", err);
    return { ok: false, claimed: [], conflicts: [], error: err };
  }
}

/**
 * N° released (trous) disponibles, triés croissant.
 */
async function peekReleasedTicketNumbers(supabase, limit = 50) {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from("ticket_allocations")
      .select("ticket_number")
      .eq("site_key", SITE_KEY)
      .eq("status", "released")
      .order("ticket_number", { ascending: true })
      .limit(Math.max(1, Math.min(200, limit)));
    if (error) {
      logger.warn("peek released tickets:", error);
      return [];
    }
    return (data || [])
      .map((r) => String(r.ticket_number || "").trim())
      .filter(Boolean)
      .sort((a, b) => {
        const na = parseCarnetTicketNumber(a);
        const nb = parseCarnetTicketNumber(b);
        if (na != null && nb != null) return na - nb;
        return a.localeCompare(b, undefined, { numeric: true });
      });
  } catch (err) {
    logger.warn("peek released tickets exception:", err);
    return [];
  }
}

/**
 * Propose `count` n° suivants SANS consommer le compteur.
 * Priorité aux trous (released), puis suite du compteur.
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
  const released = await peekReleasedTicketNumbers(supabase, n + 20);
  for (const candidate of released) {
    if (numbers.length >= n) break;
    const key = normalizeTicketNumberKey(candidate);
    if (!key || used.has(key)) continue;
    numbers.push(candidate);
    used.add(key);
  }

  let cursor = String(baseline.nextValue);
  let guard = 0;
  while (numbers.length < n && guard < n + ADVANCE_PAST_USED_LIMIT) {
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

  return { ok: true, numbers, nextValue: baseline.nextValue, error: null };
}

/**
 * Après validation : réserve atomiquement les n° auto (multi-PC).
 * Ne fait plus de ensure(max+1) global (source de trous).
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string[]} [_ticketNumbers] conservé pour compat (non utilisé pour l’exclude auto)
 * @param {{
 *   autoCount?: number,
 *   excludeKeys?: Iterable<string>|string[],
 *   quotes?: Array,
 *   keepTicketNumbers?: Iterable<string>|string[],
 * }} [options]
 * `excludeKeys` / `quotes` = n° déjà distribués ailleurs.
 * `keepTicketNumbers` = n° manuels de CE devis à ne pas réattribuer.
 * Ne pas passer les suggestions auto dans exclude/keep (elles seront remplacées).
 * @returns {{ ok: boolean, reservedNumbers?: string[], reservation?: object|null, error?: Error, nextValue?: number|null }}
 */
export async function commitTicketSequenceAfterPayment(supabase, _ticketNumbers, options = {}) {
  const autoCount = Math.max(0, Math.floor(Number(options.autoCount) || 0));
  let reservedNumbers = [];
  let reservation = null;

  const exclude =
    options.excludeKeys != null
      ? usedKeysToExcludeArray(options.excludeKeys)
      : usedKeysToExcludeArray(buildUsedTicketKeys(options.quotes));

  for (const raw of options.keepTicketNumbers || []) {
    const key = normalizeTicketNumberKey(raw);
    if (key && !exclude.includes(key)) exclude.push(key);
  }

  if (autoCount > 0) {
    const reserved = await reserveTicketNumbers(supabase, autoCount, { exclude });
    if (!reserved.ok) {
      return { ok: false, reservedNumbers: [], reservation: null, error: reserved.error };
    }
    reservedNumbers = reserved.numbers;
    reservation = {
      start: reserved.start,
      next: reserved.next,
      expectedNext: reserved.next,
      restoreNext: reserved.restoreNext,
      count: autoCount,
      numbers: reservedNumbers,
    };
  }

  return {
    ok: true,
    reservedNumbers,
    reservation,
    nextValue: reservation?.next ?? null,
    error: null,
  };
}
