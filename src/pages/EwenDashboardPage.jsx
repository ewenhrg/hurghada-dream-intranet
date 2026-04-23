import { useMemo, useCallback } from "react";
import { GhostBtn } from "../components/ui";

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

export function EwenDashboardPage({ user, presenceState, supabaseConfigured, onForceLogoutRequest }) {
  const onlineRows = useMemo(() => presenceStateToRows(presenceState), [presenceState]);

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

  return (
    <div className="space-y-8">
      <header className="rounded-2xl px-5 py-6 bg-gradient-to-r from-slate-900/90 via-indigo-950/90 to-slate-900/90 border border-white/10 text-white shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-indigo-200/90 mb-1">Ewen · Tableau de bord</p>
            <h1 className="text-2xl font-bold tracking-tight">Vue d’ensemble</h1>
            <p className="text-sm text-white/70 mt-1 max-w-xl">
              Indicateurs internes. D’autres blocs pourront s’ajouter ici plus tard.
            </p>
          </div>
          <div className="flex items-center gap-2 text-sm text-white/80">
            <span className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400 shadow shadow-emerald-500/50 animate-pulse" aria-hidden />
            Connecté : <span className="font-semibold text-white">{user?.name || "—"}</span>
          </div>
        </div>
      </header>

      <section className="rounded-2xl border border-slate-200/80 bg-white/95 shadow-lg shadow-slate-200/40 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 bg-gradient-to-r from-emerald-50/90 to-teal-50/80 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Qui est en ligne</h2>
            <p className="text-sm text-slate-600">
              Connexions actives à l’intranet (temps réel Supabase). Un même compte sur plusieurs onglets compte plusieurs sessions. Vous pouvez forcer la déconnexion si quelqu’un a laissé une session ouverte.
            </p>
          </div>
          <span className="text-sm font-medium tabular-nums px-3 py-1 rounded-full bg-white/90 border border-emerald-200 text-emerald-900">
            {onlineRows.length} personne{onlineRows.length !== 1 ? "s" : ""}
          </span>
        </div>

        {!supabaseConfigured ? (
          <div className="p-6 text-sm text-amber-900 bg-amber-50 border-t border-amber-100">
            Supabase n’est pas configuré : la présence en ligne n’est pas disponible.
          </div>
        ) : onlineRows.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm">
            Aucune présence détectée pour l’instant. Les autres utilisateurs apparaîtront dès qu’ils sont connectés à l’intranet.
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {onlineRows.map((row) => (
              <li
                key={row.mapKey}
                className="px-5 py-4 flex flex-wrap items-center justify-between gap-3 hover:bg-slate-50/80 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white text-sm font-bold shadow-md"
                    aria-hidden
                  >
                    {(row.name || "?").slice(0, 1).toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 truncate">{row.name}</p>
                    {row.code ? (
                      <p className="text-xs text-slate-500 font-mono">Code · {row.code}</p>
                    ) : (
                      <p className="text-xs text-slate-400">Pas de code en session</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                  {row.sessions > 1 && (
                    <span className="text-xs font-medium px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-800">
                      {row.sessions} onglets
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    En ligne
                  </span>
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
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 px-5 py-8 text-center text-slate-500 text-sm">
        Espace réservé pour de futurs indicateurs (stats devis, alertes, etc.).
      </section>
    </div>
  );
}
