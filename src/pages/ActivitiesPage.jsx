import { useState, useMemo, useEffect, useRef, useCallback, memo } from "react";
import { supabase } from "../lib/supabase";
import { SITE_KEY, LS_KEYS, CATEGORIES, WEEKDAYS } from "../constants";
import { uuid, currency, emptyTransfers, mergeTransfers, saveLS, loadLS } from "../utils";
import { TextInput, NumberInput, PrimaryBtn } from "../components/ui";
import { DaysSelector } from "../components/DaysSelector";
import { TransfersEditor } from "../components/TransfersEditor";
import { toast } from "../utils/toast.js";
import { logger } from "../utils/logger";
import { useDebounce } from "../hooks/useDebounce";
import { TableRowSkeleton } from "../components/Skeleton";
import {
  downloadBackup,
  parseBackupFile,
  restoreFromBackup,
  getBackupFilename,
} from "../utils/activitiesBackup";

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
  const restoreFileInputRef = useRef(null);
  
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
    
    // SAUVEGARDE LOCALE IMMÉDIATE (AVANT Supabase) pour garantir la persistance
    setActivities(next);
    saveLS(LS_KEYS.activities, next);
    
    // Vérification que la sauvegarde locale s'est bien passée
    const savedActivities = loadLS(LS_KEYS.activities, []);
    const savedActivity = savedActivities.find((a) => a.id === activityData.id);
    if (savedActivity) {
      logger.log(`✅ Sauvegarde locale confirmée pour "${activityData.name}" (ID: ${activityData.id})`);
      logger.log(`📦 Total d'activités sauvegardées localement: ${savedActivities.length}`);
    } else {
      logger.error(`❌ ERREUR: L'activité "${activityData.name}" n'a pas été trouvée dans le localStorage après sauvegarde!`);
      toast.error("Erreur lors de la sauvegarde locale. Veuillez réessayer.");
      return; // Arrêter ici si la sauvegarde locale a échoué
    }

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
          
          // S'assurer que la sauvegarde locale est à jour AVANT la mise à jour Supabase
          const currentSavedActivities = loadLS(LS_KEYS.activities, []);
          const currentActivity = currentSavedActivities.find((a) => a.id === activityData.id);
          if (!currentActivity) {
            logger.error(`❌ ERREUR CRITIQUE: L'activité "${activityData.name}" n'existe pas dans le localStorage avant la mise à jour Supabase!`);
            toast.error("Erreur: activité non trouvée localement. La modification a été annulée.");
            return;
          }
          
          const result = await supabase
            .from("activities")
            .update(supabaseData)
            .eq("id", supabaseId);
          data = result.data;
          error = result.error;
          
          // Après la mise à jour Supabase, s'assurer que la sauvegarde locale est toujours à jour
          if (!error) {
            const finalSavedActivities = loadLS(LS_KEYS.activities, []);
            const finalActivity = finalSavedActivities.find((a) => a.id === activityData.id);
            if (finalActivity) {
              logger.log(`✅ Sauvegarde locale confirmée après mise à jour Supabase pour "${activityData.name}"`);
            } else {
              logger.error(`❌ ERREUR: L'activité "${activityData.name}" a disparu du localStorage après la mise à jour Supabase!`);
              // Réessayer la sauvegarde locale
              setActivities(next);
              saveLS(LS_KEYS.activities, next);
            }
          }
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
            
            // Vérification que la mise à jour avec supabase_id s'est bien passée
            const updatedSavedActivities = loadLS(LS_KEYS.activities, []);
            const updatedActivity = updatedSavedActivities.find((a) => a.id === activityData.id);
            if (updatedActivity && updatedActivity.supabase_id === existingSupabaseId) {
              logger.log(`✅ Activité trouvée dans Supabase, réutilisation de l'ID: ${existingSupabaseId}`);
              logger.log(`📦 Sauvegarde locale confirmée avec supabase_id pour "${activityData.name}"`);
            } else {
              logger.error(`❌ ERREUR: La mise à jour avec supabase_id a échoué pour "${activityData.name}"`);
            }
            
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
              
              // Vérification que la mise à jour avec supabase_id s'est bien passée
              const updatedSavedActivities = loadLS(LS_KEYS.activities, []);
              const updatedActivity = updatedSavedActivities.find((a) => a.id === activityData.id);
              if (updatedActivity && updatedActivity.supabase_id === newSupabaseId) {
                logger.log(`✅ Nouveau supabase_id sauvegardé localement: ${newSupabaseId} pour "${activityData.name}"`);
                logger.log(`📦 Sauvegarde locale confirmée avec supabase_id`);
              } else {
                logger.error(`❌ ERREUR: La mise à jour avec le nouveau supabase_id a échoué pour "${activityData.name}"`);
              }
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
          
          // Confirmation visuelle de la sauvegarde complète (locale + Supabase)
          toast.success(
            `✅ Activité "${activityData.name}" ${action} avec succès!\n` +
            `📦 Sauvegardée localement et dans Supabase.`
          );
          
          // Vérification finale que tout est bien sauvegardé
          const finalSavedActivities = loadLS(LS_KEYS.activities, []);
          logger.log(`📊 Vérification finale: ${finalSavedActivities.length} activités dans le localStorage`);
        }
      } catch (err) {
        logger.error("❌ EXCEPTION lors de l'envoi à Supabase:", err);
        toast.error("Exception lors de l'envoi à Supabase. L'activité est quand même enregistrée en local. Vérifiez la console pour plus de détails.");
      }
    } else {
      logger.warn("⚠️ Supabase n'est pas disponible (stub)");
      const action = isEditing ? "modifiée" : "créée";
      toast.success(
        `✅ Activité "${activityData.name}" ${action}!\n` +
        `📦 Sauvegardée localement (Supabase non configuré).`
      );
      
      // Vérification que la sauvegarde locale s'est bien passée
      const finalSavedActivities = loadLS(LS_KEYS.activities, []);
      logger.log(`📊 Vérification finale (sans Supabase): ${finalSavedActivities.length} activités dans le localStorage`);
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

  // Fonction de vérification et synchronisation des activités
  const handleVerifyAndSync = useCallback(async () => {
    if (!supabase) {
      toast.warning("Supabase n'est pas configuré. Impossible de vérifier la synchronisation.");
      return;
    }

    logger.log("🔍 Vérification de la synchronisation des activités...");
    toast.info("Vérification en cours...");

    try {
      // 1. Récupérer toutes les activités locales
      const localActivities = loadLS(LS_KEYS.activities, []);
      logger.log(`📦 Activités locales: ${localActivities.length}`);

      // 2. Récupérer toutes les activités depuis Supabase
      const { data: supabaseActivities, error: fetchError } = await supabase
        .from("activities")
        .select("id, name, category, site_key")
        .eq("site_key", SITE_KEY);

      if (fetchError) {
        logger.error("❌ Erreur lors de la récupération depuis Supabase:", fetchError);
        toast.error("Erreur lors de la vérification. Vérifiez la console.");
        return;
      }

      logger.log(`☁️ Activités dans Supabase: ${supabaseActivities?.length || 0}`);

      // 3. Identifier les activités locales sans supabase_id
      const activitiesWithoutSupabaseId = localActivities.filter((a) => !a.supabase_id);
      logger.log(`⚠️ Activités locales sans supabase_id: ${activitiesWithoutSupabaseId.length}`);

      // 4. Identifier les activités qui existent dans Supabase mais pas localement
      const supabaseIds = new Set(supabaseActivities?.map((a) => a.id) || []);
      const localSupabaseIds = new Set(
        localActivities.filter((a) => a.supabase_id).map((a) => a.supabase_id)
      );
      const missingInLocal = supabaseActivities?.filter(
        (a) => !localSupabaseIds.has(a.id)
      ) || [];

      // 5. Synchroniser les activités sans supabase_id
      let syncedCount = 0;
      let errorCount = 0;
      const errors = [];

      for (const activity of activitiesWithoutSupabaseId) {
        try {
          // Préparer les données pour Supabase
          const supabaseData = {
            site_key: SITE_KEY,
            name: activity.name,
            category: activity.category || "desert",
            price_adult: activity.priceAdult || 0,
            price_child: activity.priceChild || 0,
            price_baby: activity.priceBaby || 0,
            age_child: activity.ageChild || "",
            age_baby: activity.ageBaby || "",
            currency: activity.currency || "EUR",
            available_days: activity.availableDays || [false, false, false, false, false, false, false],
            notes: activity.notes || "",
            transfers: activity.transfers || {},
          };

          // Vérifier si l'activité existe déjà dans Supabase
          const { data: existing } = await supabase
            .from("activities")
            .select("id")
            .eq("site_key", SITE_KEY)
            .eq("name", activity.name)
            .eq("category", activity.category || "desert")
            .limit(1);

          let supabaseId;
          if (existing && existing.length > 0) {
            // Utiliser l'ID existant
            supabaseId = existing[0].id;
            logger.log(`✅ Activité "${activity.name}" trouvée dans Supabase (ID: ${supabaseId})`);
          } else {
            // Créer une nouvelle activité
            const { data: newActivity, error: insertError } = await supabase
              .from("activities")
              .insert(supabaseData)
              .select("id")
              .single();

            if (insertError) {
              throw insertError;
            }
            supabaseId = newActivity.id;
            logger.log(`✅ Activité "${activity.name}" créée dans Supabase (ID: ${supabaseId})`);
          }

          // Mettre à jour l'activité locale avec le supabase_id
          const updatedActivities = localActivities.map((a) =>
            a.id === activity.id ? { ...a, supabase_id: supabaseId } : a
          );
          setActivities(updatedActivities);
          saveLS(LS_KEYS.activities, updatedActivities);
          syncedCount++;
        } catch (err) {
          errorCount++;
          errors.push({ name: activity.name, error: err.message || err });
          logger.error(`❌ Erreur lors de la synchronisation de "${activity.name}":`, err);
        }
      }

      // 6. Afficher le rapport
      const report = [
        `📊 Rapport de vérification:`,
        `📦 Activités locales: ${localActivities.length}`,
        `☁️ Activités dans Supabase: ${supabaseActivities?.length || 0}`,
        `✅ Activités synchronisées: ${syncedCount}`,
        missingInLocal.length > 0 ? `⚠️ Activités dans Supabase non trouvées localement: ${missingInLocal.length}` : null,
        errorCount > 0 ? `❌ Erreurs: ${errorCount}` : null,
      ]
        .filter(Boolean)
        .join("\n");

      logger.log(report);

      if (syncedCount > 0) {
        toast.success(
          `✅ Synchronisation terminée!\n` +
          `${syncedCount} activité(s) synchronisée(s).\n` +
          `Vérifiez la console pour plus de détails.`
        );
      } else if (activitiesWithoutSupabaseId.length === 0) {
        toast.success(
          `✅ Toutes les activités sont synchronisées!\n` +
          `${localActivities.length} activité(s) locale(s).\n` +
          `${supabaseActivities?.length || 0} activité(s) dans Supabase.`
        );
      } else {
        toast.warning(
          `⚠️ Synchronisation partielle.\n` +
          `${syncedCount} synchronisée(s), ${errorCount} erreur(s).\n` +
          `Vérifiez la console pour plus de détails.`
        );
      }

      if (errors.length > 0) {
        logger.error("❌ Erreurs détaillées:", errors);
      }
    } catch (err) {
      logger.error("❌ Erreur lors de la vérification:", err);
      toast.error("Erreur lors de la vérification. Vérifiez la console.");
    }
  }, [activities, setActivities, supabase]);

  // Sauvegarde complète de toutes les activités (fichier JSON téléchargé)
  const handleBackup = useCallback(() => {
    const list = loadLS(LS_KEYS.activities, []);
    if (list.length === 0) {
      toast.warning("Aucune activité à sauvegarder.");
      return;
    }
    try {
      const backup = downloadBackup(list, SITE_KEY);
      saveLS(LS_KEYS.activities, list);
      logger.log(`💾 Sauvegarde créée: ${backup.count} activités → ${getBackupFilename()}`);
      toast.success(
        `✅ Sauvegarde créée !\n${backup.count} activité(s) exportée(s).\nFichier téléchargé.`
      );
    } catch (err) {
      logger.error("❌ Erreur lors de la sauvegarde:", err);
      toast.error("Erreur lors de la création de la sauvegarde.");
    }
  }, []);

  // Restauration depuis un fichier de sauvegarde
  const handleRestoreClick = useCallback(() => {
    restoreFileInputRef.current?.click();
  }, []);

  const handleRestoreFileChange = useCallback(
    (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      e.target.value = "";

      const reader = new FileReader();
      reader.onload = () => {
        const raw = reader.result;
        const { ok, backup, error } = parseBackupFile(raw);
        if (!ok || !backup) {
          toast.error(`Fichier invalide: ${error}`);
          return;
        }
        const count = backup.activities?.length || 0;
        if (count === 0) {
          toast.warning("La sauvegarde ne contient aucune activité.");
          return;
        }

        const currentActivities = loadLS(LS_KEYS.activities, []);
        const mode = currentActivities.length === 0 ? "replace" : null;
        if (mode === "replace") {
          setActivities(backup.activities);
          saveLS(LS_KEYS.activities, backup.activities);
          logger.log(`📂 Restauration: ${count} activités (remplacement)`);
          toast.success(`✅ Restauration terminée ! ${count} activité(s) restaurée(s).`);
          return;
        }

        const replace = window.confirm(
          `La sauvegarde contient ${count} activité(s). Vous avez actuellement ${currentActivities.length} activité(s).\n\n` +
            `Cliquer OK pour REMPLACER toutes les activités par la sauvegarde.\n` +
            `Cliquer Annuler pour FUSIONNER (garder les actuelles + ajouter les manquantes).`
        );
        const finalList = replace
          ? restoreFromBackup(backup, "replace")
          : restoreFromBackup(backup, "merge", currentActivities);
        setActivities(finalList);
        saveLS(LS_KEYS.activities, finalList);
        logger.log(`📂 Restauration: ${finalList.length} activités (${replace ? "remplacement" : "fusion"})`);
        toast.success(`✅ Restauration terminée ! ${finalList.length} activité(s).`);
      };
      reader.onerror = () => toast.error("Impossible de lire le fichier.");
      reader.readAsText(file, "UTF-8");
    },
    [setActivities]
  );

  const handleDelete = useCallback(async (id) => {
    if (!canModifyActivities) {
      toast.warning("Seuls Léa, Laly et Ewen peuvent supprimer les activités.");
      return;
    }
    const activityToDelete = activitiesMap.get(id);
    const activityName = activityToDelete?.name || "cette activité";
    if (!window.confirm(`Êtes-vous sûr de vouloir supprimer l'activité "${activityName}" ?\n\nCette action est irréversible et supprimera définitivement l'activité.`)) return;
    
    // Log détaillé de la suppression pour audit
    logger.warn("🗑️ SUPPRESSION D'ACTIVITÉ INITIÉE:", {
      id: id,
      supabase_id: activityToDelete?.supabase_id,
      name: activityName,
      category: activityToDelete?.category,
      timestamp: new Date().toISOString(),
      user: user?.name || "Utilisateur inconnu"
    });
    
    setActivities((prevActivities) => {
      const next = prevActivities.filter((a) => a.id !== id);
      saveLS(LS_KEYS.activities, next);
      logger.log(`📦 Activité supprimée localement. ${next.length} activités restantes.`);
      return next;
    });
    
    // Supprimer de Supabase si configuré
    if (supabase && activityToDelete?.supabase_id) {
      try {
        logger.log(`🔄 Tentative de suppression dans Supabase (ID: ${activityToDelete.supabase_id})...`);
        const { error, data } = await supabase
          .from("activities")
          .delete()
          .eq("id", activityToDelete.supabase_id)
          .select(); // Récupérer les données supprimées pour confirmation
        
        if (error) {
          logger.error("❌ Erreur lors de la suppression dans Supabase:", {
            error: error,
            activity_id: activityToDelete.supabase_id,
            activity_name: activityName,
            error_code: error.code,
            error_message: error.message
          });
          toast.error("Erreur lors de la suppression dans Supabase. L'activité a été supprimée localement.");
        } else {
          logger.log("✅ Activité supprimée de Supabase avec succès!", {
            supabase_id: activityToDelete.supabase_id,
            activity_name: activityName,
            deleted_data: data
          });
        }
      } catch (err) {
        logger.error("❌ Exception lors de la suppression dans Supabase:", {
          exception: err,
          activity_id: activityToDelete.supabase_id,
          activity_name: activityName,
          stack: err.stack
        });
        toast.error("Exception lors de la suppression dans Supabase. L'activité a été supprimée localement.");
      }
    } else {
      logger.warn("⚠️ Suppression locale uniquement (pas de supabase_id ou Supabase non configuré)", {
        has_supabase: !!supabase,
        has_supabase_id: !!activityToDelete?.supabase_id
      });
    }
  }, [canModifyActivities, activitiesMap, user]);

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

  // Quand une recherche ou un filtre par jour est actif, ouvrir automatiquement les catégories qui ont des résultats
  const hasActiveFilter = Boolean(debouncedSearchQuery.trim() || selectedDay !== "");
  useEffect(() => {
    if (!hasActiveFilter) return;
    setOpenCategories((prev) => {
      const next = { ...prev };
      CATEGORIES.forEach((c) => {
        const count = (grouped[c.key] || []).length;
        if (count > 0) next[c.key] = true;
      });
      return next;
    });
  }, [hasActiveFilter, debouncedSearchQuery, selectedDay, grouped]);

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

  // Ligne de table : style épuré
  const ActivityRow = memo(({ activity, onEdit, onDelete, onOpenDescription, canModify }) => {
    const hasDescription = !!activity.description;
    const availableDaysList = useMemo(() => {
      return WEEKDAYS.filter((d, dayIdx) => activity.availableDays?.[dayIdx]);
    }, [activity.availableDays]);

    return (
      <tr className="border-t border-indigo-100 hover:bg-indigo-100/60 transition-colors">
        <td className="px-4 py-3 font-semibold text-indigo-900 text-sm">{activity.name}</td>
        <td className="px-4 py-3 text-emerald-700 text-sm tabular-nums font-medium">{currency(activity.priceAdult, activity.currency)}</td>
        <td className="px-4 py-3 text-emerald-600 text-sm tabular-nums font-medium">{currency(activity.priceChild, activity.currency)}</td>
        <td className="px-4 py-3 text-emerald-600 text-sm tabular-nums font-medium">{currency(activity.priceBaby, activity.currency)}</td>
        <td className="px-4 py-3">
          <div className="flex gap-1.5 flex-wrap">
            {availableDaysList.map((d) => (
              <span
                key={d.key}
                className="px-2.5 py-1 rounded-lg bg-emerald-200 text-emerald-800 text-xs font-bold border border-emerald-300/60"
              >
                {d.label}
              </span>
            ))}
          </div>
        </td>
        <td className="px-4 py-3 text-slate-600 text-xs max-w-[140px] truncate" title={activity.notes || ""}>
          {activity.notes || "—"}
        </td>
        <td className="px-4 py-3 text-right">
          <div className="flex gap-2 justify-end flex-wrap">
            <button
              type="button"
              onClick={() => onOpenDescription(activity)}
              className={`text-xs font-semibold px-3 py-2 rounded-lg transition-colors ${
                hasDescription
                  ? "bg-emerald-200 text-emerald-800 hover:bg-emerald-300 border border-emerald-300"
                  : "bg-slate-200 text-slate-700 hover:bg-slate-300 border border-slate-300"
              }`}
            >
              📝 Description{hasDescription ? " ✓" : ""}
            </button>
            {canModify && (
              <>
                <button
                  type="button"
                  onClick={() => onEdit(activity)}
                  className="text-xs font-semibold px-3 py-2 rounded-lg bg-indigo-200 text-indigo-800 hover:bg-indigo-300 border border-indigo-300 transition-colors"
                >
                  ✏️ Modifier
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(activity.id)}
                  className="text-xs font-semibold px-3 py-2 rounded-lg bg-red-200 text-red-800 hover:bg-red-300 border border-red-300 transition-colors"
                >
                  🗑️ Supprimer
                </button>
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

  const totalActivities = activities.length;

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-6 md:space-y-8 max-w-6xl mx-auto">
      {/* En-tête coloré */}
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b-2 border-indigo-200 rounded-xl px-5 py-5 bg-gradient-to-r from-indigo-500/10 via-violet-500/10 to-blue-500/10">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center flex-shrink-0 shadow-lg shadow-indigo-500/30">
            <span className="text-white text-xl">🎯</span>
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-indigo-900 tracking-tight">
              Gestion des activités
            </h1>
            <p className="text-sm text-indigo-600 mt-1 font-medium">
              {totalActivities} activité{totalActivities !== 1 ? "s" : ""} · Prix, jours et transferts par quartier
            </p>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          {user?.canAddActivity && (
            <PrimaryBtn
              onClick={handleToggleForm}
              className="w-full sm:w-auto text-sm font-semibold px-6 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 border-0 shadow-lg shadow-indigo-500/25"
            >
              {showForm ? "Annuler" : "➕ Ajouter une activité"}
            </PrimaryBtn>
          )}
          {supabase && (
            <PrimaryBtn
              onClick={handleVerifyAndSync}
              className="w-full sm:w-auto text-sm font-semibold px-6 py-3 rounded-xl bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 border-0 shadow-lg shadow-green-500/25"
            >
              🔍 Vérifier & Synchroniser
            </PrimaryBtn>
          )}
          <PrimaryBtn
            onClick={handleBackup}
            className="w-full sm:w-auto text-sm font-semibold px-6 py-3 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 border-0 shadow-lg shadow-amber-500/25"
          >
            💾 Sauvegarder tout
          </PrimaryBtn>
          <>
            <input
              ref={restoreFileInputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={handleRestoreFileChange}
            />
            <PrimaryBtn
              onClick={handleRestoreClick}
              className="w-full sm:w-auto text-sm font-semibold px-6 py-3 rounded-xl bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-700 hover:to-blue-700 border-0 shadow-lg shadow-sky-500/25"
            >
              📂 Restaurer une sauvegarde
            </PrimaryBtn>
          </>
        </div>
      </header>

      {/* Filtres - bloc coloré */}
      <section className="rounded-xl border-2 border-indigo-200 p-5 md:p-6 shadow-md bg-gradient-to-br from-indigo-50 via-white to-violet-50">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-indigo-500 flex items-center justify-center shadow-md">
            <span className="text-white text-lg">🔍</span>
          </div>
          <h2 className="text-base font-bold text-indigo-900">Recherche et filtres</h2>
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-indigo-700/80 uppercase tracking-wider mb-1.5">
              Recherche
            </label>
            <TextInput
              placeholder="Nom, notes ou description..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="text-sm rounded-lg border-indigo-200 focus:ring-indigo-500/30 focus:border-indigo-400"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-indigo-700/80 uppercase tracking-wider mb-1.5">
              Jour
            </label>
            <select
              value={selectedDay}
              onChange={(e) => setSelectedDay(e.target.value)}
              className="w-full rounded-lg border border-indigo-200 bg-white px-3 py-2.5 text-sm text-slate-800 focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400"
            >
              <option value="">Tous les jours</option>
              {WEEKDAYS.map((day) => (
                <option key={day.key} value={day.key}>
                  {day.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-4 pt-4 border-t-2 border-indigo-200/60">
          <span className="text-xs font-semibold text-indigo-700">Catégories</span>
          <button
            type="button"
            onClick={openAllCategories}
            className="text-xs font-semibold px-3 py-2 rounded-lg bg-indigo-500 text-white hover:bg-indigo-600 transition-colors shadow-sm"
          >
            Ouvrir tout
          </button>
          <button
            type="button"
            onClick={closeAllCategories}
            className="text-xs font-semibold px-3 py-2 rounded-lg bg-violet-100 text-violet-700 hover:bg-violet-200 transition-colors"
          >
            Fermer tout
          </button>
        </div>
      </section>

      {showForm && (
        <form ref={formRef} onSubmit={handleCreate} className="bg-white rounded-xl border-2 border-indigo-200 shadow-lg overflow-hidden">
          <div className="px-6 py-5 border-b-2 border-indigo-300 bg-indigo-800">
            <h2 className="text-lg font-bold mt-0" style={{ color: "#fff", textShadow: "0 1px 3px rgba(0,0,0,0.5)" }}>
              {editingId ? "✏️ Modifier l'activité" : "➕ Nouvelle activité"}
            </h2>
            <p className="text-sm font-medium mt-1" style={{ color: "#fff", textShadow: "0 1px 3px rgba(0,0,0,0.5)" }}>
              {editingId ? "Modifiez les champs ci-dessous" : "Renseignez les informations de l'activité"}
            </p>
          </div>
          <div className="p-5 md:p-6 space-y-6">
            <div className="rounded-xl p-4 bg-indigo-50/80 border border-indigo-200">
              <h3 className="text-xs font-bold text-indigo-700 uppercase tracking-wider mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-indigo-500" /> Informations de base
              </h3>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Nom *</label>
                  <TextInput
                    placeholder="Ex: Snorkeling"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    className="text-sm rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Catégorie *</label>
                  <select
                    value={form.category}
                    onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                    className="w-full rounded-lg border border-indigo-200 bg-white px-3 py-2.5 text-sm text-slate-800 focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400"
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

            <div className="rounded-xl p-4 bg-emerald-50/80 border border-emerald-200">
              <h3 className="text-xs font-bold text-emerald-700 uppercase tracking-wider mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500" /> Tarification
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Adulte</label>
                  <NumberInput
                    placeholder="0"
                    value={form.priceAdult}
                    onChange={(e) => setForm((f) => ({ ...f, priceAdult: e.target.value }))}
                    className="text-sm rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Enfant</label>
                  <NumberInput
                    placeholder="0"
                    value={form.priceChild}
                    onChange={(e) => setForm((f) => ({ ...f, priceChild: e.target.value }))}
                    className="text-sm rounded-lg"
                  />
                  <TextInput
                    placeholder="Âge (ex: 5-12 ans)"
                    value={form.ageChild}
                    onChange={(e) => setForm((f) => ({ ...f, ageChild: e.target.value }))}
                    className="mt-1.5 text-xs rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Bébé</label>
                  <NumberInput
                    placeholder="0"
                    value={form.priceBaby}
                    onChange={(e) => setForm((f) => ({ ...f, priceBaby: e.target.value }))}
                    className="text-sm rounded-lg"
                  />
                  <TextInput
                    placeholder="Âge (ex: 0-4 ans)"
                    value={form.ageBaby}
                    onChange={(e) => setForm((f) => ({ ...f, ageBaby: e.target.value }))}
                    className="mt-1.5 text-xs rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Devise</label>
                  <TextInput
                    placeholder="EUR"
                    value={form.currency}
                    onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value.toUpperCase() }))}
                    className="text-sm rounded-lg font-medium"
                  />
                </div>
              </div>
            </div>

            <div className="rounded-xl p-4 bg-amber-50/80 border border-amber-200">
              <h3 className="text-xs font-bold text-amber-700 uppercase tracking-wider mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-500" /> Jours disponibles
              </h3>
              <DaysSelector value={form.availableDays} onChange={(v) => setForm((f) => ({ ...f, availableDays: v }))} />
            </div>

            <div className="rounded-xl p-4 bg-violet-50/80 border border-violet-200">
              <h3 className="text-xs font-bold text-violet-700 uppercase tracking-wider mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-violet-500" /> Transferts par quartier
              </h3>
              <p className="text-xs text-slate-500 mb-3">Matin / Après-midi / Soir, heures et suppléments par quartier</p>
              <TransfersEditor value={form.transfers} onChange={(v) => setForm((f) => ({ ...f, transfers: v }))} />
            </div>

            <div className="rounded-xl p-4 bg-slate-100/80 border border-slate-200">
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">📌 Notes (facultatif)</label>
              <TextInput
                placeholder="Remarques, infos complémentaires..."
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                className="text-sm rounded-lg border-slate-200"
              />
            </div>

            <div className="flex justify-end pt-4">
              <PrimaryBtn type="submit" className="text-sm font-semibold px-6 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 border-0 shadow-lg shadow-indigo-500/25">
                {editingId ? "💾 Enregistrer les modifications" : "✅ Créer l'activité"}
              </PrimaryBtn>
            </div>
          </div>
        </form>
      )}

      {/* Liste des catégories en accordéon */}
      <section className="bg-white rounded-xl border-2 border-indigo-200 shadow-lg overflow-hidden">
        <div className="px-6 py-5 border-b-2 border-indigo-300 bg-indigo-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center">
              <span className="text-white text-lg">📂</span>
            </div>
            <div>
              <h2 className="text-lg font-bold mt-0" style={{ color: "#fff", textShadow: "0 1px 3px rgba(0,0,0,0.5)" }}>Activités par catégorie</h2>
              <p className="text-sm font-medium mt-0.5" style={{ color: "#fff", textShadow: "0 1px 3px rgba(0,0,0,0.5)" }}>Cliquez sur une catégorie pour afficher les activités</p>
            </div>
          </div>
        </div>
        <div className="p-4 space-y-3 bg-gradient-to-b from-slate-50/50 to-white">
          {CATEGORIES.map((cat) => {
            const activitiesInCategory = grouped[cat.key] || [];
            const isOpen = openCategories[cat.key];
            const count = activitiesInCategory.length;

            return (
              <div
                key={cat.key}
                data-category={cat.key}
                className="rounded-xl border-2 overflow-hidden transition-all hover:shadow-lg"
                style={{
                  contentVisibility: "auto",
                  containIntrinsicSize: "auto 56px",
                  borderColor: isOpen ? "rgb(99 102 241)" : "rgb(226 232 240)",
                  backgroundColor: isOpen ? "rgb(238 242 255)" : "white",
                }}
              >
                <button
                  type="button"
                  onClick={() => toggleCategory(cat.key)}
                  className={`w-full flex items-center gap-3 px-4 py-4 text-left transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-400 ${
                    isOpen
                      ? "bg-gradient-to-r from-indigo-100 to-violet-100 hover:from-indigo-200 hover:to-violet-200"
                      : "bg-white hover:bg-indigo-50/80"
                  }`}
                  aria-expanded={isOpen}
                  aria-controls={`category-content-${cat.key}`}
                  id={`category-header-${cat.key}`}
                >
                  <span className="flex-shrink-0 w-10 h-10 rounded-xl bg-indigo-800 flex items-center justify-center text-base font-bold shadow-md" style={{ color: "#fff", textShadow: "0 1px 2px rgba(0,0,0,0.6)" }}>
                    {cat.label.charAt(0)}
                  </span>
                  <span className="flex-1 min-w-0 text-sm font-semibold text-slate-800 truncate">
                    {cat.label}
                  </span>
                  <span className="text-xs font-bold text-indigo-700 tabular-nums bg-indigo-200 px-3 py-1 rounded-lg">
                    {count} activité{count !== 1 ? "s" : ""}
                  </span>
                  <svg
                    className={`flex-shrink-0 w-5 h-5 text-indigo-600 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                <div
                  id={`category-content-${cat.key}`}
                  role="region"
                  aria-labelledby={`category-header-${cat.key}`}
                  className={`overflow-hidden transition-all duration-200 ease-out ${
                    isOpen ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0"
                  }`}
                >
                  <div className="overflow-x-auto" style={{ WebkitOverflowScrolling: "touch" }}>
                    <table className="w-full text-sm min-w-[640px]">
                      <thead>
                        <tr className="border-b-2 border-indigo-200 bg-gradient-to-r from-indigo-100 to-violet-100">
                          <th className="text-left py-3 px-4 text-xs font-bold text-indigo-900 uppercase tracking-wider">Activité</th>
                          <th className="text-left py-3 px-4 text-xs font-bold text-indigo-900 uppercase tracking-wider">Adulte</th>
                          <th className="text-left py-3 px-4 text-xs font-bold text-indigo-900 uppercase tracking-wider">Enfant</th>
                          <th className="text-left py-3 px-4 text-xs font-bold text-indigo-900 uppercase tracking-wider">Bébé</th>
                          <th className="text-left py-3 px-4 text-xs font-bold text-indigo-900 uppercase tracking-wider">Jours</th>
                          <th className="text-left py-3 px-4 text-xs font-bold text-indigo-900 uppercase tracking-wider">Notes</th>
                          <th className="text-right py-3 px-4 text-xs font-bold text-indigo-900 uppercase tracking-wider">Actions</th>
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
                            <td colSpan={7} className="py-12 text-center bg-indigo-50/50">
                              <p className="text-sm font-medium text-indigo-600">Aucune activité dans cette catégorie</p>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Modal description */}
      {descriptionModal.isOpen && descriptionModal.activity && (
        <div
          ref={descriptionModalRef}
          className="fixed inset-0 bg-indigo-900/30 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
          onClick={handleCloseDescriptionModal}
        >
          <div
            className="bg-white rounded-xl border-2 border-indigo-300 shadow-2xl max-w-lg w-full max-h-[85vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b-2 border-indigo-200 bg-gradient-to-r from-indigo-500 to-violet-600 flex items-center justify-between">
              <h3 className="text-base font-bold text-white">
                📝 Description · {descriptionModal.activity.name}
              </h3>
              <button
                type="button"
                onClick={handleCloseDescriptionModal}
                className="p-2 rounded-lg text-white/90 hover:text-white hover:bg-white/20 transition-colors"
                aria-label="Fermer"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-5 flex-1 overflow-y-auto bg-slate-50/50">
              <textarea
                ref={textareaRefCallback}
                value={descriptionModal.description}
                onChange={(e) => setDescriptionModal((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="Description de l'activité..."
                disabled={user?.name !== "Ewen"}
                readOnly={user?.name !== "Ewen"}
                className={`w-full h-40 rounded-xl border-2 border-indigo-200 px-4 py-3 text-sm text-slate-800 placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 resize-none ${
                  user?.name !== "Ewen" ? "bg-amber-50/50 cursor-not-allowed" : ""
                }`}
              />
              {user?.name !== "Ewen" && (
                <p className="text-xs font-medium text-amber-700 mt-2 bg-amber-100 px-2 py-1.5 rounded-lg">Seul Ewen peut modifier la description.</p>
              )}
            </div>
            <div className="px-6 py-4 border-t-2 border-indigo-200 flex gap-3 justify-end bg-gradient-to-r from-indigo-50 to-violet-50">
              <button
                type="button"
                onClick={handleCloseDescriptionModal}
                className="text-sm font-semibold px-4 py-2.5 rounded-lg text-slate-600 hover:bg-slate-200 transition-colors"
              >
                Fermer
              </button>
              {user?.name === "Ewen" && (
                <PrimaryBtn onClick={handleSaveDescription} className="text-sm font-semibold px-5 py-2.5 rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 border-0 shadow-md">
                  💾 Enregistrer
                </PrimaryBtn>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

