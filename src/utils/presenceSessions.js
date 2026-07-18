import { SITE_KEY, LS_KEYS } from "../constants";
import { loadLS, saveLS } from "../utils";
import { supabase, __SUPABASE_DEBUG__ } from "../lib/supabase";
import { toLocalDateKey, personNamesMatch, nextBusinessDayStartMs } from "./quoteUserStats";
import { logger } from "./logger";

const LOCAL_MAX = 800;
const STALE_MS = 3 * 60 * 1000;

function nowIso() {
  return new Date().toISOString();
}

function normalizeName(name) {
  return String(name || "").trim();
}

function normalizeCode(code) {
  return code != null && String(code).trim() !== "" ? String(code).trim() : "";
}

function readLocalSessions() {
  const rows = loadLS(LS_KEYS.presenceSessions, []);
  return Array.isArray(rows) ? rows : [];
}

function writeLocalSessions(rows) {
  const trimmed = rows.slice(-LOCAL_MAX);
  saveLS(LS_KEYS.presenceSessions, trimmed);
  return trimmed;
}

function upsertLocalSession(row) {
  const rows = readLocalSessions();
  const idx = rows.findIndex((r) => r.id === row.id);
  if (idx >= 0) rows[idx] = { ...rows[idx], ...row };
  else rows.push(row);
  writeLocalSessions(rows);
  return row;
}

/** Ferme toutes les sessions locales encore ouvertes pour un session_key donné. */
function closeLocalOpenSessionsForKey(sessionKey, at) {
  const key = String(sessionKey || "");
  if (!key) return;
  const rows = readLocalSessions();
  let changed = false;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].session_key === key && !rows[i].ended_at) {
      rows[i] = { ...rows[i], ended_at: at, last_seen_at: at };
      changed = true;
    }
  }
  if (changed) writeLocalSessions(rows);
}

/**
 * Démarre une session de présence (Supabase si dispo + miroir localStorage).
 * Ferme d'abord toute session ouverte pour le même onglet (session_key).
 * @returns {Promise<string|null>} id de session
 */
export async function startPresenceSession({ sessionKey, user }) {
  const startedAt = nowIso();
  const key = String(sessionKey || "");

  // Évite les doublons d'onglet : fermer les sessions ouvertes du même session_key
  closeLocalOpenSessionsForKey(key, startedAt);
  if (__SUPABASE_DEBUG__?.isConfigured && supabase && key) {
    try {
      await supabase
        .from("intranet_presence_sessions")
        .update({ ended_at: startedAt, last_seen_at: startedAt })
        .eq("site_key", SITE_KEY)
        .eq("session_key", key)
        .is("ended_at", null);
    } catch {
      /* ignore */
    }
  }

  const localId =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `local-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  const base = {
    id: localId,
    site_key: SITE_KEY,
    session_key: key,
    user_code: normalizeCode(user?.code),
    user_name: normalizeName(user?.name) || "—",
    user_id: user?.id != null ? String(user.id) : "",
    started_at: startedAt,
    ended_at: null,
    last_seen_at: startedAt,
  };

  upsertLocalSession(base);

  if (!__SUPABASE_DEBUG__?.isConfigured || !supabase) return localId;

  try {
    const { data, error } = await supabase
      .from("intranet_presence_sessions")
      .insert({
        site_key: base.site_key,
        session_key: base.session_key,
        user_code: base.user_code,
        user_name: base.user_name,
        user_id: base.user_id,
        started_at: startedAt,
        last_seen_at: startedAt,
      })
      .select("id")
      .single();

    if (error) {
      logger.warn("Présence sessions : insert Supabase", error.message || error);
      return localId;
    }

    const remoteId = data?.id || localId;
    const rows = readLocalSessions().filter((r) => r.id !== localId);
    rows.push({ ...base, id: remoteId });
    writeLocalSessions(rows);
    return remoteId;
  } catch (err) {
    logger.warn("Présence sessions : insert", err);
    return localId;
  }
}

/**
 * Heartbeat : met à jour last_seen_at uniquement.
 * Ne rouvre JAMAIS une session déjà terminée (ended_at).
 */
export async function touchPresenceSession(sessionId) {
  if (!sessionId) return;
  const at = nowIso();
  const rows = readLocalSessions();
  const idx = rows.findIndex((r) => r.id === sessionId);
  if (idx >= 0) {
    if (rows[idx].ended_at) return;
    rows[idx] = { ...rows[idx], last_seen_at: at };
    writeLocalSessions(rows);
  }

  if (!__SUPABASE_DEBUG__?.isConfigured || !supabase) return;
  try {
    await supabase
      .from("intranet_presence_sessions")
      .update({ last_seen_at: at })
      .eq("id", sessionId)
      .is("ended_at", null);
  } catch {
    /* ignore */
  }
}

export async function endPresenceSession(sessionId) {
  if (!sessionId) return;
  const at = nowIso();
  const rows = readLocalSessions();
  const idx = rows.findIndex((r) => r.id === sessionId);
  if (idx >= 0) {
    rows[idx] = { ...rows[idx], ended_at: at, last_seen_at: at };
    writeLocalSessions(rows);
  }

  if (!__SUPABASE_DEBUG__?.isConfigured || !supabase) return;

  try {
    await supabase
      .from("intranet_presence_sessions")
      .update({ ended_at: at, last_seen_at: at })
      .eq("id", sessionId);
  } catch {
    /* ignore */
  }
}

/**
 * Charge les sessions (Supabase + fusion local), pour le tableau de bord.
 * @param {{ days?: number }} opts
 * @returns {Promise<{ rows: Array, remoteCount: number, remoteError: string|null }>}
 */
export async function loadPresenceSessions({ days = 90 } = {}) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceIso = since.toISOString();
  const sinceMs = since.getTime();

  let remote = [];
  let remoteError = null;
  if (__SUPABASE_DEBUG__?.isConfigured && supabase) {
    try {
      // IMPORTANT : utiliser .gte() (paramètres encodés) et NON .or(`...gte.${iso}`)
      // car les ":" d'un ISO cassent le parseur PostgREST → 0 ligne remote → seuls
      // les temps locaux (utilisateur courant) apparaissaient.
      const { data, error } = await supabase
        .from("intranet_presence_sessions")
        .select("id, site_key, session_key, user_code, user_name, user_id, started_at, ended_at, last_seen_at")
        .eq("site_key", SITE_KEY)
        .gte("started_at", sinceIso)
        .order("started_at", { ascending: false })
        .limit(5000);

      if (error) {
        remoteError = error.message || String(error);
        logger.warn("Présence sessions : lecture Supabase", remoteError);
      } else if (Array.isArray(data)) {
        remote = data;
      }

      // Sessions ouvertes démarrées avant la fenêtre mais encore actives récemment
      try {
        const { data: openData, error: openError } = await supabase
          .from("intranet_presence_sessions")
          .select("id, site_key, session_key, user_code, user_name, user_id, started_at, ended_at, last_seen_at")
          .eq("site_key", SITE_KEY)
          .is("ended_at", null)
          .gte("last_seen_at", sinceIso)
          .lt("started_at", sinceIso)
          .order("last_seen_at", { ascending: false })
          .limit(500);

        if (!openError && Array.isArray(openData) && openData.length) {
          const seen = new Set(remote.map((r) => r.id));
          for (const row of openData) {
            if (row?.id && !seen.has(row.id)) remote.push(row);
          }
        }
      } catch {
        /* optionnel */
      }
    } catch (err) {
      remoteError = err?.message || String(err);
      logger.warn("Présence sessions : lecture", err);
    }
  }

  const local = readLocalSessions().filter((r) => {
    const started = Date.parse(r.started_at || "");
    const lastSeen = Date.parse(r.last_seen_at || r.ended_at || r.started_at || "");
    if (Number.isFinite(started) && started >= sinceMs) return true;
    if (!r.ended_at && Number.isFinite(lastSeen) && lastSeen >= sinceMs) return true;
    return false;
  });

  // Fusion par id — préférer la version remote (UUID) à un clone local
  const byId = new Map();
  for (const row of [...local, ...remote]) {
    if (!row?.id) continue;
    const prev = byId.get(row.id);
    if (!prev) {
      byId.set(row.id, row);
      continue;
    }
    const prevSeen = Date.parse(prev.last_seen_at || prev.ended_at || prev.started_at || 0);
    const nextSeen = Date.parse(row.last_seen_at || row.ended_at || row.started_at || 0);
    const preferRemote = !String(row.id).startsWith("local-") && String(prev.id).startsWith("local-");
    byId.set(
      row.id,
      preferRemote || nextSeen >= prevSeen ? { ...prev, ...row } : { ...row, ...prev }
    );
  }

  // Dédupliquer les clones local/remote avec même session_key + started_at
  const byLogical = new Map();
  for (const row of byId.values()) {
    const logicalKey = `${row.session_key || ""}|${row.started_at || ""}`;
    const prev = byLogical.get(logicalKey);
    if (!prev) {
      byLogical.set(logicalKey, row);
      continue;
    }
    const prevIsLocal = String(prev.id).startsWith("local-");
    const nextIsLocal = String(row.id).startsWith("local-");
    if (prevIsLocal && !nextIsLocal) {
      byLogical.set(logicalKey, { ...prev, ...row, id: row.id });
    } else if (!prevIsLocal && nextIsLocal) {
      byLogical.set(logicalKey, { ...row, ...prev, id: prev.id });
    } else {
      const prevSeen = Date.parse(prev.last_seen_at || prev.ended_at || 0);
      const nextSeen = Date.parse(row.last_seen_at || row.ended_at || 0);
      byLogical.set(logicalKey, nextSeen >= prevSeen ? { ...prev, ...row } : { ...row, ...prev });
    }
  }

  return {
    rows: [...byLogical.values()],
    remoteCount: remote.length,
    remoteError,
  };
}

function sessionEndMs(row, now = Date.now()) {
  const ended = Date.parse(row.ended_at || "");
  if (Number.isFinite(ended)) return ended;
  const lastSeen = Date.parse(row.last_seen_at || row.started_at || "");
  if (!Number.isFinite(lastSeen)) return now;
  // Session ouverte sans heartbeat récent → on coupe à last_seen
  if (now - lastSeen > STALE_MS) return lastSeen;
  return now;
}

function mergeIntervals(intervals) {
  if (!intervals.length) return [];
  const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
  const out = [[sorted[0][0], sorted[0][1]]];
  for (let i = 1; i < sorted.length; i++) {
    const [s, e] = sorted[i];
    const last = out[out.length - 1];
    if (s <= last[1]) last[1] = Math.max(last[1], e);
    else out.push([s, e]);
  }
  return out;
}

export function formatDurationMs(ms) {
  const totalSec = Math.max(0, Math.round(Number(ms) / 1000));
  if (totalSec < 60) return "< 1 min";
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  if (hours <= 0) return `${minutes} min`;
  if (minutes <= 0) return `${hours} h`;
  return `${hours} h ${minutes} min`;
}

/** Format compact pour cellules calendrier (ex. 2h20, 45m). */
export function formatDurationCompact(ms) {
  const totalMin = Math.max(0, Math.round(Number(ms) / 60000));
  if (totalMin < 1) return "<1m";
  const hours = Math.floor(totalMin / 60);
  const minutes = totalMin % 60;
  if (hours <= 0) return `${minutes}m`;
  if (minutes <= 0) return `${hours}h`;
  return `${hours}h${String(minutes).padStart(2, "0")}`;
}

/** Cumul de durée pour un mois donné (days = [{ dateKey, durationMs }]). */
export function getMonthDurationTotal(days = [], year, month) {
  const prefix = `${year}-${String(month + 1).padStart(2, "0")}-`;
  let total = 0;
  for (const day of days) {
    if (day?.dateKey?.startsWith(prefix)) total += Number(day.durationMs) || 0;
  }
  return total;
}

/** Map dateKey → durationMs pour accès rapide. */
export function buildDurationByDayMap(days = []) {
  const map = new Map();
  for (const day of days) {
    if (!day?.dateKey) continue;
    map.set(day.dateKey, Number(day.durationMs) || 0);
  }
  return map;
}

/**
 * Clé canonique d'un utilisateur actif : toujours `code:X` s'il a un code,
 * sinon `name:…` (évite de scinder le même compte en deux buckets).
 */
function canonicalUserKey(user) {
  const code = normalizeCode(user?.code);
  const name = normalizeName(user?.name);
  if (code) return `code:${code}`;
  return `name:${name.toLowerCase()}`;
}

/**
 * Agrège les sessions par utilisateur actif puis par jour.
 * @returns {Array<{ name, code, days: Array<{ dateKey, durationMs, label }>, totalMs }>}
 */
export function buildConnectionActivityByUser(sessions = [], users = [], { now = Date.now() } = {}) {
  const active = (users || [])
    .map((u) => ({
      name: normalizeName(u?.name),
      code: normalizeCode(u?.code),
    }))
    .filter((u) => u.name || u.code);

  const activeCodes = new Set(active.map((u) => u.code).filter(Boolean));

  const findActiveUser = (row) => {
    const code = normalizeCode(row.user_code);
    const name = normalizeName(row.user_name);
    if (code && activeCodes.has(code)) {
      return active.find((a) => a.code === code) || null;
    }
    if (name) {
      return active.find((a) => personNamesMatch(a.name, name)) || null;
    }
    return null;
  };

  /** @type {Map<string, { name: string, code: string|null, intervalsByDay: Map<string, Array<[number, number]>> }>} */
  const byUser = new Map();

  const resolveKey = (row) => {
    const matched = findActiveUser(row);
    if (matched) {
      return {
        mapKey: canonicalUserKey(matched),
        name: matched.name,
        code: matched.code || null,
      };
    }
    // Fallback (ne devrait pas arriver après filter)
    const code = normalizeCode(row.user_code);
    const name = normalizeName(row.user_name);
    if (code) return { mapKey: `code:${code}`, name: name || code, code };
    return { mapKey: `name:${name.toLowerCase()}`, name, code: null };
  };

  const filtered = (sessions || []).filter((row) => Boolean(findActiveUser(row)));

  for (const row of filtered) {
    const start = Date.parse(row.started_at || "");
    if (!Number.isFinite(start)) continue;
    const end = sessionEndMs(row, now);
    if (end <= start) continue;

    const { mapKey, name, code } = resolveKey(row);
    if (!byUser.has(mapKey)) {
      byUser.set(mapKey, { name, code, intervalsByDay: new Map() });
    }
    const entry = byUser.get(mapKey);

    // Découper aux minuits Hurghada (Africa/Cairo), pas au fuseau du navigateur
    let cursor = start;
    while (cursor < end) {
      const dateKey = toLocalDateKey(new Date(cursor));
      if (!dateKey) break;
      const sliceEnd = Math.min(end, nextBusinessDayStartMs(cursor));
      if (sliceEnd <= cursor) break;
      if (!entry.intervalsByDay.has(dateKey)) entry.intervalsByDay.set(dateKey, []);
      entry.intervalsByDay.get(dateKey).push([cursor, sliceEnd]);
      cursor = sliceEnd;
    }
  }

  // Inclure les utilisateurs actifs même sans session
  for (const u of active) {
    const mapKey = canonicalUserKey(u);
    if (!byUser.has(mapKey)) {
      byUser.set(mapKey, { name: u.name, code: u.code || null, intervalsByDay: new Map() });
    }
  }

  const result = [];
  for (const entry of byUser.values()) {
    const days = [];
    let totalMs = 0;
    for (const [dateKey, intervals] of entry.intervalsByDay) {
      const merged = mergeIntervals(intervals);
      const durationMs = merged.reduce((sum, [s, e]) => sum + (e - s), 0);
      totalMs += durationMs;
      const d = new Date(`${dateKey}T12:00:00`);
      days.push({
        dateKey,
        durationMs,
        label: Number.isNaN(d.getTime())
          ? dateKey
          : d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" }),
      });
    }
    days.sort((a, b) => (a.dateKey < b.dateKey ? 1 : -1));
    result.push({
      name: entry.name,
      code: entry.code,
      days,
      totalMs,
    });
  }

  return result.sort((a, b) =>
    String(a.name || "").localeCompare(String(b.name || ""), "fr", { sensitivity: "base" })
  );
}

/** Filtre une ligne présence temps réel si l’utilisateur est encore dans le répertoire. */
export function isPresenceRowActiveUser(row, users = []) {
  const code = normalizeCode(row?.code);
  const name = normalizeName(row?.name);
  return (users || []).some((u) => {
    const uc = normalizeCode(u?.code);
    const un = normalizeName(u?.name);
    if (code && uc && code === uc) return true;
    if (name && un && personNamesMatch(name, un)) return true;
    return false;
  });
}
