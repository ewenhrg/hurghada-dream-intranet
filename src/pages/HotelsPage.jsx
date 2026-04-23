import { useState, useEffect, useCallback } from "react";
import { supabase, __SUPABASE_DEBUG__ } from "../lib/supabase";
import { SITE_KEY, NEIGHBORHOODS, getQuoteSiteKeysForSync } from "../constants";
import { canAccessHotelsPage } from "../constants/permissions";
import { TextInput, PrimaryBtn, GhostBtn } from "../components/ui";
import { toast } from "../utils/toast.js";
import { logger } from "../utils/logger";
import { appCache, createCacheKey } from "../utils/cache";

function hotelsListCacheKey() {
  return createCacheKey("hotels", ...getQuoteSiteKeysForSync());
}

export function HotelsPage({ user }) {
  const [hotels, setHotels] = useState([]);
  const [siteKeyScopeWarning, setSiteKeyScopeWarning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingHotel, setEditingHotel] = useState(null);
  const [form, setForm] = useState({
    name: "",
    neighborhood_key: "",
  });

  const canAccess = canAccessHotelsPage(user);

  const supabaseHost =
    typeof __SUPABASE_DEBUG__?.supabaseUrl === "string"
      ? (() => {
          try {
            return new URL(__SUPABASE_DEBUG__.supabaseUrl).host;
          } catch {
            return "—";
          }
        })()
      : "—";

  // Charger les hôtels depuis Supabase (pas de lecture cache : évite une liste vide obsolète après correction env / base)
  const loadHotels = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    try {
      const siteKeys = getQuoteSiteKeysForSync();
      const cacheKey = hotelsListCacheKey();
      appCache.delete(cacheKey);

      const normalizeHotelRow = (row) => ({
        ...row,
        name: row?.name || "",
        neighborhood_key: row?.neighborhood_key || row?.neighborhood || "",
        site_key: row?.site_key || row?.site || "",
      });

      const loadRowsFromTable = async (tableName) => {
        const attempts = [
          { mode: "site_key", query: (q) => q.in("site_key", siteKeys) },
          { mode: "site", query: (q) => q.in("site", siteKeys) },
          { mode: "all", query: (q) => q },
        ];

        for (const attempt of attempts) {
          const { data, error } = await attempt
            .query(supabase.from(tableName).select("*"))
            .order("name", { ascending: true });
          if (!error && Array.isArray(data)) {
            return {
              rows: data.map(normalizeHotelRow),
              tableName,
              mode: attempt.mode,
            };
          }
        }
        return null;
      };

      let loaded = await loadRowsFromTable("hotels");
      if (!loaded || loaded.rows.length === 0) {
        const fallbackLoaded = await loadRowsFromTable("hotel");
        if (fallbackLoaded && fallbackLoaded.rows.length > 0) {
          loaded = fallbackLoaded;
          logger.warn(
            "[Hotels] Fallback activé: la liste provient de la table",
            fallbackLoaded.tableName,
            "(mode:",
            fallbackLoaded.mode + ")."
          );
        }
      }

      if (!loaded) {
        setSiteKeyScopeWarning(false);
        setHotels([]);
        toast.error("Erreur lors du chargement des hôtels: table inaccessible ou structure non reconnue.");
        return;
      }

      let hotelsData = loaded.rows;
      const usedScopedFilter = loaded.mode === "site_key" || loaded.mode === "site";
      const hasRowsOutsideScope =
        hotelsData.length > 0 &&
        hotelsData.some((r) => r.site_key && !siteKeys.includes(r.site_key));
      setSiteKeyScopeWarning(usedScopedFilter ? false : hasRowsOutsideScope);

      if (!usedScopedFilter && hotelsData.length > 0) {
        const keys = [...new Set(hotelsData.map((r) => r.site_key).filter(Boolean))];
        logger.warn(
          "[Hotels] Chargement sans filtre site_key/site,",
          hotelsData.length,
          "ligne(s), site_key distincts:",
          keys
        );
      }

      setHotels(hotelsData);
      if (hotelsData.length > 0) {
        appCache.set(cacheKey, hotelsData, 10 * 60 * 1000);
      }
    } catch (err) {
      logger.error("Exception lors du chargement des hôtels:", err);
      toast.error("Exception lors du chargement des hôtels: " + err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Charger les hôtels au montage
  useEffect(() => {
    loadHotels();
  }, [loadHotels]);

  // Réinitialiser le formulaire
  function resetForm() {
    setForm({
      name: "",
      neighborhood_key: "",
    });
    setEditingHotel(null);
    setShowForm(false);
  }

  // Modifier un hôtel
  function handleEdit(hotel) {
    setForm({
      name: hotel.name || "",
      neighborhood_key: hotel.neighborhood_key || "",
    });
    setEditingHotel(hotel);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Sauvegarder (créer ou modifier) un hôtel
  async function handleSubmit(e) {
    e.preventDefault();
    
    // Vérifier que seuls Ewen et Léa peuvent modifier
    if (!canAccess) {
      toast.error("Seuls Ewen et Léa peuvent ajouter ou modifier des hôtels.");
      return;
    }

    setLoading(true);

    // Validation
    if (!form.name.trim()) {
      toast.warning("Veuillez entrer un nom d'hôtel.");
      setLoading(false);
      return;
    }
    if (!form.neighborhood_key) {
      toast.warning("Veuillez sélectionner un quartier.");
      setLoading(false);
      return;
    }

    try {
      const hotelData = {
        name: form.name.trim(),
        neighborhood_key: form.neighborhood_key,
        site_key: SITE_KEY,
        created_by: user?.name || "",
        updated_by: user?.name || "",
      };

      if (editingHotel) {
        // Modifier un hôtel existant
        const { error } = await supabase
          .from("hotels")
          .update({
            name: hotelData.name,
            neighborhood_key: hotelData.neighborhood_key,
            updated_by: hotelData.updated_by,
          })
          .eq("id", editingHotel.id)
          .select()
          .single();

        if (error) {
          logger.error("Erreur lors de la modification de l'hôtel:", error);
          toast.error("Erreur lors de la modification de l'hôtel: " + (error.message || "Erreur inconnue"));
        } else {
          logger.log("✅ Hôtel modifié avec succès!");
          // Invalider le cache pour forcer le rechargement
          appCache.delete(hotelsListCacheKey());
          await loadHotels();
          resetForm();
          toast.success("Hôtel modifié avec succès !");
        }
      } else {
        // Créer un nouvel hôtel
        const { error } = await supabase
          .from("hotels")
          .insert(hotelData)
          .select()
          .single();

        if (error) {
          logger.error("Erreur lors de la création de l'hôtel:", error);
          if (error.code === "23505") {
            toast.error("Cet hôtel existe déjà dans la base de données.");
          } else {
            toast.error("Erreur lors de la création de l'hôtel: " + (error.message || "Erreur inconnue"));
          }
        } else {
          logger.log("✅ Hôtel créé avec succès!");
          // Invalider le cache pour forcer le rechargement
          appCache.delete(hotelsListCacheKey());
          await loadHotels();
          resetForm();
          toast.success("Hôtel créé avec succès !");
        }
      }
    } catch (err) {
      logger.error("Exception lors de la sauvegarde de l'hôtel:", err);
      toast.error("Exception lors de la sauvegarde: " + err.message);
    } finally {
      setLoading(false);
    }
  }

  // Supprimer un hôtel
  async function handleDelete(hotelId, hotelName) {
    if (!canAccess) {
      toast.error("Seuls Ewen et Léa peuvent supprimer des hôtels.");
      return;
    }

    if (!window.confirm(`Êtes-vous sûr de vouloir supprimer l'hôtel "${hotelName}" ?\n\nCette action est irréversible.`)) {
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.from("hotels").delete().eq("id", hotelId);

      if (error) {
        logger.error("Erreur lors de la suppression de l'hôtel:", error);
        toast.error("Erreur lors de la suppression: " + (error.message || "Erreur inconnue"));
      } else {
        logger.log("✅ Hôtel supprimé avec succès!");
        // Invalider le cache pour forcer le rechargement
        appCache.delete(hotelsListCacheKey());
        await loadHotels();
        toast.success("Hôtel supprimé avec succès !");
      }
    } catch (err) {
      logger.error("Exception lors de la suppression:", err);
      toast.error("Exception lors de la suppression: " + err.message);
    } finally {
      setLoading(false);
    }
  }

  // Si l'utilisateur n'a pas accès, afficher un message
  if (!canAccess) {
    return (
      <div className="p-4 md:p-6">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <p className="text-red-800 font-semibold">Accès refusé</p>
          <p className="text-red-600 text-sm mt-2">
            Seuls les comptes Ewen / Léa (y compris « Lea » sans accent) peuvent accéder à cette page pour gérer les hôtels.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      {siteKeyScopeWarning && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p className="font-semibold">Filtrage site_key</p>
          <p className="mt-1 text-amber-900/90">
            Aucun hôtel ne correspond à la clé d’environnement actuelle, mais des lignes existent en base. Liste complète
            affichée. Alignez la colonne <code className="rounded bg-amber-100/80 px-1">site_key</code> sur{" "}
            <code className="rounded bg-amber-100/80 px-1">{getQuoteSiteKeysForSync().join(", ")}</code> ou définissez{" "}
            <code className="rounded bg-amber-100/80 px-1">VITE_LEGACY_SITE_KEYS</code> dans <code className="rounded bg-amber-100/80 px-1">.env</code>.
          </p>
        </div>
      )}
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold text-gray-800">Gestion des hôtels</h3>
          <p className="text-sm text-gray-600">Associez les hôtels à leurs quartiers pour une détection automatique</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <GhostBtn type="button" variant="neutral" disabled={loading} onClick={() => loadHotels()}>
            {loading ? "Chargement…" : "Rafraîchir la liste"}
          </GhostBtn>
          <PrimaryBtn onClick={() => setShowForm(!showForm)}>{showForm ? "Annuler" : "Nouvel hôtel"}</PrimaryBtn>
        </div>
      </div>

      {/* Formulaire de création/modification */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white/95 backdrop-blur-sm rounded-2xl border border-blue-100/60 p-6 space-y-4 shadow-lg">
          <h4 className="text-base font-semibold text-gray-800">{editingHotel ? "Modifier l'hôtel" : "Créer un nouvel hôtel"}</h4>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-600 mb-1">Nom de l'hôtel</label>
              <TextInput
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Ex: Soma Bay Resort"
                required
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Quartier</label>
              <select
                value={form.neighborhood_key}
                onChange={(e) => setForm((f) => ({ ...f, neighborhood_key: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-normal text-slate-700 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                required
              >
                <option value="">— Sélectionner un quartier —</option>
                {NEIGHBORHOODS.map((n) => (
                  <option key={n.key} value={n.key}>
                    {n.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex gap-3 justify-end pt-4 border-t">
            <GhostBtn type="button" onClick={resetForm} variant="neutral">
              Annuler
            </GhostBtn>
            <PrimaryBtn type="submit" disabled={loading}>
              {loading ? "Enregistrement..." : editingHotel ? "Modifier" : "Créer"}
            </PrimaryBtn>
          </div>
        </form>
      )}

      {/* Liste des hôtels */}
      <div className="bg-white/95 backdrop-blur-sm rounded-2xl border border-blue-100/60 shadow-lg overflow-hidden">
        <div className="p-4 border-b bg-blue-50/70 flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-sm font-semibold text-gray-800">Liste des hôtels ({hotels.length})</h4>
          <GhostBtn type="button" size="sm" variant="neutral" disabled={loading} onClick={() => loadHotels()}>
            Rafraîchir
          </GhostBtn>
        </div>
        {loading && hotels.length === 0 ? (
          <div className="p-8 text-center text-gray-500">Chargement...</div>
        ) : hotels.length === 0 ? (
          <div className="p-8 space-y-4 text-center text-gray-600">
            <p>Aucun hôtel renvoyé par l’API pour ce navigateur.</p>
            <div className="mx-auto max-w-lg rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-left text-xs text-slate-800">
              <p className="font-semibold text-slate-900">Vérifications courantes</p>
              <ul className="mt-2 list-disc space-y-1.5 pl-4">
                <li>
                  La table doit s’appeler <code className="rounded bg-white px-1">public.hotels</code> (avec un « s »), pas
                  <code className="rounded bg-white px-1"> hotel</code>.
                </li>
                <li>
                  Le site déployé doit utiliser le <strong>même projet Supabase</strong> que celui où vous voyez les lignes
                  (hôte API : <code className="rounded bg-white px-1">{supabaseHost}</code>).
                </li>
                <li>
                  Colonne <code className="rounded bg-white px-1">site_key</code> : l’app filtre sur{" "}
                  <code className="rounded bg-white px-1">{getQuoteSiteKeysForSync().join(", ")}</code> ; si besoin ajoutez{" "}
                  <code className="rounded bg-white px-1">VITE_LEGACY_SITE_KEYS</code> puis redéployez.
                </li>
                <li>
                  Row Level Security : une politique <code className="rounded bg-white px-1">SELECT</code> doit autoriser la
                  clé <code className="rounded bg-white px-1">anon</code> sur <code className="rounded bg-white px-1">hotels</code> (voir{" "}
                  <code className="rounded bg-white px-1">supabase/supabase_hotels_table.sql</code> dans le dépôt).
                </li>
              </ul>
            </div>
            <GhostBtn type="button" variant="neutral" disabled={loading} onClick={() => loadHotels()}>
              Réessayer le chargement
            </GhostBtn>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-blue-50/70 text-gray-700 text-xs">
                <tr>
                  <th className="px-4 py-3 text-left">Nom de l'hôtel</th>
                  <th className="px-4 py-3 text-left">Quartier</th>
                  <th className="px-4 py-3 text-left">Créé le</th>
                  <th className="px-4 py-3 text-left">Modifié le</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {hotels.map((h, idx) => {
                  const neighborhood = NEIGHBORHOODS.find((n) => n.key === h.neighborhood_key);
                  const rowKey = h.id != null && h.id !== "" ? String(h.id) : `row-${idx}-${h.name || ""}`;
                  const created = h.created_at ? new Date(h.created_at) : null;
                  const createdOk = created && !Number.isNaN(created.getTime());
                  return (
                    <tr key={rowKey} className="border-t hover:bg-blue-50/30 transition-colors">
                      <td className="px-4 py-3 font-medium text-gray-800">{h.name}</td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-1 rounded-full bg-blue-100 text-blue-700 text-xs font-medium">
                          {neighborhood?.label || h.neighborhood_key}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {createdOk ? created.toLocaleDateString("fr-FR") : "—"}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {h.updated_at ? new Date(h.updated_at).toLocaleDateString("fr-FR") : "-"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex gap-2 justify-end">
                          <GhostBtn onClick={() => handleEdit(h)} size="sm">
                            ✏️ Modifier
                          </GhostBtn>
                          <GhostBtn
                            onClick={() => handleDelete(h.id, h.name)}
                            variant="danger"
                            size="sm"
                          >
                            🗑️ Supprimer
                          </GhostBtn>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

