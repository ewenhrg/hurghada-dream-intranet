import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { SITE_KEY, LS_KEYS, CATEGORIES, WEEKDAYS } from "../constants";
import { uuid, currency, emptyTransfers, saveLS, loadLS } from "../utils";
import { TextInput, NumberInput, PrimaryBtn, GhostBtn } from "../components/ui";
import { DaysSelector } from "../components/DaysSelector";
import { TransfersEditor } from "../components/TransfersEditor";
import { toast } from "../utils/toast.js";
import { useDebounce } from "../hooks/useDebounce";

export function ActivitiesPage({ activities, setActivities, user }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDay, setSelectedDay] = useState("");
  // Debounce de la recherche pour améliorer les performances
  const debouncedSearchQuery = useDebounce(searchQuery, 300);
  
  // Vérifier si l'utilisateur peut modifier/supprimer les activités (Léa, Laly et Ewen)
  const canModifyActivities = user?.name === "Léa" || user?.name === "Laly" || user?.name === "Ewen";

  // Map des activités pour des recherches O(1) au lieu de O(n)
  const activitiesMap = useMemo(() => {
    const map = new Map();
    activities.forEach((activity) => {
      if (activity.id) map.set(activity.id, activity);
      if (activity.supabase_id) map.set(activity.supabase_id, activity);
    });
    return map;
  }, [activities]);
  
  // Charger le formulaire sauvegardé depuis localStorage
  const [isPageReload] = useState(() => {
    const navigationEntry = performance.getEntriesByType('navigation')[0];
    const isReload = navigationEntry && navigationEntry.type === 'reload';
    const wasMounted = sessionStorage.getItem('activitiesPageMounted') === 'true';
    
    if (isReload) {
      localStorage.removeItem(LS_KEYS.activityForm);
      sessionStorage.setItem('activitiesPageMounted', 'true');
      return true;
    }
    
    if (!wasMounted) {
      sessionStorage.setItem('activitiesPageMounted', 'true');
    }
    
    return false;
  });

  const savedForm = !isPageReload ? loadLS(LS_KEYS.activityForm, null) : null;
  const defaultForm = savedForm ? {
    name: savedForm.name || "",
    category: savedForm.category || "desert",
    priceAdult: savedForm.priceAdult || "",
    priceChild: savedForm.priceChild || "",
    priceBaby: savedForm.priceBaby || "",
    ageChild: savedForm.ageChild || "",
    ageBaby: savedForm.ageBaby || "",
    currency: savedForm.currency || "EUR",
    availableDays: savedForm.availableDays || [false, false, false, false, false, false, false],
    notes: savedForm.notes || "",
    transfers: savedForm.transfers || emptyTransfers(),
  } : {
    name: "",
    category: "desert",
    priceAdult: "",
    priceChild: "",
    priceBaby: "",
    ageChild: "",
    ageBaby: "",
    currency: "EUR",
    availableDays: [false, false, false, false, false, false, false],
    notes: "",
    transfers: emptyTransfers(),
  };
  
  const [form, setForm] = useState(defaultForm);
  const [showForm, setShowForm] = useState(savedForm?.showForm || false);
  const [editingId, setEditingId] = useState(savedForm?.editingId || null);
  const saveTimeoutRef = useRef(null);
  const formRef = useRef(null);
  const descriptionModalRef = useRef(null);
  
  // État pour la modal de description
  const [descriptionModal, setDescriptionModal] = useState({ isOpen: false, activity: null, description: "" });

  // Sauvegarder le formulaire dans localStorage avec debounce (500ms pour réduire les écritures)
  useEffect(() => {
    sessionStorage.setItem('activitiesPageMounted', 'true');
    
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    const timeoutId = setTimeout(() => {
      saveLS(LS_KEYS.activityForm, {
        ...form,
        showForm,
        editingId,
      });
    }, 500); // Augmenté à 500ms pour réduire les écritures
    
    saveTimeoutRef.current = timeoutId;

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [form, showForm, editingId]);

  const handleEdit = useCallback((activity) => {
    if (!canModifyActivities) {
      toast.warning("Seuls Léa, Laly et Ewen peuvent modifier les activités.");
      return;
    }
    setForm({
      name: activity.name || "",
      category: activity.category || "desert",
      priceAdult: activity.priceAdult || "",
      priceChild: activity.priceChild || "",
      priceBaby: activity.priceBaby || "",
      ageChild: activity.ageChild || "",
      ageBaby: activity.ageBaby || "",
      currency: activity.currency || "EUR",
      availableDays: activity.availableDays || [false, false, false, false, false, false, false],
      notes: activity.notes || "",
      transfers: activity.transfers || emptyTransfers(),
    });
    setEditingId(activity.id);
    setShowForm(true);
    // Scroll vers le formulaire après un court délai pour laisser le DOM se mettre à jour
    setTimeout(() => {
      if (formRef.current) {
        formRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
      } else {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    }, 100);
  }, [canModifyActivities]);
  
  const handleOpenDescriptionModal = useCallback((activity) => {
    // Scroll vers le haut avant d'ouvrir la modale pour une meilleure UX
    window.scrollTo({ top: 0, behavior: "smooth" });
    setDescriptionModal({
      isOpen: true,
      activity: activity,
      description: activity.description || "",
    });
  }, []);
  
  const handleSaveDescription = useCallback(async () => {
    if (!descriptionModal.activity) return;
    
    const activityId = descriptionModal.activity.id;
    const supabaseId = descriptionModal.activity.supabase_id;
    const description = descriptionModal.description;
    
    // Mettre à jour l'activité dans le state local
    setActivities((prevActivities) => {
      const updated = prevActivities.map((a) =>
        a.id === activityId ? { ...a, description } : a
      );
      saveLS(LS_KEYS.activities, updated);
      return updated;
    });
    
    // Mettre à jour dans Supabase si configuré et si supabaseId existe
    if (supabase && supabaseId) {
      try {
        const { error } = await supabase
          .from("activities")
          .update({ description: description || "" })
          .eq("id", supabaseId);
        
        if (error) {
          // Si l'erreur est 400 (Bad Request), c'est probablement que la colonne n'existe pas encore
          if (error.code === "PGRST204" || error.message?.includes("column") || error.message?.includes("description")) {
            console.warn("⚠️ La colonne 'description' n'existe peut-être pas encore dans Supabase. La description est sauvegardée localement.");
            toast.warning("La colonne description n'existe pas encore dans Supabase. Exécutez le script SQL pour l'ajouter. La description est sauvegardée localement.");
          } else {
            console.error("❌ Erreur lors de la mise à jour de la description dans Supabase:", error);
            toast.error("Erreur lors de la sauvegarde dans Supabase. La description est sauvegardée localement.");
          }
        } else {
          toast.success("Description sauvegardée avec succès.");
        }
      } catch (err) {
        console.error("❌ Exception lors de la mise à jour de la description dans Supabase:", err);
        toast.error("Exception lors de la sauvegarde dans Supabase. La description est sauvegardée localement.");
      }
    } else if (!supabaseId) {
      // Pas de supabase_id, donc l'activité n'est pas encore dans Supabase
      toast.success("Description sauvegardée localement. L'activité sera synchronisée avec Supabase lors de sa prochaine modification.");
    } else {
      toast.success("Description sauvegardée avec succès.");
    }
    
    setDescriptionModal({ isOpen: false, activity: null, description: "" });
  }, [descriptionModal.activity, descriptionModal.description]);

  const handleCreate = useCallback(async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;

    const isEditing = editingId !== null;
    
    // Vérifier les permissions
    if (isEditing && !canModifyActivities) {
      toast.warning("Seuls Léa, Laly et Ewen peuvent modifier les activités.");
      return;
    }
    if (!isEditing && !user?.canAddActivity) {
      toast.warning("Vous n'avez pas la permission d'ajouter des activités.");
      return;
    }
    // Trouver l'activité en cours de modification pour récupérer son supabase_id (optimisé avec Map)
    const existingActivity = isEditing ? activitiesMap.get(editingId) : null;
    const supabaseId = existingActivity?.supabase_id;
    
    const activityData = {
      id: isEditing ? editingId : uuid(),
      name: form.name.trim(),
      category: form.category,
      priceAdult: Number(form.priceAdult || 0),
      priceChild: Number(form.priceChild || 0),
      priceBaby: Number(form.priceBaby || 0),
      ageChild: form.ageChild || "",
      ageBaby: form.ageBaby || "",
      currency: form.currency || "EUR",
      availableDays: form.availableDays,
      notes: form.notes,
      transfers: form.transfers,
      site_key: SITE_KEY,
      // Préserver le supabase_id si on modifie
      supabase_id: supabaseId,
    };

    let next;
    if (isEditing) {
      // Modification
      next = activities.map((a) => (a.id === editingId ? activityData : a));
    } else {
      // Création
      next = [activityData, ...activities];
    }
    setActivities(next);
    saveLS(LS_KEYS.activities, next);

    // Envoyer à Supabase si configuré (essayer toujours si supabase existe)
    if (supabase) {
      try {
        // Préparer les données pour Supabase
        // On commence avec les colonnes de base
        let supabaseData = {
          site_key: SITE_KEY,
          name: activityData.name,
        };

        // Ajouter les colonnes optionnelles seulement si elles ont des valeurs
        // Cela évite d'envoyer des colonnes qui pourraient ne pas exister
        if (activityData.category) supabaseData.category = activityData.category;
        if (activityData.priceAdult !== undefined && activityData.priceAdult !== null) supabaseData.price_adult = activityData.priceAdult;
        if (activityData.priceChild !== undefined && activityData.priceChild !== null) supabaseData.price_child = activityData.priceChild;
        if (activityData.priceBaby !== undefined && activityData.priceBaby !== null) supabaseData.price_baby = activityData.priceBaby;
        if (activityData.ageChild) supabaseData.age_child = activityData.ageChild;
        if (activityData.ageBaby) supabaseData.age_baby = activityData.ageBaby;
        if (activityData.currency) supabaseData.currency = activityData.currency;
        if (activityData.notes) supabaseData.notes = activityData.notes;
        // Pour available_days, on envoie seulement si c'est un tableau valide
        if (activityData.availableDays && Array.isArray(activityData.availableDays) && activityData.availableDays.length === 7) {
          supabaseData.available_days = activityData.availableDays;
        }
        // Pour transfers, on envoie seulement si c'est un objet valide
        if (activityData.transfers && typeof activityData.transfers === 'object') {
          supabaseData.transfers = activityData.transfers;
        }

        let data, error;
        
        if (isEditing && supabaseId) {
          // MODIFICATION : utiliser UPDATE avec l'ID Supabase
          console.log("🔄 Mise à jour dans Supabase (ID:", supabaseId, "):", supabaseData);
          const result = await supabase
            .from("activities")
            .update(supabaseData)
            .eq("id", supabaseId);
          data = result.data;
          error = result.error;
        } else {
          // CRÉATION : vérifier d'abord si une activité similaire existe déjà dans Supabase
          const { data: existingActivities, error: checkError } = await supabase
            .from("activities")
            .select("id")
            .eq("site_key", SITE_KEY)
            .eq("name", activityData.name)
            .eq("category", activityData.category || "desert");
          
          if (!checkError && existingActivities && existingActivities.length > 0) {
            // Une activité similaire existe déjà, utiliser son ID
            const existingSupabaseId = existingActivities[0].id;
            activityData.supabase_id = existingSupabaseId;
            // Mettre à jour l'activité dans le state avec le supabase_id existant
            next = next.map((a) => (a.id === activityData.id ? { ...a, supabase_id: existingSupabaseId } : a));
            setActivities(next);
            saveLS(LS_KEYS.activities, next);
            console.log("✅ Activité trouvée dans Supabase, réutilisation de l'ID:", existingSupabaseId);
            data = existingActivities;
            error = null;
          } else {
            // Pas d'activité similaire, créer une nouvelle
            console.log("🔄 Création dans Supabase:", supabaseData);
            const result = await supabase.from("activities").insert(supabaseData);
            data = result.data;
            error = result.error;
            
            // Si création réussie, sauvegarder l'ID Supabase retourné
            if (!error && data && data.length > 0 && data[0].id) {
              const newSupabaseId = data[0].id;
              activityData.supabase_id = newSupabaseId;
              // Mettre à jour l'activité dans le state avec le supabase_id
              next = next.map((a) => (a.id === activityData.id ? { ...a, supabase_id: newSupabaseId } : a));
              setActivities(next);
              saveLS(LS_KEYS.activities, next);
            }
          }
        }
        
        if (error) {
          const action = isEditing ? "mise à jour" : "création";
          console.error(`❌ ERREUR Supabase (${action}):`, error);
          console.error("Détails:", JSON.stringify(error, null, 2));
          
          // Si l'erreur concerne des colonnes manquantes ou le code PGRST204
          if ((error.message && error.message.includes("column")) || error.code === "PGRST204") {
            console.warn("⚠️ Erreur PGRST204 - Colonnes manquantes ou format incorrect dans Supabase.");
            console.warn("Données envoyées:", JSON.stringify(supabaseData, null, 2));
            toast.error("Erreur PGRST204 - Structure Supabase. L'activité est sauvegardée localement. Vérifiez la console pour plus de détails.");
          } else if (error.message && error.message.includes("row-level security") || error.code === "42501") {
            // Erreur de politique RLS (Row Level Security)
            console.error("❌ Erreur RLS (Row Level Security) - Les politiques Supabase bloquent l'insertion");
            toast.error("Erreur de sécurité Supabase (RLS). L'activité est sauvegardée localement. Vérifiez la console pour plus de détails.");
          } else {
            toast.error("Erreur Supabase (création). L'activité est quand même enregistrée en local. Vérifiez la console pour plus de détails.");
          }
        } else {
          const action = isEditing ? "modifiée" : "créée";
          console.log(`✅ Activité ${action} avec succès dans Supabase!`);
          console.log("Données retournées:", data);
        }
      } catch (err) {
        console.error("❌ EXCEPTION lors de l'envoi à Supabase:", err);
        toast.error("Exception lors de l'envoi à Supabase. L'activité est quand même enregistrée en local. Vérifiez la console pour plus de détails.");
      }
    } else {
      console.warn("⚠️ Supabase n'est pas disponible (stub)");
      toast.warning("Supabase n'est pas configuré. L'activité est sauvegardée uniquement en local.");
    }

    setForm({
      name: "",
      category: "desert",
      priceAdult: "",
      priceChild: "",
      priceBaby: "",
      currency: "EUR",
      availableDays: [false, false, false, false, false, false, false],
      notes: "",
      transfers: emptyTransfers(),
    });
    setEditingId(null);
    setShowForm(false);
    
    // Supprimer le formulaire sauvegardé après création réussie
    localStorage.removeItem(LS_KEYS.activityForm);
  }, [form, editingId, canModifyActivities, user?.canAddActivity, activitiesMap, activities, setActivities]);

  const handleDelete = useCallback(async (id) => {
    if (!canModifyActivities) {
      toast.warning("Seuls Léa, Laly et Ewen peuvent supprimer les activités.");
      return;
    }
    const activityToDelete = activitiesMap.get(id);
    const activityName = activityToDelete?.name || "cette activité";
    if (!window.confirm(`Êtes-vous sûr de vouloir supprimer l'activité "${activityName}" ?\n\nCette action est irréversible et supprimera définitivement l'activité.`)) return;
    
    setActivities((prevActivities) => {
      const next = prevActivities.filter((a) => a.id !== id);
      saveLS(LS_KEYS.activities, next);
      return next;
    });
    
    // Supprimer de Supabase si configuré
    if (supabase && activityToDelete?.supabase_id) {
      try {
        const { error } = await supabase
          .from("activities")
          .delete()
          .eq("id", activityToDelete.supabase_id);
        
        if (error) {
          console.error("❌ Erreur lors de la suppression dans Supabase:", error);
          toast.error("Erreur lors de la suppression dans Supabase. L'activité a été supprimée localement.");
        } else {
          console.log("✅ Activité supprimée de Supabase avec succès!");
        }
      } catch (err) {
        console.error("❌ Exception lors de la suppression dans Supabase:", err);
        toast.error("Exception lors de la suppression dans Supabase. L'activité a été supprimée localement.");
      }
    }
  }, [canModifyActivities, activitiesMap]);

  // Filtrer les activités par recherche et par jour (utilise debouncedSearchQuery)
  const filteredActivities = useMemo(() => {
    let filtered = activities;

    // Filtrer par recherche (nom, notes ou description) avec debounce
    if (debouncedSearchQuery.trim()) {
      const query = debouncedSearchQuery.toLowerCase().trim();
      filtered = filtered.filter((a) => {
        const nameMatch = a.name?.toLowerCase().includes(query);
        const notesMatch = a.notes?.toLowerCase().includes(query);
        const descriptionMatch = a.description?.toLowerCase().includes(query);
        return nameMatch || notesMatch || descriptionMatch;
      });
    }

    // Filtrer par jour sélectionné
    if (selectedDay !== "") {
      const dayIndex = parseInt(selectedDay);
      filtered = filtered.filter((a) => {
        return a.availableDays?.[dayIndex] === true;
      });
    }

    return filtered;
  }, [activities, debouncedSearchQuery, selectedDay]);

  const grouped = useMemo(() => {
    const base = {};
    CATEGORIES.forEach((c) => (base[c.key] = []));
    filteredActivities.forEach((a) => {
      const key = a.category && CATEGORIES.some((c) => c.key === a.category) ? a.category : "desert";
      if (base[key]) {
        base[key].push(a);
      }
    });
    return base;
  }, [filteredActivities]);
  
  // Mémoriser les handlers pour éviter les re-renders
  const handleToggleForm = useCallback(() => {
    if (showForm) {
      setForm({
        name: "",
        category: "desert",
        priceAdult: "",
        priceChild: "",
        priceBaby: "",
        currency: "EUR",
        availableDays: [false, false, false, false, false, false, false],
        notes: "",
        transfers: emptyTransfers(),
      });
      setEditingId(null);
    }
    setShowForm((s) => !s);
  }, [showForm]);
  
  const handleCloseDescriptionModal = useCallback(() => {
    setDescriptionModal({ isOpen: false, activity: null, description: "" });
  }, []);
  
  // Ref callback optimisé pour le textarea
  const textareaRefCallback = useCallback((el) => {
    if (el && descriptionModal.isOpen && user?.name === "Ewen") {
      setTimeout(() => el.focus(), 100);
    }
  }, [descriptionModal.isOpen, user?.name]);

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-6 md:space-y-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex-1">
          <h2 className="text-xl md:text-2xl font-bold text-slate-800 mb-2 flex items-center gap-2">
            <span className="text-2xl">🎯</span>
            Gestion des activités
          </h2>
          <p className="text-sm md:text-base text-slate-600 font-medium">
            Ajoutez une activité, ses prix, ses jours disponibles et ses transferts par quartier
          </p>
        </div>
        {user?.canAddActivity && (
          <PrimaryBtn
            onClick={handleToggleForm}
            className="w-full sm:w-auto text-base font-bold px-6 py-3"
          >
            {showForm ? "❌ Annuler" : "➕ Ajouter une activité"}
          </PrimaryBtn>
        )}
      </div>

      {/* Filtres et recherche */}
      <div className="bg-gradient-to-br from-slate-50/90 to-blue-50/70 rounded-2xl border-2 border-slate-200/60 p-5 md:p-6 shadow-lg backdrop-blur-sm">
        <h3 className="text-base md:text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
          <span className="text-xl">🔍</span>
          Recherche et filtres
        </h3>
        <div className="grid md:grid-cols-2 gap-4 md:gap-5">
          <div>
            <label className="block text-xs md:text-sm font-semibold text-slate-700 mb-2">Rechercher une activité</label>
            <TextInput
              placeholder="Nom, notes ou description..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="text-base"
            />
          </div>
          <div>
            <label className="block text-xs md:text-sm font-semibold text-slate-700 mb-2">Filtrer par jour</label>
            <select
              value={selectedDay}
              onChange={(e) => setSelectedDay(e.target.value)}
              className="w-full rounded-xl border-2 border-blue-300/60 bg-white/98 backdrop-blur-sm px-4 py-3 text-sm md:text-base font-medium text-slate-800 shadow-md focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all"
            >
              <option value="">📅 Tous les jours</option>
              {WEEKDAYS.map((day) => (
                <option key={day.key} value={day.key}>
                  {day.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {showForm && (
        <form ref={formRef} onSubmit={handleCreate} className="space-y-5 md:space-y-6 bg-gradient-to-br from-blue-50/90 via-indigo-50/80 to-purple-50/70 backdrop-blur-sm rounded-2xl p-5 md:p-7 border-2 border-blue-200/60 shadow-xl">
          <div className="flex items-center gap-3 mb-4 pb-4 border-b-2 border-blue-200/60">
            <span className="text-2xl">{editingId ? "✏️" : "➕"}</span>
            <h3 className="text-lg md:text-xl font-bold text-slate-800">
              {editingId ? "Modifier l'activité" : "Nouvelle activité"}
            </h3>
          </div>

          <div className="bg-white/80 rounded-xl p-4 md:p-5 border-2 border-blue-100/60">
            <label className="block text-xs md:text-sm font-bold text-slate-700 mb-3">Informations de base</label>
            <div className="grid md:grid-cols-2 gap-4 md:gap-5">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-2">Nom de l'activité *</label>
                <TextInput
                  placeholder="Ex: Snorkeling"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="text-base"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-2">Catégorie *</label>
                <select
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                  className="w-full rounded-xl border-2 border-blue-300/60 bg-white/98 backdrop-blur-sm px-4 py-3 text-sm md:text-base font-medium text-slate-800 shadow-md focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-emerald-50/80 to-teal-50/70 rounded-xl p-4 md:p-5 border-2 border-emerald-200/60">
            <label className="block text-xs md:text-sm font-bold text-slate-700 mb-3">💰 Tarification</label>
            <div className="grid md:grid-cols-4 gap-4 md:gap-5">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-2">Prix adulte</label>
                <NumberInput
                  placeholder="0.00"
                  value={form.priceAdult}
                  onChange={(e) => setForm((f) => ({ ...f, priceAdult: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-2">Prix enfant</label>
                <NumberInput
                  placeholder="0.00"
                  value={form.priceChild}
                  onChange={(e) => setForm((f) => ({ ...f, priceChild: e.target.value }))}
                />
                <TextInput
                  placeholder="Âge (ex: 5-12 ans)"
                  value={form.ageChild}
                  onChange={(e) => setForm((f) => ({ ...f, ageChild: e.target.value }))}
                  className="mt-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-2">Prix bébé</label>
                <NumberInput
                  placeholder="0.00"
                  value={form.priceBaby}
                  onChange={(e) => setForm((f) => ({ ...f, priceBaby: e.target.value }))}
                />
                <TextInput
                  placeholder="Âge (ex: 0-4 ans)"
                  value={form.ageBaby}
                  onChange={(e) => setForm((f) => ({ ...f, ageBaby: e.target.value }))}
                  className="mt-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-2">Devise</label>
                <TextInput
                  placeholder="EUR"
                  value={form.currency}
                  onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value.toUpperCase() }))}
                  className="text-base font-semibold"
                />
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-amber-50/80 to-yellow-50/70 rounded-xl p-4 md:p-5 border-2 border-amber-200/60">
            <label className="block text-xs md:text-sm font-bold text-slate-700 mb-3">📅 Jours disponibles</label>
            <DaysSelector value={form.availableDays} onChange={(v) => setForm((f) => ({ ...f, availableDays: v }))} />
          </div>

          <div className="bg-gradient-to-br from-purple-50/80 to-pink-50/70 rounded-xl p-4 md:p-5 border-2 border-purple-200/60">
            <label className="block text-xs md:text-sm font-bold text-slate-700 mb-3">🚗 Transferts par quartier</label>
            <p className="text-xs text-slate-600 mb-3 font-medium">
              Activez Matin / Après-midi / Soir et indiquez les heures et suppléments pour chaque quartier
            </p>
            <TransfersEditor value={form.transfers} onChange={(v) => setForm((f) => ({ ...f, transfers: v }))} />
          </div>

          <div className="bg-slate-50/80 rounded-xl p-4 md:p-5 border-2 border-slate-200/60">
            <label className="block text-xs md:text-sm font-bold text-slate-700 mb-2">📝 Notes (facultatif)</label>
            <TextInput
              placeholder="Informations supplémentaires, remarques..."
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              className="text-base"
            />
          </div>

          <div className="flex justify-end pt-4 border-t-2 border-blue-200/60">
            <PrimaryBtn type="submit" className="text-base font-bold px-8 py-3">
              {editingId ? "💾 Modifier l'activité" : "✅ Enregistrer"}
            </PrimaryBtn>
          </div>
        </form>
      )}

      {CATEGORIES.map((cat) => (
        <div key={cat.key} className="space-y-3 md:space-y-4">
          <div className="flex items-center gap-3">
            <h3 className="text-base md:text-lg font-bold text-slate-800 bg-gradient-to-r from-blue-500 to-indigo-500 text-white px-4 py-2 rounded-xl shadow-md">
              {cat.label}
            </h3>
            <span className="text-sm font-semibold text-slate-600 bg-slate-100 px-3 py-1 rounded-full">
              {(grouped[cat.key] || []).length} activité{(grouped[cat.key] || []).length > 1 ? "s" : ""}
            </span>
          </div>
          <div className="rounded-2xl border-2 border-slate-200/60 bg-white/95 backdrop-blur-sm shadow-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm md:text-base">
                <thead className="bg-gradient-to-r from-blue-50/90 to-indigo-50/80 text-slate-800 text-xs md:text-sm font-bold">
                  <tr>
                    <th className="text-left px-4 py-3 md:px-5 md:py-4">Activité</th>
                    <th className="text-left px-4 py-3 md:px-5 md:py-4">💰 Adulte</th>
                    <th className="text-left px-4 py-3 md:px-5 md:py-4">👶 Enfant</th>
                    <th className="text-left px-4 py-3 md:px-5 md:py-4">🍼 Bébé</th>
                    <th className="text-left px-4 py-3 md:px-5 md:py-4">📅 Jours</th>
                    <th className="text-left px-4 py-3 md:px-5 md:py-4">📝 Notes</th>
                    <th className="text-right px-4 py-3 md:px-5 md:py-4">⚙️ Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(grouped[cat.key] || []).map((a) => {
                    const hasDescription = !!a.description;
                    return (
                      <tr 
                        key={a.id}
                        className="border-t border-slate-200/60 transition-colors hover:bg-blue-50/50"
                      >
                        <td className="px-4 py-3 md:px-5 md:py-4 font-semibold text-slate-800">{a.name}</td>
                        <td className="px-4 py-3 md:px-5 md:py-4 font-medium text-slate-700">{currency(a.priceAdult, a.currency)}</td>
                        <td className="px-4 py-3 md:px-5 md:py-4 font-medium text-slate-700">{currency(a.priceChild, a.currency)}</td>
                        <td className="px-4 py-3 md:px-5 md:py-4 font-medium text-slate-700">{currency(a.priceBaby, a.currency)}</td>
                        <td className="px-4 py-3 md:px-5 md:py-4">
                          <div className="flex gap-1.5 flex-wrap">
                            {WEEKDAYS.map((d, dayIdx) =>
                              a.availableDays?.[dayIdx] ? (
                                <span
                                  key={d.key}
                                  className="px-2.5 py-1 rounded-full bg-gradient-to-r from-green-100 to-emerald-100 text-green-800 text-xs font-bold border border-green-300/60 shadow-sm"
                                >
                                  {d.label}
                                </span>
                              ) : null,
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 md:px-5 md:py-4 text-slate-600 text-sm">{a.notes || <span className="text-slate-400 italic">—</span>}</td>
                        <td className="px-4 py-3 md:px-5 md:py-4 text-right">
                          <div className="flex gap-2 justify-end">
                            <GhostBtn 
                              onClick={() => handleOpenDescriptionModal(a)} 
                              variant="primary" 
                              size="sm"
                              className={hasDescription ? "bg-green-100 hover:bg-green-200 text-green-800 border-green-300" : ""}
                            >
                              📄 Description{hasDescription ? " ✓" : ""}
                            </GhostBtn>
                            {canModifyActivities && (
                              <>
                                <GhostBtn onClick={() => handleEdit(a)} variant="primary" size="sm">
                                  ✏️ Modifier
                                </GhostBtn>
                                <GhostBtn onClick={() => handleDelete(a.id)} variant="danger" size="sm">
                                  🗑️ Supprimer
                                </GhostBtn>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {(!grouped[cat.key] || grouped[cat.key].length === 0) && (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 md:py-10 text-center">
                        <div className="flex flex-col items-center gap-2">
                          <span className="text-3xl">📭</span>
                          <p className="text-slate-500 font-medium">Aucune activité dans cette catégorie</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ))}
      
      {/* Modal de description */}
      {descriptionModal.isOpen && descriptionModal.activity && (
        <div 
          ref={descriptionModalRef} 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        >
          <div className="bg-white rounded-2xl border-2 border-slate-200 shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="bg-gradient-to-r from-blue-500 to-indigo-600 px-6 py-4">
              <h3 className="text-xl font-bold text-white">
                📄 Description - {descriptionModal.activity.name}
              </h3>
            </div>
            <div className="p-6 flex-1 overflow-y-auto">
              <textarea
                ref={textareaRefCallback}
                value={descriptionModal.description}
                onChange={(e) => setDescriptionModal((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="Ajoutez une description pour cette activité..."
                disabled={user?.name !== "Ewen"}
                readOnly={user?.name !== "Ewen"}
                className={`w-full h-48 rounded-xl border-2 border-slate-200 bg-white px-4 py-3 text-sm md:text-base text-slate-800 shadow-sm focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all resize-none ${
                  user?.name !== "Ewen" ? "bg-slate-100 cursor-not-allowed" : ""
                }`}
              />
              {user?.name !== "Ewen" && (
                <p className="text-xs text-amber-600 mt-2 font-medium">
                  ⚠️ Seul Ewen peut modifier la description.
                </p>
              )}
              {user?.name === "Ewen" && (
                <p className="text-xs text-slate-500 mt-2">
                  💡 Cette description sera sauvegardée avec l'activité.
                </p>
              )}
            </div>
            <div className="px-6 py-4 border-t border-slate-200 flex gap-3 justify-end">
              <GhostBtn
                onClick={handleCloseDescriptionModal}
                variant="primary"
              >
                Fermer
              </GhostBtn>
              {user?.name === "Ewen" && (
                <PrimaryBtn onClick={handleSaveDescription}>
                  Enregistrer
                </PrimaryBtn>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

