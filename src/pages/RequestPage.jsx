import { useState, useEffect, useMemo } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { SITE_KEY, CATEGORIES } from "../constants";
import { TextInput, PrimaryBtn } from "../components/ui";
import { toast } from "../utils/toast.js";

export function RequestPage() {
  const { token } = useParams();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [activities, setActivities] = useState([]);
  const [formData, setFormData] = useState({
    clientName: "",
    clientPhone: "",
    clientHotel: "",
    arrivalDate: "",
    departureDate: "",
    selectedActivities: [],
  });
  const [expandedCategories, setExpandedCategories] = useState(() => {
    // Par défaut, toutes les catégories sont fermées
    const initial = {};
    CATEGORIES.forEach((cat) => {
      initial[cat.key] = false;
    });
    return initial;
  });

  // Charger les activités disponibles
  useEffect(() => {
    async function loadActivities() {
      if (!supabase) {
        toast.error("Erreur de connexion. Veuillez réessayer plus tard.");
        setLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from("activities")
          .select("*")
          .eq("site_key", SITE_KEY)
          .order("name", { ascending: true });

        if (error) {
          console.error("Erreur lors du chargement des activités:", error);
          toast.error("Impossible de charger les activités.");
        } else {
          // Les activités de Supabase ont directement l'ID Supabase dans le champ 'id'
          // On les utilise telles quelles
          setActivities(data || []);
        }
      } catch (err) {
        console.error("Exception lors du chargement des activités:", err);
        toast.error("Erreur lors du chargement des activités.");
      } finally {
        setLoading(false);
      }
    }

    loadActivities();
  }, []);

  // Vérifier si le token existe déjà (pour pré-remplir le formulaire)
  useEffect(() => {
    async function checkExistingRequest() {
      if (!token || !supabase) return;

      try {
        const { data, error } = await supabase
          .from("client_requests")
          .select("*")
          .eq("token", token)
          .eq("site_key", SITE_KEY)
          .single();

        if (!error && data) {
          // Pré-remplir le formulaire avec les données existantes
          setFormData({
            clientName: data.client_name || "",
            clientPhone: data.client_phone || "",
            clientHotel: data.client_hotel || "",
            arrivalDate: data.arrival_date || "",
            departureDate: data.departure_date || "",
            selectedActivities: Array.isArray(data.selected_activities) ? data.selected_activities : [],
          });
        }
      } catch (err) {
        console.error("Erreur lors de la vérification de la demande:", err);
      }
    }

    checkExistingRequest();
  }, [token]);

  const handleActivityToggle = (activityId) => {
    setFormData((prev) => {
      const existingIndex = prev.selectedActivities.findIndex(
        (a) => a.activityId?.toString() === activityId?.toString()
      );

      if (existingIndex >= 0) {
        // Retirer l'activité
        return {
          ...prev,
          selectedActivities: prev.selectedActivities.filter(
            (_, idx) => idx !== existingIndex
          ),
        };
      } else {
        // Ajouter l'activité avec des quantités par défaut
        // Utiliser l'ID Supabase (id) comme identifiant principal
        return {
          ...prev,
          selectedActivities: [
            ...prev.selectedActivities,
            {
              activityId: activityId?.toString(),
              adults: "",
              children: 0,
              babies: 0,
            },
          ],
        };
      }
    });
  };

  const updateActivityQuantity = (activityId, field, value) => {
    setFormData((prev) => ({
      ...prev,
      selectedActivities: prev.selectedActivities.map((a) =>
        a.activityId === activityId
          ? { ...a, [field]: field === "adults" ? value : Number(value) || 0 }
          : a
      ),
    }));
  };

  // Grouper les activités par catégorie et les trier alphabétiquement
  const activitiesByCategory = useMemo(() => {
    const grouped = {};
    
    // Initialiser toutes les catégories avec un tableau vide
    CATEGORIES.forEach((cat) => {
      grouped[cat.key] = [];
    });
    
    // Grouper les activités par catégorie
    activities.forEach((activity) => {
      const category = activity.category || "desert";
      // S'assurer que la catégorie existe, sinon utiliser "desert"
      const validCategory = CATEGORIES.some(cat => cat.key === category) ? category : "desert";
      if (!grouped[validCategory]) {
        grouped[validCategory] = [];
      }
      grouped[validCategory].push(activity);
    });
    
    // Trier les activités alphabétiquement dans chaque catégorie
    Object.keys(grouped).forEach((categoryKey) => {
      if (grouped[categoryKey].length > 0) {
        grouped[categoryKey].sort((a, b) => {
          const nameA = (a.name || "").toLowerCase();
          const nameB = (b.name || "").toLowerCase();
          return nameA.localeCompare(nameB, "fr");
        });
      }
    });
    
    return grouped;
  }, [activities]);

  // Toggle l'expansion d'une catégorie
  const toggleCategory = (categoryKey) => {
    setExpandedCategories((prev) => ({
      ...prev,
      [categoryKey]: !prev[categoryKey],
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validation
    if (!formData.clientName.trim()) {
      toast.error("Veuillez saisir votre nom.");
      return;
    }
    if (!formData.clientPhone.trim()) {
      toast.error("Veuillez saisir votre numéro de téléphone.");
      return;
    }
    if (!formData.arrivalDate) {
      toast.error("Veuillez sélectionner votre date d'arrivée.");
      return;
    }
    if (!formData.departureDate) {
      toast.error("Veuillez sélectionner votre date de départ.");
      return;
    }
    if (formData.selectedActivities.length === 0) {
      toast.error("Veuillez sélectionner au moins une activité.");
      return;
    }

    // Vérifier que toutes les activités sélectionnées ont au moins un adulte
    const invalidActivities = formData.selectedActivities.filter(
      (a) => !a.adults || Number(a.adults) <= 0
    );
    if (invalidActivities.length > 0) {
      toast.error("Veuillez indiquer le nombre d'adultes pour chaque activité sélectionnée.");
      return;
    }

    setSubmitting(true);

    try {
      const requestData = {
        site_key: SITE_KEY,
        token: token || crypto.randomUUID(),
        client_name: formData.clientName.trim(),
        client_phone: formData.clientPhone.trim(),
        client_hotel: formData.clientHotel.trim(),
        client_room: "",
        client_neighborhood: "",
        arrival_date: formData.arrivalDate,
        departure_date: formData.departureDate,
        selected_activities: formData.selectedActivities,
        status: "pending",
      };

      let result;
      if (token) {
        // Mise à jour d'une demande existante
        const { data: existing } = await supabase
          .from("client_requests")
          .select("id")
          .eq("token", token)
          .eq("site_key", SITE_KEY)
          .single();

        if (existing) {
          const { error } = await supabase
            .from("client_requests")
            .update(requestData)
            .eq("id", existing.id);
          
          if (error) throw error;
          toast.success("Votre demande a été mise à jour avec succès !");
        } else {
          // Créer une nouvelle demande avec le token fourni
          const { error } = await supabase
            .from("client_requests")
            .insert(requestData);
          
          if (error) throw error;
          toast.success("Votre demande a été envoyée avec succès !");
        }
      } else {
        // Créer une nouvelle demande
        const { error } = await supabase
          .from("client_requests")
          .insert(requestData);
        
        if (error) throw error;
        toast.success("Votre demande a été envoyée avec succès !");
      }

      // Afficher un message de confirmation
      setTimeout(() => {
        alert("Merci ! Votre demande a été envoyée. Nous vous contacterons bientôt.");
      }, 500);
    } catch (error) {
      console.error("Erreur lors de l'envoi de la demande:", error);
      toast.error("Une erreur est survenue. Veuillez réessayer.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Chargement...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 py-8 px-4">
      <div className="max-w-5xl mx-auto">
        <div className="bg-white rounded-3xl shadow-2xl overflow-hidden">
          {/* Header avec dégradé */}
          <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 px-6 md:px-10 py-8 text-center text-white">
            <h1 className="text-3xl md:text-4xl font-bold mb-3">
              📋 Demande de devis
            </h1>
            <p className="text-blue-100 text-lg mb-4">
              Remplissez ce formulaire pour recevoir un devis personnalisé
            </p>
            <a
              href="https://tapkit.me/catalogues-activites"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-white text-blue-600 font-bold px-6 py-3 rounded-xl shadow-lg hover:shadow-xl hover:bg-blue-50 transition-all duration-200 transform hover:scale-105"
            >
              📖 NOTRE CATALOGUE
            </a>
          </div>

          <form onSubmit={handleSubmit} className="p-6 md:p-10 space-y-8">
            {/* Informations personnelles */}
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-6 md:p-8 border border-blue-100 shadow-sm">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-lg">
                  👤
                </div>
                <h2 className="text-2xl font-bold text-gray-900">
                  Vos informations
                </h2>
              </div>
              <div className="grid md:grid-cols-2 gap-5">
                <div>
                  <label className="block text-sm font-semibold text-gray-800 mb-2">
                    Nom complet <span className="text-red-500">*</span>
                  </label>
                  <TextInput
                    required
                    value={formData.clientName}
                    onChange={(e) =>
                      setFormData({ ...formData, clientName: e.target.value })
                    }
                    placeholder="Votre nom complet"
                    className="text-base"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-800 mb-2">
                    Téléphone <span className="text-red-500">*</span>
                  </label>
                  <TextInput
                    required
                    type="tel"
                    value={formData.clientPhone}
                    onChange={(e) =>
                      setFormData({ ...formData, clientPhone: e.target.value })
                    }
                    placeholder="+33 6 12 34 56 78"
                    className="text-base"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-800 mb-2">
                    Hôtel
                  </label>
                  <TextInput
                    value={formData.clientHotel}
                    onChange={(e) =>
                      setFormData({ ...formData, clientHotel: e.target.value })
                    }
                    placeholder="Nom de votre hôtel"
                    className="text-base"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-800 mb-2">
                    Date d'arrivée <span className="text-red-500">*</span>
                  </label>
                  <input
                    required
                    type="date"
                    value={formData.arrivalDate}
                    onChange={(e) =>
                      setFormData({ ...formData, arrivalDate: e.target.value })
                    }
                    className="w-full rounded-xl border-2 border-gray-200 bg-white px-4 py-3 text-base focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-800 mb-2">
                    Date de départ <span className="text-red-500">*</span>
                  </label>
                  <input
                    required
                    type="date"
                    value={formData.departureDate}
                    onChange={(e) =>
                      setFormData({ ...formData, departureDate: e.target.value })
                    }
                    min={formData.arrivalDate}
                    className="w-full rounded-xl border-2 border-gray-200 bg-white px-4 py-3 text-base focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
                  />
                </div>
              </div>
            </div>

            {/* Sélection des activités */}
            <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-2xl p-6 md:p-8 border border-green-100 shadow-sm">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-full bg-green-600 flex items-center justify-center text-white font-bold text-lg">
                  🎯
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">
                    Activités souhaitées <span className="text-red-500">*</span>
                  </h2>
                  <p className="text-sm text-gray-600 mt-1">
                    Sélectionnez les activités qui vous intéressent et indiquez le nombre de personnes
                  </p>
                </div>
              </div>

              {activities.length === 0 ? (
                <div className="bg-white rounded-xl p-8 text-center border-2 border-dashed border-gray-300">
                  <p className="text-gray-500 text-lg">
                    Aucune activité disponible pour le moment.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {CATEGORIES.filter((category) => {
                    // Afficher seulement les catégories qui ont des activités
                    const categoryActivities = activitiesByCategory[category.key] || [];
                    return categoryActivities.length > 0;
                  }).map((category) => {
                    const categoryActivities = activitiesByCategory[category.key] || [];
                    const isExpanded = expandedCategories[category.key] === true;
                    const selectedCount = categoryActivities.filter((activity) =>
                      formData.selectedActivities.some(
                        (a) => a.activityId?.toString() === activity.id?.toString()
                      )
                    ).length;

                    // Icônes par catégorie
                    const categoryIcons = {
                      desert: "🏜️",
                      aquatique: "🌊",
                      exploration_bien_etre: "🧘",
                      luxor_caire: "🏛️",
                      marsa_alam: "🐠",
                      transfert: "🚗",
                    };

                    return (
                      <div
                        key={category.key}
                        className="bg-white rounded-xl border-2 border-gray-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow"
                      >
                        <button
                          type="button"
                          onClick={() => toggleCategory(category.key)}
                          className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
                        >
                          <div className="flex items-center gap-3 flex-wrap">
                            <span className="text-2xl">{categoryIcons[category.key] || "📋"}</span>
                            <h3 className="text-lg font-bold text-gray-900">
                              {category.label}
                            </h3>
                            <span className="text-sm text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                              {categoryActivities.length} activité{categoryActivities.length > 1 ? "s" : ""}
                            </span>
                            {selectedCount > 0 && (
                              <span className="bg-blue-600 text-white text-xs font-semibold px-2 py-1 rounded-full">
                                {selectedCount} sélectionnée{selectedCount > 1 ? "s" : ""}
                              </span>
                            )}
                          </div>
                          <span className="text-gray-400 text-xl font-bold ml-2">
                            {isExpanded ? "▼" : "▶"}
                          </span>
                        </button>
                        {isExpanded && (
                          <div className="border-t border-gray-200 p-4 space-y-3 bg-gray-50">
                            {categoryActivities.map((activity) => {
                              const activityId = activity.id?.toString();
                              const isSelected = formData.selectedActivities.some(
                                (a) => a.activityId?.toString() === activityId
                              );
                              const selectedActivity = formData.selectedActivities.find(
                                (a) => a.activityId?.toString() === activityId
                              );

                              return (
                                <div
                                  key={activity.id}
                                  className={`border-2 rounded-xl p-4 transition-all duration-200 ${
                                    isSelected
                                      ? "border-blue-500 bg-blue-50 shadow-md"
                                      : "border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm"
                                  }`}
                                >
                                  <div className="flex items-start gap-3">
                                    <input
                                      type="checkbox"
                                      checked={isSelected}
                                      onChange={() => handleActivityToggle(activityId)}
                                      className="mt-1 w-5 h-5 text-blue-600 rounded border-2 border-gray-300 focus:ring-2 focus:ring-blue-500 cursor-pointer"
                                    />
                                    <div className="flex-1">
                                      <div className="flex items-center justify-between mb-2">
                                        <h4 className="text-base font-bold text-gray-900">
                                          {activity.name}
                                        </h4>
                                        {activity.price_adult && (
                                          <span className="text-sm font-semibold text-blue-600 bg-blue-100 px-2 py-1 rounded-full">
                                            {activity.price_adult}€ / adulte
                                          </span>
                                        )}
                                      </div>
                                      {activity.notes && (
                                        <p className="text-xs text-gray-600 mb-3 bg-gray-50 p-2 rounded-lg">
                                          {activity.notes}
                                        </p>
                                      )}
                                      {isSelected && (
                                        <div className="mt-3 pt-3 border-t-2 border-blue-200">
                                          <p className="text-xs font-semibold text-gray-700 mb-2">
                                            Nombre de personnes :
                                          </p>
                                          <div className="grid grid-cols-3 gap-2">
                                            <div>
                                              <label className="block text-xs font-semibold text-gray-800 mb-1">
                                                👥 Adultes <span className="text-red-500">*</span>
                                              </label>
                                              <input
                                                type="number"
                                                min="1"
                                                required
                                                value={selectedActivity?.adults || ""}
                                                onChange={(e) =>
                                                  updateActivityQuantity(
                                                    activityId,
                                                    "adults",
                                                    e.target.value
                                                  )
                                                }
                                                className="w-full rounded-lg border-2 border-gray-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
                                                placeholder="0"
                                              />
                                            </div>
                                            <div>
                                              <label className="block text-xs font-semibold text-gray-800 mb-1">
                                                👶 Enfants
                                              </label>
                                              <input
                                                type="number"
                                                min="0"
                                                value={selectedActivity?.children || 0}
                                                onChange={(e) =>
                                                  updateActivityQuantity(
                                                    activityId,
                                                    "children",
                                                    e.target.value
                                                  )
                                                }
                                                className="w-full rounded-lg border-2 border-gray-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
                                                placeholder="0"
                                              />
                                            </div>
                                            <div>
                                              <label className="block text-xs font-semibold text-gray-800 mb-1">
                                                🍼 Bébés
                                              </label>
                                              <input
                                                type="number"
                                                min="0"
                                                value={selectedActivity?.babies || 0}
                                                onChange={(e) =>
                                                  updateActivityQuantity(
                                                    activityId,
                                                    "babies",
                                                    e.target.value
                                                  )
                                                }
                                                className="w-full rounded-lg border-2 border-gray-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
                                                placeholder="0"
                                              />
                                            </div>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Bouton de soumission */}
            <div className="flex flex-col items-center gap-4 pt-6 border-t border-gray-200">
              <PrimaryBtn 
                type="submit" 
                disabled={submitting}
                className="px-8 py-4 text-lg font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all"
              >
                {submitting ? (
                  <span className="flex items-center gap-2">
                    <span className="animate-spin">⏳</span>
                    Envoi en cours...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    ✉️ Envoyer ma demande
                  </span>
                )}
              </PrimaryBtn>
              <p className="text-xs text-gray-500 text-center">
                Les champs marqués d'un <span className="text-red-500">*</span> sont obligatoires
              </p>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

