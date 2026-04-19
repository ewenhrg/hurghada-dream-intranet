import { useCallback, useMemo, useRef, useEffect, useState } from "react";
import { supabase, __SUPABASE_DEBUG__ } from "../lib/supabase";
import { SITE_KEY, LS_KEYS, CATEGORIES } from "../constants";
import { saveLS } from "../utils";
import { toast } from "../utils/toast.js";
import { logger } from "../utils/logger";

function canEditActivityPrices(user) {
  if (!user) return false;
  return (
    user.name === "Léa" ||
    user.name === "Ewen" ||
    user.canAccessSituation === true ||
    user.name === "situation" ||
    user.canEditActivity === true ||
    user.canDeleteActivity === true
  );
}

function categoryLabel(key) {
  const k = key || "desert";
  return CATEGORIES.find((c) => c.key === k)?.label || k;
}

/** Sections triées : ordre CATEGORIES puis autres clés par ordre alpha. */
function groupActivitiesByCategory(list) {
  const map = new Map();
  for (const a of list || []) {
    if (!a) continue;
    const cat = a.category || "desert";
    if (!map.has(cat)) map.set(cat, []);
    map.get(cat).push(a);
  }
  for (const arr of map.values()) {
    arr.sort((x, y) => String(x.name || "").localeCompare(String(y.name || ""), "fr", { sensitivity: "base" }));
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

async function persistActivityRow(activity) {
  if (!__SUPABASE_DEBUG__.isConfigured || !supabase) {
    toast.error("Supabase non disponible.");
    return;
  }
  if (!activity?.supabase_id) {
    logger.warn("ActivityUpdatePage : pas de supabase_id, sync distante ignorée", activity?.name);
    return;
  }
  const payload = {
    site_key: SITE_KEY,
    name: activity.name,
    price_adult: Number(activity.priceAdult) || 0,
    price_child: Number(activity.priceChild) || 0,
    price_baby: Number(activity.priceBaby) || 0,
    notes: activity.notes != null ? String(activity.notes) : "",
  };
  const { error } = await supabase.from("activities").update(payload).eq("id", activity.supabase_id);
  if (error) {
    logger.error("ActivityUpdatePage : erreur Supabase", error);
    toast.error(error.message || "Erreur lors de l’enregistrement.");
    return;
  }
  toast.success(`Enregistré : ${activity.name}`, 2200);
}

/** Champ prix : pendant le focus, le texte peut être vide pour permettre de remplacer un 0 sans qu’il « revienne » tout de suite. */
function ActivityPriceCell({ activity, field, disabled, patchActivity, scheduleSave }) {
  const committed = activity[field];
  const numericCommitted = committed === undefined || committed === null ? 0 : Number(committed);
  const safeCommitted = Number.isFinite(numericCommitted) ? numericCommitted : 0;

  const [focused, setFocused] = useState(false);
  const [text, setText] = useState(() => String(safeCommitted));

  useEffect(() => {
    if (!focused) {
      setText(String(safeCommitted));
    }
  }, [activity.id, field, safeCommitted, focused]);

  const displayValue = focused ? text : String(safeCommitted);

  const commitNumeric = useCallback(
    (rawString) => {
      const trimmed = rawString.trim();
      const n = trimmed === "" ? 0 : Number(trimmed);
      const final = Number.isFinite(n) && n >= 0 ? n : 0;
      patchActivity(activity.id, { [field]: final });
      scheduleSave(activity.id);
      return final;
    },
    [activity.id, field, patchActivity, scheduleSave]
  );

  return (
    <input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      disabled={disabled}
      className="w-full min-w-[4.5rem] rounded-lg border border-slate-200 px-2 py-1.5 text-slate-900 disabled:opacity-60"
      value={displayValue}
      onFocus={(e) => {
        setFocused(true);
        setText(String(safeCommitted));
        requestAnimationFrame(() => {
          try {
            e.target.select();
          } catch {
            /* ignore */
          }
        });
      }}
      onBlur={() => {
        setFocused(false);
        const final = commitNumeric(text);
        setText(String(final));
      }}
      onChange={(e) => {
        const raw = e.target.value.replace(/\D/g, "");
        setText(raw);
        if (raw !== "") {
          const n = Number(raw);
          if (Number.isFinite(n) && n >= 0) {
            patchActivity(activity.id, { [field]: n });
            scheduleSave(activity.id);
          }
        }
      }}
    />
  );
}

export function ActivityUpdatePage({ activities, setActivities, user }) {
  const canEdit = canEditActivityPrices(user);
  const activitiesRef = useRef(activities);
  const saveTimersRef = useRef({});

  useEffect(() => {
    activitiesRef.current = activities;
  }, [activities]);

  useEffect(() => {
    return () => {
      Object.values(saveTimersRef.current).forEach((t) => clearTimeout(t));
      saveTimersRef.current = {};
    };
  }, []);

  const [search, setSearch] = useState("");

  const filteredActivities = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return activities || [];
    return (activities || []).filter((a) => {
      const name = (a.name || "").toLowerCase();
      const notes = (a.notes || "").toLowerCase();
      return name.includes(q) || notes.includes(q);
    });
  }, [activities, search]);

  const grouped = useMemo(() => groupActivitiesByCategory(filteredActivities), [filteredActivities]);

  const patchActivity = useCallback(
    (id, patch) => {
      setActivities((prev) => {
        const next = prev.map((a) => (a.id === id ? { ...a, ...patch } : a));
        saveLS(LS_KEYS.activities, next);
        return next;
      });
    },
    [setActivities]
  );

  const scheduleSave = useCallback((activityId) => {
    if (!canEdit) return;
    if (saveTimersRef.current[activityId]) {
      clearTimeout(saveTimersRef.current[activityId]);
    }
    saveTimersRef.current[activityId] = setTimeout(() => {
      const latest = activitiesRef.current.find((a) => a.id === activityId);
      if (latest) void persistActivityRow(latest);
      delete saveTimersRef.current[activityId];
    }, 700);
  }, [canEdit]);

  const handleNotesChange = useCallback(
    (activity, raw) => {
      patchActivity(activity.id, { notes: raw });
      scheduleSave(activity.id);
    },
    [patchActivity, scheduleSave]
  );

  if (!activities?.length) {
    return (
      <p className="text-sm text-slate-600 py-8 text-center">Aucune activité à afficher. Synchronisez ou ajoutez des activités depuis l’onglet Activités.</p>
    );
  }

  return (
    <div className="space-y-10">
      {!canEdit && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Lecture seule : vous n’avez pas la permission de modifier les prix. Les changements ne seront pas enregistrés en base.
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm flex flex-col sm:flex-row sm:items-end gap-3">
        <div className="flex-1 min-w-0">
          <label htmlFor="activity-update-search" className="block text-xs font-semibold text-slate-600 mb-1.5">
            Rechercher une activité
          </label>
          <input
            id="activity-update-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Nom ou mot dans les notes…"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            autoComplete="off"
          />
        </div>
        <button
          type="button"
          onClick={() => setSearch("")}
          disabled={!search.trim()}
          className="shrink-0 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:pointer-events-none"
        >
          Effacer la recherche
        </button>
      </div>

      {search.trim() && filteredActivities.length === 0 && (
        <p className="text-sm text-slate-600 text-center py-6 rounded-xl border border-slate-200 bg-slate-50">
          Aucune activité ne correspond à « {search.trim()} ».
        </p>
      )}

      {grouped.map(({ key, label, items }) => (
        <section key={key} className="rounded-2xl border border-slate-200/90 bg-white shadow-sm overflow-hidden">
          <div className="px-4 py-3 bg-gradient-to-r from-indigo-50 to-slate-50 border-b border-slate-100">
            <h3 className="text-base font-semibold text-slate-900">{label}</h3>
            <p className="text-xs text-slate-500">{items.length} activité{items.length !== 1 ? "s" : ""}</p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[760px] w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 border-b border-slate-100">
                  <th className="px-3 py-2.5 w-[28%]">Activité</th>
                  <th className="px-2 py-2.5 w-[11%]">Adulte</th>
                  <th className="px-2 py-2.5 w-[11%]">Enfant</th>
                  <th className="px-2 py-2.5 w-[11%]">Bébé</th>
                  <th className="px-3 py-2.5">Notes</th>
                  <th className="px-2 py-2.5 w-[10%] text-center">Sync</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-50/60">
                    <td className="px-3 py-2 align-top">
                      <div className="font-medium text-slate-900">{a.name}</div>
                      {a._localOnly && (
                        <span className="text-[10px] font-medium text-amber-700">Cache seulement</span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 align-top">
                      <ActivityPriceCell
                        activity={a}
                        field="priceAdult"
                        disabled={!canEdit}
                        patchActivity={patchActivity}
                        scheduleSave={scheduleSave}
                      />
                    </td>
                    <td className="px-2 py-1.5 align-top">
                      <ActivityPriceCell
                        activity={a}
                        field="priceChild"
                        disabled={!canEdit}
                        patchActivity={patchActivity}
                        scheduleSave={scheduleSave}
                      />
                    </td>
                    <td className="px-2 py-1.5 align-top">
                      <ActivityPriceCell
                        activity={a}
                        field="priceBaby"
                        disabled={!canEdit}
                        patchActivity={patchActivity}
                        scheduleSave={scheduleSave}
                      />
                    </td>
                    <td className="px-3 py-1.5 align-top">
                      <textarea
                        rows={2}
                        disabled={!canEdit}
                        className="w-full min-w-[12rem] rounded-lg border border-slate-200 px-2 py-1.5 text-slate-800 text-xs leading-snug resize-y min-h-[2.75rem] disabled:opacity-60"
                        value={a.notes ?? ""}
                        onChange={(e) => handleNotesChange(a, e.target.value)}
                      />
                    </td>
                    <td className="px-2 py-2 align-middle text-center">
                      {a.supabase_id ? (
                        <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500" title="Liée à Supabase" />
                      ) : (
                        <span className="inline-flex h-2 w-2 rounded-full bg-amber-400" title="Pas d’ID Supabase" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      <p className="text-xs text-slate-500">
        Les prix et notes sont enregistrés dans le cache tout de suite ; la base Supabase est mise à jour automatiquement après une courte pause (debounce). La page Activités utilise les mêmes données.
      </p>
    </div>
  );
}
