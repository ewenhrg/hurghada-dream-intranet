import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase, __SUPABASE_DEBUG__ } from "../lib/supabase";
import { SITE_KEY, CATEGORIES } from "../constants";
import { logger } from "../utils/logger";
import { getActivityTarifListLines } from "../utils/activityHelpers";
import { formatActivityAvailableDaysSummary, getActivityDayLabelsList } from "../utils/activityDaysDisplay";

/** Même jeu de colonnes que l’intranet (App.jsx) pour les prix / catégorie. */
const SELECT_COLUMNS =
  "id, name, category, price_adult, price_child, price_baby, notes, currency, site_key, available_days";

/**
 * Même logique que ActivitiesPage : une activité n’est rangée que dans une clé
 * listée dans CATEGORIES ; sinon elle va dans « desert » (évite des sections fantômes / mélanges).
 */
function canonicalCategoryKey(raw) {
  const c = (raw || "").trim();
  if (c && CATEGORIES.some((x) => x.key === c)) return c;
  return "desert";
}

/**
 * Regroupe en conservant l’ordre d’entrée (ici : id décroissant comme l’intranet),
 * et n’affiche que les catégories qui ont au moins une ligne.
 */
function groupRowsByCategory(rowsInOrder) {
  const base = {};
  CATEGORIES.forEach((c) => {
    base[c.key] = [];
  });
  for (const row of rowsInOrder || []) {
    if (!row) continue;
    const key = canonicalCategoryKey(row.category);
    base[key].push(row);
  }
  return CATEGORIES.filter((c) => base[c.key].length > 0).map((c) => ({
    key: c.key,
    label: c.label,
    items: base[c.key],
  }));
}

function formatMoney(n, currency) {
  const v = n != null && n !== "" ? Number(n) : 0;
  const safe = Number.isFinite(v) ? v : 0;
  const cur = (currency || "EUR").toUpperCase();
  try {
    return new Intl.NumberFormat("fr-FR", { style: "currency", currency: cur }).format(safe);
  } catch {
    return `${safe} ${cur}`;
  }
}

function TarifsMobileDayChips({ row }) {
  const labels = getActivityDayLabelsList(row);
  if (labels === null) {
    return <p className="text-sm text-slate-400">—</p>;
  }
  if (labels.length === 0) {
    return <p className="text-sm text-slate-500">Aucun jour</p>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {labels.map((d) => (
        <span
          key={d}
          className="inline-flex items-center rounded-lg border border-slate-200/90 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-sm tabular-nums"
        >
          {d}
        </span>
      ))}
    </div>
  );
}

function TarifsSpecialLinesList({ lines, rowId }) {
  return (
    <div className="rounded-xl border border-indigo-200/70 bg-gradient-to-br from-indigo-50/80 via-white to-slate-50/40 p-4 shadow-sm">
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-indigo-700/90">
        Grille tarifaire (plusieurs options)
      </p>
      <ul className="space-y-2.5">
        {lines.map((line, idx) => (
          <li key={`${rowId}-sl-${idx}`} className="flex gap-3 text-[15px] leading-snug text-slate-800">
            <span
              className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-500"
              aria-hidden
            />
            <span className="min-w-0 flex-1 break-words font-medium">{line}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TarifsActivityMobileCard({ row }) {
  const lines = getActivityTarifListLines(row);
  return (
    <article className="space-y-4 rounded-2xl border border-slate-200/90 bg-white p-5 shadow-soft ring-1 ring-slate-900/[0.03]">
      <h3 className="font-display text-lg font-semibold leading-snug tracking-tight text-slate-900 pr-1">
        {row.name}
      </h3>

      <div className="rounded-xl border border-slate-100 bg-slate-50/90 px-4 py-3">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">Jours disponibles</p>
        <TarifsMobileDayChips row={row} />
      </div>

      {lines ? (
        <TarifsSpecialLinesList lines={lines} rowId={row.id} />
      ) : (
        <div className="grid gap-2">
          {[
            { k: "Adulte", v: formatMoney(row.price_adult, row.currency) },
            { k: "Enfant", v: formatMoney(row.price_child, row.currency) },
            { k: "Bébé", v: formatMoney(row.price_baby, row.currency) },
          ].map(({ k, v }) => (
            <div
              key={k}
              className="flex min-w-0 items-baseline justify-between gap-4 rounded-xl border border-slate-100 bg-white px-4 py-3 shadow-sm"
            >
              <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-slate-500">{k}</span>
              <span className="min-w-0 text-right text-base font-semibold tabular-nums tracking-tight text-slate-900">
                {v}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-xl border border-slate-100 bg-slate-50/60 px-4 py-3">
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">Notes</p>
        <p className="text-sm leading-relaxed text-slate-700 whitespace-pre-wrap break-words">
          {row.notes ? String(row.notes) : "—"}
        </p>
      </div>
    </article>
  );
}

/**
 * Choisit la liste la plus longue comme App.jsx (site_key puis requêtes de secours),
 * pour que la page publique affiche autant d’activités que l’intranet après sync.
 */
async function fetchActivityRowsBestSource(client) {
  const { data, error } = await client
    .from("activities")
    .select(SELECT_COLUMNS)
    .eq("site_key", SITE_KEY)
    .order("id", { ascending: false });

  let finalRows = Array.isArray(data) ? data : [];
  let primaryError = error;

  const checks = [];
  const fallbackSiteKey = __SUPABASE_DEBUG__?.supabaseUrl;
  if (fallbackSiteKey && fallbackSiteKey !== SITE_KEY) {
    checks.push(
      client
        .from("activities")
        .select(SELECT_COLUMNS)
        .eq("site_key", fallbackSiteKey)
        .order("id", { ascending: false })
    );
  }
  checks.push(client.from("activities").select(SELECT_COLUMNS).order("id", { ascending: false }));

  const checkedResults = await Promise.all(checks.map((q) => q));
  checkedResults.forEach((result) => {
    if (!result?.error && Array.isArray(result.data) && result.data.length > finalRows.length) {
      finalRows = result.data;
    }
    if (result?.error) primaryError = primaryError || result.error;
  });

  return { rows: finalRows, error: finalRows.length === 0 ? primaryError : null };
}

export function PublicTarifsPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [lastSync, setLastSync] = useState(null);
  const [copyDone, setCopyDone] = useState(false);

  const publicUrl = typeof window !== "undefined" ? `${window.location.origin}/tarifs` : "/tarifs";

  const fetchActivities = useCallback(async () => {
    if (!__SUPABASE_DEBUG__.isConfigured || !supabase) {
      setError("Connexion à la base indisponible.");
      setRows([]);
      setLoading(false);
      return;
    }
    try {
      const { rows, error: fetchError } = await fetchActivityRowsBestSource(supabase);
      if (fetchError && rows.length === 0) {
        logger.error("PublicTarifsPage: chargement", fetchError);
        setError(fetchError.message || "Impossible de charger les tarifs.");
        setRows([]);
      } else {
        if (fetchError && rows.length > 0) {
          logger.warn("PublicTarifsPage: une requête a échoué mais une liste partielle est affichée.", fetchError);
        }
        setError(null);
        setRows(rows);
        setLastSync(new Date());
      }
    } catch (e) {
      logger.error("PublicTarifsPage:", e);
      setError(e?.message || "Erreur inattendue.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchActivities();
  }, [fetchActivities]);

  useEffect(() => {
    if (!__SUPABASE_DEBUG__.isConfigured || !supabase) return undefined;

    const channel = supabase
      .channel("public-tarifs-activities")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "activities" },
        () => {
          void fetchActivities();
        }
      )
      .subscribe();

    const poll = window.setInterval(() => {
      void fetchActivities();
    }, 120000);

    return () => {
      window.clearInterval(poll);
      supabase.removeChannel(channel);
    };
  }, [fetchActivities]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const name = (r.name || "").toLowerCase();
      const notes = (r.notes || "").toLowerCase();
      return name.includes(q) || notes.includes(q);
    });
  }, [rows, search]);

  const grouped = useMemo(() => groupRowsByCategory(filtered), [filtered]);

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopyDone(true);
      window.setTimeout(() => setCopyDone(false), 2000);
    } catch {
      window.prompt("Copiez ce lien :", publicUrl);
    }
  }

  return (
    <div className="relative min-h-screen bg-slate-100 text-slate-900 selection:bg-indigo-100 selection:text-indigo-950">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[min(28rem,55vh)] bg-gradient-to-b from-indigo-500/[0.09] via-slate-100/0 to-transparent"
        aria-hidden
      />
      <header className="relative border-b border-slate-200/90 bg-white/80 shadow-sm backdrop-blur-md">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8 md:py-10">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-indigo-600/90">Hurghada Dream</p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            Tarifs des activités
          </h1>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-slate-600">
            Liste publique en <strong className="font-semibold text-slate-800">lecture seule</strong>. Les montants se
            mettent à jour lorsque l’équipe modifie les prix dans l’intranet — même source et même ordre que la page
            Activités.
          </p>

          <div className="mt-6 flex flex-col gap-4 rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-slate-500">Lien à partager</p>
              <p className="mt-1 break-all font-mono text-sm leading-snug text-slate-800">{publicUrl}</p>
            </div>
            <button
              type="button"
              onClick={handleCopyLink}
              className="inline-flex shrink-0 items-center justify-center rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-indigo-900/15 transition hover:bg-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
            >
              {copyDone ? "Copié ✓" : "Copier le lien"}
            </button>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-slate-600">
            <Link
              to="/"
              className="font-medium text-indigo-600 underline-offset-4 transition hover:text-indigo-800 hover:underline"
            >
              Connexion intranet
            </Link>
            {lastSync && (
              <span className="text-slate-500">
                Affiché à jour : <time dateTime={lastSync.toISOString()}>{lastSync.toLocaleString("fr-FR")}</time>
              </span>
            )}
            {!loading && !error && rows.length > 0 && (
              <span className="rounded-full bg-white px-2.5 py-0.5 text-xs font-medium text-slate-600 ring-1 ring-slate-200/80">
                {rows.length} activité{rows.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>
      </header>

      <main className="relative mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6 md:py-10">
        <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-soft sm:p-5">
          <label htmlFor="tarifs-search" className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Rechercher une activité
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden>
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.2-5.2M11 18a7 7 0 100-14 7 7 0 000 14z" />
              </svg>
            </span>
            <input
              id="tarifs-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Nom d’activité ou mot dans les notes…"
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-3 pl-11 pr-4 text-slate-900 shadow-inner shadow-slate-900/[0.03] placeholder:text-slate-400 transition focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/25"
              autoComplete="off"
            />
          </div>
        </div>

        {loading && (
          <div
            className="rounded-2xl border border-slate-200/90 bg-white p-10 shadow-soft"
            role="status"
            aria-live="polite"
            aria-busy="true"
          >
            <div className="mx-auto max-w-md space-y-3">
              <div className="h-3.5 animate-pulse rounded-full bg-slate-200" />
              <div className="h-3.5 w-4/5 animate-pulse rounded-full bg-slate-200" />
              <div className="h-3.5 w-3/5 animate-pulse rounded-full bg-slate-200" />
            </div>
            <p className="mt-6 text-center text-sm font-medium text-slate-500">Chargement des tarifs…</p>
          </div>
        )}

        {!loading && error && (
          <div className="rounded-2xl border border-rose-200/90 bg-rose-50 px-5 py-4 text-sm leading-relaxed text-rose-900 shadow-sm">
            {error}
          </div>
        )}

        {!loading && !error && rows.length === 0 && (
          <p className="rounded-2xl border border-dashed border-slate-200 bg-white/80 py-14 text-center text-slate-600 shadow-sm">
            Aucune activité publiée pour le moment.
          </p>
        )}

        {!loading && !error && filtered.length === 0 && rows.length > 0 && (
          <p className="rounded-2xl border border-slate-200/90 bg-white py-10 text-center text-slate-600 shadow-sm">
            Aucun résultat pour « <span className="font-medium text-slate-800">{search.trim()}</span> ».
          </p>
        )}

        {grouped.map(({ key, label, items }) => (
          <section
            key={key}
            className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-soft"
          >
            <div className="relative border-b border-slate-100 bg-white px-5 py-4 sm:px-6">
              <div
                className="absolute left-0 top-3 bottom-3 w-1 rounded-r-full bg-indigo-500"
                aria-hidden
              />
              <div className="pl-4">
                <h2 className="font-display text-lg font-semibold tracking-tight text-slate-900 sm:text-xl">
                  {label}
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  {items.length} activité{items.length !== 1 ? "s" : ""}
                </p>
              </div>
            </div>
            <div className="md:hidden space-y-4 bg-slate-50/50 p-4 sm:p-5">
              {items.map((r) => (
                <TarifsActivityMobileCard key={r.id} row={r} />
              ))}
            </div>

            <div className="hidden md:block overflow-x-auto">
              <table className="min-w-[760px] w-full text-sm">
                <thead className="border-b border-slate-100 bg-slate-50">
                  <tr className="text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                    <th className="px-4 py-3">Activité</th>
                    <th className="px-3 py-3 w-[14%]">Jours dispo</th>
                    <th className="px-3 py-3 w-[11%] text-right">Adulte</th>
                    <th className="px-3 py-3 w-[11%] text-right">Enfant</th>
                    <th className="px-3 py-3 w-[11%] text-right">Bébé</th>
                    <th className="px-4 py-3">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((r) => {
                    const lines = getActivityTarifListLines(r);
                    return (
                    <tr key={r.id} className="transition-colors hover:bg-slate-50/80">
                      <td className="px-4 py-3 align-top font-medium leading-snug text-slate-900">{r.name}</td>
                      <td className="max-w-[11rem] px-3 py-3 align-top text-xs leading-relaxed text-slate-600">
                        {formatActivityAvailableDaysSummary(r)}
                      </td>
                      {lines ? (
                        <td colSpan={3} className="min-w-[16rem] px-3 py-3 align-top">
                          <TarifsSpecialLinesList lines={lines} rowId={r.id} />
                        </td>
                      ) : (
                        <>
                      <td className="px-3 py-3 text-right font-semibold tabular-nums text-slate-900">
                        {formatMoney(r.price_adult, r.currency)}
                      </td>
                      <td className="px-3 py-3 text-right font-semibold tabular-nums text-slate-900">
                        {formatMoney(r.price_child, r.currency)}
                      </td>
                      <td className="px-3 py-3 text-right font-semibold tabular-nums text-slate-900">
                        {formatMoney(r.price_baby, r.currency)}
                      </td>
                        </>
                      )}
                      <td className="max-w-xs px-4 py-3 align-top text-xs leading-relaxed text-slate-600 whitespace-pre-wrap">
                        {r.notes ? String(r.notes) : "—"}
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </main>

      <footer className="relative mt-12 border-t border-slate-200/90 bg-white/60 py-8 text-center text-xs leading-relaxed text-slate-500 backdrop-blur-sm">
        Hurghada Dream — tarifs indicatifs, non modifiables sur cette page.
      </footer>
    </div>
  );
}
