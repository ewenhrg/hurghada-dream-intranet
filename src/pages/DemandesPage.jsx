import { useState, useEffect, useMemo } from "react";
import { supabase } from "../lib/supabase";
import { SITE_KEY, NEIGHBORHOODS } from "../constants";
import { uuid, currency } from "../utils";
import { TextInput, PrimaryBtn, GhostBtn } from "../components/ui";
import { toast } from "../utils/toast.js";
import { generateRequestLink, generateRequestToken } from "../utils/tokenGenerator";

export function DemandesPage({ activities, onConvertToQuote }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("pending"); // pending, converted, all
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [generatedLink, setGeneratedLink] = useState("");

  // Charger les demandes depuis Supabase
  useEffect(() => {
    loadRequests();
    
    // Recharger toutes les 10 secondes
    const interval = setInterval(loadRequests, 10000);
    return () => clearInterval(interval);
  }, []);

  async function loadRequests() {
    if (!supabase) {
      setLoading(false);
      return;
    }

    try {
      let query = supabase
        .from("client_requests")
        .select("*")
        .eq("site_key", SITE_KEY)
        .order("created_at", { ascending: false });

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      const { data, error } = await query;

      if (error) {
        console.error("Erreur lors du chargement des demandes:", error);
        toast.error("Impossible de charger les demandes.");
      } else {
        setRequests(data || []);
      }
    } catch (err) {
      console.error("Exception lors du chargement des demandes:", err);
      toast.error("Erreur lors du chargement des demandes.");
    } finally {
      setLoading(false);
    }
  }

  // Filtrer les demandes par recherche
  const filteredRequests = useMemo(() => {
    if (!searchQuery.trim()) return requests;

    const query = searchQuery.toLowerCase().trim();
    return requests.filter(
      (r) =>
        r.client_name?.toLowerCase().includes(query) ||
        r.client_phone?.toLowerCase().includes(query) ||
        r.client_hotel?.toLowerCase().includes(query)
    );
  }, [requests, searchQuery]);

  // Obtenir le nom d'une activité par son ID
  const getActivityName = (activityId) => {
    if (!activityId) return "Activité inconnue";
    
    // Chercher par ID local
    let activity = activities.find((a) => a.id?.toString() === activityId?.toString());
    
    // Si pas trouvé, chercher par supabase_id
    if (!activity) {
      activity = activities.find((a) => a.supabase_id?.toString() === activityId?.toString());
    }
    
    return activity?.name || `Activité (ID: ${activityId})`;
  };

  // Créer un devis à partir d'une demande
  const handleCreateQuote = (request) => {
    if (!request.selected_activities || request.selected_activities.length === 0) {
      toast.error("Cette demande ne contient aucune activité.");
      return;
    }

    // Convertir les activités sélectionnées en items de devis
    const items = request.selected_activities.map((selectedActivity) => {
      // Chercher l'activité correspondante
      let activity = activities.find(
        (a) => a.id?.toString() === selectedActivity.activityId?.toString()
      );
      
      // Si pas trouvé par ID local, chercher par supabase_id
      if (!activity) {
        activity = activities.find(
          (a) => a.supabase_id?.toString() === selectedActivity.activityId?.toString()
        );
      }

      // Utiliser l'ID local de l'activité trouvée, ou l'ID fourni en dernier recours
      const activityId = activity?.id || selectedActivity.activityId;

      return {
        activityId: activityId,
        date: new Date().toISOString().slice(0, 10), // Date par défaut (à modifier manuellement)
        adults: selectedActivity.adults || "",
        children: selectedActivity.children || 0,
        babies: selectedActivity.babies || 0,
        extraLabel: "",
        extraAmount: "",
        slot: "",
        extraDolphin: false,
        speedBoatExtra: [],
        buggySimple: "",
        buggyFamily: "",
        yamaha250: "",
        ktm640: "",
        ktm530: "",
        allerSimple: false,
        allerRetour: false,
      };
    });

    // Préparer les données client
    const client = {
      name: request.client_name || "",
      phone: request.client_phone || "",
      hotel: request.client_hotel || "",
      room: request.client_room || "",
      neighborhood: request.client_neighborhood || "",
      arrivalDate: request.arrival_date || "",
      departureDate: request.departure_date || "",
    };

    // Appeler la fonction de callback pour créer le devis
    if (onConvertToQuote) {
      onConvertToQuote({ client, items, notes: request.notes || "" });
      
      // Marquer la demande comme convertie
      markAsConverted(request.id);
      
      toast.success("Devis créé avec succès ! Les informations ont été pré-remplies.");
    }
  };

  // Marquer une demande comme convertie
  async function markAsConverted(requestId) {
    if (!supabase) return;

    try {
      const { error } = await supabase
        .from("client_requests")
        .update({ status: "converted", converted_at: new Date().toISOString() })
        .eq("id", requestId);

      if (error) {
        console.error("Erreur lors de la mise à jour du statut:", error);
      } else {
        // Recharger les demandes
        loadRequests();
      }
    } catch (err) {
      console.error("Exception lors de la mise à jour du statut:", err);
    }
  }

  // Supprimer une demande
  async function handleDelete(requestId) {
    if (!window.confirm("Êtes-vous sûr de vouloir supprimer cette demande ?")) {
      return;
    }

    if (!supabase) return;

    try {
      const { error } = await supabase
        .from("client_requests")
        .delete()
        .eq("id", requestId);

      if (error) {
        console.error("Erreur lors de la suppression:", error);
        toast.error("Erreur lors de la suppression de la demande.");
      } else {
        toast.success("Demande supprimée avec succès.");
        loadRequests();
      }
    } catch (err) {
      console.error("Exception lors de la suppression:", err);
      toast.error("Erreur lors de la suppression de la demande.");
    }
  }

  // Copier le lien de la demande
  const copyRequestLink = (token) => {
    const link = generateRequestLink(token);
    navigator.clipboard.writeText(link);
    toast.success("Lien copié dans le presse-papiers !");
  };

  // Générer un nouveau lien unique
  const handleGenerateNewLink = () => {
    const token = generateRequestToken();
    const link = generateRequestLink(token);
    setGeneratedLink(link);
    
    // Copier automatiquement dans le presse-papiers
    navigator.clipboard.writeText(link);
    toast.success("Nouveau lien généré et copié !");
  };

  // Copier le lien généré
  const copyGeneratedLink = () => {
    if (generatedLink) {
      navigator.clipboard.writeText(generatedLink);
      toast.success("Lien copié dans le presse-papiers !");
    }
  };

  if (loading) {
    return (
      <div className="p-4 md:p-6 flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Chargement des demandes...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
        <div className="flex-1">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Demandes clients</h2>
          <p className="text-sm text-gray-600">
            Gérez les demandes de devis de vos clients
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <PrimaryBtn onClick={handleGenerateNewLink} className="whitespace-nowrap">
            🔗 Créer un lien unique
          </PrimaryBtn>
          <button
            onClick={() => setStatusFilter("pending")}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              statusFilter === "pending"
                ? "bg-blue-600 text-white"
                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
            }`}
          >
            En attente ({requests.filter((r) => r.status === "pending").length})
          </button>
          <button
            onClick={() => setStatusFilter("converted")}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              statusFilter === "converted"
                ? "bg-green-600 text-white"
                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
            }`}
          >
            Converties ({requests.filter((r) => r.status === "converted").length})
          </button>
          <button
            onClick={() => setStatusFilter("all")}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              statusFilter === "all"
                ? "bg-gray-800 text-white"
                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
            }`}
          >
            Toutes ({requests.length})
          </button>
        </div>
      </div>

      {/* Affichage du lien généré */}
      {generatedLink && (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border-2 border-blue-200 p-4 shadow-md">
          <div className="flex flex-col md:flex-row gap-3 items-start md:items-center">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-700 mb-1">Lien unique généré :</p>
              <div className="bg-white rounded-lg border border-blue-200 px-4 py-2">
                <code className="text-sm text-blue-900 break-all">{generatedLink}</code>
              </div>
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <PrimaryBtn onClick={copyGeneratedLink} className="whitespace-nowrap">
                📋 Copier
              </PrimaryBtn>
              <GhostBtn
                onClick={() => setGeneratedLink("")}
                variant="danger"
                className="whitespace-nowrap"
              >
                ✕ Fermer
              </GhostBtn>
            </div>
          </div>
        </div>
      )}

      {/* Barre de recherche */}
      <div className="bg-white rounded-xl border border-blue-100/60 p-4 shadow-md">
        <TextInput
          placeholder="Rechercher par nom, téléphone ou hôtel..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Liste des demandes */}
      {filteredRequests.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <p className="text-gray-500">
            {searchQuery
              ? "Aucune demande ne correspond à votre recherche."
              : "Aucune demande pour le moment."}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredRequests.map((request) => (
            <div
              key={request.id}
              className={`bg-white rounded-xl border-2 shadow-md overflow-hidden ${
                request.status === "pending"
                  ? "border-blue-200"
                  : "border-green-200 bg-green-50/30"
              }`}
            >
              <div className="p-4 md:p-6">
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                  {/* Informations client */}
                  <div className="flex-1 space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900">
                          {request.client_name || "Sans nom"}
                        </h3>
                        <p className="text-sm text-gray-600">
                          📞 {request.client_phone || "Non renseigné"}
                        </p>
                      </div>
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-medium ${
                          request.status === "pending"
                            ? "bg-blue-100 text-blue-800"
                            : "bg-green-100 text-green-800"
                        }`}
                      >
                        {request.status === "pending" ? "En attente" : "Convertie"}
                      </span>
                    </div>

                    <div className="grid md:grid-cols-2 gap-2 text-sm text-gray-600">
                      {request.client_hotel && (
                        <p>
                          <span className="font-medium">Hôtel :</span> {request.client_hotel}
                          {request.client_room && ` - Chambre ${request.client_room}`}
                        </p>
                      )}
                      {request.client_neighborhood && (
                        <p>
                          <span className="font-medium">Quartier :</span>{" "}
                          {NEIGHBORHOODS.find((n) => n.key === request.client_neighborhood)
                            ?.label || request.client_neighborhood}
                        </p>
                      )}
                      {request.arrival_date && (
                        <p>
                          <span className="font-medium">Arrivée :</span>{" "}
                          {new Date(request.arrival_date).toLocaleDateString("fr-FR")}
                        </p>
                      )}
                      {request.departure_date && (
                        <p>
                          <span className="font-medium">Départ :</span>{" "}
                          {new Date(request.departure_date).toLocaleDateString("fr-FR")}
                        </p>
                      )}
                    </div>

                    {/* Activités sélectionnées */}
                    {request.selected_activities &&
                      Array.isArray(request.selected_activities) &&
                      request.selected_activities.length > 0 && (
                        <div className="mt-4 pt-4 border-t border-gray-200">
                          <p className="text-sm font-medium text-gray-700 mb-2">
                            Activités sélectionnées :
                          </p>
                          <div className="space-y-2">
                            {request.selected_activities.map((selectedActivity, idx) => (
                              <div
                                key={idx}
                                className="bg-gray-50 rounded-lg p-2 text-sm"
                              >
                                <span className="font-medium">
                                  {getActivityName(selectedActivity.activityId)}
                                </span>
                                <span className="text-gray-600 ml-2">
                                  - {selectedActivity.adults || 0} adulte
                                  {selectedActivity.adults > 1 ? "s" : ""}
                                  {selectedActivity.children > 0 &&
                                    `, ${selectedActivity.children} enfant${
                                      selectedActivity.children > 1 ? "s" : ""
                                    }`}
                                  {selectedActivity.babies > 0 &&
                                    `, ${selectedActivity.babies} bébé${
                                      selectedActivity.babies > 1 ? "s" : ""
                                    }`}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                    {/* Date de création */}
                    <p className="text-xs text-gray-500">
                      Demandé le{" "}
                      {new Date(request.created_at).toLocaleDateString("fr-FR", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col gap-2 md:min-w-[200px]">
                    {request.status === "pending" && (
                      <PrimaryBtn
                        onClick={() => handleCreateQuote(request)}
                        className="w-full"
                      >
                        📝 Créer un devis
                      </PrimaryBtn>
                    )}
                    <GhostBtn
                      onClick={() => copyRequestLink(request.token)}
                      variant="primary"
                      className="w-full"
                    >
                      🔗 Copier le lien
                    </GhostBtn>
                    <GhostBtn
                      onClick={() => handleDelete(request.id)}
                      variant="danger"
                      className="w-full"
                    >
                      🗑️ Supprimer
                    </GhostBtn>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

