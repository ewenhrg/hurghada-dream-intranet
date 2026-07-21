import { useMemo, useCallback, useState, useEffect } from "react";
import {
  ChevronRight,
  Clock3,
  FileText,
  Search,
  AlertTriangle,
  MessageSquare,
  LogOut,
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
  loadDashboardQuoteStats,
  loadPresenceSessions,
  probePresenceTable,
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

function SyncBanner({ tone, title, children }) {
  const styles =
    tone === "danger"
      ? "border-rose-200 bg-rose-50 text-rose-950"
      : tone === "warn"
        ? "border-amber-200 bg-amber-50 text-amber-950"
        : "border-sky-200 bg-sky-50 text-sky-950";
  const icon =
    tone === "info" ? (
      <Clock3 className="mt-0.5 h-4 w-4 shrink-0 opacity-70" aria-hidden />
    ) : (
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 opacity-80" aria-hidden />
    );
  return (
    <div role={tone === "info" ? "status" : "alert"} className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${styles}`}>
      {icon}
      <div className="min-w-0 space-y-0.5">
        {title ? <p className="font-semibold">{title}</p> : null}
        <div className="text-[13px] leading-relaxed opacity-90">{children}</div>
      </div>
    </div>
  );
}

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
  const [sessionsTableMissing, setSessionsTableMissing] = useState(false);
  const [sessionsDistinctUsers, setSessionsDistinctUsers] = useState(0);
  const [dashboardQuotes, setDashboardQuotes] = useState([]);
  const [quotesSyncError, setQuotesSyncError] = useState(null);
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
  const monthLabel = MONTH_NAMES[viewMonth];

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
        const [result, probe, quoteStats] = await Promise.all([
          loadPresenceSessions({ days: 90, teamMode: true }),
          probePresenceTable(),
          loadDashboardQuoteStats({ days: 180 }),
        ]);
        if (cancelled) return;
        const rows = Array.isArray(result) ? result : result?.rows || [];
        setSessionRows(rows);
        setSessionsRemoteCount(Array.isArray(result) ? rows.length : Number(result?.remoteCount) || 0);
        setSessionsError(
          Array.isArray(result) ? null : result?.remoteError || (!probe.ok ? probe.error : null)
        );
        setSessionsTableMissing(
          Boolean(result?.tableMissing) ||
            Boolean(probe.error && String(probe.error).toLowerCase().includes("does not exist"))
        );
        setSessionsDistinctUsers(Number(result?.distinctRemoteUsers) || 0);
        setDashboardQuotes(quoteStats?.quotes || []);
        setQuotesSyncError(quoteStats?.error || null);
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

  const quotesByUser = useMemo(
    () => buildQuotesCountByUserAndDay(dashboardQuotes.length ? dashboardQuotes : quotes),
    [dashboardQuotes, quotes]
  );

  const quotesForTotals = dashboardQuotes.length ? dashboardQuotes : quotes;
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
      (u) => u.name.toLowerCase().includes(q) || (u.code && u.code.toLowerCase().includes(q))
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
      const totalQuotes = getTotalQuotesForUser(quotesForTotals, u.name);
      const todayMs = Number(
        (activity?.days || []).find((d) => d.dateKey === todayKey)?.durationMs || 0
      );
      // Devis toujours depuis Supabase (indépendant du temps connecté)
      const todayQuotes = getQuoteCountOnDay(quoteDays, todayKey);
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
    quotesForTotals,
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

  const syncOk = !sessionsLoading && !sessionsError && !sessionsTableMissing;
  const needReconnectOthers =
    syncOk && sessionsRemoteCount > 0 && sessionsDistinctUsers <= 1;
  const noRemoteSessions = syncOk && sessionsRemoteCount === 0;

  return (
    <div className="mx-auto max-w-5xl space-y-8 pb-8">
      {/* Header — une composition simple */}
      <header className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
              Tableau de bord
            </p>
            <h1 className="mt-1 font-[family-name:var(--hd-font-display)] text-3xl font-semibold tracking-tight text-slate-900">
              Équipe
            </h1>
            <p className="mt-1.5 max-w-lg text-sm leading-relaxed text-slate-500">
              Temps connecté et devis créés — fuseau Hurghada. Clique un nom pour le calendrier.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="inline-flex items-center gap-2 text-slate-600">
              <span
                className={`h-2 w-2 rounded-full ${onlineRows.length ? "bg-emerald-500" : "bg-slate-300"}`}
                aria-hidden
              />
              <span className="tabular-nums font-medium text-slate-900">{onlineRows.length}</span>
              en ligne
            </span>
            <span className="hidden h-4 w-px bg-slate-200 sm:block" aria-hidden />
            <span className="text-slate-500">
              Toi · <span className="font-medium text-slate-800">{user?.name || "—"}</span>
            </span>
          </div>
        </div>
      </header>

      {/* Un seul bandeau d’état sync */}
      {sessionsTableMissing || sessionsError ? (
        <SyncBanner tone="warn" title="Temps d’équipe non synchronisés">
          Exécute le SQL{" "}
          <code className="rounded bg-black/5 px-1 text-[11px]">
            supabase_intranet_presence_sessions_table.sql
          </code>{" "}
          dans Supabase, puis demande à chaque collègue de se reconnecter une fois.
          {sessionsError ? (
            <p className="mt-1 text-xs opacity-75">Détail : {sessionsError}</p>
          ) : null}
        </SyncBanner>
      ) : null}

      {quotesSyncError ? (
        <SyncBanner tone="danger" title="Devis non synchronisés">
          {quotesSyncError}
        </SyncBanner>
      ) : null}

      {needReconnectOthers ? (
        <SyncBanner tone="info" title="Presque synchronisé">
          Une seule personne a des sessions en base. Les autres doivent ouvrir l’intranet (se
          reconnecter) pour que leurs temps apparaissent.
        </SyncBanner>
      ) : null}

      {noRemoteSessions ? (
        <SyncBanner tone="info" title="Aucune session d’équipe pour l’instant">
          Après le SQL, chaque collègue doit se reconnecter une fois. Les devis s’affichent déjà
          ci-dessous s’ils sont en base.
        </SyncBanner>
      ) : null}

      {/* En ligne — compact */}
      <section aria-labelledby="hd-online-heading">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 id="hd-online-heading" className="text-sm font-semibold text-slate-900">
            En ligne maintenant
          </h2>
          {!supabaseConfigured ? (
            <span className="text-xs text-amber-700">Supabase non configuré</span>
          ) : null}
        </div>

        {!supabaseConfigured ? null : onlineRows.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-6 text-center text-sm text-slate-500">
            Personne en ligne pour le moment.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200/80 bg-white">
            {onlineRows.map((row) => {
              const since = formatOnlineSince(row.onlineAt);
              return (
                <li
                  key={row.mapKey}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5"
                >
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    onClick={() => setSelectedUser({ name: row.name, code: row.code || "" })}
                  >
                    <span
                      className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-sm font-semibold text-white"
                      aria-hidden
                    >
                      {(row.name || "?").slice(0, 1).toUpperCase()}
                      <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-400" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-900">{row.name}</p>
                      <p className="text-xs text-slate-500">
                        {row.code ? `Code ${row.code}` : "Sans code"}
                        {since ? ` · depuis ${since}` : ""}
                        {row.sessions > 1 ? ` · ${row.sessions} onglets` : ""}
                      </p>
                    </div>
                  </button>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {onSendUserScreenMessage && (row.code || (row.name && row.name !== "—")) ? (
                      <GhostBtn
                        type="button"
                        variant="neutral"
                        size="sm"
                        className="min-h-0 min-w-0 gap-1.5 py-1.5 text-xs"
                        onClick={() => openMessageModal(row)}
                      >
                        <MessageSquare className="h-3.5 w-3.5" aria-hidden />
                        Message
                      </GhostBtn>
                    ) : null}
                    {onForceLogoutRequest && (row.code || (row.name && row.name !== "—")) ? (
                      <GhostBtn
                        type="button"
                        variant="danger"
                        size="sm"
                        className="min-h-0 min-w-0 gap-1.5 py-1.5 text-xs"
                        onClick={() => handleForceLogoutRow(row)}
                      >
                        <LogOut className="h-3.5 w-3.5" aria-hidden />
                        Déconnecter
                      </GhostBtn>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Activité équipe */}
      <section aria-labelledby="hd-team-heading">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="hd-team-heading" className="text-sm font-semibold text-slate-900">
              Activité
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Aujourd’hui · {monthLabel} {viewYear}
              {sessionsLoading ? " · sync…" : ""}
              {!quotesSyncError ? (
                <span className="text-slate-400">
                  {" "}
                  · {dashboardQuotes.length || quotes.length} devis chargés
                </span>
              ) : null}
            </p>
          </div>
          <div className="relative w-full max-w-xs">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden
            />
            <TextInput
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              placeholder="Rechercher…"
              className="pl-10"
              aria-label="Rechercher un utilisateur"
            />
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white">
          <div className="hidden border-b border-slate-100 bg-slate-50/90 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 md:grid md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_auto] md:gap-4">
            <span>Collaborateur</span>
            <span className="inline-flex items-center gap-1.5">
              <Clock3 className="h-3.5 w-3.5" aria-hidden /> Aujourd’hui
            </span>
            <span className="inline-flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5" aria-hidden /> {monthLabel}
            </span>
            <span className="sr-only">Détail</span>
          </div>

          {sessionsLoading && registeredUsers.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">Chargement…</div>
          ) : teamRows.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">
              {registeredUsers.length === 0
                ? "Aucun utilisateur dans le répertoire."
                : "Aucun résultat pour cette recherche."}
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {teamRows.map((row) => {
                const { user: u, key, online, monthMs, monthQuotes, totalQuotes, todayMs, todayQuotes } =
                  row;
                return (
                  <li key={key}>
                    <button
                      type="button"
                      onClick={() => setSelectedUser(u)}
                      className="group grid w-full grid-cols-1 items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-slate-50 sm:px-5 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_auto] md:gap-4"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span
                          className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white ${
                            online ? "bg-emerald-600" : "bg-slate-400"
                          }`}
                          aria-hidden
                        >
                          {u.name.slice(0, 1).toUpperCase()}
                          {online ? (
                            <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-400" />
                          ) : null}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-slate-900">{u.name}</p>
                          <p className="text-xs text-slate-500">
                            {u.code ? `Code ${u.code}` : "Sans code"}
                            <span className={online ? " text-emerald-600" : " text-slate-400"}>
                              {" "}
                              · {online ? "En ligne" : "Hors ligne"}
                            </span>
                          </p>
                        </div>
                      </div>

                      <div className="flex items-baseline gap-3 md:block">
                        <span className="w-16 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-slate-400 md:hidden">
                          Aujourd’hui
                        </span>
                        <div>
                          <p className="text-sm font-semibold tabular-nums text-slate-900">
                            {todayMs > 0 ? formatDurationMs(todayMs) : "—"}
                          </p>
                          <p className="text-xs tabular-nums text-slate-500">
                            {todayQuotes} devis
                          </p>
                        </div>
                      </div>

                      <div className="flex items-baseline gap-3 md:block">
                        <span className="w-16 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-slate-400 md:hidden">
                          {monthLabel}
                        </span>
                        <div>
                          <p className="text-sm font-semibold tabular-nums text-slate-900">
                            {monthMs > 0 ? formatDurationMs(monthMs) : "—"}
                          </p>
                          <p className="text-xs tabular-nums text-slate-500">
                            {monthQuotes} devis · {totalQuotes} total
                          </p>
                        </div>
                      </div>

                      <span className="flex items-center justify-end gap-1 text-xs font-medium text-slate-400 transition group-hover:text-slate-700">
                        Détail
                        <ChevronRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      {messageTargetRow && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="hd-screen-msg-title"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeMessageModal();
          }}
        >
          <div className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 id="hd-screen-msg-title" className="text-lg font-semibold text-slate-900">
                Message à l’écran
              </h2>
              <p className="mt-0.5 text-sm text-slate-500">
                {messageTargetRow.name}
                {messageTargetRow.code ? ` · code ${messageTargetRow.code}` : ""} — ~3 secondes.
              </p>
            </div>
            <div className="space-y-3 p-5">
              <label className="block text-sm font-medium text-slate-700" htmlFor="hd-screen-msg-body">
                Texte
              </label>
              <textarea
                id="hd-screen-msg-body"
                value={messageDraft}
                onChange={(e) => setMessageDraft(e.target.value.slice(0, MAX_SCREEN_MESSAGE_LEN))}
                rows={4}
                className="w-full resize-none rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                placeholder="Ex. : Peux-tu venir au bureau ?"
                disabled={messageSending}
              />
              <p className="text-xs tabular-nums text-slate-400">
                {messageDraft.length}/{MAX_SCREEN_MESSAGE_LEN}
              </p>
            </div>
            <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 bg-slate-50 px-5 py-4">
              <GhostBtn
                type="button"
                variant="neutral"
                size="sm"
                onClick={closeMessageModal}
                disabled={messageSending}
              >
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
