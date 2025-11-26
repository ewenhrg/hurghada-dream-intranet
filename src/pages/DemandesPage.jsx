import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { SITE_KEY, NEIGHBORHOODS } from "../constants";
import { TextInput, PrimaryBtn, GhostBtn, Pill } from "../components/ui";
import { toast } from "../utils/toast.js";
import { generateRequestLink, generateRequestToken } from "../utils/tokenGenerator";

export function DemandesPage({ activities, onRequestStatusChange, onCreateQuoteFromRequest }) {
  const [requests, setRequests] = useState([]);
  const [historyRequests, setHistoryRequests] = useState([]); // Demandes converties (historique)
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("pending"); // pending, converted, all
  const [generatedLink, setGeneratedLink] = useState("");
  const [showHistory, setShowHistory] = useState(false); // Afficher/masquer l'historique

  // Map des activités pour des recherches O(1) au lieu de O(n)
  const activitiesMap = useMemo(() => {
    const map = new Map();
    activities.forEach((activity) => {
      if (activity.id) map.set(activity.id.toString(), activity);
      if (activity.supabase_id) map.set(activity.supabase_id.toString(), activity);
    });
    return map;
  }, [activities]);

  // Fonction pour supprimer les demandes de plus de 5 jours
  const cleanupOldRequests = useCallback(async () => {
    if (!supabase) return;

    try {
      // Calculer la date limite (5 jours avant aujourd'hui)
      const fiveDaysAgo = new Date();
      fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
      const fiveDaysAgoISO = fiveDaysAgo.toISOString();

      // Supprimer les demandes converties de plus de 5 jours
      const { error } = await supabase
        .from("client_requests")
        .delete()
        .eq("site_key", SITE_KEY)
        .eq("status", "converted")
        .lt("converted_at", fiveDaysAgoISO);

      if (error) {
        console.warn("Erreur lors du nettoyage des anciennes demandes:", error);
      } else {
        console.log("✅ Nettoyage des demandes de plus de 5 jours effectué");
      }
    } catch (err) {
      console.warn("Exception lors du nettoyage des anciennes demandes:", err);
    }
  }, []);

  // Charger les demandes depuis Supabase (optimisé avec useCallback)
  const loadRequests = useCallback(async () => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    try {
      // Nettoyer les anciennes demandes avant de charger
      await cleanupOldRequests();

      let query = supabase
        .from("client_requests")
        .select("*")
        .eq("site_key", SITE_KEY)
        .order("created_at", { ascending: false });

      if (statusFilter === "pending") {
        query = query.eq("status", "pending");
      } else if (statusFilter === "converted") {
        query = query.eq("status", "converted");
      }
      // Si "all", on affiche toutes les demandes

      const { data, error } = await query;

      if (error) {
        console.error("Erreur lors du chargement des demandes:", error);
        toast.error("Impossible de charger les demandes.");
      } else {
        // Calculer la date limite (5 jours avant aujourd'hui)
        const now = new Date();
        const fiveDaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);
        
        // Filtrer les demandes converties de plus de 5 jours pour l'affichage principal
        const validRequests = (data || []).filter((request) => {
          // Si c'est une demande convertie, vérifier qu'elle n'a pas plus de 5 jours
          if (request.status === "converted" && request.converted_at) {
            const convertedDate = new Date(request.converted_at);
            return convertedDate >= fiveDaysAgo;
          }
          // Pour les autres demandes (pending), toujours les afficher
          return true;
        });

        setRequests(validRequests);

        // Charger séparément l'historique (toutes les demandes converties de moins de 5 jours)
        // On les charge séparément pour pouvoir les afficher dans une section dédiée
        const { data: historyData, error: historyError } = await supabase
          .from("client_requests")
          .select("*")
          .eq("site_key", SITE_KEY)
          .eq("status", "converted")
          .gte("converted_at", fiveDaysAgo.toISOString())
          .order("converted_at", { ascending: false })
          .limit(50); // Limiter à 50 pour éviter de surcharger

        if (!historyError && historyData) {
          setHistoryRequests(historyData || []);
        } else if (historyError) {
          console.warn("Erreur lors du chargement de l'historique:", historyError);
        }
      }
    } catch (err) {
      console.error("Exception lors du chargement des demandes:", err);
      toast.error("Erreur lors du chargement des demandes.");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, cleanupOldRequests]);

  useEffect(() => {
    loadRequests();
    
    // Recharger toutes les 30 secondes au lieu de 10 secondes pour réduire la charge
    const interval = setInterval(loadRequests, 30000);
    return () => clearInterval(interval);
  }, [loadRequests]);

  // Filtrer les demandes par recherche (optimisé avec useMemo)
  const filteredRequests = useMemo(() => {
    if (!searchQuery.trim()) return requests;

    const query = searchQuery.toLowerCase().trim();
    return requests.filter(
      (r) =>
        r.client_name?.toLowerCase().includes(query) ||
        r.client_phone?.toLowerCase().includes(query) ||
        r.client_email?.toLowerCase().includes(query) ||
        r.client_hotel?.toLowerCase().includes(query)
    );
  }, [requests, searchQuery]);

  // Obtenir le nom d'une activité par son ID (optimisé avec Map O(1))
  const getActivityName = useCallback((activityId) => {
    if (!activityId) return "Activité inconnue";
    
    const activityIdStr = activityId.toString();
    const activity = activitiesMap.get(activityIdStr);
    
    return activity?.name || `Activité (ID: ${activityId})`;
  }, [activitiesMap]);


  // Copier le lien générique (ou le lien spécifique si token fourni)
  const copyRequestLink = (token) => {
    // Si un token est fourni, utiliser le lien spécifique, sinon utiliser le lien générique
    const baseUrl = window.location.origin;
    const link = token ? generateRequestLink(token) : `${baseUrl}/request`;
    navigator.clipboard.writeText(link);
    toast.success("Lien copié dans le presse-papiers !");
  };

  // Générer un lien générique réutilisable pour tous
  const handleGenerateNewLink = () => {
    // Lien générique sans token - peut être utilisé par tout le monde
    const baseUrl = window.location.origin;
    const link = `${baseUrl}/request`;
    setGeneratedLink(link);
    
    // Copier automatiquement dans le presse-papiers
    navigator.clipboard.writeText(link);
    toast.success("Lien générique généré et copié ! Ce lien peut être utilisé par tous les clients.");
  };

  // Copier le lien généré
  const copyGeneratedLink = () => {
    if (generatedLink) {
      navigator.clipboard.writeText(generatedLink);
      toast.success("Lien copié dans le presse-papiers !");
    }
  };

  // Supprimer une demande
  const handleDeleteRequest = async (requestId) => {
    if (!supabase) {
      toast.error("Impossible de supprimer la demande.");
      return;
    }

    // Demander confirmation
    const confirmed = window.confirm(
      "Êtes-vous sûr de vouloir supprimer cette demande ? Cette action est irréversible."
    );

    if (!confirmed) return;

    try {
      const { error } = await supabase
        .from("client_requests")
        .delete()
        .eq("id", requestId)
        .eq("site_key", SITE_KEY);

      if (error) {
        console.error("Erreur lors de la suppression de la demande:", error);
        toast.error("Impossible de supprimer la demande.");
      } else {
        toast.success("Demande supprimée avec succès.");
        // Recharger les demandes
        loadRequests();
        // Mettre à jour le compteur de demandes en attente
        if (onRequestStatusChange) {
          onRequestStatusChange();
        }
      }
    } catch (err) {
      console.error("Exception lors de la suppression de la demande:", err);
      toast.error("Erreur lors de la suppression de la demande.");
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
          <h2 className="text-2xl font-bold text-white mb-2 drop-shadow-[0_2px_4px_rgba(0,0,0,0.3)]">Demandes clients</h2>
          <p className="text-sm text-white/80">
            Gérez les demandes de devis de vos clients
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <PrimaryBtn onClick={handleGenerateNewLink} className="whitespace-nowrap">
            🔗 Générer le lien générique
          </PrimaryBtn>
          <Pill
            active={statusFilter === "pending"}
            onClick={() => setStatusFilter("pending")}
          >
            ⏳ En attente ({requests.filter((r) => r.status === "pending").length})
          </Pill>
          <Pill
            active={statusFilter === "converted"}
            onClick={() => setStatusFilter("converted")}
          >
            ✅ Converties ({requests.filter((r) => r.status === "converted").length})
          </Pill>
          <Pill
            active={statusFilter === "all"}
            onClick={() => setStatusFilter("all")}
          >
            📊 Toutes ({requests.length})
          </Pill>
        </div>
      </div>

      {/* Affichage du lien généré */}
      {generatedLink && (
        <div className="bg-gradient-to-br from-blue-50/90 to-indigo-50/80 rounded-xl border-2 border-blue-200/60 p-4 md:p-5 shadow-lg backdrop-blur-sm">
          <div className="flex flex-col md:flex-row gap-3 items-start md:items-center">
            <div className="flex-1 min-w-0">
              <p className="text-sm md:text-base font-bold text-gray-800 mb-2 flex items-center gap-2">
                <span className="text-lg">🔗</span>
                Lien générique réutilisable :
              </p>
              <div className="bg-white/95 backdrop-blur-sm rounded-lg border-2 border-blue-200/60 px-4 py-3 shadow-sm">
                <code className="text-sm md:text-base text-blue-900 break-all font-medium">{generatedLink}</code>
              </div>
              <p className="text-xs md:text-sm text-gray-600 mt-2 font-medium">
                💡 Ce lien peut être envoyé à tous vos clients. Chaque client pourra créer sa propre demande.
              </p>
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
      <div className="bg-white/95 backdrop-blur-sm rounded-xl border border-blue-100/60 p-4 shadow-md">
        <TextInput
          placeholder="Rechercher par nom, téléphone, email ou hôtel..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Liste des demandes */}
      {filteredRequests.length === 0 ? (
        <div className="bg-white/95 backdrop-blur-sm rounded-xl border border-gray-200/60 p-8 text-center shadow-sm">
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
              className={`bg-white/95 backdrop-blur-sm rounded-xl border-2 shadow-md overflow-hidden transition-all duration-200 hover:shadow-lg ${
                request.status === "pending"
                  ? "border-blue-200/60"
                  : request.status === "converted"
                  ? "border-emerald-200/60 bg-emerald-50/30"
                  : "border-gray-200/60 bg-gray-50/40"
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
                        {request.client_email && (
                          <p className="text-sm text-gray-600">
                            📧 {request.client_email}
                          </p>
                        )}
                      </div>
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-semibold shadow-sm border-2 ${
                          request.status === "pending"
                            ? "bg-gradient-to-r from-blue-100 to-blue-50 text-blue-800 border-blue-200/50"
                            : request.status === "converted"
                            ? "bg-gradient-to-r from-emerald-100 to-emerald-50 text-emerald-800 border-emerald-200/50"
                            : "bg-gradient-to-r from-gray-100 to-gray-50 text-gray-800 border-gray-200/50"
                        }`}
                      >
                        {request.status === "pending" 
                          ? "⏳ En attente" 
                          : request.status === "converted"
                          ? "✅ Convertie en devis"
                          : request.status || "Inconnu"}
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
                                className="bg-gradient-to-r from-gray-50/80 to-blue-50/40 rounded-lg border border-gray-200/50 p-2 text-sm shadow-sm"
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

                    {/* Date de création et conversion */}
                    <div className="space-y-1">
                      <p className="text-xs text-gray-500">
                        📅 Demandé le{" "}
                        {new Date(request.created_at).toLocaleDateString("fr-FR", {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                      {request.status === "converted" && request.converted_at && (
                        <p className="text-xs text-emerald-600 font-medium">
                          ✅ Convertie en devis le{" "}
                          {new Date(request.converted_at).toLocaleDateString("fr-FR", {
                            day: "numeric",
                            month: "long",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                          {request.converted_by && ` par ${request.converted_by}`}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col gap-2 md:min-w-[200px]">
                    {onCreateQuoteFromRequest && request.status !== "converted" && (
                      <PrimaryBtn
                        onClick={() => onCreateQuoteFromRequest(request)}
                        className="w-full"
                      >
                        ✏️ Créer un devis
                      </PrimaryBtn>
                    )}
                    {request.status === "converted" && (
                      <div className="bg-emerald-50/80 border-2 border-emerald-200/60 rounded-lg p-3 text-center">
                        <p className="text-xs font-bold text-emerald-800">
                          ✅ Cette demande a été convertie en devis
                        </p>
                        <p className="text-xs text-emerald-700 mt-1">
                          Consultez l'historique pour retrouver le devis
                        </p>
                      </div>
                    )}
                    {request.status !== "converted" && (
                      <GhostBtn
                        onClick={() => copyRequestLink(request.token)}
                        variant="primary"
                        className="w-full"
                      >
                        🔗 Copier le lien
                      </GhostBtn>
                    )}
                    <GhostBtn
                      onClick={() => handleDeleteRequest(request.id)}
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

      {/* Section Historique des demandes converties */}
      {historyRequests.length > 0 && (
        <div className="mt-8 pt-8 border-t border-gray-300/30">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-xl font-bold text-white mb-1 drop-shadow-[0_2px_4px_rgba(0,0,0,0.3)]">
                📜 Historique des demandes converties
              </h3>
              <p className="text-sm text-white/70">
                Demandes converties en devis (conservées 5 jours)
              </p>
            </div>
            <GhostBtn
              onClick={() => setShowHistory(!showHistory)}
              variant="primary"
              className="whitespace-nowrap"
            >
              {showHistory ? "👁️ Masquer" : "👁️ Afficher"} ({historyRequests.length})
            </GhostBtn>
          </div>

          {showHistory && (
            <div className="space-y-4 mt-4">
              {historyRequests.map((request) => (
                <div
                  key={request.id}
                  className="bg-gradient-to-br from-emerald-50/60 to-teal-50/40 backdrop-blur-sm rounded-xl border-2 border-emerald-200/60 shadow-md overflow-hidden transition-all duration-200 hover:shadow-lg opacity-75"
                >
                  <div className="p-4 md:p-6">
                    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                      {/* Informations client */}
                      <div className="flex-1 space-y-3">
                        <div className="flex items-start justify-between">
                          <div>
                            <h4 className="text-base font-semibold text-gray-800">
                              {request.client_name || "Sans nom"}
                            </h4>
                            <p className="text-sm text-gray-600">
                              📞 {request.client_phone || "Non renseigné"}
                            </p>
                            {request.client_email && (
                              <p className="text-sm text-gray-600">
                                📧 {request.client_email}
                              </p>
                            )}
                          </div>
                          <span className="px-3 py-1 rounded-full text-xs font-semibold shadow-sm border-2 bg-gradient-to-r from-emerald-100 to-emerald-50 text-emerald-800 border-emerald-200/50">
                            ✅ Convertie
                          </span>
                        </div>

                        <div className="grid md:grid-cols-2 gap-2 text-sm text-gray-600">
                          {request.client_hotel && (
                            <p>
                              <span className="font-medium">Hôtel :</span> {request.client_hotel}
                              {request.client_room && ` - Chambre ${request.client_room}`}
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
                            <div className="mt-3 pt-3 border-t border-emerald-200/50">
                              <p className="text-xs font-medium text-gray-700 mb-2">
                                Activités sélectionnées :
                              </p>
                              <div className="space-y-1">
                                {request.selected_activities.slice(0, 3).map((selectedActivity, idx) => (
                                  <div
                                    key={idx}
                                    className="bg-white/60 rounded-lg border border-emerald-200/50 p-2 text-xs shadow-sm"
                                  >
                                    <span className="font-medium">
                                      {getActivityName(selectedActivity.activityId)}
                                    </span>
                                    <span className="text-gray-600 ml-2">
                                      - {selectedActivity.adults || 0} adulte
                                      {selectedActivity.adults > 1 ? "s" : ""}
                                    </span>
                                  </div>
                                ))}
                                {request.selected_activities.length > 3 && (
                                  <p className="text-xs text-gray-500 italic">
                                    + {request.selected_activities.length - 3} autre(s) activité(s)
                                  </p>
                                )}
                              </div>
                            </div>
                          )}

                        {/* Date de conversion */}
                        <div className="space-y-1">
                          <p className="text-xs text-gray-500">
                            📅 Demandé le{" "}
                            {new Date(request.created_at).toLocaleDateString("fr-FR", {
                              day: "numeric",
                              month: "long",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </p>
                          {request.converted_at && (
                            <p className="text-xs text-emerald-600 font-medium">
                              ✅ Convertie le{" "}
                              {new Date(request.converted_at).toLocaleDateString("fr-FR", {
                                day: "numeric",
                                month: "long",
                                year: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                              {request.converted_by && ` par ${request.converted_by}`}
                            </p>
                          )}
                          {request.converted_at && (() => {
                            const convertedDate = new Date(request.converted_at);
                            const now = new Date();
                            const daysSinceConversion = Math.floor(
                              (now.getTime() - convertedDate.getTime()) / (1000 * 60 * 60 * 24)
                            );
                            const daysRemaining = Math.max(0, 5 - daysSinceConversion);
                            return (
                              <p className="text-xs text-gray-400 italic">
                                ⏱️ Suppression automatique dans {daysRemaining} jour{daysRemaining > 1 ? "s" : ""}
                              </p>
                            );
                          })()}
                        </div>
                      </div>
                      {/* Bouton pour créer un nouveau devis */}
                      {onCreateQuoteFromRequest && (
                        <div className="flex-shrink-0">
                          <PrimaryBtn
                            onClick={() => {
                              if (onCreateQuoteFromRequest) {
                                onCreateQuoteFromRequest(request);
                                toast.success("Devis créé à partir de la demande !");
                              }
                            }}
                            variant="primary"
                            className="w-full md:w-auto whitespace-nowrap"
                          >
                            📝 Créer un nouveau devis
                          </PrimaryBtn>
                          <p className="text-xs text-gray-500 mt-2 text-center md:text-left">
                            Recréer le devis si perdu
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

