import { useState, useEffect, useMemo } from "react";
import { supabase } from "../lib/supabase";
import { SITE_KEY } from "../constants";
import { TextInput, PrimaryBtn, GhostBtn } from "../components/ui";
import { toast } from "../utils/toast.js";

export function StopSalePage({ activities, user }) {
  const [stopSales, setStopSales] = useState([]);
  const [pushSales, setPushSales] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedActivityId, setSelectedActivityId] = useState("");
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
  const [type, setType] = useState("stop"); // "stop" ou "push"
  const [searchQuery, setSearchQuery] = useState("");

  // Vérifier si l'utilisateur peut modifier (Ewen, Léa ou situation)
  const canEdit = useMemo(() => {
    return user?.name === "Ewen" || user?.name === "Léa" || user?.canAccessSituation || user?.name === "situation";
  }, [user]);

  // Charger les stop sales et push sales depuis Supabase
  useEffect(() => {
    loadStopSales();
    loadPushSales();
  }, []);

  async function loadStopSales() {
    if (!supabase) return;
    try {
      const today = new Date().toISOString().split('T')[0]; // Date d'aujourd'hui au format YYYY-MM-DD

      const { data, error } = await supabase
        .from("stop_sales")
        .select("*")
        .eq("site_key", SITE_KEY)
        .order("date", { ascending: false });

      if (error) {
        console.error("Erreur lors du chargement des stop sales:", error);
      } else {
        // Filtrer et supprimer les stop sales dont la date est passée
        const validStopSales = [];
        const expiredStopSales = [];

        (data || []).forEach((stopSale) => {
          if (stopSale.date < today) {
            expiredStopSales.push(stopSale.id);
          } else {
            validStopSales.push(stopSale);
          }
        });

        // Supprimer les stop sales expirés de Supabase
        if (expiredStopSales.length > 0) {
          await supabase
            .from("stop_sales")
            .delete()
            .in("id", expiredStopSales);
        }

        setStopSales(validStopSales);
      }
    } catch (err) {
      console.error("Exception lors du chargement des stop sales:", err);
    }
  }

  async function loadPushSales() {
    if (!supabase) return;
    try {
      const today = new Date().toISOString().split('T')[0]; // Date d'aujourd'hui au format YYYY-MM-DD

      const { data, error } = await supabase
        .from("push_sales")
        .select("*")
        .eq("site_key", SITE_KEY)
        .order("date", { ascending: false });

      if (error) {
        console.error("Erreur lors du chargement des push sales:", error);
      } else {
        // Filtrer et supprimer les push sales dont la date est passée
        const validPushSales = [];
        const expiredPushSales = [];

        (data || []).forEach((pushSale) => {
          if (pushSale.date < today) {
            expiredPushSales.push(pushSale.id);
          } else {
            validPushSales.push(pushSale);
          }
        });

        // Supprimer les push sales expirés de Supabase
        if (expiredPushSales.length > 0) {
          await supabase
            .from("push_sales")
            .delete()
            .in("id", expiredPushSales);
        }

        setPushSales(validPushSales);
      }
    } catch (err) {
      console.error("Exception lors du chargement des push sales:", err);
    }
  }

  async function handleAdd() {
    if (!canEdit) {
      toast.warning("Seuls Ewen, Léa et Situation peuvent ajouter des stop sales/push sales.");
      return;
    }

    if (!selectedActivityId) {
      toast.warning("Veuillez sélectionner une activité.");
      return;
    }

    if (!selectedDate) {
      toast.warning("Veuillez sélectionner une date.");
      return;
    }

    setLoading(true);

    try {
      const activity = activities.find((a) => a.id === selectedActivityId);
      if (!activity) {
        toast.error("Activité non trouvée.");
        setLoading(false);
        return;
      }

      if (type === "stop") {
        // Vérifier si le stop sale existe déjà
        const existing = stopSales.find(
          (s) => s.activity_id === selectedActivityId && s.date === selectedDate
        );
        if (existing) {
          toast.warning("Ce stop sale existe déjà pour cette activité et cette date.");
          setLoading(false);
          return;
        }

        // Vérifier si un push sale existe pour la même activité/date (conflit)
        const conflictingPush = pushSales.find(
          (p) => p.activity_id === selectedActivityId && p.date === selectedDate
        );
        if (conflictingPush) {
          if (!window.confirm("Un push sale existe déjà pour cette activité et cette date. Voulez-vous le supprimer et créer un stop sale ?")) {
            setLoading(false);
            return;
          }
          // Supprimer le push sale conflictuel
          await supabase
            .from("push_sales")
            .delete()
            .eq("id", conflictingPush.id);
          await loadPushSales();
        }

        const { data, error } = await supabase
          .from("stop_sales")
          .insert({
            site_key: SITE_KEY,
            activity_id: selectedActivityId,
            activity_name: activity.name || "",
            date: selectedDate,
            created_by: user?.name || "",
          })
          .select()
          .single();

        if (error) {
          console.error("Erreur lors de l'ajout du stop sale:", error);
          toast.error("Erreur lors de l'ajout du stop sale.");
        } else {
          toast.success("Stop sale ajouté avec succès !");
          await loadStopSales();
          setSelectedActivityId("");
          setSelectedDate(new Date().toISOString().slice(0, 10));
        }
      } else {
        // Push sale
        // Vérifier si le push sale existe déjà
        const existing = pushSales.find(
          (p) => p.activity_id === selectedActivityId && p.date === selectedDate
        );
        if (existing) {
          toast.warning("Ce push sale existe déjà pour cette activité et cette date.");
          setLoading(false);
          return;
        }

        // Vérifier si un stop sale existe pour la même activité/date (conflit)
        const conflictingStop = stopSales.find(
          (s) => s.activity_id === selectedActivityId && s.date === selectedDate
        );
        if (conflictingStop) {
          if (!window.confirm("Un stop sale existe déjà pour cette activité et cette date. Voulez-vous le supprimer et créer un push sale ?")) {
            setLoading(false);
            return;
          }
          // Supprimer le stop sale conflictuel
          await supabase
            .from("stop_sales")
            .delete()
            .eq("id", conflictingStop.id);
          await loadStopSales();
        }

        const { data, error } = await supabase
          .from("push_sales")
          .insert({
            site_key: SITE_KEY,
            activity_id: selectedActivityId,
            activity_name: activity.name || "",
            date: selectedDate,
            created_by: user?.name || "",
          })
          .select()
          .single();

        if (error) {
          console.error("Erreur lors de l'ajout du push sale:", error);
          toast.error("Erreur lors de l'ajout du push sale.");
        } else {
          toast.success("Push sale ajouté avec succès !");
          await loadPushSales();
          setSelectedActivityId("");
          setSelectedDate(new Date().toISOString().slice(0, 10));
        }
      }
    } catch (err) {
      console.error("Exception lors de l'ajout:", err);
      toast.error("Erreur lors de l'ajout.");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id, isStopSale) {
    if (!canEdit) {
      toast.warning("Seuls Ewen, Léa et Situation peuvent supprimer des stop sales/push sales.");
      return;
    }

    const elementType = isStopSale ? "stop sale" : "push sale";
    if (!window.confirm(`Êtes-vous sûr de vouloir supprimer ce ${elementType} ?\n\nCette action est irréversible.`)) {
      return;
    }

    setLoading(true);

    try {
      const tableName = isStopSale ? "stop_sales" : "push_sales";
      const { error } = await supabase
        .from(tableName)
        .delete()
        .eq("id", id);

      if (error) {
        console.error("Erreur lors de la suppression:", error);
        toast.error("Erreur lors de la suppression.");
      } else {
        toast.success("Élément supprimé avec succès !");
        if (isStopSale) {
          await loadStopSales();
        } else {
          await loadPushSales();
        }
      }
    } catch (err) {
      console.error("Exception lors de la suppression:", err);
      toast.error("Erreur lors de la suppression.");
    } finally {
      setLoading(false);
    }
  }

  // Filtrer les stop sales et push sales par recherche
  const filteredStopSales = useMemo(() => {
    if (!searchQuery.trim()) return stopSales;
    const query = searchQuery.toLowerCase().trim();
    return stopSales.filter(
      (s) =>
        (s.activity_name || "").toLowerCase().includes(query) ||
        (s.date || "").includes(query)
    );
  }, [stopSales, searchQuery]);

  const filteredPushSales = useMemo(() => {
    if (!searchQuery.trim()) return pushSales;
    const query = searchQuery.toLowerCase().trim();
    return pushSales.filter(
      (p) =>
        (p.activity_name || "").toLowerCase().includes(query) ||
        (p.date || "").includes(query)
    );
  }, [pushSales, searchQuery]);


  return (
    <div className="p-4 md:p-6 space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-800">Stop Sale & Push Sale</h3>
        <p className="text-sm text-gray-600">
          Gérez les arrêts de vente (Stop Sale) et les ouvertures exceptionnelles (Push Sale) des activités
        </p>
      </div>

      {/* Formulaire d'ajout */}
      {canEdit && (
        <div className="bg-white/90 rounded-2xl border border-blue-100/60 p-6 shadow-md">
          <h4 className="text-base font-semibold text-gray-800 mb-4">
            {type === "stop" ? "Ajouter un Stop Sale" : "Ajouter un Push Sale"}
          </h4>

          <div className="space-y-4">
            {/* Type */}
            <div>
              <p className="text-xs text-gray-500 mb-2">Type</p>
              <div className="flex gap-3">
                <button
                  onClick={() => setType("stop")}
                  className={`px-4 py-2 rounded-lg border transition-colors ${
                    type === "stop"
                      ? "bg-red-100 text-red-700 border-red-300 font-semibold"
                      : "bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100"
                  }`}
                >
                  🛑 Stop Sale
                </button>
                <button
                  onClick={() => setType("push")}
                  className={`px-4 py-2 rounded-lg border transition-colors ${
                    type === "push"
                      ? "bg-green-100 text-green-700 border-green-300 font-semibold"
                      : "bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100"
                  }`}
                >
                  ➕ Push Sale
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                {type === "stop"
                  ? "Bloque la vente d'une activité à une date donnée"
                  : "Ouvre la vente d'une activité à une date normalement indisponible"}
              </p>
            </div>

            {/* Sélection d'activité */}
            <div>
              <p className="text-xs text-gray-500 mb-1">Activité</p>
              <select
                value={selectedActivityId}
                onChange={(e) => setSelectedActivityId(e.target.value)}
                className="w-full rounded-xl border border-blue-200/50 bg-white px-3 py-2 text-sm"
              >
                <option value="">— Choisir une activité —</option>
                {activities.sort((a, b) => (a.name || "").localeCompare(b.name || "", "fr", { sensitivity: "base" })).map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Date */}
            <div>
              <p className="text-xs text-gray-500 mb-1">Date</p>
              <TextInput
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full"
              />
            </div>

            {/* Bouton d'ajout */}
            <div className="flex justify-end">
              <PrimaryBtn onClick={handleAdd} disabled={loading}>
                {loading ? "Enregistrement..." : `Ajouter ${type === "stop" ? "Stop Sale" : "Push Sale"}`}
              </PrimaryBtn>
            </div>
          </div>
        </div>
      )}

      {/* Recherche globale */}
      <div className="bg-white/90 rounded-2xl border border-blue-100/60 p-4 shadow-md">
        <p className="text-xs text-gray-500 mb-1">Rechercher dans les listes</p>
        <TextInput
          placeholder="Rechercher par activité ou date..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Liste des Stop Sales */}
      <div className="bg-white/90 rounded-2xl border border-red-100/60 shadow-md overflow-hidden">
        <div className="p-4 border-b bg-red-50/70">
          <h4 className="text-sm font-semibold text-gray-800">
            🛑 Stop Sales ({filteredStopSales.length})
          </h4>
          <p className="text-xs text-gray-600 mt-1">
            Activités bloquées à la vente pour certaines dates
          </p>
        </div>
        {filteredStopSales.length === 0 ? (
          <div className="p-8 text-center text-gray-500">Aucun stop sale.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-red-50/70 text-gray-700 text-xs">
                <tr>
                  <th className="px-4 py-3 text-left">Activité</th>
                  <th className="px-4 py-3 text-left">Date</th>
                  <th className="px-4 py-3 text-left">Créé par</th>
                  <th className="px-4 py-3 text-left">Créé le</th>
                  {canEdit && <th className="px-4 py-3 text-right">Action</th>}
                </tr>
              </thead>
              <tbody>
                {filteredStopSales.map((s) => (
                  <tr key={s.id} className="border-t hover:bg-red-50/30 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-800">{s.activity_name}</td>
                    <td className="px-4 py-3 text-gray-700">
                      {new Date(s.date + "T12:00:00").toLocaleDateString("fr-FR")}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{s.created_by || "—"}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {new Date(s.created_at).toLocaleDateString("fr-FR")}
                    </td>
                    {canEdit && (
                      <td className="px-4 py-3 text-right">
                        <GhostBtn
                          onClick={() => handleDelete(s.id, true)}
                          variant="danger"
                          size="sm"
                        >
                          🗑️ Supprimer
                        </GhostBtn>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Liste des Push Sales */}
      <div className="bg-white/90 rounded-2xl border border-green-100/60 shadow-md overflow-hidden">
        <div className="p-4 border-b bg-green-50/70">
          <h4 className="text-sm font-semibold text-gray-800">
            ➕ Push Sales ({filteredPushSales.length})
          </h4>
          <p className="text-xs text-gray-600 mt-1">
            Activités ouvertes exceptionnellement à la vente pour certaines dates
          </p>
        </div>
        {filteredPushSales.length === 0 ? (
          <div className="p-8 text-center text-gray-500">Aucun push sale.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-green-50/70 text-gray-700 text-xs">
                <tr>
                  <th className="px-4 py-3 text-left">Activité</th>
                  <th className="px-4 py-3 text-left">Date</th>
                  <th className="px-4 py-3 text-left">Créé par</th>
                  <th className="px-4 py-3 text-left">Créé le</th>
                  {canEdit && <th className="px-4 py-3 text-right">Action</th>}
                </tr>
              </thead>
              <tbody>
                {filteredPushSales.map((p) => (
                  <tr key={p.id} className="border-t hover:bg-green-50/30 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-800">{p.activity_name}</td>
                    <td className="px-4 py-3 text-gray-700">
                      {new Date(p.date + "T12:00:00").toLocaleDateString("fr-FR")}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{p.created_by || "—"}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {new Date(p.created_at).toLocaleDateString("fr-FR")}
                    </td>
                    {canEdit && (
                      <td className="px-4 py-3 text-right">
                        <GhostBtn
                          onClick={() => handleDelete(p.id, false)}
                          variant="danger"
                          size="sm"
                        >
                          🗑️ Supprimer
                        </GhostBtn>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

