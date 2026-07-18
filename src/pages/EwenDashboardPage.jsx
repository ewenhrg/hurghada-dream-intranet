import { useMemo, useCallback, useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  ChevronRight,
  Clock3,
  FileText,
  Search,
  Users,
  Wifi,
  AlertTriangle,
} from "lucide-react";
import { GhostBtn, PrimaryBtn, TextInput } from "../components/ui";
import { UserActivityDetailModal } from "../components/dashboard/UserActivityDetailModal";
import { loadLS } from "../utils";
import { LS_KEYS } from "../constants";
import { supabase, __SUPABASE_DEBUG__ } from "../lib/supabase";
import {
  buildConnectionActivityByUser,
  formatDurationMs,
  getMonthDurationTotal,
  isPresenceRowActiveUser,
  loadPresenceSessions,
} from "../utils/presenceSessions";
import {
  buildQuotesCountByUserAndDay,
  getMonthQuoteTotal,
  getQuoteCountOnDay,
  getQuoteDaysForUser,
  getTotalQuotesForUser,
  MONTH_NAMES,
  toLocalDateKey,
} from "../utils/quoteUserStats";

/**
 * Regroupe les entrées Realtime Presence (une par onglet / connexion) par code utilisateur.
 */
function presenceStateToRows(presenceState) {
  const byKey = new Map();
  for (const entries of Object.values(presenceState || {})) {
    for (const row of entries || []) {
      const code = row.code != null && String(row.code).trim() !== "" ? String(row.code).trim() : "";
      const name = (row.name && String(row.name).trim()) || "—";
      const mapKey = code || `name:${name.toLowerCase()}`;
      const prev = byKey.get(mapKey);
      const sessions = prev ? prev.sessions + 1 : 1;
      const onlineAt = Math.max(prev?.onlineAt || 0, Number(row.online_at) || 0);
      byKey.set(mapKey, { mapKey, name, code: code || null, sessions, onlineAt });
    }
  }
  return [...byKey.values()].sort((a, b) =>
    String(a.name || "").localeCompare(String(b.name || ""), "fr", { sensitivity: "base" })
  );
}

function formatOnlineSince(onlineAt) {
  if (!onlineAt) return null;
  const ms = Date.now() - Number(onlineAt);
  if (!Number.isFinite(ms) || ms < 0) return null;
  return formatDurationMs(ms);
}

function userMapKey(user) {
  const code = user?.code != null && String(user.code).trim() !== "" ? String(user.code).trim() : "";
  const name = String(user?.name || "").trim();
  if (code) return `code:${code}`;
  return `name:${name.toLowerCase()}`;
}

const MAX_SCREEN_MESSAGE_LEN = 500;

export function EwenDashboardPage({
  user,
  quotes = [],
  presenceState,
  supabaseConfigured,
  onForceLogoutRequest,
  onSendUserScreenMessage,
}) {
  const [directoryUsers, setDirectoryUsers] = useState(() => loadLS(LS_KEYS.users, []));
  const [sessionRows, setSessionRows] = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [sessionsRemoteCount, setSessionsRemoteCount] = useState(0);
  const [sessionsError, setSessionsError] = useState(null);
  const [messageTargetRow, setMessageTargetRow] = useState(null);
  const [messageDraft, setMessageDraft] = useState("");
  const [messageSending, setMessageSending] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [userSearch, setUserSearch] = useState("");
  const [tick, setTick] = useState(0);

  const now = useMemo(() => new Date(), [tick]);
  const viewYear = now.getFullYear();
  const viewMonth = now.getMonth();
  const todayKey = useMemo(() => toLocalDateKey(now), [now]);

  useEffect(() => {
    let cancelled = false;

    async function refreshUsers() {
      const cached = loadLS(LS_KEYS.users, []);
      if (!cancelled && Array.isArray(cached) && cached.length) {
        setDirectoryUsers(cached);
      }
      if (!__SUPABASE_DEBUG__?.isConfigured || !supabase) return;
      try {
        const { data, error } = await supabase
          .from("users")
          .select("id, name, code")
          .order("name", { ascending: true });
        if (!error && Array.isArray(data) && !cancelled) {
          setDirectoryUsers(data);
        }
      } catch {
        /* keep cache */
      }
    }

    async function refreshSessions() {
      setSessionsLoading(true);
      try {
        const result = await loadPresenceSessions({ days: 90 });
        if (cancelled) return;
        // Compat : ancienne API renvoyait un tableau
        const rows = Array.isArray(result) ? result : result?.rows || [];
        setSessionRows(rows);
        setSessionsRemoteCount(Array.isArray(result) ? rows.length : Number(result?.remoteCount) || 0);
        setSessionsError(Array.isArray(result) ? null : result?.remoteError || null);
      } finally {
        if (!cancelled) setSessionsLoading(false);
      }
    }

    refreshUsers();
    refreshSessions();
    const interval = setInterval(() => {
      refreshSessions();
      setTick((n) => n + 1);
    }, 60_000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const onlineRows = useMemo(() => {
    const all = presenceStateToRows(presenceState);
    return all.filter((row) => isPresenceRowActiveUser(row, directoryUsers));
  }, [presenceState, directoryUsers]);

  const onlineKeySet = useMemo(() => {
    const set = new Set();
    for (const row of onlineRows) {
      if (row.code) set.add(`code:${row.code}`);
      if (row.name) set.add(`name:${String(row.name).toLowerCase()}`);
    }
    return set;
  }, [onlineRows]);

  const connectionActivity = useMemo(
    () => buildConnectionActivityByUser(sessionRows, directoryUsers, { now: Date.now() }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sessionRows, directoryUsers, tick]
  );

  const activityByKey = useMemo(() => {
    const map = new Map();
    for (const entry of connectionActivity) {
      map.set(userMapKey(entry), entry);
    }
    return map;
  }, [connectionActivity]);

  const quotesByUser = useMemo(() => buildQuotesCountByUserAndDay(quotes), [quotes]);

  const registeredUsers = useMemo(() => {
    const list = (directoryUsers || [])
      .map((u) => ({
        id: u.id,
        name: String(u?.name || "").trim(),
        code: u?.code != null && String(u.code).trim() !== "" ? String(u.code).trim() : "",
      }))
      .filter((u) => u.name);
    list.sort((a, b) => a.name.localeCompare(b.name, "fr", { sensitivity: "base" }));
    return list;
  }, [directoryUsers]);

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    if (!q) return registeredUsers;
    return registeredUsers.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        (u.code && u.code.toLowerCase().includes(q))
    );
  }, [registeredUsers, userSearch]);

  const teamRows = useMemo(() => {
    return filteredUsers.map((u) => {
      const key = userMapKey(u);
      const online =
        (u.code && onlineKeySet.has(`code:${u.code}`)) ||
        onlineKeySet.has(`name:${u.name.toLowerCase()}`);
      const activity = activityByKey.get(key);
      const quoteDays = getQuoteDaysForUser(quotesByUser, u.name);
      const monthMs = getMonthDurationTotal(activity?.days || [], viewYear, viewMonth);
      const monthQuotes = getMonthQuoteTotal(quoteDays, viewYear, viewMonth);
      const totalQuotes = getTotalQuotesForUser(quotes, u.name);
      const todayMs = Number(
        (activity?.days || []).find((d) => d.dateKey === todayKey)?.durationMs || 0
      );
      const todayQuotesRaw = getQuoteCountOnDay(quoteDays, todayKey);
      // Un jour sans connexion = pas de devis affichés pour « aujourd'hui »
      // (évite l'impression qu'ils ont travaillé s'ils sont absents)
      const todayQuotes = todayMs > 0 ? todayQuotesRaw : 0;
      return {
        user: u,
        key,
        online,
        activity,
        monthMs,
        monthQuotes,
        totalQuotes,
        todayMs,
        todayQuotes,
      };
    });
  }, [
    filteredUsers,
    onlineKeySet,
    activityByKey,
    quotesByUser,
    quotes,
    viewYear,
    viewMonth,
    todayKey,
  ]);

  const selectedActivity = useMemo(() => {
    if (!selectedUser) return null;
    return activityByKey.get(userMapKey(selectedUser)) || { days: [], totalMs: 0 };
  }, [selectedUser, activityByKey]);

  const selectedQuoteDays = useMemo(() => {
    if (!selectedUser?.name) return new Map();
    return getQuoteDaysForUser(quotesByUser, selectedUser.name);
  }, [selectedUser, quotesByUser]);

  const selectedIsOnline = useMemo(() => {
    if (!selectedUser) return false;
    if (selectedUser.code && onlineKeySet.has(`code:${selectedUser.code}`)) return true;
    return onlineKeySet.has(`name:${selectedUser.name.toLowerCase()}`);
  }, [selectedUser, onlineKeySet]);

  const handleForceLogoutRow = useCallback(
    (row) => {
      if (!onForceLogoutRequest) return;
      const label = row.code ? `le code ${row.code}` : row.name;
      if (
        !window.confirm(
          `Déconnecter cet utilisateur (${label}) sur tous ses onglets ouverts ? La session locale sera effacée sur chaque navigateur qui reçoit le message temps réel.`
        )
      ) {
        return;
      }
      onForceLogoutRequest({ code: row.code, name: row.name });
    },
    [onForceLogoutRequest]
  );

  const openMessageModal = useCallback((row) => {
    setMessageDraft("");
    setMessageTargetRow(row);
  }, []);

  const closeMessageModal = useCallback(() => {
    if (messageSending) return;
    setMessageTargetRow(null);
    setMessageDraft("");
  }, [messageSending]);

  const handleSendScreenMessage = useCallback(async () => {
    if (!onSendUserScreenMessage || !messageTargetRow) return;
    setMessageSending(true);
    try {
      const ok = await onSendUserScreenMessage(messageTargetRow, messageDraft);
      if (ok) {
        setMessageTargetRow(null);
        setMessageDraft("");
      }
    } finally {
      setMessageSending(false);
    }
  }, [onSendUserScreenMessage, messageTargetRow, messageDraft]);

  const monthLabel = MONTH_NAMES[viewMonth];

  return (
    <div className="space-y-6">
      <header className="relative overflow-hidden rounded-2xl border border-white/15 bg-gradient-to-br from-slate-900 via-[#1a1640] to-slate-950 px-5 py-6 text-white shadow-xl shadow-indigo-950/40">
        <div
          className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-cyan-400/15 blur-3xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-24 left-10 h-48 w-48 rounded-full bg-indigo-500/20 blur-3xl"
          aria-hidden
        />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-200/80">
              Ewen · Tableau de bord
            </p>
            <h1 className="font-[family-name:var(--hd-font-display)] text-2xl font-bold tracking-tight">
              Vue d&apos;ensemble
            </h1>
            <p className="mt-1 max-w-xl text-sm text-white/70">
              Temps connecté et devis de toute l&apos;équipe — clique sur un prénom pour le calendrier détaillé.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/85 backdrop-blur-sm">
              <span
                className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400 shadow shadow-emerald-500/50 animate-pulse"
                aria-hidden
              />
              {onlineRows.length} en ligne
            </div>
            <div className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/85 backdrop-blur-sm">
              Connecté : <span className="font-semibold text-white">{user?.name || "—"}</span>
            </div>
          </div>
        </div>
      </header>

      {sessionsError ? (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-2xl border border-amber-300/80 bg-amber-50 px-4 py-3 text-sm text-amber-950"
        >
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden />
          <div>
            <p className="font-semibold">Sessions distantes indisponibles</p>
            <p className="mt-0.5 text-amber-900/80">
              Seuls les temps locaux de ce navigateur sont visibles. Erreur : {sessionsError}
            </p>
          </div>
        </div>
      ) : null}

      {!sessionsLoading && !sessionsError && sessionsRemoteCount === 0 && sessionRows.length > 0 ? (
        <div
          role="status"
          className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700"
        >
          <Wifi className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" aria-hidden />
          <p>
            Aucune session d&apos;équipe reçue depuis Supabase pour le moment. Les autres utilisateurs
            doivent être connectés au moins une fois (après ce correctif) pour apparaître.
          </p>
        </div>
      ) : null}

      {/* En ligne */}
      <section className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white/90 shadow-md shadow-slate-900/5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100/90 bg-gradient-to-r from-emerald-50/80 via-teal-50/50 to-slate-50/80 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Qui est en ligne</h2>
            <p className="mt-0.5 text-sm text-slate-600">
              Connexions actives (temps réel). Un compte sur plusieurs onglets = plusieurs sessions.
            </p>
          </div>
          <span className="rounded-lg border border-emerald-200/80 bg-white/90 px-3 py-1 text-sm font-medium tabular-nums text-emerald-900">
            {onlineRows.length} personne{onlineRows.length !== 1 ? "s" : ""}
          </span>
        </div>

        {!supabaseConfigured ? (
          <div className="border-t border-amber-100 bg-amber-50 p-6 text-sm text-amber-900">
            Supabase n&apos;est pas configuré : la présence en ligne n&apos;est pas disponible.
          </div>
        ) : onlineRows.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            Aucune présence détectée parmi les utilisateurs actuels.
          </div>
        ) : (
          <ul className="divide-y divide-slate-100/90">
            {onlineRows.map((row) => {
              const since = formatOnlineSince(row.onlineAt);
              return (
                <li
                  key={row.mapKey}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 transition-colors hover:bg-slate-50/70"
                >
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    onClick={() =>
                      setSelectedUser({
                        name: row.name,
                        code: row.code || "",
                      })
                    }
                  >
                    <span
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-sm font-bold text-white shadow-md shadow-emerald-600/20"
                      aria-hidden
                    >
                      {(row.name || "?").slice(0, 1).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-900 hover:text-violet-700">
                        {row.name}
                      </p>
                      <p className="text-xs text-slate-500">
                        {row.code ? `Code · ${row.code}` : "Pas de code en session"}
                        {since ? ` · depuis ${since}` : ""}
                      </p>
                    </div>
                  </button>
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                    {row.sessions > 1 && (
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                        {row.sessions} onglets
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200/80">
                      <span className="h-2 w-2 rounded-full bg-emerald-500" />
                      En ligne
                    </span>
                    {onSendUserScreenMessage && (row.code || (row.name && row.name !== "—")) && (
                      <GhostBtn
                        type="button"
                        variant="neutral"
                        size="sm"
                        className="min-h-0 min-w-0 py-2"
                        onClick={() => openMessageModal(row)}
                      >
                        Message
                      </GhostBtn>
                    )}
                    {onForceLogoutRequest && (row.code || (row.name && row.name !== "—")) && (
                      <GhostBtn
                        type="button"
                        variant="danger"
                        size="sm"
                        className="min-h-0 min-w-0 py-2"
                        onClick={() => handleForceLogoutRow(row)}
                      >
                        Déconnecter
                      </GhostBtn>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Liste équipe */}
      <section className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white/90 shadow-md shadow-slate-900/5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100/90 bg-gradient-to-r from-violet-50/90 via-indigo-50/50 to-cyan-50/40 px-5 py-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-cyan-500 text-white shadow-md shadow-violet-600/25">
              <Users className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Équipe — activité</h2>
              <p className="mt-0.5 text-sm text-slate-600">
                Aujourd&apos;hui (connexion réelle) et bilan {monthLabel}. Les devis n&apos;apparaissent
                que les jours où la personne était connectée.
              </p>
            </div>
          </div>
          <span className="rounded-lg border border-violet-200/80 bg-white/90 px-3 py-1 text-sm font-medium tabular-nums text-violet-900">
            {registeredUsers.length} compte{registeredUsers.length !== 1 ? "s" : ""}
            {sessionsLoading ? " · sync…" : ""}
          </span>
        </div>

        <div className="border-b border-slate-100 px-4 py-3 sm:px-5">
          <div className="relative max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <TextInput
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              placeholder="Rechercher un prénom ou un code…"
              className="pl-10"
              aria-label="Rechercher un utilisateur"
            />
          </div>
        </div>

        {/* En-tête colonnes desktop */}
        <div className="hidden border-b border-slate-100 bg-slate-50/80 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 md:grid md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_auto] md:gap-4">
          <span>Collaborateur</span>
          <span className="inline-flex items-center gap-1.5">
            <Clock3 className="h-3.5 w-3.5" /> Aujourd&apos;hui
          </span>
          <span className="inline-flex items-center gap-1.5">
            <FileText className="h-3.5 w-3.5" /> {monthLabel}
          </span>
          <span className="text-right">Détail</span>
        </div>

        {sessionsLoading && registeredUsers.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">Chargement…</div>
        ) : teamRows.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            {registeredUsers.length === 0
              ? "Aucun utilisateur dans le répertoire."
              : "Aucun résultat pour cette recherche."}
          </div>
        ) : (
          <ul className="divide-y divide-slate-100/90">
            {teamRows.map((row, index) => {
              const { user: u, key, online, monthMs, monthQuotes, totalQuotes, todayMs, todayQuotes } =
                row;
              const workedToday = todayMs > 0;
              return (
                <motion.li
                  key={key}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.28, delay: Math.min(index * 0.03, 0.35) }}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedUser(u)}
                    className="group grid w-full grid-cols-1 items-center gap-3 px-4 py-4 text-left transition-colors hover:bg-violet-50/70 sm:px-5 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_auto] md:gap-4"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-sm font-bold text-white shadow-md ${
                          online
                            ? "bg-gradient-to-br from-emerald-500 to-teal-600 shadow-emerald-600/20"
                            : "bg-gradient-to-br from-slate-500 to-slate-700 shadow-slate-700/20"
                        }`}
                      >
                        {u.name.slice(0, 1).toUpperCase()}
                        {online ? (
                          <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-emerald-400" />
                        ) : null}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-slate-900 group-hover:text-violet-800">
                          {u.name}
                        </p>
                        <p className="text-xs text-slate-500">
                          {u.code ? `Code · ${u.code}` : "Sans code"}
                          {online ? (
                            <span className="ml-2 font-semibold text-emerald-600">· En ligne</span>
                          ) : (
                            <span className="ml-2 text-slate-400">· Hors ligne</span>
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 md:block">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 md:hidden">
                        Aujourd&apos;hui
                      </span>
                      {workedToday ? (
                        <div className="inline-flex flex-col gap-0.5 rounded-xl border border-emerald-200/80 bg-emerald-50/90 px-3 py-2">
                          <span className="inline-flex items-center gap-1.5 text-sm font-bold tabular-nums text-slate-900">
                            <Clock3 className="h-3.5 w-3.5 text-emerald-700" aria-hidden />
                            {formatDurationMs(todayMs)}
                          </span>
                          <span className="text-[11px] font-semibold tabular-nums text-emerald-800">
                            {todayQuotes} devis
                          </span>
                        </div>
                      ) : (
                        <div className="inline-flex items-center rounded-xl border border-rose-200/70 bg-rose-50/80 px-3 py-2">
                          <span className="text-sm font-semibold text-rose-700">Absent</span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 md:block">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 md:hidden">
                        {monthLabel}
                      </span>
                      <div className="inline-flex flex-col gap-0.5 rounded-xl border border-violet-200/70 bg-violet-50/80 px-3 py-2">
                        <span className="text-sm font-bold tabular-nums text-slate-900">
                          {monthMs > 0 ? formatDurationMs(monthMs) : "—"}
                        </span>
                        <span className="text-[11px] tabular-nums text-slate-600">
                          {monthQuotes} devis · {totalQuotes} total
                        </span>
                      </div>
                    </div>

                    <span className="flex shrink-0 items-center justify-end gap-1.5 text-xs font-semibold text-violet-600 opacity-90 group-hover:opacity-100">
                      Calendrier
                      <ChevronRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                    </span>
                  </button>
                </motion.li>
              );
            })}
          </ul>
        )}
      </section>

      {messageTargetRow && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="hd-screen-msg-title"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeMessageModal();
          }}
        >
          <div className="w-full max-w-md overflow-hidden rounded-2xl border border-indigo-200/80 bg-white shadow-2xl">
            <div className="border-b border-slate-100 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 px-5 py-4 text-white">
              <h2 id="hd-screen-msg-title" className="text-lg font-bold">
                Message à l&apos;écran
              </h2>
              <p className="mt-0.5 text-sm text-white/85">
                {messageTargetRow.name}
                {messageTargetRow.code ? ` · code ${messageTargetRow.code}` : ""} — affichage ~3
                secondes.
              </p>
            </div>
            <div className="space-y-3 p-5">
              <label className="block text-sm font-semibold text-slate-700" htmlFor="hd-screen-msg-body">
                Texte
              </label>
              <textarea
                id="hd-screen-msg-body"
                value={messageDraft}
                onChange={(e) => setMessageDraft(e.target.value.slice(0, MAX_SCREEN_MESSAGE_LEN))}
                rows={4}
                className="w-full resize-none rounded-xl border-2 border-slate-200 px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400"
                placeholder="Ex. : Peux-tu venir au bureau ?"
                disabled={messageSending}
              />
              <p className="text-xs tabular-nums text-slate-500">
                {messageDraft.length}/{MAX_SCREEN_MESSAGE_LEN}
              </p>
            </div>
            <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 bg-slate-50 px-5 py-4">
              <GhostBtn type="button" variant="neutral" size="sm" onClick={closeMessageModal} disabled={messageSending}>
                Annuler
              </GhostBtn>
              <PrimaryBtn
                type="button"
                className="min-h-0 px-4 py-2.5 text-sm"
                onClick={handleSendScreenMessage}
                disabled={messageSending || !messageDraft.trim()}
              >
                {messageSending ? "Envoi…" : "Envoyer"}
              </PrimaryBtn>
            </div>
          </div>
        </div>
      )}

      <UserActivityDetailModal
        open={Boolean(selectedUser)}
        onClose={() => setSelectedUser(null)}
        user={selectedUser}
        activityDays={selectedActivity?.days || []}
        quoteCountByDay={selectedQuoteDays}
        isOnline={selectedIsOnline}
      />
    </div>
  );
}
