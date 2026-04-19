import { useCallback, useMemo, useRef, useEffect } from "react";
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

  const grouped = useMemo(() => groupActivitiesByCategory(activities), [activities]);

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

  const handleNumberChange = useCallback(
    (activity, field, raw) => {
      const n = raw === "" || raw == null ? 0 : Number(raw);
      const value = Number.isFinite(n) ? n : activity[field];
      patchActivity(activity.id, { [field]: value });
      scheduleSave(activity.id);
    },
    [patchActivity, scheduleSave]
  );

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
                      <input
                        type="number"
                        min={0}
                        step={1}
                        disabled={!canEdit}
                        className="w-full min-w-[4.5rem] rounded-lg border border-slate-200 px-2 py-1.5 text-slate-900 disabled:opacity-60"
                        value={a.priceAdult ?? 0}
                        onChange={(e) => handleNumberChange(a, "priceAdult", e.target.value)}
                      />
                    </td>
                    <td className="px-2 py-1.5 align-top">
                      <input
                        type="number"
                        min={0}
                        step={1}
                        disabled={!canEdit}
                        className="w-full min-w-[4.5rem] rounded-lg border border-slate-200 px-2 py-1.5 text-slate-900 disabled:opacity-60"
                        value={a.priceChild ?? 0}
                        onChange={(e) => handleNumberChange(a, "priceChild", e.target.value)}
                      />
                    </td>
                    <td className="px-2 py-1.5 align-top">
                      <input
                        type="number"
                        min={0}
                        step={1}
                        disabled={!canEdit}
                        className="w-full min-w-[4.5rem] rounded-lg border border-slate-200 px-2 py-1.5 text-slate-900 disabled:opacity-60"
                        value={a.priceBaby ?? 0}
                        onChange={(e) => handleNumberChange(a, "priceBaby", e.target.value)}
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
