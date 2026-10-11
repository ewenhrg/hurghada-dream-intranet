import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Copy, Search } from "lucide-react";
import { PublicAppShell } from "../components/public/PublicAppShell";
import { HdLoader } from "../components/public/GuestPageLoader";
import { StateCard } from "../components/public/PublicUI";
import { supabase, __SUPABASE_DEBUG__ } from "../lib/supabase";
import { SITE_KEY, CATEGORIES } from "../constants";
import { logger } from "../utils/logger";
import { getActivityTarifListLines } from "../utils/activityHelpers";
import { formatActivityAvailableDaysSummary, getActivityDayLabelsList } from "../utils/activityDaysDisplay";

/** Même jeu de colonnes que la gestion interne (App.jsx) pour les prix / catégorie. */
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
 * Regroupe en conservant l’ordre d’entrée (ici : id décroissant comme en gestion),
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
    return <p className="text-sm font-medium text-catalog-muted">—</p>;
  }
  if (labels.length === 0) {
    return <p className="text-sm font-medium text-catalog-muted">Aucun jour</p>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {labels.map((d) => (
        <span
          key={d}
          className="inline-flex min-h-7 items-center rounded-full bg-catalog-lagoonSoft px-2.5 text-xs font-bold tabular-nums text-catalog-lagoon"
        >
          {d}
        </span>
      ))}
    </div>
  );
}

function TarifsSpecialLinesList({ lines, rowId }) {
  return (
    <div className="relative overflow-hidden rounded-[1.25rem] bg-catalog-abyss p-4 sm:p-5">
      <p className="relative mb-3 text-[0.625rem] font-bold uppercase tracking-[0.2em] text-catalog-sand">
        Grille tarifaire (plusieurs options)
      </p>
      <ul className="relative space-y-2">
        {lines.map((line, idx) => (
          <li
            key={`${rowId}-sl-${idx}`}
            className="flex gap-3 rounded-xl bg-white/[0.06] px-3 py-2.5 text-[0.9375rem] font-semibold leading-snug text-white ring-1 ring-white/10"
          >
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-catalog-sand" aria-hidden />
            <span className="min-w-0 flex-1 break-words">{line}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TarifsActivityMobileCard({ row }) {
  const lines = getActivityTarifListLines(row);
  return (
    <article data-reveal="card" className="hdc-card p-5">
      <h3 className="font-catalog-display text-[1.375rem] font-medium leading-snug text-catalog-ink">{row.name}</h3>

      <div className="mt-3">
        <p className="mb-2 text-[0.625rem] font-bold uppercase tracking-[0.18em] text-catalog-muted">Jours disponibles</p>
        <TarifsMobileDayChips row={row} />
      </div>

      {lines ? (
        <div className="mt-4">
          <TarifsSpecialLinesList lines={lines} rowId={row.id} />
        </div>
      ) : (
        <dl className="mt-4 grid grid-cols-3 gap-2">
          {[
            { k: "Adulte", v: formatMoney(row.price_adult, row.currency), tone: "bg-catalog-raised text-white" },
            { k: "Enfant", v: formatMoney(row.price_child, row.currency), tone: "bg-catalog-lagoonSoft text-catalog-ink" },
            { k: "Bébé", v: formatMoney(row.price_baby, row.currency), tone: "bg-catalog-bg text-catalog-ink" },
          ].map(({ k, v, tone }) => (
            <div key={k} className={`min-w-0 rounded-2xl px-3 py-3 ${tone}`}>
              <dt className="text-[0.625rem] font-bold uppercase tracking-[0.16em] opacity-70">{k}</dt>
              <dd className="mt-1 truncate font-catalog-display text-lg leading-none tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
      )}

      {row.notes ? (
        <div className="mt-4 rounded-2xl bg-catalog-brassSoft px-4 py-3">
          <p className="mb-1 text-[0.625rem] font-bold uppercase tracking-[0.16em] text-catalog-brass">Notes</p>
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-catalog-body">{String(row.notes)}</p>
        </div>
      ) : null}
    </article>
  );
}

/**
 * Choisit la liste la plus longue comme App.jsx (site_key puis requêtes de secours),
 * pour que la page publique affiche autant d’activités que la gestion interne après sync.
 */
async function fetchActivityRowsBestSource(client) {
  const { data, error } = await client
    .from("activities")
    .select(SELECT_COLUMNS)
    .eq("site_key", SITE_KEY)
    .order("id", { ascending: false });

  let finalRows = Array.isArray(data) ? data : [];
  let primaryError = error;

  // Filet de sécurité : lecture sans filtre (surensemble de toutes les valeurs
  // de site_key). L'ancienne requête `site_key = <URL Supabase>` a été retirée :
  // `SITE_KEY` ne peut plus valoir une URL (normalizeSiteKey), et cette lecture
  // sans filtre couvre déjà ces lignes historiques.
  const checks = [
    client.from("activities").select(SELECT_COLUMNS).order("id", { ascending: false }),
  ];

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
    <PublicAppShell title="Tarifs" wide revealKey={`${loading ? "l" : "r"}-${filtered.length}`}>
      <section className="mx-auto max-w-6xl px-4 pb-2 pt-7 sm:px-6 sm:pt-12">
        <p data-reveal="item" className="hdc-eyebrow">Lecture seule · en direct</p>
        <h1 data-split className="mt-2 font-catalog-display text-[2rem] leading-[1.1] text-catalog-ink">
          Tarifs des activités
        </h1>
        <p data-reveal="item" className="mt-3 max-w-2xl text-[0.9375rem] leading-relaxed text-catalog-muted sm:text-base">
          Prix indicatifs, mis à jour en direct. Pour réserver, utilisez le catalogue.
        </p>
        <div data-reveal="item" className="mt-5 flex items-center gap-2 rounded-full bg-white p-1.5 pl-4 ring-1 ring-catalog-line">
          <p className="min-w-0 flex-1 truncate font-mono text-xs text-catalog-muted">{publicUrl}</p>
          <button
            type="button"
            data-press
            onClick={handleCopyLink}
            className="hdc-btn hdc-btn-ink !min-h-11 shrink-0 !px-4 text-sm"
          >
            {copyDone ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
            {copyDone ? "Copié" : "Copier"}
          </button>
        </div>
        {lastSync ? (
          <p className="mt-3 text-xs font-medium text-catalog-muted">
            Mise à jour : <time dateTime={lastSync.toISOString()}>{lastSync.toLocaleString("fr-FR")}</time>
          </p>
        ) : null}

        <label data-reveal="item" htmlFor="tarifs-search" className="relative mt-5 block">
          <span className="sr-only">Rechercher une activité</span>
          <Search className="pointer-events-none absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-catalog-lagoon" aria-hidden />
          <input
            id="tarifs-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Nom, mot-clé, ou extrait des notes…"
            className="hdc-input !min-h-[3.5rem] !rounded-full !bg-white !pl-14 shadow-catalog-card"
            autoComplete="off"
          />
        </label>
      </section>

      <main className="relative mx-auto max-w-6xl space-y-12 px-4 pb-16 pt-8 sm:px-6">
        {loading ? <HdLoader label="Chargement des tarifs…" className="py-20" /> : null}

        {!loading && error ? (
          <StateCard tone="error" title="Tarifs indisponibles">
            {error}
          </StateCard>
        ) : null}

        {!loading && !error && rows.length === 0 ? (
          <StateCard title="Aucune activité publiée pour le moment" />
        ) : null}

        {!loading && !error && filtered.length === 0 && rows.length > 0 ? (
          <StateCard title="Aucun résultat">
            Rien ne correspond à « <strong className="text-catalog-ink">{search.trim()}</strong> ».
          </StateCard>
        ) : null}

        {grouped.map(({ key, label, items }) => (
          <section key={key} className="space-y-4">
            <div data-reveal="item" className="flex items-end justify-between gap-4">
              <div>
                <p className="hdc-eyebrow">Rubrique</p>
                <h2 className="mt-1.5 font-catalog-display text-[1.75rem] font-medium leading-tight sm:text-3xl">{label}</h2>
              </div>
              <span className="shrink-0 rounded-full bg-white px-3 py-1.5 text-xs font-bold tabular-nums text-catalog-muted ring-1 ring-catalog-line">
                {items.length} activité{items.length !== 1 ? "s" : ""}
              </span>
            </div>

            <div className="space-y-3 md:hidden">
              {items.map((r) => (
                <TarifsActivityMobileCard key={r.id} row={r} />
              ))}
            </div>

            <div data-reveal="item" className="hdc-card hidden overflow-x-auto md:block">
              <table className="w-full min-w-[820px] text-sm">
                <thead>
                  <tr className="bg-catalog-raised text-left text-[0.625rem] font-bold uppercase tracking-[0.16em] text-white/80">
                    <th className="px-5 py-4">Activité</th>
                    <th className="w-[15%] px-4 py-4">Jours</th>
                    <th className="w-[11%] px-4 py-4 text-right">Adulte</th>
                    <th className="w-[11%] px-4 py-4 text-right">Enfant</th>
                    <th className="w-[11%] px-4 py-4 text-right">Bébé</th>
                    <th className="px-5 py-4">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-catalog-line">
                  {items.map((r) => {
                    const lines = getActivityTarifListLines(r);
                    return (
                      <tr key={r.id} className="transition-colors hover:bg-catalog-bg">
                        <td className="px-5 py-4 align-top font-catalog-display text-base font-medium leading-snug text-catalog-ink">
                          {r.name}
                        </td>
                        <td className="max-w-[12rem] px-4 py-4 align-top text-xs font-semibold leading-relaxed text-catalog-muted">
                          {formatActivityAvailableDaysSummary(r)}
                        </td>
                        {lines ? (
                          <td colSpan={3} className="min-w-[18rem] px-4 py-4 align-top">
                            <TarifsSpecialLinesList lines={lines} rowId={r.id} />
                          </td>
                        ) : (
                          <>
                            <td className="px-4 py-4 text-right align-top font-catalog-display text-lg tabular-nums text-catalog-ink">
                              {formatMoney(r.price_adult, r.currency)}
                            </td>
                            <td className="px-4 py-4 text-right align-top font-catalog-display text-lg tabular-nums text-catalog-lagoon">
                              {formatMoney(r.price_child, r.currency)}
                            </td>
                            <td className="px-4 py-4 text-right align-top font-catalog-display text-lg tabular-nums text-catalog-muted">
                              {formatMoney(r.price_baby, r.currency)}
                            </td>
                          </>
                        )}
                        <td className="max-w-[14rem] whitespace-pre-wrap px-5 py-4 align-top text-xs leading-relaxed text-catalog-body">
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
    </PublicAppShell>
  );
}
