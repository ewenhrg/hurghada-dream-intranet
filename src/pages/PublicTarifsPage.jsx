import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase, __SUPABASE_DEBUG__ } from "../lib/supabase";
import { SITE_KEY, CATEGORIES } from "../constants";
import { logger } from "../utils/logger";

const SELECT =
  "id, name, category, price_adult, price_child, price_baby, notes, currency";

function categoryLabel(key) {
  const k = key || "desert";
  return CATEGORIES.find((c) => c.key === k)?.label || k;
}

function groupRowsByCategory(rows) {
  const map = new Map();
  for (const row of rows || []) {
    if (!row) continue;
    const cat = row.category || "desert";
    if (!map.has(cat)) map.set(cat, []);
    map.get(cat).push(row);
  }
  for (const arr of map.values()) {
    arr.sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "fr", { sensitivity: "base" }));
  }
  const orderedKeys = [];
  for (const c of CATEGORIES) {
    if (map.has(c.key) && map.get(c.key).length) orderedKeys.push(c.key);
  }
  const rest = [...map.keys()]
    .filter((k) => !orderedKeys.includes(k))
    .sort((a, b) => String(a).localeCompare(String(b)));
  for (const k of rest) {
    if (map.get(k).length) orderedKeys.push(k);
  }
  return orderedKeys.map((key) => ({ key, label: categoryLabel(key), items: map.get(key) }));
}

function formatMoney(n, currency) {
  const v = Number(n) || 0;
  const cur = (currency || "EUR").toUpperCase();
  try {
    return new Intl.NumberFormat("fr-FR", { style: "currency", currency: cur }).format(v);
  } catch {
    return `${v} ${cur}`;
  }
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
      const { data, error: fetchError } = await supabase
        .from("activities")
        .select(SELECT)
        .eq("site_key", SITE_KEY)
        .order("name", { ascending: true });
      if (fetchError) {
        logger.error("PublicTarifsPage: chargement", fetchError);
        setError(fetchError.message || "Impossible de charger les tarifs.");
        setRows([]);
      } else {
        setError(null);
        setRows(Array.isArray(data) ? data : []);
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
        { event: "*", schema: "public", table: "activities", filter: `site_key=eq.${SITE_KEY}` },
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
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 text-slate-900">
      <header className="border-b border-slate-200/80 bg-white/90 backdrop-blur-sm shadow-sm">
        <div className="mx-auto max-w-5xl px-4 py-6 md:py-8">
          <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600 mb-1">Hurghada Dream</p>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900">Tarifs des activités</h1>
          <p className="mt-2 text-sm text-slate-600 max-w-2xl">
            Liste publique en <strong>lecture seule</strong>. Les montants sont mis à jour automatiquement lorsque
            l’équipe modifie les prix dans l’intranet.
          </p>
          <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-3">
            <p className="text-sm text-slate-700">
              <span className="text-slate-500">Lien à partager :</span>{" "}
              <span className="font-mono text-sm bg-slate-100 px-2 py-1 rounded border border-slate-200 break-all">
                « {publicUrl} »
              </span>
            </p>
            <button
              type="button"
              onClick={handleCopyLink}
              className="shrink-0 inline-flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
            >
              {copyDone ? "Copié ✓" : "Copier le lien"}
            </button>
          </div>
          <div className="mt-4 flex flex-wrap gap-4 text-sm">
            <Link to="/" className="text-indigo-600 hover:text-indigo-800 font-medium">
              Connexion intranet →
            </Link>
            {lastSync && (
              <span className="text-slate-500">
                Dernière mise à jour affichée : {lastSync.toLocaleString("fr-FR")}
              </span>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6 md:py-8 space-y-6">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <label htmlFor="tarifs-search" className="block text-xs font-semibold text-slate-600 mb-2">
            Rechercher une activité
          </label>
          <input
            id="tarifs-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tapez un nom ou un mot dans les notes…"
            className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            autoComplete="off"
          />
        </div>

        {loading && (
          <p className="text-center text-slate-600 py-12">Chargement des tarifs…</p>
        )}

        {!loading && error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
            {error}
          </div>
        )}

        {!loading && !error && rows.length === 0 && (
          <p className="text-center text-slate-600 py-12">Aucune activité publiée pour le moment.</p>
        )}

        {!loading && !error && filtered.length === 0 && rows.length > 0 && (
          <p className="text-center text-slate-600 py-8">Aucun résultat pour « {search.trim()} ».</p>
        )}

        {grouped.map(({ key, label, items }) => (
          <section
            key={key}
            className="rounded-2xl border border-slate-200/90 bg-white shadow-sm overflow-hidden"
          >
            <div className="px-4 py-3 bg-gradient-to-r from-indigo-50 to-slate-50 border-b border-slate-100">
              <h2 className="text-lg font-semibold text-slate-900">{label}</h2>
              <p className="text-xs text-slate-500">{items.length} activité{items.length !== 1 ? "s" : ""}</p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-[640px] w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 border-b border-slate-100">
                    <th className="px-3 py-2.5">Activité</th>
                    <th className="px-2 py-2.5 w-[14%]">Adulte</th>
                    <th className="px-2 py-2.5 w-[14%]">Enfant</th>
                    <th className="px-2 py-2.5 w-[14%]">Bébé</th>
                    <th className="px-3 py-2.5">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50/60">
                      <td className="px-3 py-2.5 font-medium text-slate-900">{r.name}</td>
                      <td className="px-2 py-2 text-slate-800 tabular-nums">
                        {formatMoney(r.price_adult, r.currency)}
                      </td>
                      <td className="px-2 py-2 text-slate-800 tabular-nums">
                        {formatMoney(r.price_child, r.currency)}
                      </td>
                      <td className="px-2 py-2 text-slate-800 tabular-nums">
                        {formatMoney(r.price_baby, r.currency)}
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-600 max-w-xs whitespace-pre-wrap">
                        {r.notes ? String(r.notes) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </main>

      <footer className="border-t border-slate-200/80 mt-8 py-6 text-center text-xs text-slate-500">
        Hurghada Dream — tarifs indicatifs, non modifiables sur cette page.
      </footer>
    </div>
  );
}
