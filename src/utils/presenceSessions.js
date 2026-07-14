import { SITE_KEY, LS_KEYS } from "../constants";
import { loadLS, saveLS } from "../utils";
import { supabase, __SUPABASE_DEBUG__ } from "../lib/supabase";
import { toLocalDateKey } from "./quoteUserStats";
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

/**
 * Démarre une session de présence (Supabase si dispo + miroir localStorage).
 * @returns {Promise<string|null>} id de session
 */
export async function startPresenceSession({ sessionKey, user }) {
  const startedAt = nowIso();
  const localId =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `local-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  const base = {
    id: localId,
    site_key: SITE_KEY,
    session_key: String(sessionKey || ""),
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
      // Table absente ou RLS : on continue en local uniquement.
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

export async function touchPresenceSession(sessionId) {
  if (!sessionId) return;
  const at = nowIso();
  const rows = readLocalSessions();
  const idx = rows.findIndex((r) => r.id === sessionId);
  if (idx >= 0) {
    rows[idx] = { ...rows[idx], last_seen_at: at, ended_at: null };
    writeLocalSessions(rows);
  }

  if (!__SUPABASE_DEBUG__?.isConfigured || !supabase) return;
  try {
    await supabase
      .from("intranet_presence_sessions")
      .update({ last_seen_at: at, ended_at: null })
      .eq("id", sessionId);
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
 */
export async function loadPresenceSessions({ days = 60 } = {}) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceIso = since.toISOString();

  let remote = [];
  if (__SUPABASE_DEBUG__?.isConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from("intranet_presence_sessions")
        .select("id, site_key, session_key, user_code, user_name, user_id, started_at, ended_at, last_seen_at")
        .eq("site_key", SITE_KEY)
        .gte("started_at", sinceIso)
        .order("started_at", { ascending: false })
        .limit(2000);

      if (error) {
        logger.warn("Présence sessions : lecture Supabase", error.message || error);
      } else if (Array.isArray(data)) {
        remote = data;
      }
    } catch (err) {
      logger.warn("Présence sessions : lecture", err);
    }
  }

  const local = readLocalSessions().filter((r) => {
    const t = Date.parse(r.started_at || "");
    return Number.isFinite(t) && t >= since.getTime();
  });

  const byId = new Map();
  for (const row of [...local, ...remote]) {
    if (!row?.id) continue;
    const prev = byId.get(row.id);
    if (!prev) {
      byId.set(row.id, row);
      continue;
    }
    // Préférer la version avec ended_at / last_seen plus récent
    const prevSeen = Date.parse(prev.last_seen_at || prev.ended_at || prev.started_at || 0);
    const nextSeen = Date.parse(row.last_seen_at || row.ended_at || row.started_at || 0);
    byId.set(row.id, nextSeen >= prevSeen ? { ...prev, ...row } : { ...row, ...prev });
  }

  return [...byId.values()];
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

  const activeNames = new Set(active.map((u) => u.name.toLowerCase()).filter(Boolean));
  const activeCodes = new Set(active.map((u) => u.code).filter(Boolean));

  const matchActive = (row) => {
    const code = normalizeCode(row.user_code);
    const name = normalizeName(row.user_name);
    if (code && activeCodes.has(code)) return true;
    if (name && activeNames.has(name.toLowerCase())) return true;
    return false;
  };

  const filtered = (sessions || []).filter(matchActive);

  /** @type {Map<string, { name: string, code: string|null, intervalsByDay: Map<string, Array<[number, number]>> }>} */
  const byUser = new Map();

  const resolveKey = (row) => {
    const code = normalizeCode(row.user_code);
    const name = normalizeName(row.user_name);
    if (code && activeCodes.has(code)) {
      const u = active.find((a) => a.code === code);
      return { mapKey: `code:${code}`, name: u?.name || name || code, code };
    }
    const u = active.find((a) => a.name.toLowerCase() === name.toLowerCase());
    return { mapKey: `name:${(u?.name || name).toLowerCase()}`, name: u?.name || name, code: u?.code || code || null };
  };

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

    // Découper si une session chevauche minuit
    let cursor = start;
    while (cursor < end) {
      const dayStart = new Date(cursor);
      dayStart.setHours(0, 0, 0, 0);
      const nextDay = new Date(dayStart);
      nextDay.setDate(nextDay.getDate() + 1);
      const sliceEnd = Math.min(end, nextDay.getTime());
      const dateKey = toLocalDateKey(dayStart);
      if (!entry.intervalsByDay.has(dateKey)) entry.intervalsByDay.set(dateKey, []);
      entry.intervalsByDay.get(dateKey).push([cursor, sliceEnd]);
      cursor = sliceEnd;
    }
  }

  // Inclure les utilisateurs actifs même sans session
  for (const u of active) {
    const mapKey = u.code ? `code:${u.code}` : `name:${u.name.toLowerCase()}`;
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
    if (name && un && name.localeCompare(un, "fr", { sensitivity: "accent" }) === 0) return true;
    return false;
  });
}
