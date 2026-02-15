import { useState, useMemo, useEffect, useRef, useCallback, memo } from "react";
import { supabase } from "../lib/supabase";
import { SITE_KEY, LS_KEYS, CATEGORIES, WEEKDAYS } from "../constants";
import { uuid, currency, emptyTransfers, mergeTransfers, saveLS, loadLS } from "../utils";
import { TextInput, NumberInput, PrimaryBtn, GhostBtn } from "../components/ui";
import { DaysSelector } from "../components/DaysSelector";
import { TransfersEditor } from "../components/TransfersEditor";
import { toast } from "../utils/toast.js";
import { logger } from "../utils/logger";
import { useDebounce } from "../hooks/useDebounce";
import { TableRowSkeleton } from "../components/Skeleton";

export function ActivitiesPage({ activities, setActivities, user }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDay, setSelectedDay] = useState("");
  // Debounce de la recherche pour améliorer les performances
  const debouncedSearchQuery = useDebounce(searchQuery, 300);
  
  // Vérifier si l'utilisateur peut modifier/supprimer les activités (Léa, Laly, Ewen et utilisateurs avec accès Situation)
  const canModifyActivities = user?.name === "Léa" || user?.name === "Laly" || user?.name === "Ewen" || user?.canAccessSituation || user?.name === "situation";

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

  // Catégories repliables (fermées par défaut) : cliquer pour ouvrir/fermer
  const [openCategories, setOpenCategories] = useState(() => {
    const initial = {};
    CATEGORIES.forEach((c) => (initial[c.key] = false));
    return initial;
  });
  const toggleCategory = useCallback((catKey) => {
    setOpenCategories((prev) => ({ ...prev, [catKey]: !prev[catKey] }));
  }, []);
  const openAllCategories = useCallback(() => {
    const next = {};
    CATEGORIES.forEach((c) => (next[c.key] = true));
    setOpenCategories(next);
  }, []);
  const closeAllCategories = useCallback(() => {
    const next = {};
    CATEGORIES.forEach((c) => (next[c.key] = false));
    setOpenCategories(next);
  }, []);

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
      transfers: mergeTransfers(activity.transfers),
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
            logger.warn("⚠️ La colonne 'description' n'existe peut-être pas encore dans Supabase. La description est sauvegardée localement.");
            toast.warning("La colonne description n'existe pas encore dans Supabase. Exécutez le script SQL pour l'ajouter. La description est sauvegardée localement.");
          } else {
            logger.error("❌ Erreur lors de la mise à jour de la description dans Supabase:", error);
            toast.error("Erreur lors de la sauvegarde dans Supabase. La description est sauvegardée localement.");
          }
        } else {
          toast.success("Description sauvegardée avec succès.");
        }
      } catch (err) {
        logger.error("❌ Exception lors de la mise à jour de la description dans Supabase:", err);
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
          logger.log("🔄 Mise à jour dans Supabase (ID:", supabaseId, "):", supabaseData);
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
            logger.log("✅ Activité trouvée dans Supabase, réutilisation de l'ID:", existingSupabaseId);
            data = existingActivities;
            error = null;
          } else {
            // Pas d'activité similaire, créer une nouvelle
            logger.log("🔄 Création dans Supabase:", supabaseData);
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
          logger.error(`❌ ERREUR Supabase (${action}):`, error);
          logger.error("Détails:", JSON.stringify(error, null, 2));
          
          // Si l'erreur concerne des colonnes manquantes ou le code PGRST204
          if ((error.message && error.message.includes("column")) || error.code === "PGRST204") {
            logger.warn("⚠️ Erreur PGRST204 - Colonnes manquantes ou format incorrect dans Supabase.");
            logger.warn("Données envoyées:", JSON.stringify(supabaseData, null, 2));
            toast.error("Erreur PGRST204 - Structure Supabase. L'activité est sauvegardée localement. Vérifiez la console pour plus de détails.");
          } else if (error.message && error.message.includes("row-level security") || error.code === "42501") {
            // Erreur de politique RLS (Row Level Security)
            logger.error("❌ Erreur RLS (Row Level Security) - Les politiques Supabase bloquent l'insertion");
            toast.error("Erreur de sécurité Supabase (RLS). L'activité est sauvegardée localement. Vérifiez la console pour plus de détails.");
          } else {
            toast.error("Erreur Supabase (création). L'activité est quand même enregistrée en local. Vérifiez la console pour plus de détails.");
          }
        } else {
          const action = isEditing ? "modifiée" : "créée";
          logger.log(`✅ Activité ${action} avec succès dans Supabase!`);
          logger.log("Données retournées:", data);
        }
      } catch (err) {
        logger.error("❌ EXCEPTION lors de l'envoi à Supabase:", err);
        toast.error("Exception lors de l'envoi à Supabase. L'activité est quand même enregistrée en local. Vérifiez la console pour plus de détails.");
      }
    } else {
      logger.warn("⚠️ Supabase n'est pas disponible (stub)");
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
          logger.error("❌ Erreur lors de la suppression dans Supabase:", error);
          toast.error("Erreur lors de la suppression dans Supabase. L'activité a été supprimée localement.");
        } else {
          logger.log("✅ Activité supprimée de Supabase avec succès!");
        }
      } catch (err) {
        logger.error("❌ Exception lors de la suppression dans Supabase:", err);
        toast.error("Exception lors de la suppression dans Supabase. L'activité a été supprimée localement.");
      }
    }
  }, [canModifyActivities, activitiesMap]);

  // Index de recherche pour améliorer les performances (créé une seule fois)
  const searchIndexRef = useRef(new Map());
  
  // Mettre à jour l'index de recherche quand les activités changent
  useEffect(() => {
    const index = new Map();
    activities.forEach((a) => {
      const searchableText = `${a.name || ''} ${a.notes || ''} ${a.description || ''}`.toLowerCase();
      index.set(a.id, searchableText);
    });
    searchIndexRef.current = index;
  }, [activities]);

  // Filtrer les activités par recherche et par jour (optimisé avec index)
  const filteredActivities = useMemo(() => {
    let filtered = activities;
    const searchIndex = searchIndexRef.current;

    // Filtrer par recherche (nom, notes ou description) avec debounce - optimisé avec index
    if (debouncedSearchQuery.trim()) {
      const query = debouncedSearchQuery.toLowerCase().trim();
      filtered = filtered.filter((a) => {
        const searchableText = searchIndex.get(a.id) || '';
        return searchableText.includes(query);
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

  // Toutes les catégories sont maintenant toujours visibles pour éviter les carrés blancs

  // Composant de ligne de table mémorisé pour améliorer les performances
  const ActivityRow = memo(({ activity, onEdit, onDelete, onOpenDescription, canModify }) => {
    const hasDescription = !!activity.description;
    const availableDaysList = useMemo(() => {
      return WEEKDAYS.filter((d, dayIdx) => activity.availableDays?.[dayIdx]);
    }, [activity.availableDays]);

    return (
      <tr 
        className="border-t border-slate-200/60"
      >
        <td className="px-4 py-4 md:px-5 md:py-5 font-bold text-slate-800 text-base">{activity.name}</td>
        <td className="px-4 py-4 md:px-5 md:py-5 font-semibold text-slate-700">{currency(activity.priceAdult, activity.currency)}</td>
        <td className="px-4 py-4 md:px-5 md:py-5 font-semibold text-slate-700">{currency(activity.priceChild, activity.currency)}</td>
        <td className="px-4 py-4 md:px-5 md:py-5 font-semibold text-slate-700">{currency(activity.priceBaby, activity.currency)}</td>
        <td className="px-4 py-4 md:px-5 md:py-5">
          <div className="flex gap-1.5 flex-wrap">
            {availableDaysList.map((d) => (
              <span
                key={d.key}
                className="px-2.5 py-1 rounded-lg bg-gradient-to-r from-emerald-100 to-teal-100 text-emerald-800 text-xs font-bold border border-emerald-300/60 shadow-sm"
              >
                {d.label}
              </span>
            ))}
          </div>
        </td>
        <td className="px-4 py-4 md:px-5 md:py-5 text-slate-600 text-sm">{activity.notes || <span className="text-slate-400 italic">—</span>}</td>
        <td className="px-4 py-3 md:px-5 md:py-4 text-right">
          <div className="flex gap-2 justify-end">
            <GhostBtn 
              onClick={() => onOpenDescription(activity)} 
              variant="primary" 
              size="sm"
              className={hasDescription ? "bg-green-100 hover:bg-green-200 text-green-800 border-green-300" : ""}
            >
              📄 Description{hasDescription ? " ✓" : ""}
            </GhostBtn>
            {canModify && (
              <>
                <GhostBtn onClick={() => onEdit(activity)} variant="primary" size="sm">
                  ✏️ Modifier
                </GhostBtn>
                <GhostBtn onClick={() => onDelete(activity.id)} variant="danger" size="sm">
                  🗑️ Supprimer
                </GhostBtn>
              </>
            )}
          </div>
        </td>
      </tr>
    );
  }, (prevProps, nextProps) => {
    // Comparaison personnalisée optimisée pour éviter les re-renders inutiles
    if (prevProps.activity.id !== nextProps.activity.id) return false;
    if (prevProps.activity.name !== nextProps.activity.name) return false;
    if (prevProps.activity.priceAdult !== nextProps.activity.priceAdult) return false;
    if (prevProps.activity.priceChild !== nextProps.activity.priceChild) return false;
    if (prevProps.activity.priceBaby !== nextProps.activity.priceBaby) return false;
    if (prevProps.activity.notes !== nextProps.activity.notes) return false;
    if (prevProps.activity.description !== nextProps.activity.description) return false;
    if (prevProps.canModify !== nextProps.canModify) return false;
    
    // Comparaison optimisée des availableDays sans JSON.stringify
    const prevDays = prevProps.activity.availableDays;
    const nextDays = nextProps.activity.availableDays;
    if (!prevDays && !nextDays) return true;
    if (!prevDays || !nextDays) return false;
    if (prevDays.length !== nextDays.length) return false;
    for (let i = 0; i < prevDays.length; i++) {
      if (prevDays[i] !== nextDays[i]) return false;
    }
    
    return true;
  });

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-6 md:space-y-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b-2 border-slate-200/60">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg">
            <span className="text-2xl">🎯</span>
          </div>
          <div>
            <h2 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-blue-700 via-indigo-700 to-purple-700 bg-clip-text text-transparent">
              Gestion des activités
            </h2>
            <p className="text-sm md:text-base text-slate-600 font-medium mt-1">
              Ajoutez une activité, ses prix, ses jours disponibles et ses transferts par quartier
            </p>
          </div>
        </div>
        {user?.canAddActivity && (
          <PrimaryBtn
            onClick={handleToggleForm}
            className="w-full sm:w-auto text-base font-bold px-6 py-3 shadow-lg"
          >
            {showForm ? "❌ Annuler" : "➕ Ajouter une activité"}
          </PrimaryBtn>
        )}
      </div>

      {/* Filtres et recherche */}
      <div className="bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 rounded-2xl border-2 border-slate-200/60 p-5 md:p-7 shadow-xl">
        <div className="flex items-center gap-4 mb-5 pb-4 border-b-2 border-blue-200/40">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg">
            <span className="text-xl">🔍</span>
          </div>
          <div>
            <h3 className="text-lg md:text-xl font-bold bg-gradient-to-r from-blue-700 to-indigo-700 bg-clip-text text-transparent">
              Recherche et filtres
            </h3>
            <p className="text-xs text-slate-600 mt-0.5">
              Trouvez rapidement une activité
            </p>
          </div>
        </div>
        <div className="grid md:grid-cols-2 gap-5 md:gap-6">
          <div>
            <label className="block text-sm font-semibold text-slate-800 mb-2 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
              Rechercher une activité
            </label>
            <TextInput
              placeholder="Nom, notes ou description..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="text-base shadow-md"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-800 mb-2 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
              Filtrer par jour
            </label>
            <select
              value={selectedDay}
              onChange={(e) => setSelectedDay(e.target.value)}
              className="w-full rounded-xl border-2 border-blue-300/60 bg-white/98 px-4 py-3 text-sm md:text-base font-medium text-slate-800 shadow-md focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
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
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-blue-200/40 mt-2">
          <span className="text-xs font-semibold text-slate-600">Catégories :</span>
          <button
            type="button"
            onClick={openAllCategories}
            className="text-xs font-bold px-3 py-1.5 rounded-lg bg-blue-100 hover:bg-blue-200 text-blue-800 border border-blue-300/60 transition-colors"
          >
            Ouvrir tout
          </button>
          <button
            type="button"
            onClick={closeAllCategories}
            className="text-xs font-bold px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300/60 transition-colors"
          >
            Fermer tout
          </button>
        </div>
      </div>

      {showForm && (
        <form ref={formRef} onSubmit={handleCreate} className="space-y-5 md:space-y-6 bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 rounded-2xl p-5 md:p-7 lg:p-9 border-2 border-blue-200/60 shadow-xl">
          <div className="flex items-center gap-4 mb-5 pb-4 border-b-2 border-blue-200/60">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg">
              <span className="text-2xl">{editingId ? "✏️" : "➕"}</span>
            </div>
            <div>
              <h3 className="text-xl md:text-2xl font-bold bg-gradient-to-r from-blue-700 via-indigo-700 to-purple-700 bg-clip-text text-transparent">
                {editingId ? "Modifier l'activité" : "Nouvelle activité"}
              </h3>
              <p className="text-xs text-slate-600 mt-0.5">
                {editingId ? "Modifiez les informations de l'activité" : "Remplissez les informations de la nouvelle activité"}
              </p>
            </div>
          </div>

          <div className="bg-white/90 rounded-xl p-5 md:p-6 border-2 border-blue-100/60 shadow-lg">
            <div className="flex items-center gap-3 mb-4 pb-3 border-b border-blue-100/60">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                <span className="text-white text-sm">📋</span>
              </div>
              <label className="text-sm md:text-base font-bold text-slate-800">Informations de base</label>
            </div>
            <div className="grid md:grid-cols-2 gap-5 md:gap-6">
              <div>
                <label className="block text-sm font-semibold text-slate-800 mb-2 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                  Nom de l'activité *
                </label>
                <TextInput
                  placeholder="Ex: Snorkeling"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="text-base shadow-md"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-800 mb-2 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                  Catégorie *
                </label>
                <select
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                  className="w-full rounded-xl border-2 border-blue-300/60 bg-white/98 px-4 py-3 text-sm md:text-base font-medium text-slate-800 shadow-md focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
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

          <div className="bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50 rounded-xl p-5 md:p-6 border-2 border-emerald-200/60 shadow-lg">
            <div className="flex items-center gap-3 mb-4 pb-3 border-b border-emerald-200/60">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
                <span className="text-white text-sm">💰</span>
              </div>
              <label className="text-sm md:text-base font-bold text-slate-800">Tarification</label>
            </div>
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

          <div className="bg-gradient-to-br from-amber-50 via-yellow-50 to-orange-50 rounded-xl p-5 md:p-6 border-2 border-amber-200/60 shadow-lg">
            <div className="flex items-center gap-3 mb-4 pb-3 border-b border-amber-200/60">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-yellow-600 flex items-center justify-center">
                <span className="text-white text-sm">📅</span>
              </div>
              <label className="text-sm md:text-base font-bold text-slate-800">Jours disponibles</label>
            </div>
            <DaysSelector value={form.availableDays} onChange={(v) => setForm((f) => ({ ...f, availableDays: v }))} />
          </div>

          <div className="bg-gradient-to-br from-purple-50 via-pink-50 to-rose-50 rounded-xl p-5 md:p-6 border-2 border-purple-200/60 shadow-lg">
            <div className="flex items-center gap-3 mb-4 pb-3 border-b border-purple-200/60">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center">
                <span className="text-white text-sm">🚗</span>
              </div>
              <div className="flex-1">
                <label className="text-sm md:text-base font-bold text-slate-800 block">Transferts par quartier</label>
                <p className="text-xs text-slate-600 mt-1 font-medium">
                  Activez Matin / Après-midi / Soir et indiquez les heures et suppléments pour chaque quartier
                </p>
              </div>
            </div>
            <TransfersEditor value={form.transfers} onChange={(v) => setForm((f) => ({ ...f, transfers: v }))} />
          </div>

          <div className="bg-slate-50/90 rounded-xl p-5 md:p-6 border-2 border-slate-200/60 shadow-lg">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-slate-500 to-slate-600 flex items-center justify-center">
                <span className="text-white text-sm">📝</span>
              </div>
              <label className="text-sm md:text-base font-bold text-slate-800">Notes (facultatif)</label>
            </div>
            <TextInput
              placeholder="Informations supplémentaires, remarques..."
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              className="text-base shadow-md"
            />
          </div>

          <div className="flex justify-end pt-5 border-t-2 border-blue-200/60">
            <PrimaryBtn type="submit" className="text-base font-bold px-8 py-3 shadow-lg">
              {editingId ? "💾 Modifier l'activité" : "✅ Enregistrer"}
            </PrimaryBtn>
          </div>
        </form>
      )}

      {/* Liste des catégories en accordéon : fermées par défaut, clic pour ouvrir */}
      <div className="bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/30 rounded-2xl border-2 border-slate-200/60 p-5 md:p-6 shadow-xl">
        <div className="flex items-center gap-3 mb-4 pb-3 border-b border-slate-200/60">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg">
            <span className="text-xl">📂</span>
          </div>
          <div>
            <h3 className="text-lg md:text-xl font-bold text-slate-800">Activités par catégorie</h3>
            <p className="text-xs text-slate-600 font-medium">Cliquez sur une catégorie pour afficher ou masquer les activités</p>
          </div>
        </div>
        <div className="space-y-3 md:space-y-4">
        {CATEGORIES.map((cat) => {
          const activitiesInCategory = grouped[cat.key] || [];
          const isOpen = openCategories[cat.key];
          const count = activitiesInCategory.length;

          return (
            <div
              key={cat.key}
              data-category={cat.key}
              className="rounded-2xl border-2 border-slate-200/70 bg-white/98 shadow-lg overflow-hidden transition-shadow hover:shadow-xl"
              style={{ contentVisibility: "auto", containIntrinsicSize: "auto 80px" }}
            >
              <button
                type="button"
                onClick={() => toggleCategory(cat.key)}
                className="w-full flex items-center gap-4 px-5 py-4 md:px-6 md:py-5 text-left bg-gradient-to-r from-slate-50 via-blue-50/50 to-indigo-50/50 hover:from-blue-50 hover:to-indigo-50 border-b border-slate-200/60 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:ring-inset"
                aria-expanded={isOpen}
                aria-controls={`category-content-${cat.key}`}
                id={`category-header-${cat.key}`}
              >
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-md flex-shrink-0">
                  <span className="text-white text-lg font-bold">{cat.label.charAt(0)}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg md:text-xl font-bold bg-gradient-to-r from-blue-700 to-indigo-700 bg-clip-text text-transparent truncate">
                    {cat.label}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5 font-medium">
                    {count} activité{count !== 1 ? "s" : ""}
                  </p>
                </div>
                <span
                  className={`flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center bg-slate-200/60 text-slate-600 transition-transform duration-200 ${
                    isOpen ? "rotate-180" : ""
                  }`}
                  aria-hidden
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </span>
                <span className="hidden sm:inline px-3 py-1.5 text-sm font-bold text-slate-600 bg-white/80 rounded-lg border border-slate-200/80 shadow-sm">
                  {count}
                </span>
              </button>

              <div
                id={`category-content-${cat.key}`}
                role="region"
                aria-labelledby={`category-header-${cat.key}`}
                className={`overflow-hidden transition-all duration-300 ease-out ${
                  isOpen ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0"
                }`}
              >
                <div className="rounded-b-2xl border-t-0 border-2 border-slate-200/60 bg-white/95 shadow-inner">
                  <div className="overflow-x-auto -mx-3 md:mx-0 px-3 md:px-0" style={{ WebkitOverflowScrolling: "touch" }}>
                    <table className="w-full text-sm md:text-base min-w-full">
                      <thead className="bg-gradient-to-r from-blue-50/80 via-indigo-50/80 to-purple-50/80 text-slate-800 text-xs md:text-sm font-bold border-b-2 border-blue-200/60">
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
                        {activitiesInCategory.map((a) => (
                          <ActivityRow
                            key={a.id}
                            activity={a}
                            onEdit={handleEdit}
                            onDelete={handleDelete}
                            onOpenDescription={handleOpenDescriptionModal}
                            canModify={canModifyActivities}
                          />
                        ))}
                        {activitiesInCategory.length === 0 && (
                          <tr>
                            <td colSpan={7} className="px-4 py-10 md:py-14 text-center">
                              <div className="flex flex-col items-center gap-2">
                                <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center">
                                  <span className="text-2xl">📭</span>
                                </div>
                                <p className="text-slate-500 font-semibold text-sm">Aucune activité dans cette catégorie</p>
                              </div>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        </div>
      </div>

      {/* Modal de description */}
      {descriptionModal.isOpen && descriptionModal.activity && (
        <div 
          ref={descriptionModalRef} 
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
        >
          <div className="bg-white rounded-2xl border-2 border-slate-200 shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col animate-scale-in">
            <div className="bg-gradient-to-r from-blue-500 via-indigo-600 to-purple-600 px-6 py-5 border-b-2 border-blue-400/60">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                  <span className="text-xl">📄</span>
                </div>
                <h3 className="text-xl font-bold text-white">
                  Description - {descriptionModal.activity.name}
                </h3>
              </div>
            </div>
            <div className="p-6 flex-1 overflow-y-auto">
              <textarea
                ref={textareaRefCallback}
                value={descriptionModal.description}
                onChange={(e) => setDescriptionModal((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="Ajoutez une description pour cette activité..."
                disabled={user?.name !== "Ewen"}
                readOnly={user?.name !== "Ewen"}
                className={`w-full h-48 rounded-xl border-2 border-slate-200 bg-white px-4 py-3 text-sm md:text-base text-slate-800 shadow-sm focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 resize-none ${
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

