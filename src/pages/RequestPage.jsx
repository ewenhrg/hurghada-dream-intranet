import { useState, useEffect, useMemo } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { SITE_KEY, CATEGORIES } from "../constants";
import { TextInput, PrimaryBtn } from "../components/ui";
import { toast } from "../utils/toast.js";

// Composant Tooltip amélioré
function Tooltip({ text, children, id, position = "top" }) {
  const [isVisible, setIsVisible] = useState(false);
  
  return (
    <div className="relative inline-flex items-center">
      <button
        type="button"
        className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-gradient-to-br from-blue-100 to-indigo-100 text-blue-600 hover:from-blue-200 hover:to-indigo-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all duration-200 hover:scale-110"
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
        onFocus={() => setIsVisible(true)}
        onBlur={() => setIsVisible(false)}
        onClick={() => setIsVisible(!isVisible)}
        aria-label={`Aide: ${text}`}
        aria-describedby={id}
        aria-expanded={isVisible}
      >
        <span className="text-xs font-bold">?</span>
      </button>
      {isVisible && (
        <div
          id={id}
          role="tooltip"
          className={`absolute z-50 ${
            position === "top" 
              ? "bottom-full mb-2 left-1/2 transform -translate-x-1/2" 
              : "top-full mt-2 left-1/2 transform -translate-x-1/2"
          } w-64 p-3 bg-gradient-to-br from-slate-900 to-slate-800 text-white text-xs rounded-xl shadow-2xl pointer-events-none border border-slate-700 animate-in fade-in duration-200`}
        >
          <div className="relative">
            <p className="leading-relaxed">{text}</p>
            <div className={`absolute ${
              position === "top" ? "top-full -mt-1" : "bottom-full -mb-1"
            } left-1/2 transform -translate-x-1/2`}>
              <div className={`w-0 h-0 border-l-4 border-r-4 ${
                position === "top" ? "border-t-4 border-t-slate-900" : "border-b-4 border-b-slate-900"
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
        return {
          ...prev,
          selectedActivities: prev.selectedActivities.filter(
            (_, idx) => idx !== existingIndex
          ),
        };
      } else {
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

  // Grouper les activités par catégorie
  const activitiesByCategory = useMemo(() => {
    const grouped = {};
    
    CATEGORIES.forEach((cat) => {
      grouped[cat.key] = [];
    });
    
    activities.forEach((activity) => {
      const category = activity.category || "desert";
      const validCategory = CATEGORIES.some(cat => cat.key === category) ? category : "desert";
      if (!grouped[validCategory]) {
        grouped[validCategory] = [];
      }
      grouped[validCategory].push(activity);
    });
    
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
          
          if (error) {
            console.error("Erreur détaillée Supabase:", error);
            throw error;
          }
          toast.success("Votre demande a été mise à jour avec succès !");
          setRequestSubmitted(true);
        } else {
          const { error } = await supabase
            .from("client_requests")
            .insert(requestData);
          
          if (error) {
            console.error("Erreur détaillée Supabase:", error);
            throw error;
          }
          toast.success("Votre demande a été envoyée avec succès !");
          setRequestSubmitted(true);
        }
      } else {
        const { error } = await supabase
          .from("client_requests")
          .insert(requestData);
        
        if (error) {
          console.error("Erreur détaillée Supabase:", error);
          throw error;
        }
        toast.success("Votre demande a été envoyée avec succès !");
        setRequestSubmitted(true);
      }
    } catch (error) {
      console.error("Erreur lors de l'envoi de la demande:", error);
      let errorMessage = "Une erreur s'est produite lors de l'envoi de votre demande.";
      if (error?.message) {
        errorMessage = error.message;
      } else if (error?.details) {
        errorMessage = error.details;
      } else if (error?.hint) {
        errorMessage = error.hint;
      } else if (typeof error === 'string') {
        errorMessage = error;
      } else if (error?.toString) {
        errorMessage = error.toString();
      }
      
      toast.error(`Erreur: ${errorMessage}. Veuillez réessayer ou contacter le support.`);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
        <div className="text-center">
          <div className="relative">
            <div className="animate-spin rounded-full h-16 w-16 border-4 border-blue-200 border-t-blue-600 mx-auto mb-4"></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-2xl">⏳</span>
            </div>
          </div>
          <p className="text-slate-600 font-medium">Chargement des activités...</p>
        </div>
      </div>
    );
  }

  // Page de confirmation améliorée
  if (requestSubmitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50 py-6 md:py-8 px-4 sm:px-6">
        <div className="max-w-2xl mx-auto w-full">
          <div className="bg-white rounded-2xl shadow-2xl overflow-hidden border border-emerald-200/50 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-500 px-6 md:px-8 py-12 text-center text-white relative overflow-hidden">
              <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg width="60" height="60" viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg"%3E%3Cg fill="none" fill-rule="evenodd"%3E%3Cg fill="%23ffffff" fill-opacity="0.1"%3E%3Cpath d="M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z"/%3E%3C/g%3E%3C/g%3E%3C/svg%3E')] opacity-20"></div>
              <div className="relative z-10">
                <div className="inline-flex items-center justify-center w-20 h-20 mb-6 bg-white/20 backdrop-blur-sm rounded-full border-4 border-white/30 animate-bounce">
                  <span className="text-4xl">✅</span>
                </div>
                <h1 className="text-3xl md:text-4xl font-bold mb-3 drop-shadow-lg">
                  Demande envoyée avec succès !
                </h1>
                <p className="text-emerald-50 text-base md:text-lg max-w-md mx-auto leading-relaxed">
                  Merci pour votre demande. Nous avons bien reçu vos informations et nous vous contacterons bientôt.
                </p>
              </div>
            </div>

            <div className="p-6 md:p-8 text-center space-y-6">
              <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-xl p-6 border-2 border-emerald-200">
                <p className="text-slate-700 text-base font-semibold mb-4">
                  Votre demande de devis a été enregistrée et sera traitée dans les plus brefs délais.
                </p>
                <div className="flex justify-center items-center gap-3">
                  <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-lg shadow-sm border border-emerald-200">
                    <span className="text-xl">💬</span>
                    <span className="text-blue-600 font-bold">sur WhatsApp</span>
                  </div>
                </div>
              </div>
              
              <p className="text-xs text-slate-500 leading-relaxed">
                Cette page ne peut plus être modifiée. Si vous avez besoin de modifier votre demande, veuillez nous contacter directement.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const selectedCount = formData.selectedActivities.length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 py-8 md:py-12 px-4 sm:px-6">
      <div className="max-w-5xl mx-auto">
        {/* Header moderne et accueillant */}
        <div className="bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-600 rounded-2xl shadow-2xl overflow-hidden border border-blue-500/20 mb-8 relative">
          <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg width="60" height="60" viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg"%3E%3Cg fill="none" fill-rule="evenodd"%3E%3Cg fill="%23ffffff" fill-opacity="0.05"%3E%3Cpath d="M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z"/%3E%3C/g%3E%3C/g%3E%3C/svg%3E')] opacity-30"></div>
          <div className="relative z-10 px-6 md:px-10 py-10 md:py-12 text-center text-white">
            <div className="inline-flex items-center justify-center w-20 h-20 mb-6 bg-white/20 backdrop-blur-sm rounded-full border-4 border-white/30 shadow-lg">
              <span className="text-4xl">📋</span>
            </div>
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-4 drop-shadow-lg">
              Demande de devis personnalisé
            </h1>
            <p className="text-blue-100 text-base md:text-lg mb-6 max-w-2xl mx-auto leading-relaxed">
              Remplissez ce formulaire pour recevoir un devis personnalisé adapté à vos besoins
            </p>
            <a
              href="https://tapkit.me/catalogues-activites"
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => {
                e.preventDefault();
                window.open("https://tapkit.me/catalogues-activites", "_blank", "noopener,noreferrer");
              }}
              className="inline-flex items-center gap-2 bg-white text-blue-600 font-bold px-6 py-3 rounded-xl shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-200 text-sm md:text-base"
            >
              <span className="text-xl">📖</span>
              <span>Découvrir notre catalogue</span>
            </a>
          </div>
        </div>

        <form 
          onSubmit={handleSubmit} 
          className="space-y-6 md:space-y-8" 
          aria-label="Formulaire de demande de devis"
          noValidate
        >
          {/* Section Informations personnelles - Design moderne */}
          <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-200/50">
            <div className="bg-gradient-to-r from-blue-500 to-indigo-500 px-6 md:px-8 py-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center text-white border-2 border-white/30">
                  <span className="text-2xl">👤</span>
                </div>
                <div>
                  <h2 className="text-xl md:text-2xl font-bold text-white">
                    Vos informations
                  </h2>
                  <p className="text-blue-100 text-sm mt-1">Renseignez vos coordonnées</p>
                </div>
              </div>
            </div>
            <div className="p-6 md:p-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-6">
                <div className="space-y-2">
                  <label htmlFor="clientName" className="block text-sm font-semibold text-slate-700 flex items-center gap-2">
                    Nom complet <span className="text-red-500" aria-label="obligatoire">*</span>
                    <Tooltip 
                      text="Indiquez votre nom complet tel qu'il apparaît sur votre pièce d'identité."
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
                    placeholder="Jean Dupont"
                    aria-required="true"
                    aria-describedby="tooltip-name"
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="clientPhone" className="block text-sm font-semibold text-slate-700 flex items-center gap-2">
                    Téléphone <span className="text-red-500" aria-label="obligatoire">*</span>
                    <Tooltip 
                      text="Numéro avec indicatif pays (ex: +33 pour la France)"
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
                    placeholder="+33 6 12 34 56 78"
                    aria-required="true"
                    aria-describedby="tooltip-phone"
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="clientEmail" className="block text-sm font-semibold text-slate-700 flex items-center gap-2">
                    Email <span className="text-red-500" aria-label="obligatoire">*</span>
                    <Tooltip 
                      text="Nous vous enverrons une confirmation par email"
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
                    placeholder="email@exemple.com"
                    aria-required="true"
                    aria-describedby="tooltip-email"
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="clientHotel" className="block text-sm font-semibold text-slate-700 flex items-center gap-2">
                    Hôtel <span className="text-red-500" aria-label="obligatoire">*</span>
                    <Tooltip 
                      text="Pour organiser les transferts si nécessaire"
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
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="arrivalDate" className="block text-sm font-semibold text-slate-700 flex items-center gap-2">
                    Date d'arrivée <span className="text-red-500" aria-label="obligatoire">*</span>
                    <Tooltip 
                      text="Date de votre arrivée à Hurghada"
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
                    className="w-full rounded-xl border border-[rgba(148,163,184,0.35)] bg-[rgba(255,255,255,0.98)] backdrop-blur-sm px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-[rgba(79,70,229,0.3)] focus:border-[rgba(79,70,229,0.7)] transition-all duration-200 shadow-[0_16px_35px_-28px_rgba(15,23,42,0.45)] hover:border-[rgba(79,70,229,0.5)] hover:shadow-[0_18px_38px_-28px_rgba(15,23,42,0.5)] focus:shadow-[0_0_0_2px_rgba(79,70,229,0.2),0_18px_36px_-26px_rgba(15,23,42,0.5)] min-h-[44px] disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="departureDate" className="block text-sm font-semibold text-slate-700 flex items-center gap-2">
                    Date de départ <span className="text-red-500" aria-label="obligatoire">*</span>
                    <Tooltip 
                      text="Date de votre départ (après l'arrivée)"
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
                    className="w-full rounded-xl border border-[rgba(148,163,184,0.35)] bg-[rgba(255,255,255,0.98)] backdrop-blur-sm px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-[rgba(79,70,229,0.3)] focus:border-[rgba(79,70,229,0.7)] transition-all duration-200 shadow-[0_16px_35px_-28px_rgba(15,23,42,0.45)] hover:border-[rgba(79,70,229,0.5)] hover:shadow-[0_18px_38px_-28px_rgba(15,23,42,0.5)] focus:shadow-[0_0_0_2px_rgba(79,70,229,0.2),0_18px_36px_-26px_rgba(15,23,42,0.5)] min-h-[44px] disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Section Activités - Design moderne avec cartes interactives */}
          <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-200/50">
            <div className="bg-gradient-to-r from-emerald-500 to-teal-500 px-6 md:px-8 py-6">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center text-white border-2 border-white/30">
                    <span className="text-2xl">🎯</span>
                  </div>
                  <div>
                    <h2 className="text-xl md:text-2xl font-bold text-white">
                      Activités souhaitées <span className="text-red-200">*</span>
                    </h2>
                    <p className="text-emerald-100 text-sm mt-1">
                      Sélectionnez les activités et indiquez le nombre de personnes
                    </p>
                  </div>
                </div>
                {selectedCount > 0 && (
                  <div className="bg-white/20 backdrop-blur-sm px-4 py-2 rounded-xl border-2 border-white/30">
                    <span className="text-white font-bold text-sm">
                      {selectedCount} activité{selectedCount > 1 ? "s" : ""} sélectionnée{selectedCount > 1 ? "s" : ""}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="p-6 md:p-8">
              {activities.length === 0 ? (
                <div className="bg-gradient-to-br from-slate-50 to-slate-100 rounded-xl p-8 text-center border-2 border-dashed border-slate-300">
                  <span className="text-4xl mb-4 block">📭</span>
                  <p className="text-slate-600 font-medium">
                    Aucune activité disponible pour le moment.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {CATEGORIES.filter((category) => {
                    if (category.key === "transfert") {
                      return false;
                    }
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
                        className="bg-gradient-to-br from-slate-50 to-white rounded-xl border-2 border-slate-200 overflow-hidden shadow-sm hover:shadow-md transition-all duration-300"
                      >
                        <button
                          type="button"
                          disabled={requestSubmitted}
                          onClick={() => toggleCategory(category.key)}
                          aria-expanded={isExpanded}
                          aria-controls={`category-${category.key}`}
                          aria-label={`${isExpanded ? 'Réduire' : 'Développer'} la catégorie ${category.label}`}
                          className="w-full flex items-center justify-between p-5 hover:bg-gradient-to-r hover:from-emerald-50 hover:to-teal-50 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 rounded-t-xl"
                        >
                          <div className="flex items-center gap-4 flex-wrap flex-1 min-w-0">
                            <span className="text-2xl">{categoryIcons[category.key] || "📋"}</span>
                            <h3 className="text-lg font-bold text-slate-800">
                              {category.label}
                            </h3>
                            <span className="text-xs text-slate-600 bg-white px-3 py-1.5 rounded-full font-semibold border border-slate-200 shadow-sm">
                              {categoryActivities.length} activité{categoryActivities.length > 1 ? "s" : ""}
                            </span>
                            {selectedCount > 0 && (
                              <span className="bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-sm">
                                {selectedCount} sélectionnée{selectedCount > 1 ? "s" : ""}
                              </span>
                            )}
                          </div>
                          <span className={`text-slate-400 text-xl font-bold ml-4 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}>
                            ▶
                          </span>
                        </button>
                        {isExpanded && (
                          <div 
                            id={`category-${category.key}`}
                            role="region"
                            aria-label={`Activités de la catégorie ${category.label}`}
                            className="border-t-2 border-slate-200 p-5 space-y-4 bg-gradient-to-br from-white to-slate-50"
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
                                  className={`border-2 rounded-xl p-5 transition-all duration-300 ${
                                    isSelected
                                      ? "border-emerald-500 bg-gradient-to-br from-emerald-50 to-teal-50 shadow-lg scale-[1.02]"
                                      : "border-slate-200 bg-white hover:border-emerald-300 hover:shadow-md"
                                  }`}
                                >
                                  <div className="flex items-start gap-4">
                                    <input
                                      type="checkbox"
                                      id={`activity-${activityId}`}
                                      disabled={requestSubmitted}
                                      checked={isSelected}
                                      onChange={() => handleActivityToggle(activityId)}
                                      aria-label={`Sélectionner l'activité ${activity.name}`}
                                      aria-describedby={`activity-desc-${activityId}`}
                                      className="mt-1 w-5 h-5 text-emerald-600 rounded border-2 border-slate-300 focus:ring-2 focus:ring-emerald-200 cursor-pointer accent-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed"
                                    />
                                    <div className="flex-1 min-w-0">
                                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
                                        <h4 
                                          id={`activity-desc-${activityId}`}
                                          className="text-lg font-bold text-slate-800 break-words"
                                        >
                                          {activity.name}
                                        </h4>
                                        {activity.price_adult && (
                                          <span className="text-sm font-bold text-white bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-2 rounded-lg whitespace-nowrap self-start sm:self-auto shadow-sm">
                                            {activity.price_adult}€ / adulte
                                          </span>
                                        )}
                                      </div>
                                      {(activity.age_child || activity.age_baby) && (
                                        <div className="flex flex-wrap gap-2 mb-3">
                                          {activity.age_child && (
                                            <span className="text-xs text-slate-700 bg-green-100 px-3 py-1.5 rounded-full font-semibold border border-green-200">
                                              👶 Enfant: {activity.age_child}
                                            </span>
                                          )}
                                          {activity.age_baby && (
                                            <span className="text-xs text-slate-700 bg-pink-100 px-3 py-1.5 rounded-full font-semibold border border-pink-200">
                                              🍼 Bébé: {activity.age_baby}
                                            </span>
                                          )}
                                        </div>
                                      )}
                                      {activity.notes && (
                                        <p className="text-sm text-slate-700 mb-3 bg-slate-50 p-3 rounded-lg border border-slate-200">
                                          {activity.notes}
                                        </p>
                                      )}
                                      {isSelected && activity.description && (
                                        <div className="mb-4 bg-gradient-to-r from-emerald-50 to-teal-50 p-4 rounded-lg border-2 border-emerald-200">
                                          <div className="flex items-start gap-3">
                                            <span className="text-lg mt-0.5">📄</span>
                                            <div className="flex-1">
                                              <p className="text-xs font-bold text-emerald-800 mb-2 uppercase tracking-wide">
                                                Description
                                              </p>
                                              <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap">
                                                {activity.description}
                                              </p>
                                            </div>
                                          </div>
                                        </div>
                                      )}
                                      {isSelected && (
                                        <div className="mt-4 pt-4 border-t-2 border-emerald-200">
                                          <p className="text-sm font-bold text-slate-800 mb-4">
                                            Nombre de personnes :
                                          </p>
                                          <div className="grid grid-cols-3 gap-4">
                                            <div>
                                              <label className="block text-xs font-bold text-slate-700 mb-2">
                                                👥 Adultes <span className="text-red-500">*</span>
                                                <span className="block text-xs font-normal text-slate-500 mt-1">(12+ ans)</span>
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
                                                className="w-full rounded-xl border border-[rgba(148,163,184,0.35)] bg-white px-4 py-3 text-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                                                placeholder="0"
                                              />
                                            </div>
                                            <div>
                                              <label className="block text-xs font-bold text-slate-700 mb-2">
                                                👶 Enfants
                                                {activity.age_child && (
                                                  <span className="block text-xs font-normal text-slate-500 mt-1">
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
                                                className="w-full rounded-xl border border-[rgba(148,163,184,0.35)] bg-white px-4 py-3 text-sm focus:border-green-500 focus:ring-2 focus:ring-green-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                                                placeholder="0"
                                              />
                                            </div>
                                            <div>
                                              <label className="block text-xs font-bold text-slate-700 mb-2">
                                                🍼 Bébés
                                                {activity.age_baby && (
                                                  <span className="block text-xs font-normal text-slate-500 mt-1">
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
                                                className="w-full rounded-xl border border-[rgba(148,163,184,0.35)] bg-white px-4 py-3 text-sm focus:border-pink-500 focus:ring-2 focus:ring-pink-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
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
          </div>

          {/* Bouton de soumission amélioré */}
          <div className="bg-white rounded-2xl shadow-xl p-6 md:p-8 border border-slate-200/50">
            <div className="flex flex-col items-center gap-6">
              <PrimaryBtn 
                type="submit" 
                disabled={submitting || requestSubmitted}
                aria-label={submitting ? "Envoi de la demande en cours" : "Envoyer la demande de devis"}
                aria-busy={submitting}
                className="w-full md:w-auto px-10 py-4 text-lg font-bold shadow-xl hover:shadow-2xl"
              >
                {submitting ? (
                  <span className="flex items-center justify-center gap-3">
                    <span className="animate-spin text-xl">⏳</span>
                    <span>Envoi en cours...</span>
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-3">
                    <span className="text-xl">✉️</span>
                    <span>Envoyer ma demande</span>
                  </span>
                )}
              </PrimaryBtn>
              <p className="text-xs text-slate-500 text-center flex items-center gap-2">
                <span className="text-red-500 font-bold">*</span>
                <span>Les champs marqués d'un astérisque sont obligatoires</span>
              </p>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
