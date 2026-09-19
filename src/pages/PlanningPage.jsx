import { useMemo, useState } from "react";
import { CATEGORIES } from "../constants";
import { TextInput } from "../components/ui";
import { useDebounce } from "../hooks/useDebounce";

/** Ordre d’affichage planning (Lun → Dim). `index` = index dans availableDays (0 = dimanche). */
const PLANNING_DAYS = [
  { index: 1, short: "Lun", full: "Lundi" },
  { index: 2, short: "Mar", full: "Mardi" },
  { index: 3, short: "Mer", full: "Mercredi" },
  { index: 4, short: "Jeu", full: "Jeudi" },
  { index: 5, short: "Ven", full: "Vendredi" },
  { index: 6, short: "Sam", full: "Samedi" },
  { index: 0, short: "Dim", full: "Dimanche" },
];

const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.key, c.label]));

function categoryTone(categoryKey) {
  switch (categoryKey) {
    case "desert":
      return "border-amber-200 bg-amber-50 text-amber-950";
    case "aquatique":
      return "border-sky-200 bg-sky-50 text-sky-950";
    case "exploration_bien_etre":
      return "border-emerald-200 bg-emerald-50 text-emerald-950";
    case "luxor_caire":
      return "border-violet-200 bg-violet-50 text-violet-950";
    case "marsa_alam":
      return "border-teal-200 bg-teal-50 text-teal-950";
    case "transfert":
      return "border-slate-200 bg-slate-50 text-slate-800";
    default:
      return "border-indigo-200 bg-indigo-50 text-indigo-950";
  }
}

function resolveCategoryKey(activity) {
  const key = activity?.category;
  return CATEGORIES.some((c) => c.key === key) ? key : "desert";
}

/**
 * Planning hebdomadaire : activités ouvertes chaque jour (masque availableDays).
 */
export function PlanningPage({ activities = [] }) {
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebounce(searchQuery, 200);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const todayIndex = new Date().getDay(); // 0 = dimanche … 6 = samedi

  const filteredActivities = useMemo(() => {
    let list = Array.isArray(activities) ? activities : [];
    if (categoryFilter !== "all") {
      list = list.filter((a) => resolveCategoryKey(a) === categoryFilter);
    }
    const q = debouncedSearch.trim().toLowerCase();
    if (q) {
      list = list.filter((a) => String(a?.name || "").toLowerCase().includes(q));
    }
    return list;
  }, [activities, categoryFilter, debouncedSearch]);

  const columns = useMemo(() => {
    return PLANNING_DAYS.map((day) => {
      const items = filteredActivities
        .filter((a) => {
          const days = a?.availableDays ?? a?.available_days;
          return Array.isArray(days) && days.length === 7 && days[day.index] === true;
        })
        .slice()
        .sort((a, b) => {
          const catA = resolveCategoryKey(a);
          const catB = resolveCategoryKey(b);
          if (catA !== catB) return catA.localeCompare(catB);
          return String(a.name || "").localeCompare(String(b.name || ""), "fr", { sensitivity: "base" });
        });
      return { ...day, items, isToday: day.index === todayIndex };
    });
  }, [filteredActivities, todayIndex]);

  const totalOpenSlots = useMemo(
    () => columns.reduce((sum, col) => sum + col.items.length, 0),
    [columns]
  );

  return (
    <div className="space-y-4 md:space-y-5">
      <div className="flex flex-col gap-3 rounded-2xl border border-indigo-200/70 bg-gradient-to-br from-indigo-50/90 via-white to-sky-50/80 p-4 md:p-5 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-indigo-700/80">Vue semaine</p>
            <p className="mt-1 text-sm text-slate-600">
              {filteredActivities.length} activité{filteredActivities.length !== 1 ? "s" : ""} filtrée
              {filteredActivities.length !== 1 ? "s" : ""} · {totalOpenSlots} ouverture
              {totalOpenSlots !== 1 ? "s" : ""} sur la semaine
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-300 bg-sky-100 px-2.5 py-1 text-sky-900">
              <span className="h-2 w-2 rounded-full bg-sky-500" aria-hidden />
              Aujourd’hui
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <TextInput
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Rechercher une activité…"
              aria-label="Rechercher une activité"
            />
          </div>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="min-h-[44px] rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            aria-label="Filtrer par catégorie"
          >
            <option value="all">Toutes les catégories</option>
            {CATEGORIES.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Desktop / tablette : grille 7 colonnes */}
      <div className="hidden md:block overflow-x-auto pb-2">
        <div className="grid min-w-[920px] grid-cols-7 gap-2.5 lg:gap-3">
          {columns.map((col) => (
            <div
              key={col.index}
              className={`flex min-h-[28rem] flex-col rounded-2xl border-2 shadow-sm ${
                col.isToday
                  ? "border-sky-400 bg-sky-50/80 ring-2 ring-sky-200/80"
                  : "border-slate-200/90 bg-white/95"
              }`}
            >
              <header
                className={`sticky top-0 z-[1] rounded-t-[0.9rem] border-b px-2.5 py-3 text-center ${
                  col.isToday
                    ? "border-sky-200 bg-gradient-to-b from-sky-100 to-sky-50"
                    : "border-slate-100 bg-gradient-to-b from-slate-50 to-white"
                }`}
              >
                <p className={`text-[11px] font-bold uppercase tracking-wide ${col.isToday ? "text-sky-700" : "text-slate-500"}`}>
                  {col.short}
                </p>
                <p className={`text-sm font-extrabold ${col.isToday ? "text-sky-950" : "text-slate-800"}`}>
                  {col.full}
                </p>
                <p className={`mt-1 text-xs font-semibold tabular-nums ${col.isToday ? "text-sky-700" : "text-slate-500"}`}>
                  {col.items.length} act.
                </p>
              </header>

              <ul className="flex flex-1 flex-col gap-1.5 overflow-y-auto p-2">
                {col.items.length === 0 ? (
                  <li className="rounded-lg border border-dashed border-slate-200 px-2 py-6 text-center text-xs text-slate-400">
                    Aucune activité
                  </li>
                ) : (
                  col.items.map((activity) => {
                    const cat = resolveCategoryKey(activity);
                    return (
                      <li
                        key={activity.id || activity.supabase_id || activity.name}
                        className={`rounded-lg border px-2 py-1.5 text-[11px] font-semibold leading-snug shadow-sm ${categoryTone(cat)}`}
                        title={`${activity.name} — ${CATEGORY_LABEL[cat] || cat}`}
                      >
                        <span className="block line-clamp-3">{activity.name}</span>
                        <span className="mt-0.5 block text-[9px] font-medium uppercase tracking-wide opacity-70">
                          {CATEGORY_LABEL[cat] || cat}
                        </span>
                      </li>
                    );
                  })
                )}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* Mobile : une carte par jour */}
      <div className="space-y-3 md:hidden">
        {columns.map((col) => (
          <section
            key={col.index}
            className={`rounded-2xl border-2 shadow-sm ${
              col.isToday ? "border-sky-400 bg-sky-50/70" : "border-slate-200 bg-white"
            }`}
          >
            <header
              className={`flex items-center justify-between gap-2 border-b px-4 py-3 ${
                col.isToday ? "border-sky-200 bg-sky-100/80" : "border-slate-100 bg-slate-50"
              }`}
            >
              <div>
                <p className={`text-base font-extrabold ${col.isToday ? "text-sky-950" : "text-slate-800"}`}>
                  {col.full}
                  {col.isToday ? (
                    <span className="ml-2 align-middle text-[10px] font-bold uppercase tracking-wide text-sky-700">
                      Aujourd’hui
                    </span>
                  ) : null}
                </p>
              </div>
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-bold tabular-nums ${
                  col.isToday ? "bg-sky-200 text-sky-900" : "bg-slate-200 text-slate-700"
                }`}
              >
                {col.items.length}
              </span>
            </header>
            <ul className="space-y-1.5 p-3">
              {col.items.length === 0 ? (
                <li className="py-4 text-center text-sm text-slate-400">Aucune activité ouverte</li>
              ) : (
                col.items.map((activity) => {
                  const cat = resolveCategoryKey(activity);
                  return (
                    <li
                      key={activity.id || activity.supabase_id || activity.name}
                      className={`rounded-xl border px-3 py-2 text-sm font-semibold ${categoryTone(cat)}`}
                    >
                      {activity.name}
                      <span className="mt-0.5 block text-[10px] font-medium uppercase tracking-wide opacity-70">
                        {CATEGORY_LABEL[cat] || cat}
                      </span>
                    </li>
                  );
                })
              )}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
