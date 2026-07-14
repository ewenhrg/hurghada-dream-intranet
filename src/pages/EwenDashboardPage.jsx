import { useMemo, useCallback, useState, useEffect } from "react";
import { GhostBtn, PrimaryBtn } from "../components/ui";
import { UserQuotesCalendarSection } from "../components/dashboard/UserQuotesCalendarSection";
import { loadLS } from "../utils";
import { LS_KEYS } from "../constants";
import { supabase, __SUPABASE_DEBUG__ } from "../lib/supabase";
import {
  buildConnectionActivityByUser,
  formatDurationMs,
  isPresenceRowActiveUser,
  loadPresenceSessions,
} from "../utils/presenceSessions";

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
  const [messageTargetRow, setMessageTargetRow] = useState(null);
  const [messageDraft, setMessageDraft] = useState("");
  const [messageSending, setMessageSending] = useState(false);
  const [, setTick] = useState(0);

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
        const rows = await loadPresenceSessions({ days: 60 });
        if (!cancelled) setSessionRows(rows);
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

  const connectionActivity = useMemo(
    () => buildConnectionActivityByUser(sessionRows, directoryUsers),
    [sessionRows, directoryUsers]
  );

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
              Présence, activité de connexion et devis créés — uniquement pour les comptes encore dans Utilisateurs.
            </p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/85 backdrop-blur-sm">
            <span className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400 shadow shadow-emerald-500/50 animate-pulse" aria-hidden />
            Connecté : <span className="font-semibold text-white">{user?.name || "—"}</span>
          </div>
        </div>
      </header>

      <section className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white/75 shadow-md shadow-slate-900/5">
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
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-sm font-bold text-white shadow-md shadow-emerald-600/20"
                      aria-hidden
                    >
                      {(row.name || "?").slice(0, 1).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-900">{row.name}</p>
                      <p className="text-xs text-slate-500">
                        {row.code ? `Code · ${row.code}` : "Pas de code en session"}
                        {since ? ` · connecté depuis ${since}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                    {row.sessions > 1 && (
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                        {row.sessions} onglets
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
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

      <section className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white/75 shadow-md shadow-slate-900/5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100/90 bg-gradient-to-r from-slate-50/95 via-indigo-50/40 to-cyan-50/40 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Activité de connexion</h2>
            <p className="mt-0.5 text-sm text-slate-600">
              Jours connectés et durée (sessions fusionnées si plusieurs onglets). Historique ~60 jours.
            </p>
          </div>
        </div>

        {sessionsLoading && connectionActivity.every((u) => u.days.length === 0) ? (
          <div className="p-8 text-center text-sm text-slate-500">Chargement des sessions…</div>
        ) : connectionActivity.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            Aucun utilisateur dans le répertoire pour afficher l&apos;activité.
          </div>
        ) : (
          <div className="grid gap-4 p-4 sm:grid-cols-2 md:p-5 xl:grid-cols-3">
            {connectionActivity.map((entry) => (
              <article
                key={`${entry.code || ""}-${entry.name}`}
                className="rounded-xl border border-slate-200/90 bg-white/90 p-4 shadow-sm shadow-indigo-900/5"
              >
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-cyan-600 text-sm font-bold text-white">
                      {(entry.name || "?").slice(0, 1).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <h3 className="truncate font-semibold text-slate-900">{entry.name}</h3>
                      <p className="text-xs text-slate-500">
                        {entry.days.length} jour{entry.days.length !== 1 ? "s" : ""} ·{" "}
                        {formatDurationMs(entry.totalMs)} cumulé
                      </p>
                    </div>
                  </div>
                </div>
                {entry.days.length === 0 ? (
                  <p className="text-xs text-slate-400">Aucune session enregistrée pour l&apos;instant.</p>
                ) : (
                  <ul className="max-h-48 space-y-1.5 overflow-y-auto pr-1">
                    {entry.days.slice(0, 21).map((day) => (
                      <li
                        key={day.dateKey}
                        className="flex items-center justify-between gap-2 rounded-lg bg-slate-50/80 px-2.5 py-1.5 text-xs"
                      >
                        <span className="font-medium capitalize text-slate-700">{day.label}</span>
                        <span className="tabular-nums text-slate-600">{formatDurationMs(day.durationMs)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            ))}
          </div>
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
                {messageTargetRow.code ? ` · code ${messageTargetRow.code}` : ""} — affichage ~3 secondes.
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

      <UserQuotesCalendarSection quotes={quotes} users={directoryUsers} />
    </div>
  );
}
