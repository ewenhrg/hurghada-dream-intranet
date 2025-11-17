import { useState, useEffect, useMemo } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { SITE_KEY, CATEGORIES } from "../constants";
import { TextInput, PrimaryBtn } from "../components/ui";
import { toast } from "../utils/toast.js";

// Composant Tooltip pour l'aide contextuelle avec amélioration mobile et accessibilité
function Tooltip({ text, children, id, position = "top" }) {
  const [isVisible, setIsVisible] = useState(false);
  
  return (
    <div className="relative inline-flex items-center">
      <button
        type="button"
        className="inline-flex items-center justify-center w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-blue-100 text-blue-600 hover:bg-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 transition-colors touch-manipulation"
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
        onFocus={() => setIsVisible(true)}
        onBlur={() => setIsVisible(false)}
        onTouchStart={() => setIsVisible(!isVisible)}
        onClick={() => setIsVisible(!isVisible)}
        aria-label={`Aide: ${text}`}
        aria-describedby={id}
        aria-expanded={isVisible}
        aria-haspopup="true"
      >
        <span className="text-xs sm:text-sm font-bold">?</span>
      </button>
      {isVisible && (
        <div
          id={id}
          role="tooltip"
          className={`absolute z-50 ${
            position === "top" 
              ? "bottom-full mb-2 left-1/2 transform -translate-x-1/2" 
              : "top-full mt-2 left-1/2 transform -translate-x-1/2"
          } w-64 sm:w-72 md:w-80 p-3 bg-gray-900 text-white text-xs sm:text-sm rounded-lg shadow-xl pointer-events-none`}
        >
          <div className="relative">
            <p className="leading-relaxed">{text}</p>
            {/* Flèche pointant vers le bouton */}
            <div className={`absolute ${
              position === "top" ? "top-full -mt-1" : "bottom-full -mb-1"
            } left-1/2 transform -translate-x-1/2`}>
              <div className={`w-0 h-0 border-l-4 border-r-4 ${
                position === "top" ? "border-t-4 border-t-gray-900" : "border-b-4 border-b-gray-900"
              } border-transparent`}></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function RequestPage() {
  const { token } = useParams();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [requestSubmitted, setRequestSubmitted] = useState(false);
  const [activities, setActivities] = useState([]);
  const [formData, setFormData] = useState({
    clientName: "",
    clientPhone: "",
    clientEmail: "",
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
            clientEmail: data.client_email || "",
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
    if (!formData.clientEmail.trim()) {
      toast.error("Veuillez saisir votre adresse email.");
      return;
    }
    // Validation basique de l'email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.clientEmail.trim())) {
      toast.error("Veuillez saisir une adresse email valide.");
      return;
    }
    if (!formData.clientHotel.trim()) {
      toast.error("Veuillez saisir votre hôtel.");
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
        client_email: formData.clientEmail.trim(),
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
          setRequestSubmitted(true);
        } else {
          // Créer une nouvelle demande avec le token fourni
          const { error } = await supabase
            .from("client_requests")
            .insert(requestData);
          
          if (error) throw error;
          toast.success("Votre demande a été envoyée avec succès !");
          setRequestSubmitted(true);
        }
      } else {
        // Créer une nouvelle demande
        const { error } = await supabase
          .from("client_requests")
          .insert(requestData);
        
        if (error) throw error;
        toast.success("Votre demande a été envoyée avec succès !");
        setRequestSubmitted(true);
      }
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

  // Afficher l'écran de confirmation si la demande a été envoyée
  if (requestSubmitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 py-4 sm:py-6 md:py-8 px-3 sm:px-4 relative overflow-hidden">
        {/* Effets de fond animés */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-400 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob"></div>
          <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-purple-400 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob animation-delay-2000"></div>
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-indigo-400 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob animation-delay-4000"></div>
        </div>

        <div className="max-w-2xl mx-auto relative z-10">
          <div className="bg-white/90 backdrop-blur-lg rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden border border-white/20 animate-fade-in">
            <div className="relative bg-gradient-to-r from-green-600 via-emerald-600 to-teal-600 px-4 sm:px-6 md:px-10 py-8 sm:py-10 text-center text-white overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -skew-x-12 animate-shine"></div>
              
              <div className="relative z-10">
                <div className="inline-flex items-center justify-center w-20 h-20 sm:w-24 sm:h-24 mb-4 bg-white/20 rounded-full backdrop-blur-sm animate-bounce-subtle">
                  <span className="text-4xl sm:text-5xl">✅</span>
                </div>
                <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold mb-3 sm:mb-4 drop-shadow-lg">
                  Demande envoyée avec succès !
                </h1>
                <p className="text-green-100 text-base sm:text-lg md:text-xl mb-4 sm:mb-6 px-2 font-medium">
                  Merci pour votre demande. Nous avons bien reçu vos informations et nous vous contacterons bientôt.
                </p>
              </div>
            </div>

            <div className="p-6 sm:p-8 md:p-10 text-center space-y-4">
              <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-6 border-2 border-green-200">
                <p className="text-gray-700 text-sm sm:text-base font-medium mb-4">
                  Votre demande de devis a été enregistrée et sera traitée dans les plus brefs délais.
                </p>
                <div className="flex justify-center items-center text-xs sm:text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">💬</span>
                    <span className="text-blue-600 font-semibold">sur WhatsApp</span>
                  </div>
                </div>
              </div>
              
              <p className="text-xs sm:text-sm text-gray-500 font-medium">
                Cette page ne peut plus être modifiée. Si vous avez besoin de modifier votre demande, veuillez nous contacter directement.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Styles CSS pour les animations */}
      <style>{`
        @keyframes blob {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(30px, -50px) scale(1.1); }
          66% { transform: translate(-20px, 20px) scale(0.9); }
        }
        @keyframes shine {
          0% { transform: translateX(-100%) skewX(-12deg); }
          100% { transform: translateX(200%) skewX(-12deg); }
        }
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes bounce-subtle {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }
        .animate-blob {
          animation: blob 7s infinite;
        }
        .animation-delay-2000 {
          animation-delay: 2s;
        }
        .animation-delay-4000 {
          animation-delay: 4s;
        }
        .animate-shine {
          animation: shine 3s infinite;
        }
        .animate-fade-in {
          animation: fade-in 0.6s ease-out;
        }
        .animate-bounce-subtle {
          animation: bounce-subtle 2s ease-in-out infinite;
        }
      `}</style>
      
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 py-4 sm:py-6 md:py-8 px-3 sm:px-4 relative overflow-hidden">
        {/* Effets de fond animés */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-400 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob"></div>
          <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-purple-400 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob animation-delay-2000"></div>
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-indigo-400 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob animation-delay-4000"></div>
        </div>
      
      <div className="max-w-5xl mx-auto relative z-10">
        <div className="bg-white/90 backdrop-blur-lg rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden border border-white/20 animate-fade-in">
          {/* Header avec dégradé amélioré */}
          <div className="relative bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 px-4 sm:px-6 md:px-10 py-8 sm:py-10 text-center text-white overflow-hidden">
            {/* Effet de brillance animé */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -skew-x-12 animate-shine"></div>
            
            <div className="relative z-10">
              <div className="inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 mb-4 bg-white/20 rounded-full backdrop-blur-sm animate-bounce-subtle">
                <span className="text-3xl sm:text-4xl">📋</span>
              </div>
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold mb-3 sm:mb-4 drop-shadow-lg">
                Demande de devis
              </h1>
              <p className="text-blue-100 text-sm sm:text-base md:text-lg mb-4 sm:mb-6 px-2 font-medium">
                Remplissez ce formulaire pour recevoir un devis personnalisé
              </p>
              <a
                href="https://tapkit.me/catalogues-activites"
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => {
                  e.preventDefault();
                  window.open("https://tapkit.me/catalogues-activites", "_blank", "noopener,noreferrer");
                }}
                className="inline-flex items-center gap-2 bg-white text-blue-600 font-bold px-6 sm:px-8 py-3 sm:py-3.5 rounded-xl shadow-xl hover:shadow-2xl hover:bg-blue-50 transition-all duration-300 transform hover:scale-110 active:scale-95 text-sm sm:text-base border-2 border-white/50 cursor-pointer"
              >
                <span className="text-lg">📖</span>
                <span>NOTRE CATALOGUE</span>
              </a>
            </div>
          </div>

          <form 
            onSubmit={handleSubmit} 
            className="p-4 sm:p-6 md:p-10 space-y-6 sm:space-y-8" 
            style={{ pointerEvents: requestSubmitted ? 'none' : 'auto', opacity: requestSubmitted ? 0.5 : 1 }}
            aria-label="Formulaire de demande de devis"
            noValidate
          >
            {/* Informations personnelles */}
            <div className="bg-gradient-to-br from-blue-50/80 via-indigo-50/80 to-purple-50/80 backdrop-blur-sm rounded-xl sm:rounded-2xl p-5 sm:p-6 md:p-8 border-2 border-blue-100/50 shadow-lg hover:shadow-xl transition-all duration-300 relative overflow-hidden group">
              {/* Effet de brillance au survol */}
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 -skew-x-12 transform translate-x-[-100%] group-hover:translate-x-[100%]"></div>
              
              <div className="flex items-center gap-3 sm:gap-4 mb-5 sm:mb-6 relative z-10">
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-lg sm:text-xl flex-shrink-0 shadow-lg transform group-hover:scale-110 transition-transform duration-300">
                  <span className="text-xl sm:text-2xl">👤</span>
                </div>
                <h2 className="text-xl sm:text-2xl font-extrabold text-gray-900 bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                  Vos informations
                </h2>
              </div>
              <div className="grid md:grid-cols-2 gap-4 sm:gap-5 relative z-10">
                <div className="transform transition-all duration-300 hover:scale-[1.02]">
                  <label htmlFor="clientName" className="block text-sm sm:text-base font-bold text-gray-800 mb-2.5 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500" aria-hidden="true"></span>
                    Nom complet <span className="text-red-500 font-bold" aria-label="obligatoire">*</span>
                    <Tooltip 
                      text="Indiquez votre nom complet tel qu'il apparaît sur votre pièce d'identité. Cela nous permettra de vous identifier facilement."
                      id="tooltip-name"
                    />
                  </label>
                  <TextInput
                    id="clientName"
                    name="clientName"
                    required
                    disabled={requestSubmitted}
                    value={formData.clientName}
                    onChange={(e) =>
                      setFormData({ ...formData, clientName: e.target.value })
                    }
                    placeholder="Votre nom complet"
                    aria-required="true"
                    aria-describedby="tooltip-name"
                    className="text-base sm:text-lg py-3 sm:py-3.5 border-2 border-gray-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all duration-300 shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation"
                  />
                </div>
                <div className="transform transition-all duration-300 hover:scale-[1.02]">
                  <label htmlFor="clientPhone" className="block text-sm sm:text-base font-bold text-gray-800 mb-2.5 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500" aria-hidden="true"></span>
                    Téléphone <span className="text-red-500 font-bold" aria-label="obligatoire">*</span>
                    <Tooltip 
                      text="Indiquez votre numéro de téléphone avec l'indicatif pays (ex: +33 pour la France). Nous vous contacterons sur ce numéro pour confirmer votre réservation."
                      id="tooltip-phone"
                    />
                  </label>
                  <TextInput
                    id="clientPhone"
                    name="clientPhone"
                    required
                    type="tel"
                    inputMode="tel"
                    disabled={requestSubmitted}
                    value={formData.clientPhone}
                    onChange={(e) =>
                      setFormData({ ...formData, clientPhone: e.target.value })
                    }
                    placeholder="+33606060606"
                    aria-required="true"
                    aria-describedby="tooltip-phone"
                    className="text-base sm:text-lg py-3 sm:py-3.5 border-2 border-gray-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all duration-300 shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation"
                  />
                </div>
                <div className="transform transition-all duration-300 hover:scale-[1.02]">
                  <label htmlFor="clientEmail" className="block text-sm sm:text-base font-bold text-gray-800 mb-2.5 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500" aria-hidden="true"></span>
                    Adresse email <span className="text-red-500 font-bold" aria-label="obligatoire">*</span>
                    <Tooltip 
                      text="Indiquez votre adresse email. Nous vous enverrons une confirmation de votre demande par email."
                      id="tooltip-email"
                    />
                  </label>
                  <TextInput
                    id="clientEmail"
                    name="clientEmail"
                    required
                    type="email"
                    inputMode="email"
                    disabled={requestSubmitted}
                    value={formData.clientEmail}
                    onChange={(e) =>
                      setFormData({ ...formData, clientEmail: e.target.value })
                    }
                    placeholder="votre.email@exemple.com"
                    aria-required="true"
                    aria-describedby="tooltip-email"
                    className="text-base sm:text-lg py-3 sm:py-3.5 border-2 border-gray-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all duration-300 shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation"
                  />
                </div>
                <div className="transform transition-all duration-300 hover:scale-[1.02]">
                  <label htmlFor="clientHotel" className="block text-sm sm:text-base font-bold text-gray-800 mb-2.5 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" aria-hidden="true"></span>
                    Hôtel <span className="text-red-500 font-bold" aria-label="obligatoire">*</span>
                    <Tooltip 
                      text="Indiquez le nom de votre hôtel. Cela nous aidera à organiser les transferts si nécessaire."
                      id="tooltip-hotel"
                    />
                  </label>
                  <TextInput
                    id="clientHotel"
                    name="clientHotel"
                    required
                    disabled={requestSubmitted}
                    value={formData.clientHotel}
                    onChange={(e) =>
                      setFormData({ ...formData, clientHotel: e.target.value })
                    }
                    placeholder="Nom de votre hôtel"
                    aria-required="true"
                    aria-describedby="tooltip-hotel"
                    className="text-base sm:text-lg py-3 sm:py-3.5 border-2 border-gray-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all duration-300 shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation"
                  />
                </div>
                <div className="transform transition-all duration-300 hover:scale-[1.02]">
                  <label htmlFor="arrivalDate" className="block text-sm sm:text-base font-bold text-gray-800 mb-2.5 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500" aria-hidden="true"></span>
                    Date d'arrivée <span className="text-red-500 font-bold" aria-label="obligatoire">*</span>
                    <Tooltip 
                      text="Sélectionnez la date de votre arrivée à Hurghada. Cette date nous permettra de planifier vos activités."
                      id="tooltip-arrival"
                    />
                  </label>
                  <input
                    id="arrivalDate"
                    name="arrivalDate"
                    required
                    type="date"
                    disabled={requestSubmitted}
                    value={formData.arrivalDate}
                    onChange={(e) =>
                      setFormData({ ...formData, arrivalDate: e.target.value })
                    }
                    min={new Date().toISOString().split('T')[0]}
                    aria-required="true"
                    aria-describedby="tooltip-arrival"
                    className="w-full rounded-xl border-2 border-gray-200 bg-white px-4 py-3 sm:py-3.5 text-base sm:text-lg focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all duration-300 shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation"
                  />
                </div>
                <div className="transform transition-all duration-300 hover:scale-[1.02]">
                  <label htmlFor="departureDate" className="block text-sm sm:text-base font-bold text-gray-800 mb-2.5 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500" aria-hidden="true"></span>
                    Date de départ <span className="text-red-500 font-bold" aria-label="obligatoire">*</span>
                    <Tooltip 
                      text="Sélectionnez la date de votre départ. Cette date doit être postérieure à votre date d'arrivée. Elle nous permettra de planifier vos activités jusqu'à votre départ."
                      id="tooltip-departure"
                    />
                  </label>
                  <input
                    id="departureDate"
                    name="departureDate"
                    required
                    type="date"
                    disabled={requestSubmitted}
                    value={formData.departureDate}
                    onChange={(e) =>
                      setFormData({ ...formData, departureDate: e.target.value })
                    }
                    min={formData.arrivalDate || new Date().toISOString().split('T')[0]}
                    aria-required="true"
                    aria-describedby="tooltip-departure"
                    aria-invalid={formData.departureDate && formData.arrivalDate && formData.departureDate < formData.arrivalDate}
                    className="w-full rounded-xl border-2 border-gray-200 bg-white px-4 py-3 sm:py-3.5 text-base sm:text-lg focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all duration-300 shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation"
                  />
                </div>
              </div>
            </div>

            {/* Sélection des activités */}
            <div className="bg-gradient-to-br from-green-50/80 via-emerald-50/80 to-teal-50/80 backdrop-blur-sm rounded-xl sm:rounded-2xl p-5 sm:p-6 md:p-8 border-2 border-green-100/50 shadow-lg hover:shadow-xl transition-all duration-300 relative overflow-hidden group">
              {/* Effet de brillance au survol */}
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 -skew-x-12 transform translate-x-[-100%] group-hover:translate-x-[100%]"></div>
              
              <div className="flex items-start gap-3 sm:gap-4 mb-5 sm:mb-6 relative z-10">
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center text-white font-bold text-lg sm:text-xl flex-shrink-0 mt-0.5 shadow-lg transform group-hover:scale-110 transition-transform duration-300">
                  <span className="text-xl sm:text-2xl">🎯</span>
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-xl sm:text-2xl font-extrabold text-gray-900 bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
                    Activités souhaitées <span className="text-red-500">*</span>
                  </h2>
                  <p className="text-xs sm:text-sm text-gray-600 mt-2 font-medium">
                    Sélectionnez les activités qui vous intéressent et indiquez le nombre de personnes
                  </p>
                </div>
              </div>

              {activities.length === 0 ? (
                <div className="bg-white rounded-xl p-6 sm:p-8 text-center border-2 border-dashed border-gray-300">
                  <p className="text-gray-500 text-base sm:text-lg">
                    Aucune activité disponible pour le moment.
                  </p>
                </div>
              ) : (
                <div className="space-y-2 sm:space-y-3">
                  {CATEGORIES.filter((category) => {
                    // Exclure la catégorie transfert
                    if (category.key === "transfert") {
                      return false;
                    }
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
                        className="bg-white/90 backdrop-blur-sm rounded-lg sm:rounded-xl border-2 border-gray-200 overflow-hidden shadow-md hover:shadow-xl transition-all duration-300 transform hover:scale-[1.01]"
                      >
                        <button
                          type="button"
                          disabled={requestSubmitted}
                          onClick={() => toggleCategory(category.key)}
                          aria-expanded={isExpanded}
                          aria-controls={`category-${category.key}`}
                          aria-label={`${isExpanded ? 'Réduire' : 'Développer'} la catégorie ${category.label}`}
                          className="w-full flex items-center justify-between p-4 sm:p-5 hover:bg-gradient-to-r hover:from-gray-50 hover:to-green-50/50 transition-all duration-300 touch-manipulation group disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
                        >
                          <div className="flex items-center gap-3 sm:gap-4 flex-wrap flex-1 min-w-0">
                            <span className="text-2xl sm:text-3xl flex-shrink-0 transform group-hover:scale-110 transition-transform duration-300">{categoryIcons[category.key] || "📋"}</span>
                            <h3 className="text-base sm:text-lg font-extrabold text-gray-900 flex-shrink-0 group-hover:text-green-600 transition-colors duration-300">
                              {category.label}
                            </h3>
                            <span className="text-xs sm:text-sm text-gray-600 bg-gray-100 px-3 py-1.5 rounded-full whitespace-nowrap font-semibold border border-gray-200">
                              {categoryActivities.length} activité{categoryActivities.length > 1 ? "s" : ""}
                            </span>
                            {selectedCount > 0 && (
                              <span className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white text-xs font-bold px-3 py-1.5 rounded-full whitespace-nowrap shadow-md transform group-hover:scale-110 transition-transform duration-300">
                                {selectedCount} sélectionnée{selectedCount > 1 ? "s" : ""}
                              </span>
                            )}
                          </div>
                          <span className="text-gray-400 text-xl sm:text-2xl font-bold ml-2 flex-shrink-0 transform group-hover:scale-125 transition-transform duration-300">
                            {isExpanded ? "▼" : "▶"}
                          </span>
                        </button>
                        {isExpanded && (
                          <div 
                            id={`category-${category.key}`}
                            role="region"
                            aria-label={`Activités de la catégorie ${category.label}`}
                            className="border-t border-gray-200 p-3 sm:p-4 space-y-2 sm:space-y-3 bg-gray-50"
                          >
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
                                  className={`border-2 rounded-lg sm:rounded-xl p-4 sm:p-5 transition-all duration-300 transform ${
                                    isSelected
                                      ? "border-blue-500 bg-gradient-to-br from-blue-50 to-indigo-50 shadow-lg scale-[1.02]"
                                      : "border-gray-200 bg-white hover:border-green-300 hover:shadow-md hover:scale-[1.01]"
                                  }`}
                                >
                                  <div className="flex items-start gap-3 sm:gap-4">
                                    <input
                                      type="checkbox"
                                      id={`activity-${activityId}`}
                                      disabled={requestSubmitted}
                                      checked={isSelected}
                                      onChange={() => handleActivityToggle(activityId)}
                                      aria-label={`Sélectionner l'activité ${activity.name}`}
                                      aria-describedby={`activity-desc-${activityId}`}
                                      className="mt-1 w-6 h-6 sm:w-7 sm:h-7 text-blue-600 rounded-lg border-2 border-gray-300 focus:ring-4 focus:ring-blue-200 cursor-pointer touch-manipulation flex-shrink-0 transform hover:scale-110 transition-all duration-300 accent-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
                                    />
                                    <div className="flex-1 min-w-0">
                                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
                                        <h4 
                                          id={`activity-desc-${activityId}`}
                                          className="text-sm sm:text-base font-extrabold text-gray-900 break-words leading-tight"
                                        >
                                          {activity.name}
                                        </h4>
                                        {activity.price_adult && (
                                          <span className="text-xs sm:text-sm font-bold text-white bg-gradient-to-r from-blue-500 to-indigo-600 px-3 py-1.5 rounded-full whitespace-nowrap self-start sm:self-auto shadow-md">
                                            {activity.price_adult}€ / adulte
                                          </span>
                                        )}
                                      </div>
                                      {/* Informations d'âge */}
                                      {(activity.age_child || activity.age_baby) && (
                                        <div className="flex flex-wrap gap-2 mb-3 text-xs sm:text-sm">
                                          {activity.age_child && (
                                            <span className="text-gray-700 bg-gradient-to-r from-green-100 to-emerald-100 px-3 py-1.5 rounded-full font-semibold border border-green-200 shadow-sm">
                                              👶 Enfant: {activity.age_child}
                                            </span>
                                          )}
                                          {activity.age_baby && (
                                            <span className="text-gray-700 bg-gradient-to-r from-pink-100 to-rose-100 px-3 py-1.5 rounded-full font-semibold border border-pink-200 shadow-sm">
                                              🍼 Bébé: {activity.age_baby}
                                            </span>
                                          )}
                                        </div>
                                      )}
                                      {activity.notes && (
                                        <p className="text-xs text-gray-700 mb-3 bg-gradient-to-r from-gray-50 to-blue-50/50 p-3 rounded-lg border border-gray-200 font-medium leading-relaxed">
                                          {activity.notes}
                                        </p>
                                      )}
                                      {isSelected && (
                                        <div className="mt-4 pt-4 border-t-2 border-blue-300 animate-fade-in">
                                          <p className="text-xs sm:text-sm font-extrabold text-gray-800 mb-3 flex items-center gap-2">
                                            <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
                                            Nombre de personnes :
                                          </p>
                                          <div className="grid grid-cols-3 gap-2 sm:gap-3">
                                            <div className="transform transition-all duration-300 hover:scale-105">
                                              <label className="block text-xs font-bold text-gray-800 mb-2">
                                                👥 Adultes <span className="text-red-500">*</span>
                                                <span className="block text-xs font-normal text-gray-500 mt-0.5">(12+ ans)</span>
                                              </label>
                                              <input
                                                type="number"
                                                id={`adults-${activityId}`}
                                                name={`adults-${activityId}`}
                                                min="1"
                                                required
                                                inputMode="numeric"
                                                disabled={requestSubmitted}
                                                value={selectedActivity?.adults || ""}
                                                onChange={(e) =>
                                                  updateActivityQuantity(
                                                    activityId,
                                                    "adults",
                                                    e.target.value
                                                  )
                                                }
                                                aria-label={`Nombre d'adultes pour ${activity.name}`}
                                                aria-required="true"
                                                className="w-full rounded-lg border-2 border-gray-200 bg-white px-3 py-2.5 text-base sm:text-sm focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all touch-manipulation shadow-sm hover:shadow-md font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                                                placeholder="0"
                                              />
                                            </div>
                                            <div className="transform transition-all duration-300 hover:scale-105">
                                              <label className="block text-xs font-bold text-gray-800 mb-2">
                                                👶 Enfants
                                                {activity.age_child && (
                                                  <span className="block text-xs font-normal text-gray-500 mt-0.5">
                                                    ({activity.age_child})
                                                  </span>
                                                )}
                                              </label>
                                              <input
                                                type="number"
                                                id={`children-${activityId}`}
                                                name={`children-${activityId}`}
                                                min="0"
                                                inputMode="numeric"
                                                disabled={requestSubmitted}
                                                value={selectedActivity?.children || 0}
                                                onChange={(e) =>
                                                  updateActivityQuantity(
                                                    activityId,
                                                    "children",
                                                    e.target.value
                                                  )
                                                }
                                                aria-label={`Nombre d'enfants pour ${activity.name}`}
                                                className="w-full rounded-lg border-2 border-gray-200 bg-white px-3 py-2.5 text-base sm:text-sm focus:border-green-500 focus:ring-4 focus:ring-green-100 transition-all touch-manipulation shadow-sm hover:shadow-md font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                                                placeholder="0"
                                              />
                                            </div>
                                            <div className="transform transition-all duration-300 hover:scale-105">
                                              <label className="block text-xs font-bold text-gray-800 mb-2">
                                                🍼 Bébés
                                                {activity.age_baby && (
                                                  <span className="block text-xs font-normal text-gray-500 mt-0.5">
                                                    ({activity.age_baby})
                                                  </span>
                                                )}
                                              </label>
                                              <input
                                                type="number"
                                                id={`babies-${activityId}`}
                                                name={`babies-${activityId}`}
                                                min="0"
                                                inputMode="numeric"
                                                disabled={requestSubmitted}
                                                value={selectedActivity?.babies || 0}
                                                onChange={(e) =>
                                                  updateActivityQuantity(
                                                    activityId,
                                                    "babies",
                                                    e.target.value
                                                  )
                                                }
                                                aria-label={`Nombre de bébés pour ${activity.name}`}
                                                className="w-full rounded-lg border-2 border-gray-200 bg-white px-3 py-2.5 text-base sm:text-sm focus:border-pink-500 focus:ring-4 focus:ring-pink-100 transition-all touch-manipulation shadow-sm hover:shadow-md font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
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
            <div className="flex flex-col items-center gap-4 sm:gap-5 pt-6 sm:pt-8 border-t-2 border-gray-200">
              <PrimaryBtn 
                type="submit" 
                disabled={submitting || requestSubmitted}
                aria-label={submitting ? "Envoi de la demande en cours" : "Envoyer la demande de devis"}
                aria-busy={submitting}
                className="w-full sm:w-auto px-8 sm:px-12 py-4 sm:py-5 text-base sm:text-lg font-extrabold rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white shadow-xl hover:shadow-2xl transition-all duration-300 transform hover:scale-105 active:scale-95 touch-manipulation border-2 border-white/20 relative overflow-hidden group disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-4 focus:ring-blue-500 focus:ring-offset-2"
              >
                {/* Effet de brillance au survol */}
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 -skew-x-12 transform translate-x-[-100%] group-hover:translate-x-[100%]"></div>
                
                {submitting ? (
                  <span className="flex items-center justify-center gap-3 relative z-10">
                    <span className="animate-spin text-xl">⏳</span>
                    <span>Envoi en cours...</span>
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-3 relative z-10">
                    <span className="text-xl transform group-hover:scale-110 transition-transform duration-300">✉️</span>
                    <span>Envoyer ma demande</span>
                    <span className="text-lg transform group-hover:translate-x-1 transition-transform duration-300">→</span>
                  </span>
                )}
              </PrimaryBtn>
              <p className="text-xs sm:text-sm text-gray-600 text-center px-2 font-medium">
                Les champs marqués d'un <span className="text-red-500 font-bold">*</span> sont obligatoires
              </p>
            </div>
          </form>
        </div>
      </div>
    </div>
    </>
  );
}

