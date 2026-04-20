import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
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

/** Couleurs fortes par rubrique + textes toujours très lisibles (contraste élevé). */
const CATEGORY_VISUAL = {
  desert: {
    bar: "bg-amber-500",
    headerTint: "from-amber-200/95 via-amber-50/80 to-white",
    count: "border-amber-700/30 bg-amber-600 text-white",
    cardGlow: "shadow-[0_20px_50px_-12px_rgba(245,158,11,0.22)]",
  },
  aquatique: {
    bar: "bg-sky-500",
    headerTint: "from-sky-200/95 via-cyan-50/80 to-white",
    count: "border-sky-700/30 bg-sky-600 text-white",
    cardGlow: "shadow-[0_20px_50px_-12px_rgba(14,165,233,0.22)]",
  },
  exploration_bien_etre: {
    bar: "bg-emerald-500",
    headerTint: "from-emerald-200/95 via-teal-50/80 to-white",
    count: "border-emerald-800/30 bg-emerald-600 text-white",
    cardGlow: "shadow-[0_20px_50px_-12px_rgba(16,185,129,0.22)]",
  },
  luxor_caire: {
    bar: "bg-violet-500",
    headerTint: "from-violet-200/95 via-fuchsia-50/70 to-white",
    count: "border-violet-800/30 bg-violet-600 text-white",
    cardGlow: "shadow-[0_20px_50px_-12px_rgba(139,92,246,0.22)]",
  },
  marsa_alam: {
    bar: "bg-rose-500",
    headerTint: "from-rose-200/95 via-rose-50/80 to-white",
    count: "border-rose-800/30 bg-rose-600 text-white",
    cardGlow: "shadow-[0_20px_50px_-12px_rgba(244,63,94,0.2)]",
  },
  transfert: {
    bar: "bg-indigo-500",
    headerTint: "from-indigo-200/95 via-indigo-50/80 to-white",
    count: "border-indigo-800/30 bg-indigo-600 text-white",
    cardGlow: "shadow-[0_20px_50px_-12px_rgba(79,70,229,0.22)]",
  },
};

function getCategoryVisual(categoryKey) {
  return CATEGORY_VISUAL[categoryKey] || CATEGORY_VISUAL.transfert;
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
    return <p className="text-sm font-medium text-slate-600">—</p>;
  }
  if (labels.length === 0) {
    return <p className="text-sm font-medium text-slate-700">Aucun jour</p>;
  }
  return (
    <div className="flex flex-wrap gap-2">
      {labels.map((d) => (
        <span
          key={d}
          className="inline-flex items-center rounded-lg border-2 border-indigo-200 bg-gradient-to-b from-indigo-50 to-white px-2.5 py-1.5 text-xs font-bold tabular-nums text-indigo-950 shadow-sm"
        >
          {d}
        </span>
      ))}
    </div>
  );
}

function TarifsSpecialLinesList({ lines, rowId }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border-2 border-indigo-400/80 bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 p-4 shadow-xl ring-2 ring-indigo-400/30 sm:p-5">
      <div
        className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-cyan-400/25 blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -bottom-12 -left-8 h-32 w-32 rounded-full bg-amber-400/20 blur-2xl"
        aria-hidden
      />
      <p className="relative mb-3 text-[11px] font-bold uppercase tracking-[0.18em] text-amber-300">
        Grille tarifaire (plusieurs options)
      </p>
      <ul className="relative space-y-3">
        {lines.map((line, idx) => (
          <li
            key={`${rowId}-sl-${idx}`}
            className="flex gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-[15px] font-semibold leading-snug text-white backdrop-blur-sm"
          >
            <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.9)]" aria-hidden />
            <span className="min-w-0 flex-1 break-words">{line}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TarifsActivityMobileCard({ row, categoryKey }) {
  const lines = getActivityTarifListLines(row);
  const v = getCategoryVisual(categoryKey);
  return (
    <article
      className={`relative overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-5 shadow-lg ring-1 ring-slate-900/5 sm:p-6 ${v.cardGlow}`}
    >
      <div className={`absolute inset-x-0 top-0 h-1.5 ${v.bar}`} aria-hidden />
      <div className="pt-2">
        <h3 className="font-display text-xl font-bold leading-snug tracking-tight text-slate-900 sm:text-2xl">
          {row.name}
        </h3>

        <div className="mt-4 rounded-2xl border-2 border-slate-200 bg-gradient-to-br from-slate-50 to-white px-4 py-3.5 shadow-inner">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-700">Jours disponibles</p>
          <TarifsMobileDayChips row={row} />
        </div>

        {lines ? (
          <div className="mt-4">
            <TarifsSpecialLinesList lines={lines} rowId={row.id} />
          </div>
        ) : (
          <div className="mt-4 grid gap-2.5">
            {[
              {
                k: "Adulte",
                v: formatMoney(row.price_adult, row.currency),
                bar: "border-l-indigo-600",
                tint: "from-indigo-50 to-white",
                label: "text-indigo-950",
              },
              {
                k: "Enfant",
                v: formatMoney(row.price_child, row.currency),
                bar: "border-l-teal-600",
                tint: "from-teal-50 to-white",
                label: "text-teal-950",
              },
              {
                k: "Bébé",
                v: formatMoney(row.price_baby, row.currency),
                bar: "border-l-rose-600",
                tint: "from-rose-50 to-white",
                label: "text-rose-950",
              },
            ].map(({ k, v, bar, tint, label }) => (
              <div
                key={k}
                className={`flex min-w-0 items-baseline justify-between gap-4 rounded-xl border border-slate-200/90 bg-gradient-to-r ${tint} px-4 py-3.5 shadow-sm ${bar} border-l-[5px]`}
              >
                <span className={`shrink-0 text-xs font-extrabold uppercase tracking-wide ${label}`}>{k}</span>
                <span className="min-w-0 text-right text-lg font-bold tabular-nums tracking-tight text-slate-900">
                  {v}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 rounded-2xl border-2 border-amber-200/90 bg-gradient-to-br from-amber-50 via-white to-orange-50/50 px-4 py-3.5">
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-amber-900">Notes</p>
          <p className="text-[15px] font-medium leading-relaxed text-slate-900 whitespace-pre-wrap break-words">
            {row.notes ? String(row.notes) : "—"}
          </p>
        </div>
      </div>
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
  const [scrollProgress, setScrollProgress] = useState(0);

  const publicUrl = typeof window !== "undefined" ? `${window.location.origin}/tarifs` : "/tarifs";

  useEffect(() => {
    const onScroll = () => {
      const el = document.documentElement;
      const max = el.scrollHeight - el.clientHeight;
      setScrollProgress(max > 0 ? Math.min(100, (el.scrollTop / max) * 100) : 0);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

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
    <div className="relative min-h-screen bg-stone-100 text-slate-900 selection:bg-cyan-200 selection:text-slate-950">
      <div
        className="pointer-events-none fixed left-0 top-0 z-[90] h-1 bg-gradient-to-r from-indigo-500 via-cyan-400 to-amber-400 transition-[width] duration-150 ease-out"
        style={{ width: `${scrollProgress}%` }}
        aria-hidden
      />

      <header className="relative overflow-hidden border-b border-white/10 bg-slate-950 text-white shadow-2xl shadow-indigo-950/40">
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_90%_60%_at_50%_-30%,rgba(99,102,241,0.45),transparent)]"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_85%_25%,rgba(6,182,212,0.22),transparent_45%)]"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_10%_80%,rgba(251,191,36,0.12),transparent_40%)]"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.12] bg-[linear-gradient(to_right,rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.08)_1px,transparent_1px)] bg-[size:40px_40px]"
          aria-hidden
        />

        <div className="relative mx-auto max-w-6xl px-4 pb-4 pt-10 sm:px-6 sm:pb-6 sm:pt-14 md:pt-16">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-cyan-200">
              Hurghada Dream
            </span>
            <span className="rounded-full border border-emerald-400/40 bg-emerald-400/15 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-emerald-200">
              Lecture seule
            </span>
          </div>

          <h1 className="mt-5 max-w-4xl font-display text-4xl font-bold leading-[1.08] tracking-tight text-white sm:text-5xl md:text-6xl">
            Tarifs des{" "}
            <span className="bg-gradient-to-r from-cyan-300 via-white to-amber-300 bg-clip-text text-transparent">
              activités
            </span>
          </h1>

          <p className="mt-5 max-w-2xl text-base font-medium leading-relaxed text-slate-200 sm:text-lg">
            Page publique ultra lisible : gros titres, couleurs par rubrique, montants bien contrastés. Les prix
            sont mis à jour en direct lorsque nous les modifions (même base, même ordre).
          </p>

          <div className="mt-8 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
            <div className="rounded-2xl border border-white/15 bg-slate-900/50 p-4 shadow-inner backdrop-blur-md sm:p-5">
              <p className="text-xs font-bold uppercase tracking-wider text-amber-200/90">Lien à partager</p>
              <p className="mt-2 break-all font-mono text-sm font-medium leading-relaxed text-white sm:text-base">
                {publicUrl}
              </p>
            </div>
            <button
              type="button"
              onClick={handleCopyLink}
              className="inline-flex h-12 min-w-[11rem] items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 to-indigo-600 px-6 text-sm font-bold text-slate-950 shadow-lg shadow-cyan-500/25 transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
            >
              {copyDone ? "Copié ✓" : "Copier le lien"}
            </button>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-4 text-sm font-semibold">
            <Link
              to="/"
              className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/5 px-4 py-2 text-cyan-200 transition hover:border-cyan-300/60 hover:bg-white/10 hover:text-white"
            >
              <span aria-hidden>←</span> Connexion
            </Link>
            {lastSync && (
              <span className="text-slate-300">
                Maj affichée :{" "}
                <time className="text-white" dateTime={lastSync.toISOString()}>
                  {lastSync.toLocaleString("fr-FR")}
                </time>
              </span>
            )}
          </div>
        </div>

        <div className="relative -mb-px leading-none text-stone-100" aria-hidden>
          <svg className="block w-full" viewBox="0 0 1440 48" preserveAspectRatio="none">
            <path
              fill="currentColor"
              d="M0,32 C240,8 480,48 720,24 C960,0 1200,40 1440,16 L1440,48 L0,48 Z"
            />
          </svg>
        </div>
      </header>

      <main className="relative -mt-px bg-stone-100 pb-16 pt-8 sm:pt-10">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.35] bg-[radial-gradient(circle_at_1px_1px,rgba(15,23,42,0.07)_1px,transparent_0)] bg-[length:20px_20px]"
          aria-hidden
        />

        <div className="relative mx-auto max-w-6xl space-y-8 px-4 sm:px-6">
          <div className="relative rounded-3xl bg-gradient-to-br from-indigo-500 via-violet-600 to-cyan-500 p-[2px] shadow-2xl shadow-indigo-900/20">
            <div className="rounded-[22px] bg-white p-4 sm:p-6">
              <label
                htmlFor="tarifs-search"
                className="mb-2 block text-xs font-extrabold uppercase tracking-[0.12em] text-slate-800"
              >
                Rechercher une activité
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-indigo-500" aria-hidden>
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.25}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.2-5.2M11 18a7 7 0 100-14 7 7 0 000 14z" />
                  </svg>
                </span>
                <input
                  id="tarifs-search"
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Nom, mot-clé, ou extrait des notes…"
                  className="w-full rounded-2xl border-2 border-slate-200 bg-slate-50 py-3.5 pl-12 pr-4 text-base font-medium text-slate-900 placeholder:text-slate-500 shadow-inner transition focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-indigo-500/20"
                  autoComplete="off"
                />
              </div>
            </div>
          </div>

          {loading && (
            <div
              className="rounded-3xl border-2 border-slate-200 bg-white p-12 shadow-xl"
              role="status"
              aria-live="polite"
              aria-busy="true"
            >
              <div className="mx-auto max-w-lg space-y-4">
                <div className="h-4 animate-pulse rounded-full bg-gradient-to-r from-slate-200 via-indigo-100 to-slate-200" />
                <div className="h-4 w-5/6 animate-pulse rounded-full bg-slate-200" />
                <div className="h-4 w-2/3 animate-pulse rounded-full bg-slate-200" />
              </div>
              <p className="mt-8 text-center text-base font-bold text-slate-700">Chargement des tarifs…</p>
            </div>
          )}

          {!loading && error && (
            <div className="rounded-3xl border-2 border-rose-300 bg-rose-50 px-6 py-5 text-base font-semibold leading-relaxed text-rose-950 shadow-lg">
              {error}
            </div>
          )}

          {!loading && !error && rows.length === 0 && (
            <p className="rounded-3xl border-2 border-dashed border-slate-300 bg-white py-16 text-center text-base font-semibold text-slate-800 shadow-inner">
              Aucune activité publiée pour le moment.
            </p>
          )}

          {!loading && !error && filtered.length === 0 && rows.length > 0 && (
            <p className="rounded-3xl border-2 border-amber-200 bg-amber-50 py-10 text-center text-base font-semibold text-amber-950 shadow-md">
              Aucun résultat pour « <span className="font-black text-slate-900">{search.trim()}</span> ».
            </p>
          )}

          {grouped.map(({ key, label, items }) => {
            const vis = getCategoryVisual(key);
            return (
              <section
                key={key}
                className={`overflow-hidden rounded-3xl border-2 border-slate-200/90 bg-white shadow-2xl ring-1 ring-slate-900/[0.04] ${vis.cardGlow}`}
              >
                <div
                  className={`relative border-b border-slate-200/80 bg-gradient-to-r px-5 py-5 sm:px-7 sm:py-6 ${vis.headerTint}`}
                >
                  <div className={`absolute left-0 top-0 h-full w-1.5 ${vis.bar}`} aria-hidden />
                  <div className="flex flex-wrap items-start justify-between gap-3 pl-3 sm:pl-4">
                    <div>
                      <h2 className="font-display text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">
                        {label}
                      </h2>
                      <p className="mt-1 text-sm font-bold text-slate-800">
                        {items.length} activité{items.length !== 1 ? "s" : ""} dans cette rubrique
                      </p>
                    </div>
                    <span
                      className={`inline-flex shrink-0 items-center rounded-full border-2 px-4 py-1.5 text-xs font-black uppercase tracking-wide shadow-md ${vis.count}`}
                    >
                      Rubrique
                    </span>
                  </div>
                </div>

                <div className="space-y-5 bg-gradient-to-b from-slate-50 to-stone-50/80 p-4 sm:space-y-6 sm:p-6 md:hidden">
                  {items.map((r) => (
                    <TarifsActivityMobileCard key={r.id} row={r} categoryKey={key} />
                  ))}
                </div>

                <div className="hidden md:block overflow-x-auto bg-white">
                  <table className="min-w-[820px] w-full text-sm">
                    <thead>
                      <tr className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-left text-[11px] font-extrabold uppercase tracking-[0.12em] text-white">
                        <th className="px-5 py-4">Activité</th>
                        <th className="px-4 py-4 w-[15%] text-amber-200">Jours</th>
                        <th className="px-4 py-4 w-[11%] text-right text-cyan-200">Adulte</th>
                        <th className="px-4 py-4 w-[11%] text-right text-emerald-200">Enfant</th>
                        <th className="px-4 py-4 w-[11%] text-right text-rose-200">Bébé</th>
                        <th className="px-5 py-4 text-amber-100">Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {items.map((r, idx) => {
                        const lines = getActivityTarifListLines(r);
                        const zebra = idx % 2 === 0 ? "bg-white" : "bg-slate-50/90";
                        return (
                          <tr key={r.id} className={`${zebra} transition-colors hover:bg-indigo-50/50`}>
                            <td className="px-5 py-4 align-top text-base font-bold leading-snug text-slate-900">
                              {r.name}
                            </td>
                            <td className="max-w-[12rem] px-4 py-4 align-top text-xs font-semibold leading-relaxed text-slate-800">
                              {formatActivityAvailableDaysSummary(r)}
                            </td>
                            {lines ? (
                              <td colSpan={3} className="min-w-[18rem] px-4 py-4 align-top">
                                <TarifsSpecialLinesList lines={lines} rowId={r.id} />
                              </td>
                            ) : (
                              <>
                                <td className="border-l-4 border-indigo-500 bg-indigo-50/60 px-4 py-4 text-right text-base font-black tabular-nums text-indigo-950">
                                  {formatMoney(r.price_adult, r.currency)}
                                </td>
                                <td className="border-l-4 border-teal-500 bg-teal-50/60 px-4 py-4 text-right text-base font-black tabular-nums text-teal-950">
                                  {formatMoney(r.price_child, r.currency)}
                                </td>
                                <td className="border-l-4 border-rose-500 bg-rose-50/60 px-4 py-4 text-right text-base font-black tabular-nums text-rose-950">
                                  {formatMoney(r.price_baby, r.currency)}
                                </td>
                              </>
                            )}
                            <td className="max-w-[14rem] border-l-4 border-amber-400 bg-amber-50/50 px-5 py-4 align-top text-xs font-semibold leading-relaxed text-slate-900 whitespace-pre-wrap">
                              {r.notes ? String(r.notes) : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })}
        </div>
      </main>

      <footer className="relative border-t border-white/10 bg-slate-950 py-10 text-center">
        <p className="mx-auto max-w-2xl px-4 text-sm font-semibold leading-relaxed text-slate-300">
          <span className="text-white">Hurghada Dream</span> — tarifs indicatifs, page{" "}
          <span className="text-amber-300">non modifiable</span>. Textes optimisés pour lecture rapide sur mobile et
          grand écran.
        </p>
      </footer>
    </div>
  );
}
