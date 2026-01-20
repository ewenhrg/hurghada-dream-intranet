import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { supabase } from "../lib/supabase";
import { SITE_KEY, LS_KEYS, NEIGHBORHOODS, CATEGORIES } from "../constants";
import { SPEED_BOAT_EXTRAS } from "../constants/activityExtras";
import { uuid, currency, currencyNoCents, calculateCardPrice, saveLS, loadLS, cleanPhoneNumber } from "../utils";
import { isBuggyActivity, getBuggyPrices, isMotoCrossActivity, getMotoCrossPrices, isZeroTracasActivity, getZeroTracasPrices, isZeroTracasHorsZoneActivity, getZeroTracasHorsZonePrices } from "../utils/activityHelpers";
import { TextInput, NumberInput, PrimaryBtn, GhostBtn } from "../components/ui";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { ColoredDatePicker } from "../components/ColoredDatePicker";
import { toast } from "../utils/toast.js";
import { logger } from "../utils/logger";
import { StopPushSalesSummary } from "../components/quotes/StopPushSalesSummary";
import { PaymentModal } from "../components/quotes/PaymentModal";
import { QuoteSummary } from "../components/quotes/QuoteSummary";
import { NotesSection } from "../components/quotes/NotesSection";
import { useActivityPriceCalculator } from "../hooks/useActivityPriceCalculator";
import { useAutoFillDates } from "../hooks/useAutoFillDates";
import { useDebounce } from "../hooks/useDebounce";
import { salesCache, appCache, createCacheKey } from "../utils/cache";

export function QuotesPage({ activities, quotes, setQuotes, user, draft, setDraft, onUsedDatesChange }) {
  const [stopSales, setStopSales] = useState([]);
  const [pushSales, setPushSales] = useState([]);
  const [hotels, setHotels] = useState([]);

  // Map des activités pour des recherches O(1) au lieu de O(n)
  const activitiesMap = useMemo(() => {
    const map = new Map();
    activities.forEach((activity) => {
      if (activity.id) map.set(activity.id, activity);
      if (activity.supabase_id) map.set(activity.supabase_id, activity);
    });
    return map;
  }, [activities]);

  // Map des stop sales pour des recherches O(1) : clé = "activityId_date"
  // Créer des entrées pour tous les IDs possibles (id local et supabase_id) pour chaque activité
  const stopSalesMap = useMemo(() => {
    const map = new Map();
    stopSales.forEach((stop) => {
      const date = stop.date;
      const activityId = String(stop.activity_id || '');
      
      // Créer une clé avec l'ID du stop sale
      const key = `${activityId}_${date}`;
      map.set(key, stop);
      
      // Si une activité correspond à cet ID, créer aussi des clés avec ses autres IDs possibles
      const activity = activitiesMap.get(activityId);
      if (activity) {
        // Ajouter avec l'ID local si différent
        if (activity.id && String(activity.id) !== activityId) {
          map.set(`${activity.id}_${date}`, stop);
        }
        // Ajouter avec le supabase_id si différent
        if (activity.supabase_id && String(activity.supabase_id) !== activityId) {
          map.set(`${activity.supabase_id}_${date}`, stop);
        }
      }
    });
    return map;
  }, [stopSales, activitiesMap]);

  // Map des push sales pour des recherches O(1) : clé = "activityId_date"
  // Créer des entrées pour tous les IDs possibles (id local et supabase_id) pour chaque activité
  const pushSalesMap = useMemo(() => {
    const map = new Map();
    pushSales.forEach((push) => {
      const date = push.date;
      const activityId = String(push.activity_id || '');
      
      // Créer une clé avec l'ID du push sale
      const key = `${activityId}_${date}`;
      map.set(key, push);
      
      // Si une activité correspond à cet ID, créer aussi des clés avec ses autres IDs possibles
      const activity = activitiesMap.get(activityId);
      if (activity) {
        // Ajouter avec l'ID local si différent
        if (activity.id && String(activity.id) !== activityId) {
          map.set(`${activity.id}_${date}`, push);
        }
        // Ajouter avec le supabase_id si différent
        if (activity.supabase_id && String(activity.supabase_id) !== activityId) {
          map.set(`${activity.supabase_id}_${date}`, push);
        }
      }
    });
    return map;
  }, [pushSales, activitiesMap]);

  const blankItemMemo = useCallback(() => ({
    activityId: "",
    date: new Date().toISOString().slice(0, 10),
    adults: "",
    children: 0,
    babies: 0,
    extraLabel: "",
    extraAmount: "",
    slot: "",
    extraDolphin: false,
    speedBoatExtra: [], // Array pour permettre plusieurs extras
    buggySimple: "",
    buggyFamily: "",
    yamaha250: "",
    ktm640: "",
    ktm530: "",
    allerSimple: false, // Pour HURGHADA - LE CAIRE et HURGHADA - LOUXOR
    allerRetour: false, // Pour HURGHADA - LE CAIRE et HURGHADA - LOUXOR
    zeroTracasTransfertVisaSim: "", // Pour ZERO TRACAS
    zeroTracasTransfertVisa: "", // Pour ZERO TRACAS
    zeroTracasTransfert3Personnes: "", // Pour ZERO TRACAS
    zeroTracasTransfertPlus3Personnes: "", // Pour ZERO TRACAS
    zeroTracasVisaSim: "", // Pour ZERO TRACAS
    zeroTracasVisaSeul: "", // Pour ZERO TRACAS
  }), []);

  const defaultClient = draft?.client || {
    name: "",
    phone: "",
    email: "",
    hotel: "",
    room: "",
    neighborhood: "",
    arrivalDate: "",
    departureDate: "",
  };
  
  const [client, setClient] = useState(() => defaultClient);
  
  // Debounce pour le nom de l'hôtel (attendre 800ms après la fin de la saisie)
  const debouncedHotelName = useDebounce(client.hotel, 800);
  
  const [items, setItems] = useState(() => (draft?.items && draft.items.length > 0 ? draft.items : [blankItemMemo()]));
  const [notes, setNotes] = useState(() => draft?.notes || "");
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedQuote, setSelectedQuote] = useState(null);
  const [ticketNumbers, setTicketNumbers] = useState({});
  const [paymentMethods, setPaymentMethods] = useState({}); // { index: "cash" | "stripe" }
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // État pour les suggestions de dates automatiques
  const [autoFillDates, setAutoFillDates] = useState(false);
  
  // État pour le nombre d'adultes global
  const [globalAdults, setGlobalAdults] = useState("");

  // États pour les confirmations
  const [confirmDeleteItem, setConfirmDeleteItem] = useState({ isOpen: false, index: null, activityName: "" });
  const [confirmResetForm, setConfirmResetForm] = useState(false);
  
  // État pour la modal de suggestions
  const [showSuggestionsModal, setShowSuggestionsModal] = useState(false);
  const [suggestedActivities, setSuggestedActivities] = useState([]);
  const [openCategories, setOpenCategories] = useState(new Set());

  // Grouper les suggestions par catégorie
  const suggestionsByCategory = useMemo(() => {
    const grouped = {};
    
    // Initialiser toutes les catégories
    CATEGORIES.forEach((cat) => {
      grouped[cat.key] = {
        label: cat.label,
        activities: [],
      };
    });
    
    // Grouper les suggestions par catégorie
    suggestedActivities.forEach((suggestion) => {
      const category = suggestion.activity.category || "desert";
      if (!grouped[category]) {
        grouped[category] = {
          label: category,
          activities: [],
        };
      }
      grouped[category].activities.push(suggestion);
    });
    
    // Retourner seulement les catégories qui ont des activités
    return Object.entries(grouped)
      .filter(([_, data]) => data.activities.length > 0)
      .map(([key, data]) => ({ key, ...data }));
  }, [suggestedActivities]);

  // Propager le brouillon vers l'état global pour persister lors d'un changement d'onglet
  useEffect(() => {
    if (setDraft) {
      setDraft({
        client,
        items,
        notes,
      });
    }
  }, [client, items, notes, setDraft]);

  useEffect(() => {
    if (selectedQuote) {
      setClient({
        ...selectedQuote.client,
        arrivalDate: selectedQuote.clientArrivalDate || selectedQuote.client?.arrivalDate || "",
        departureDate: selectedQuote.clientDepartureDate || selectedQuote.client?.departureDate || "",
      });
      const quoteItems = selectedQuote.items?.length
        ? selectedQuote.items.map((item) => ({
            ...item,
            speedBoatExtra: Array.isArray(item.speedBoatExtra)
              ? item.speedBoatExtra
              : item.speedBoatExtra
                ? [item.speedBoatExtra]
                : [],
          }))
        : [blankItemMemo()];
      setItems(quoteItems);
      setNotes(selectedQuote.notes || "");
      // Définir le nombre d'adultes global si toutes les activités ont le même nombre
      if (quoteItems.length > 0) {
        const firstAdults = quoteItems[0]?.adults || "";
        const allSame = quoteItems.every((item) => (item.adults || "") === firstAdults);
        if (allSame && firstAdults) {
          setGlobalAdults(firstAdults);
        } else {
          setGlobalAdults("");
        }
      }
    }
  }, [selectedQuote, blankItemMemo]);

  const setItem = useCallback((i, patch) => {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }, []);
  
  const addItem = useCallback(() => {
    setItems((prev) => [...prev, { ...blankItemMemo(), adults: globalAdults || "" }]);
  }, [blankItemMemo, globalAdults]);
  
  const removeItem = useCallback((i) => {
    // Suppression directe sans confirmation
    const itemToRemove = items[i];
    const activityName = activitiesMap.get(itemToRemove?.activityId)?.name || "cette activité";
    setItems((prev) => prev.filter((_, idx) => idx !== i));
    toast.success(`Activité "${activityName}" supprimée du devis.`);
  }, [items, activitiesMap]);

  const handleConfirmDeleteItem = useCallback(() => {
    if (confirmDeleteItem.index !== null) {
      setItems((prev) => prev.filter((_, idx) => idx !== confirmDeleteItem.index));
      toast.success("Activité supprimée du devis.");
    }
    setConfirmDeleteItem({ isOpen: false, index: null, activityName: "" });
  }, [confirmDeleteItem.index]);
  
  const resetQuoteForm = useCallback(() => {
    const emptyClient = {
      name: "",
      phone: "",
      email: "",
      hotel: "",
      room: "",
      neighborhood: "",
      arrivalDate: "",
      departureDate: "",
    };
    setClient(emptyClient);
    setItems([blankItemMemo()]);
    setNotes("");
    setTicketNumbers({});
    setPaymentMethods({});
    setGlobalAdults("");
    if (setDraft) {
      setDraft(null);
    }
  }, [blankItemMemo, setDraft]);

  // Charger les hôtels depuis Supabase avec cache
  useEffect(() => {
    async function loadHotels() {
      if (!supabase) return;
      try {
        // Vérifier le cache d'abord
        const cacheKey = createCacheKey("hotels", SITE_KEY);
        const cached = appCache.get(cacheKey);
        if (cached) {
          setHotels(cached);
          return;
        }

        // Sélection spécifique pour réduire la taille des données
        const { data, error } = await supabase
          .from("hotels")
          .select("id, name, neighborhood_key")
          .eq("site_key", SITE_KEY)
          .order("name", { ascending: true });

        if (error) {
          logger.error("Erreur lors du chargement des hôtels:", error);
        } else {
          const hotelsData = data || [];
          setHotels(hotelsData);
          // Mettre en cache (TTL de 10 minutes car les hôtels changent rarement)
          appCache.set(cacheKey, hotelsData, 10 * 60 * 1000);
        }
      } catch (err) {
        logger.error("Erreur lors du chargement des hôtels:", err);
      }
    }

    loadHotels();
  }, []);

  // Fonction pour rechercher et auto-sélectionner le quartier
  const detectHotelNeighborhood = useCallback((hotelName) => {
    if (!hotelName || !hotelName.trim() || hotels.length === 0) return;
    
    const hotelNameLower = hotelName.toLowerCase().trim();
    
    // Chercher uniquement une correspondance exacte (pas de recherche partielle)
    const foundHotel = hotels.find((h) => 
      h.name.toLowerCase().trim() === hotelNameLower
    );
    
    if (foundHotel && foundHotel.neighborhood_key !== client.neighborhood) {
      // Auto-sélectionner le quartier si l'hôtel est trouvé et que le quartier est différent
      setClient((c) => ({ 
        ...c, 
        neighborhood: foundHotel.neighborhood_key 
      }));
      const neighborhoodLabel = NEIGHBORHOODS.find((n) => n.key === foundHotel.neighborhood_key)?.label || foundHotel.neighborhood_key;
      toast.success(`Quartier détecté automatiquement : ${neighborhoodLabel}`, { duration: 3000 });
    }
  }, [hotels, client.neighborhood]);

  // Détecter le quartier après le debounce (quand l'utilisateur a fini d'écrire)
  useEffect(() => {
    if (debouncedHotelName && debouncedHotelName.trim().length >= 3) {
      detectHotelNeighborhood(debouncedHotelName);
    }
  }, [debouncedHotelName, detectHotelNeighborhood]);

  // Charger les stop sales et push sales depuis Supabase avec cache et Realtime
  useEffect(() => {
    async function loadStopSalesAndPushSales() {
      if (!supabase) return;
      try {
        const today = new Date().toISOString().split('T')[0];
        const cacheKey = createCacheKey("sales", SITE_KEY, today);
        
        // Vérifier le cache d'abord pour améliorer les performances
        const cached = salesCache.get(cacheKey);
        if (cached && cached.stopSales && cached.pushSales) {
          // Utiliser le cache mais vérifier quand même les expirés en arrière-plan
          setStopSales(cached.stopSales);
          setPushSales(cached.pushSales);
          
          // Vérifier les expirés en arrière-plan sans bloquer l'UI
          setTimeout(async () => {
            const expiredStopSales = cached.stopSales.filter(s => s.date <= today);
            const expiredPushSales = cached.pushSales.filter(p => p.date <= today);
            
            if (expiredStopSales.length > 0 || expiredPushSales.length > 0) {
              // Recharger pour avoir les données à jour
              loadStopSalesAndPushSales();
            }
          }, 100);
          return;
        }
        
        // Charger les stop sales et push sales (récupérer aussi ceux du jour même pour les supprimer)
        // On récupère depuis hier pour être sûr de ne rien manquer
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];
        
        // Sélection spécifique pour réduire la taille des données
        const [stopSalesResult, pushSalesResult] = await Promise.all([
          supabase.from("stop_sales").select("id, activity_id, date").eq("site_key", SITE_KEY).gte("date", yesterdayStr),
          supabase.from("push_sales").select("id, activity_id, date").eq("site_key", SITE_KEY).gte("date", yesterdayStr),
        ]);

        // Traiter les stop sales
        let stopSalesData = (!stopSalesResult.error && stopSalesResult.data) ? stopSalesResult.data : [];
        let pushSalesData = (!pushSalesResult.error && pushSalesResult.data) ? pushSalesResult.data : [];
        
        // Supprimer automatiquement les stop/push sales dont la date est passée ou égale à aujourd'hui (date <= aujourd'hui)
        // Si on arrive le 13/12, le stop sale du 13/12 doit être supprimé car c'est déjà trop tard
        const expiredStopSales = stopSalesData.filter(s => s.date <= today);
        const expiredPushSales = pushSalesData.filter(p => p.date <= today);
        
        if (expiredStopSales.length > 0) {
          const expiredIds = expiredStopSales.map(s => s.id);
          await supabase.from("stop_sales").delete().in("id", expiredIds);
          stopSalesData = stopSalesData.filter(s => s.date > today);
        }
        
        if (expiredPushSales.length > 0) {
          const expiredIds = expiredPushSales.map(p => p.id);
          await supabase.from("push_sales").delete().in("id", expiredIds);
          pushSalesData = pushSalesData.filter(p => p.date > today);
        }
        
        setStopSales(stopSalesData);
        setPushSales(pushSalesData);
        
        // Mettre en cache
        salesCache.set(cacheKey, { stopSales: stopSalesData, pushSales: pushSalesData });
      } catch (err) {
        logger.error("Erreur lors du chargement des stop sales/push sales:", err);
      }
    }

    // Charger immédiatement
    loadStopSalesAndPushSales();
    
    // Recharger toutes les 30 secondes pour avoir les données à jour (optimisé pour les performances)
    // Le Realtime Supabase gère les mises à jour immédiates
    const interval = setInterval(loadStopSalesAndPushSales, 30000);
    
    // Écouter les changements en temps réel avec Supabase Realtime
    let stopSalesChannel = null;
    let pushSalesChannel = null;
    
    if (supabase) {
      // Canal pour les stop sales
      stopSalesChannel = supabase
        .channel('stop_sales_changes')
        .on('postgres_changes', 
          { 
            event: '*', 
            schema: 'public', 
            table: 'stop_sales',
            filter: `site_key=eq.${SITE_KEY}`
          }, 
          (payload) => {
            // Recharger les données quand il y a un changement
            loadStopSalesAndPushSales();
          }
        )
        .subscribe();
      
      // Canal pour les push sales
      pushSalesChannel = supabase
        .channel('push_sales_changes')
        .on('postgres_changes', 
          { 
            event: '*', 
            schema: 'public', 
            table: 'push_sales',
            filter: `site_key=eq.${SITE_KEY}`
          }, 
          (payload) => {
            // Recharger les données quand il y a un changement
            loadStopSalesAndPushSales();
          }
        )
        .subscribe();
    }
    
    return () => {
      clearInterval(interval);
      if (stopSalesChannel) {
        supabase.removeChannel(stopSalesChannel);
      }
      if (pushSalesChannel) {
        supabase.removeChannel(pushSalesChannel);
      }
    };
  }, []);

  // Trier les activités par ordre alphabétique pour le menu déroulant
  const sortedActivities = useMemo(() => {
    return [...activities].sort((a, b) => {
      const nameA = (a.name || "").toLowerCase();
      const nameB = (b.name || "").toLowerCase();
      return nameA.localeCompare(nameB, "fr");
    });
  }, [activities]);


  // Hook pour le remplissage automatique des dates
  const handleAutoFillDates = useAutoFillDates(client, items, setItems, activitiesMap, stopSalesMap, pushSalesMap);

  // Fonction pour générer les suggestions d'activités basées sur les dates
  const generateSuggestions = useCallback(() => {
    if (!client.arrivalDate || !client.departureDate) {
      toast.warning("Veuillez renseigner les dates d'arrivée et de départ du client.");
      return;
    }

    const arrival = new Date(client.arrivalDate);
    const departure = new Date(client.departureDate);
    
    if (arrival > departure) {
      toast.warning("La date d'arrivée doit être antérieure à la date de départ.");
      return;
    }

    // Obtenir la date d'aujourd'hui (sans l'heure)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Calculer la date de début : maximum entre (arrivée + 1) et (aujourd'hui + 1)
    const arrivalPlusOne = new Date(arrival);
    arrivalPlusOne.setDate(arrivalPlusOne.getDate() + 1);
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const startDate = arrivalPlusOne > tomorrow ? arrivalPlusOne : tomorrow;

    // Générer toutes les dates entre la date de début et le départ
    const allDates = [];
    const currentDate = new Date(startDate);
    const departureMinusOne = new Date(departure);
    departureMinusOne.setDate(departureMinusOne.getDate() - 1);
    
    while (currentDate <= departureMinusOne) {
      const dateStr = new Date(currentDate).toISOString().slice(0, 10);
      const dayOfWeek = currentDate.getDay();
      allDates.push({ date: dateStr, dayOfWeek });
      currentDate.setDate(currentDate.getDate() + 1);
    }

    if (allDates.length === 0) {
      toast.warning("Aucune date disponible entre demain et le départ.");
      return;
    }

    // Fonction helper pour vérifier si une activité est une plongée
    const isDivingActivity = (activityName) => {
      if (!activityName) return false;
      const nameLower = activityName.toLowerCase();
      return nameLower.includes('plongée') || nameLower.includes('plongee') || nameLower.includes('diving');
    };

    // Fonction helper pour vérifier si une date respecte la règle des 2 jours minimum avant le départ (pour la plongée)
    const isDateSafeForDiving = (dateStr) => {
      const activityDate = new Date(dateStr + "T12:00:00");
      const diffTime = departure.getTime() - activityDate.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return diffDays >= 2;
    };

    // Fonction helper pour vérifier si une date/activité est disponible
    const isDateAvailableForActivity = (activityId, dateStr, dayOfWeek, availableDays) => {
      // Vérifier si c'est un push sale (toujours disponible)
      const pushKey = `${activityId}_${dateStr}`;
      if (pushSalesMap.has(pushKey)) {
        return true;
      }
      
      // Vérifier si c'est un stop sale (jamais disponible sauf si push sale)
      const stopKey = `${activityId}_${dateStr}`;
      if (stopSalesMap.has(stopKey)) {
        return false;
      }
      
      // Vérifier si l'activité est disponible ce jour de la semaine
      return availableDays?.[dayOfWeek] === true;
    };

    // Générer les suggestions : pour chaque activité, trouver toutes les dates où elle est disponible
    const suggestions = [];
    
    activities.forEach((activity) => {
      const activityId = String(activity.id || activity.supabase_id || '');
      const availableDates = [];
      
      allDates.forEach(({ date, dayOfWeek }) => {
        // Vérifier si l'activité est disponible cette date
        if (isDateAvailableForActivity(activityId, date, dayOfWeek, activity.availableDays)) {
          // Pour les plongées, vérifier la règle des 2 jours minimum avant le départ
          if (isDivingActivity(activity.name)) {
            if (isDateSafeForDiving(date)) {
              availableDates.push(date);
            }
          } else {
            availableDates.push(date);
          }
        }
      });
      
      if (availableDates.length > 0) {
        suggestions.push({
          activity,
          availableDates,
          count: availableDates.length,
        });
      }
    });

    // Trier par nombre de dates disponibles (décroissant)
    suggestions.sort((a, b) => b.count - a.count);

    if (suggestions.length === 0) {
      toast.info("Aucune activité disponible pour ces dates.");
      return;
    }

    setSuggestedActivities(suggestions);
    setShowSuggestionsModal(true);
  }, [client.arrivalDate, client.departureDate, activities, activitiesMap, stopSalesMap, pushSalesMap]);

  // Formater les stop sales avec les noms d'activités (optimisé avec Map)
  const formattedStopSales = useMemo(() => {
    return stopSales
      .map((stop) => {
        // Vérifier avec l'ID local (id) et l'ID Supabase (supabase_id) car les stop sales peuvent utiliser l'un ou l'autre
        let activity = activitiesMap.get(stop.activity_id);
        if (!activity) {
          // Si pas trouvé avec l'ID direct, chercher dans toutes les activités par supabase_id
          activity = Array.from(activitiesMap.values()).find(a => a.supabase_id === stop.activity_id);
        }
        return {
          ...stop,
          activityName: activity?.name || stop.activity_id,
          formattedDate: new Date(stop.date + "T12:00:00").toLocaleDateString("fr-FR", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
          }),
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [stopSales, activitiesMap]);

  // Formater les push sales avec les noms d'activités (optimisé avec Map)
  const formattedPushSales = useMemo(() => {
    return pushSales
      .map((push) => {
        // Vérifier avec l'ID local (id) et l'ID Supabase (supabase_id) car les push sales peuvent utiliser l'un ou l'autre
        let activity = activitiesMap.get(push.activity_id);
        if (!activity) {
          // Si pas trouvé avec l'ID direct, chercher dans toutes les activités par supabase_id
          activity = Array.from(activitiesMap.values()).find(a => a.supabase_id === push.activity_id);
        }
        return {
          ...push,
          activityName: activity?.name || push.activity_id,
          formattedDate: new Date(push.date + "T12:00:00").toLocaleDateString("fr-FR", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
          }),
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [pushSales, activitiesMap]);

  // Sélectionner automatiquement le créneau s'il n'y en a qu'un seul disponible
  useEffect(() => {
    if (!client.neighborhood || items.length === 0) return;

    items.forEach((it, idx) => {
      if (!it.activityId || it.slot) return; // Ignorer si pas d'activité ou slot déjà défini

      const act = activitiesMap.get(it.activityId);
      if (!act || !act.transfers || !act.transfers[client.neighborhood]) return;

      const transferInfo = act.transfers[client.neighborhood];
      
      // Compter les créneaux disponibles
      const availableSlots = [];
      if (transferInfo.morningEnabled) availableSlots.push("morning");
      if (transferInfo.afternoonEnabled) availableSlots.push("afternoon");
      if (transferInfo.eveningEnabled) availableSlots.push("evening");

      // Si un seul créneau est disponible, le sélectionner automatiquement
      if (availableSlots.length === 1) {
        setItem(idx, { slot: availableSlots[0] });
      }
    });
  }, [items, activitiesMap, client.neighborhood, setItem]);

  // Hook pour calculer les prix des activités
  const { computed, grandCurrency, grandTotal, grandTotalCash, grandTotalCard } = useActivityPriceCalculator(
    items,
    activitiesMap,
    client.neighborhood,
    stopSalesMap,
    pushSalesMap
  );

  // Corriger automatiquement les dates passées ou du jour même
  useEffect(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().slice(0, 10);

    let hasInvalidDates = false;
    const correctedItems = items.map((item) => {
      if (item.date) {
        const itemDate = new Date(item.date + "T12:00:00");
        itemDate.setHours(0, 0, 0, 0);
        if (itemDate <= today) {
          hasInvalidDates = true;
          return { ...item, date: tomorrowStr };
        }
      }
      return item;
    });

    if (hasInvalidDates) {
      setItems(correctedItems);
      // Correction silencieuse des dates passées
    }
  }, []); // Exécuter une seule fois au chargement

  // Récupérer toutes les dates utilisées dans le formulaire en cours avec leurs activités
  const usedDates = useMemo(() => {
    const datesMap = new Map();
    computed.forEach((c) => {
      if (c.act && c.act.name && c.raw.date) {
        if (!datesMap.has(c.raw.date)) {
          datesMap.set(c.raw.date, []);
        }
        datesMap.get(c.raw.date).push(c.act.name);
      }
    });
    
    // Trier les dates du plus récent au plus ancien
    return Array.from(datesMap.entries()).sort((a, b) => new Date(b[0]) - new Date(a[0]));
  }, [computed]);

  // Notifier le parent des dates utilisées
  useEffect(() => {
    if (onUsedDatesChange) {
      onUsedDatesChange(usedDates);
    }
  }, [usedDates, onUsedDatesChange]);

  async function handleCreateQuote(e) {
    e.preventDefault();
    e.stopPropagation();

    // Empêcher la double soumission
    if (isSubmitting) {
      return;
    }
    setIsSubmitting(true);

    // Filtrer les items vides (sans activité sélectionnée)
    const validComputed = computed.filter((c) => c.act && c.act.id);
    
    // Vérifier qu'il y a au moins un item valide
    if (validComputed.length === 0) {
      toast.warning("Veuillez sélectionner au moins une activité pour créer le devis.");
      setIsSubmitting(false);
      return;
    }

    // Vérifier que chaque activité a au moins 1 participant (adultes, enfants ou bébés)
    const activitiesWithoutParticipants = validComputed.filter((c) => {
      // Pour les activités de type "transfert" (Hurghada - Le Caire, Soma Bay - Aéroport, etc.),
      // le nombre de participants n'est pas pertinent pour le prix, mais on peut quand même vérifier
      // qu'il y a au moins 1 adulte si ce n'est pas un transfert pur.
      // Pour simplifier, on vérifie si au moins un des champs de participants est > 0
      const isTransferActivity = c.act && (
        c.act.name.toLowerCase().includes("hurghada - le caire") ||
        c.act.name.toLowerCase().includes("hurghada - louxor") ||
        c.act.name.toLowerCase().includes("aeroport") ||
        c.act.name.toLowerCase().includes("aerport")
      );

      if (isTransferActivity) {
        // Pour les transferts, on ne bloque pas la création si pas de participants,
        // car le prix est fixe et les participants sont juste informatifs.
        return false; // Ne pas considérer comme "sans participants" pour le blocage
      }

      const totalParticipants = Number(c.raw.adults || 0) + Number(c.raw.children || 0) + Number(c.raw.babies || 0);
      // Pour les activités buggy/moto, on vérifie les véhicules
      const isBuggyOrMoto = isBuggyActivity(c.act?.name) || isMotoCrossActivity(c.act?.name);
      if (isBuggyOrMoto) {
        const totalVehicles = Number(c.raw.buggySimple || 0) + Number(c.raw.buggyFamily || 0) +
                             Number(c.raw.yamaha250 || 0) + Number(c.raw.ktm640 || 0) + Number(c.raw.ktm530 || 0);
        return totalVehicles === 0;
      }

      return totalParticipants === 0;
    });

    if (activitiesWithoutParticipants.length > 0) {
      const activityNames = activitiesWithoutParticipants.map(c => c.act?.name || "une activité sans nom").join(", ");
      toast.error(
        `L'activité ou les activités suivantes n'ont pas de participants (adultes, enfants, bébés ou véhicules) : ${activityNames}. Veuillez ajouter au moins 1 participant pour chaque activité.`,
      );
      setIsSubmitting(false);
      return;
    }

    // Vérifier les stop sales
    const stopSaleItems = validComputed.filter((c) => c.isStopSale);
    if (stopSaleItems.length > 0) {
      toast.error(
        `${stopSaleItems.length} activité(s) sont en STOP SALE pour cette date. Le devis ne peut pas être créé.`,
      );
      setIsSubmitting(false);
      return;
    }

    const notAvailable = validComputed.filter((c) => c.weekday != null && !c.baseAvailable && !c.isPushSale);
    if (notAvailable.length) {
      toast.warning(
        `${notAvailable.length} activité(s) sont hors-dispo ce jour-là. Le devis est quand même créé (date exceptionnelle ou push sale).`,
      );
    }

    // Calculer le total uniquement avec les items valides
    const validGrandTotal = validComputed.reduce((s, c) => s + (c.lineTotal || 0), 0);
    const validGrandCurrency = validComputed.find((c) => c.currency)?.currency || "EUR";

    // Nettoyer le numéro de téléphone avant de créer le devis
    const cleanedClient = {
      ...client,
      phone: cleanPhoneNumber(client.phone || ""),
    };

    const q = {
      id: uuid(),
      createdAt: new Date().toISOString(),
      client: cleanedClient,
      clientArrivalDate: cleanedClient.arrivalDate || "",
      clientDepartureDate: cleanedClient.departureDate || "",
      notes: notes.trim(),
      createdByName: user?.name || "",
      items: validComputed.map((c) => ({
        activityId: c.act.id,
        activityName: c.act.name || "",
        date: c.raw.date,
        adults: Number(c.raw.adults || 0),
        children: Number(c.raw.children || 0),
        babies: Number(c.raw.babies || 0),
        extraLabel: c.raw.extraLabel || "",
        extraAmount: c.raw.extraAmount !== undefined && c.raw.extraAmount !== null && c.raw.extraAmount !== "" ? Number(c.raw.extraAmount) : 0,
        extraDolphin: c.raw.extraDolphin || false,
        speedBoatExtra: Array.isArray(c.raw.speedBoatExtra) ? c.raw.speedBoatExtra : (c.raw.speedBoatExtra ? [c.raw.speedBoatExtra] : []),
        buggySimple: Number(c.raw.buggySimple || 0),
        buggyFamily: Number(c.raw.buggyFamily || 0),
        yamaha250: Number(c.raw.yamaha250 || 0),
        ktm640: Number(c.raw.ktm640 || 0),
        ktm530: Number(c.raw.ktm530 || 0),
        allerSimple: c.raw.allerSimple || false,
        allerRetour: c.raw.allerRetour || false,
        zeroTracasTransfertVisaSim: Number(c.raw.zeroTracasTransfertVisaSim || 0),
        zeroTracasTransfertVisa: Number(c.raw.zeroTracasTransfertVisa || 0),
        zeroTracasTransfert3Personnes: Number(c.raw.zeroTracasTransfert3Personnes || 0),
        zeroTracasTransfertPlus3Personnes: Number(c.raw.zeroTracasTransfertPlus3Personnes || 0),
        zeroTracasVisaSim: Number(c.raw.zeroTracasVisaSim || 0),
        zeroTracasVisaSeul: Number(c.raw.zeroTracasVisaSeul || 0),
        neighborhood: client.neighborhood,
        slot: c.raw.slot,
        pickupTime: c.pickupTime || "",
        lineTotal: c.lineTotal,
        transferSurchargePerAdult: c.transferInfo?.surcharge || 0,
      })),
      total: validGrandTotal,
      totalCash: Math.round(validGrandTotal),
      totalCard: calculateCardPrice(validGrandTotal),
      currency: validGrandCurrency,
    };

    setQuotes((prev) => {
      const updated = [q, ...prev];
      saveLS(LS_KEYS.quotes, updated);
      return updated;
    });

    // Envoyer à Supabase si configuré
    if (supabase) {
      try {
        // Préparer les dates : convertir les chaînes vides en null pour Supabase
        const arrivalDate = q.clientArrivalDate || q.client?.arrivalDate || "";
        const departureDate = q.clientDepartureDate || q.client?.departureDate || "";
        
        const supabaseData = {
          site_key: SITE_KEY,
          client_name: q.client.name || "",
          client_phone: q.client.phone || "",
          client_email: q.client.email || "",
          client_hotel: q.client.hotel || "",
          client_room: q.client.room || "",
          client_neighborhood: q.client.neighborhood || "",
          client_arrival_date: arrivalDate || null, // Convertir chaîne vide en null
          client_departure_date: departureDate || null, // Convertir chaîne vide en null
          notes: q.notes || "",
          total: q.total,
          currency: q.currency,
          items: JSON.stringify(q.items),
          created_by_name: q.createdByName || "",
          created_at: q.createdAt,
          updated_at: q.createdAt, // Initialiser updated_at avec la date de création
        };

        logger.log("🔄 Envoi du devis à Supabase:", supabaseData);
        const { data, error } = await supabase.from("quotes").insert(supabaseData).select().single();

        if (error) {
          logger.error("❌ ERREUR Supabase (création devis):", error);
          logger.error("Détails:", JSON.stringify(error, null, 2));
          
          // Toujours afficher l'erreur pour le debug
          toast.error(
            "Erreur Supabase (création devis). Vérifiez la console pour plus de détails. Le devis est quand même enregistré en local."
          );
        } else {
          logger.log("✅ Devis créé avec succès dans Supabase!");
          logger.log("Réponse:", data);
          
          // Mettre à jour le devis local avec le supabase_id retourné
          if (data && data.id) {
            setQuotes((prev) => {
              const updated = prev.map((quote) => {
                if (quote.id === q.id) {
                  return {
                    ...quote,
                    supabase_id: data.id,
                    updated_at: data.updated_at || data.created_at || quote.createdAt,
                    // Garder l'ID local original pour éviter les problèmes de synchronisation
                    // Le supabase_id sera utilisé pour les requêtes Supabase
                  };
                }
                return quote;
              });
              saveLS(LS_KEYS.quotes, updated);
              return updated;
            });
            toast.success("Devis créé et synchronisé avec succès !");
          } else {
            logger.warn("⚠️ Supabase a retourné une réponse mais sans ID");
            toast.warning("Devis créé localement mais problème de synchronisation avec Supabase.");
          }
        }
      } catch (err) {
        logger.error("❌ EXCEPTION lors de l'envoi du devis à Supabase:", err);
        toast.error(
          "Exception lors de l'envoi à Supabase. Vérifiez la console pour plus de détails. Le devis est quand même enregistré en local."
        );
      }
    } else {
      logger.warn("⚠️ Supabase non configuré - le devis n'est enregistré qu'en local");
    }

    // Réinitialiser le formulaire après création réussie
    resetQuoteForm();

    setIsSubmitting(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
    
    // Afficher un message de succès
    toast.success("Devis créé avec succès ! Formulaire réinitialisé.");
  }


  return (
    <div className="space-y-6 md:space-y-8 lg:space-y-10 p-3 md:p-4 lg:p-6">
        {/* Section Stop Sales et Push Sales - Compacte et repliable */}
        {(stopSales.length > 0 || pushSales.length > 0) && (
          <StopPushSalesSummary 
            stopSales={formattedStopSales} 
            pushSales={formattedPushSales}
            activities={activities}
          />
        )}

        <form 
          onSubmit={handleCreateQuote} 
          onKeyDown={(e) => {
            // Désactiver la touche Entrée pour soumettre le formulaire
            if (e.key === "Enter" && e.target.tagName !== "TEXTAREA") {
              e.preventDefault();
            }
          }}
          className="space-y-5 md:space-y-6 lg:space-y-8"
        >
        {/* Barre d'information et actions */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 md:p-6 bg-gradient-to-r from-indigo-50 via-blue-50 to-cyan-50 rounded-2xl border-2 border-indigo-200/60 shadow-lg backdrop-blur-sm animate-fade-in">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-blue-500 flex items-center justify-center shadow-md">
              <span className="text-lg">💾</span>
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800">
                Sauvegarde automatique
              </p>
              <p className="text-xs text-slate-600 mt-0.5">
                Vos modifications sont enregistrées en temps réel
              </p>
            </div>
          </div>
          <GhostBtn
            type="button"
            variant="danger"
            size="sm"
            onClick={() => {
              setConfirmResetForm(true);
              // Scroll vers le haut de la page pour que la modale soit bien visible
              // La modale est en position fixed donc elle apparaît toujours au centre de l'écran
              setTimeout(() => {
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }, 100);
            }}
            className="whitespace-nowrap shadow-md hover:shadow-lg transition-all"
          >
            🧹 Tout effacer
          </GhostBtn>
        </div>
        
        {/* Infos client */}
        <div className="bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 rounded-2xl border-2 border-blue-200/60 shadow-xl backdrop-blur-sm p-5 md:p-7 lg:p-9 animate-slide-up">
          <div className="flex items-center gap-4 mb-6 pb-4 border-b-2 border-blue-200/40">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg">
              <span className="text-2xl">👤</span>
            </div>
            <div>
              <h3 className="text-xl md:text-2xl lg:text-3xl font-bold bg-gradient-to-r from-blue-700 via-indigo-700 to-purple-700 bg-clip-text text-transparent">
                Informations client
              </h3>
              <p className="text-xs md:text-sm text-slate-600 mt-1">
                Renseignez les détails de votre client
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-6">
            <div className="space-y-2 animate-fade-in" style={{ animationDelay: '50ms' }}>
              <label className="block text-sm font-semibold text-slate-800 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                Nom complet *
              </label>
              <TextInput 
                value={client.name} 
                onChange={(e) => setClient((c) => ({ ...c, name: e.target.value }))}
                placeholder="Jean Dupont"
                className="w-full"
              />
            </div>
            <div className="space-y-2 animate-fade-in" style={{ animationDelay: '100ms' }}>
              <label className="block text-sm font-semibold text-slate-800 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                Téléphone *
              </label>
              <TextInput 
                value={client.phone} 
                onChange={(e) => {
                  const cleaned = cleanPhoneNumber(e.target.value);
                  setClient((c) => ({ ...c, phone: cleaned }));
                }}
                placeholder="+33 6 12 34 56 78"
                className="w-full"
              />
            </div>
            <div className="space-y-2 animate-fade-in" style={{ animationDelay: '150ms' }}>
              <label className="block text-sm font-semibold text-slate-800 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400"></span>
                Email
              </label>
              <TextInput 
                type="email"
                value={client.email || ""} 
                onChange={(e) => setClient((c) => ({ ...c, email: e.target.value }))} 
                placeholder="email@exemple.com"
                className="w-full"
              />
            </div>
            <div className="space-y-2 animate-fade-in" style={{ animationDelay: '200ms' }}>
              <label className="block text-sm font-semibold text-slate-800 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                Hôtel
              </label>
              <div className="flex gap-2">
                <TextInput 
                  value={client.hotel} 
                  onChange={(e) => {
                    const hotelName = e.target.value;
                    setClient((c) => ({ ...c, hotel: hotelName }));
                    // La détection se fera automatiquement après le debounce (800ms après la fin de la saisie)
                  }}
                  onBlur={(e) => {
                    // Détecter aussi quand l'utilisateur quitte le champ (au cas où le debounce n'aurait pas encore fonctionné)
                    const hotelName = e.target.value;
                    if (hotelName && hotelName.trim().length >= 3) {
                      detectHotelNeighborhood(hotelName);
                    }
                  }}
                  placeholder="Nom de l'hôtel"
                  className="flex-1"
                />
                {client.hotel && (
                  <button
                    type="button"
                    onClick={() => {
                      const hotelName = encodeURIComponent(client.hotel);
                      const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${hotelName}+Hurghada+Egypt`;
                      window.open(googleMapsUrl, '_blank', 'noopener,noreferrer');
                    }}
                    className="px-4 py-2.5 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl hover:from-blue-600 hover:to-indigo-700 transition-all font-semibold whitespace-nowrap flex items-center gap-2 shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
                    title="Ouvrir sur Google Maps"
                  >
                    <span>📍</span>
                    <span className="hidden sm:inline">Maps</span>
                  </button>
                )}
              </div>
              {client.hotel && hotels.some((h) => h.name.toLowerCase().trim() === client.hotel.toLowerCase().trim()) && (
                <div className="flex items-center gap-2 mt-2 px-3 py-1.5 bg-green-50 border border-green-200 rounded-lg">
                  <span className="text-green-600">✓</span>
                  <p className="text-xs font-medium text-green-700">
                    Hôtel reconnu dans la base de données
                  </p>
                </div>
              )}
            </div>
            <div className="space-y-2 animate-fade-in" style={{ animationDelay: '250ms' }}>
              <label className="block text-sm font-semibold text-slate-800 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400"></span>
                Numéro de chambre
              </label>
              <TextInput 
                value={client.room} 
                onChange={(e) => setClient((c) => ({ ...c, room: e.target.value }))}
                placeholder="Ex: 205"
                className="w-full"
              />
            </div>
            <div className="space-y-2 animate-fade-in" style={{ animationDelay: '300ms' }}>
              <label className="block text-sm font-semibold text-slate-800 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-purple-400"></span>
                Quartier
              </label>
              <select
                value={client.neighborhood}
                onChange={(e) => setClient((c) => ({ ...c, neighborhood: e.target.value }))}
                className="w-full rounded-xl border-2 border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all shadow-sm hover:shadow-md"
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
        </div>

        {/* Dates séjour */}
        <div className="bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 rounded-2xl border-2 border-indigo-200/60 shadow-xl backdrop-blur-sm p-5 md:p-7 lg:p-9 animate-slide-up">
          <div className="flex items-center gap-4 mb-6 pb-4 border-b-2 border-indigo-200/40">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg">
              <span className="text-2xl">📅</span>
            </div>
            <div>
              <h3 className="text-xl md:text-2xl lg:text-3xl font-bold bg-gradient-to-r from-indigo-700 via-purple-700 to-pink-700 bg-clip-text text-transparent">
                Dates du séjour
              </h3>
              <p className="text-xs md:text-sm text-slate-600 mt-1">
                Définissez les dates d'arrivée et de départ
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-6">
            <div className="space-y-2 animate-fade-in">
              <label className="block text-sm font-semibold text-slate-800 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                Date d'arrivée *
              </label>
              <TextInput 
                type="date" 
                value={client.arrivalDate || ""} 
                onChange={(e) => setClient((c) => ({ ...c, arrivalDate: e.target.value }))}
                className="w-full"
              />
            </div>
            <div className="space-y-2 animate-fade-in">
              <label className="block text-sm font-semibold text-slate-800 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span>
                Date de départ *
              </label>
              <div className="flex flex-col sm:flex-row gap-3">
                <TextInput 
                  type="date" 
                  value={client.departureDate || ""} 
                  onChange={(e) => setClient((c) => ({ ...c, departureDate: e.target.value }))} 
                  className="flex-1"
                />
                {client.arrivalDate && client.departureDate && (
                  <div className="flex gap-2">
                    <GhostBtn
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleAutoFillDates();
                      }}
                      variant="primary"
                      size="sm"
                      title="Remplir automatiquement les dates des activités"
                      className="whitespace-nowrap shadow-md hover:shadow-lg transition-all"
                    >
                      ✨ Auto-dates
                    </GhostBtn>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Champ global pour le nombre d'adultes */}
        <div className="bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50 rounded-2xl border-2 border-emerald-200/60 shadow-xl backdrop-blur-sm p-5 md:p-7 lg:p-9 animate-slide-up">
          <div className="flex flex-col md:flex-row items-start md:items-center gap-5">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg">
                <span className="text-2xl">👥</span>
              </div>
              <div>
                <label className="block text-lg md:text-xl font-bold bg-gradient-to-r from-emerald-700 to-teal-700 bg-clip-text text-transparent">
                  Nombre d'adultes global
                </label>
                <p className="text-sm text-emerald-700 mt-1 font-medium">
                  Remplit automatiquement toutes les activités
                </p>
              </div>
            </div>
            <div className="flex-1 md:max-w-xs">
              <NumberInput
                value={globalAdults}
                onChange={(e) => {
                  const value = e.target.value === "" ? "" : e.target.value;
                  setGlobalAdults(value);
                  setItems((prev) =>
                    prev.map((item) => ({
                      ...item,
                      adults: value,
                    }))
                  );
                }}
                placeholder="Ex: 2"
                className="w-full text-base shadow-md hover:shadow-lg transition-all"
              />
              <div className="flex items-center gap-2 mt-3 px-3 py-2 bg-white/60 rounded-lg border border-emerald-200/60">
                <span className="text-emerald-600">💡</span>
                <p className="text-xs text-slate-600 font-medium">
                  Modifiable individuellement pour chaque activité
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Lignes */}
        <div className="space-y-5 md:space-y-6 lg:space-y-8">
          <div className="flex items-center gap-4 mb-4 pb-4 border-b-2 border-slate-200/60">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg">
              <span className="text-xl">🎯</span>
            </div>
            <div>
              <h3 className="text-xl md:text-2xl font-bold bg-gradient-to-r from-blue-700 to-indigo-700 bg-clip-text text-transparent">
                Activités
              </h3>
              <p className="text-sm text-slate-600 mt-0.5">
                {computed.length} activité{computed.length > 1 ? 's' : ''} configurée{computed.length > 1 ? 's' : ''}
              </p>
            </div>
          </div>
          {computed.map((c, idx) => (
            <div key={idx} className="bg-white rounded-2xl border-2 border-slate-200/60 shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden animate-fade-in" style={{ animationDelay: `${idx * 100}ms` }}>
              {/* En-tête de l'activité */}
              <div className="bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50 border-b-2 border-blue-200/60 px-6 py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white text-base font-bold shadow-md">
                    {idx + 1}
                  </span>
                  <div>
                    <p className="text-base font-bold text-blue-900">Activité #{idx + 1}</p>
                    {c.act && (
                      <p className="text-xs text-blue-700 mt-0.5 font-medium">{c.act.name}</p>
                    )}
                  </div>
                </div>
                <GhostBtn 
                  type="button" 
                  onClick={() => removeItem(idx)} 
                  variant="danger" 
                  size="sm"
                  className="shadow-md hover:shadow-lg transition-all"
                >
                  🗑️ Supprimer
                </GhostBtn>
              </div>
              
              {/* Contenu de l'activité */}
              <div className="p-4 md:p-6 lg:p-8 space-y-5 md:space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5 lg:gap-6">
                  <div className="sm:col-span-2 lg:col-span-1">
                    <label className="block text-sm font-medium text-slate-700 mb-2">Activité *</label>
                    <select
                      value={c.raw.activityId}
                      onChange={(e) => setItem(idx, { activityId: e.target.value })}
                      className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-normal text-slate-700 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                    >
                      <option value="">— Sélectionner une activité —</option>
                      {sortedActivities.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Date *</label>
                  <ColoredDatePicker
                    value={c.raw.date}
                    onChange={(date) => {
                      // Validation supplémentaire : empêcher les dates passées ou aujourd'hui
                      if (date) {
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);
                        const selectedDate = new Date(date + "T12:00:00");
                        selectedDate.setHours(0, 0, 0, 0);
                        if (selectedDate <= today) {
                          toast.warning("Les activités ne peuvent pas être programmées avant demain.");
                          return;
                        }
                      }
                      setItem(idx, { date });
                    }}
                    activity={c.act}
                    stopSales={stopSales || []}
                    pushSales={pushSales || []}
                  />
                  {c.act && c.isStopSale && (
                    <div className="mt-3 p-3 rounded-lg border-2 border-red-500 bg-red-500/20 shadow-lg shadow-red-500/30 animate-pulse">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">🛑</span>
                        <div className="flex-1">
                          <p className="text-sm font-bold text-red-600 uppercase tracking-wide">
                            STOP SALE
                          </p>
                          <p className="text-xs text-red-700 mt-0.5 font-medium">
                            Cette activité est bloquée à la vente pour cette date
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                  {c.act && c.isPushSale && (
                    <div className="mt-3 p-3 rounded-lg border-2 border-green-500 bg-green-500/20 shadow-lg shadow-green-500/30">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">✅</span>
                        <div className="flex-1">
                          <p className="text-sm font-bold text-green-600 uppercase tracking-wide">
                            PUSH SALE
                          </p>
                          <p className="text-xs text-green-700 mt-0.5 font-medium">
                            Cette activité est ouverte exceptionnellement pour cette date
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                  {c.act && !c.isStopSale && !c.isPushSale && !c.baseAvailable && (
                    <div className="mt-3 p-3 rounded-lg border border-amber-300 bg-amber-50">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">⚠️</span>
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-amber-900">
                            Activité non disponible
                          </p>
                          <p className="text-xs text-amber-700 mt-0.5">
                            Pas disponible ce jour-là (on peut quand même créer)
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Quartier</label>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-normal text-slate-700">
                      {client.neighborhood
                        ? NEIGHBORHOODS.find((n) => n.key === client.neighborhood)?.label
                        : "— Choisir avec le client"}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Créneau</label>
                    <select
                      value={c.raw.slot}
                      onChange={(e) => setItem(idx, { slot: e.target.value })}
                      className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-normal text-slate-700 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all disabled:bg-slate-100 disabled:text-slate-400"
                      disabled={!c.transferInfo || (!c.transferInfo.morningEnabled && !c.transferInfo.afternoonEnabled && !c.transferInfo.eveningEnabled)}
                    >
                      <option value="">— Choisir un créneau —</option>
                      {c.transferInfo?.morningEnabled && (
                        <option value="morning">🌅 Matin {c.transferInfo.morningTime ? `(${c.transferInfo.morningTime})` : ""}</option>
                      )}
                      {c.transferInfo?.afternoonEnabled && (
                        <option value="afternoon">
                          ☀️ Après-midi {c.transferInfo.afternoonTime ? `(${c.transferInfo.afternoonTime})` : ""}
                        </option>
                      )}
                      {c.transferInfo?.eveningEnabled && (
                        <option value="evening">
                          🌙 Soir {c.transferInfo.eveningTime ? `(${c.transferInfo.eveningTime})` : ""}
                        </option>
                      )}
                    </select>
                    {c.transferInfo && (
                      <p className="text-xs text-slate-600 mt-2">
                        💰 Supplément transfert: {currency(c.transferInfo.surcharge || 0, c.currency)} / adulte et enfant (bébé gratuit)
                      </p>
                    )}
                  </div>
                </div>

              {/* extra - Cases à cocher pour Speed Boat, champs classiques pour les autres */}
              {c.act && c.act.name && c.act.name.toLowerCase().includes("speed boat") ? (
                <div className="space-y-5">
                  <div>
                    <label className="block text-xs md:text-sm font-bold text-slate-700 mb-3">Extras Speed Boat (plusieurs sélections possibles)</label>
                    <div className="space-y-2.5 border-2 border-blue-200/60 rounded-xl p-4 bg-gradient-to-br from-blue-50/60 to-indigo-50/40 backdrop-blur-sm shadow-md">
                      {SPEED_BOAT_EXTRAS.filter((extra) => extra.id !== "").map((extra) => {
                        // Gérer la compatibilité avec l'ancien format (string) et le nouveau format (array)
                        const currentExtras = Array.isArray(c.raw.speedBoatExtra) 
                          ? c.raw.speedBoatExtra 
                          : (c.raw.speedBoatExtra && typeof c.raw.speedBoatExtra === "string" && c.raw.speedBoatExtra !== "" 
                            ? [c.raw.speedBoatExtra] 
                            : []);
                        const isChecked = currentExtras.includes(extra.id);
                        
                        return (
                          <label key={extra.id} className="flex items-center gap-2 cursor-pointer hover:bg-blue-50/50 p-2 rounded-lg transition-colors">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                // Utiliser une fonction de mise à jour pour lire la valeur la plus récente
                                setItems((prev) => {
                                  const currentItem = prev[idx];
                                  const currentExtras = Array.isArray(currentItem.speedBoatExtra) 
                                    ? currentItem.speedBoatExtra 
                                    : (currentItem.speedBoatExtra && typeof currentItem.speedBoatExtra === "string" && currentItem.speedBoatExtra !== "" 
                                      ? [currentItem.speedBoatExtra] 
                                      : []);
                                  
                                  let newExtras;
                                  if (e.target.checked) {
                                    // Ajouter l'extra s'il n'est pas déjà dans la liste
                                    if (!currentExtras.includes(extra.id)) {
                                      newExtras = [...currentExtras, extra.id];
                                    } else {
                                      newExtras = currentExtras;
                                    }
                                  } else {
                                    // Retirer l'extra de la liste
                                    newExtras = currentExtras.filter((id) => id !== extra.id);
                                  }
                                  
                                  return prev.map((it, i) => (i === idx ? { ...it, speedBoatExtra: newExtras } : it));
                                });
                              }}
                              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                            />
                            <span className="text-sm text-slate-700 flex-1">
                              <span className="font-medium">{extra.label}</span>
                              {extra.priceAdult > 0 && (
                                <span className="text-xs text-slate-500 ml-2">
                                  ({extra.priceAdult}€/adt + {extra.priceChild}€ enfant)
                                </span>
                              )}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                  {/* Champ Extra pour ajuster le prix manuellement */}
                  <div className="bg-amber-50/60 border-2 border-amber-200/60 rounded-xl p-4">
                    <label className="block text-xs md:text-sm font-bold text-slate-700 mb-2.5">💰 Ajustement manuel du prix</label>
                    <div className="flex items-center gap-3">
                      <NumberInput
                        value={c.raw.extraAmount || ""}
                        onChange={(e) => setItem(idx, { extraAmount: e.target.value })}
                        placeholder="0.00"
                        className="flex-1 font-semibold"
                      />
                      <span className="text-xs md:text-sm text-slate-600 font-semibold whitespace-nowrap">
                        €
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 mt-2 font-medium">
                      💡 Positif = augmentation | Négatif = réduction
                    </p>
                  </div>
                </div>
              ) : (
                <div className="bg-gradient-to-br from-purple-50/60 to-pink-50/40 border-2 border-purple-200/60 rounded-xl p-4 md:p-5">
                  <label className="block text-xs md:text-sm font-bold text-slate-700 mb-3">✨ Options supplémentaires</label>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5">
                    <div className="md:col-span-2">
                      <label className="block text-xs font-semibold text-slate-600 mb-2">Libellé (ex: photos, bateau privé…)</label>
                      <TextInput
                        placeholder="Description de l'extra"
                        value={c.raw.extraLabel || ""}
                        onChange={(e) => setItem(idx, { extraLabel: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-2">Montant (€)</label>
                      <NumberInput
                        value={c.raw.extraAmount || ""}
                        onChange={(e) => setItem(idx, { extraAmount: e.target.value })}
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* passagers - Champs spéciaux pour activités buggy */}
              {c.act && isBuggyActivity(c.act.name) ? (
                <div className="bg-gradient-to-br from-orange-50/60 to-amber-50/40 border-2 border-orange-200/60 rounded-xl p-4 md:p-5">
                  <label className="block text-xs md:text-sm font-bold text-slate-700 mb-3">🏍️ Configuration Buggy</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-5 mb-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-2">Buggy Simple ({getBuggyPrices(c.act.name).simple}€)</label>
                      <NumberInput value={c.raw.buggySimple ?? ""} onChange={(e) => setItem(idx, { buggySimple: e.target.value === "" ? "" : e.target.value })} />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-2">Buggy Family ({getBuggyPrices(c.act.name).family}€)</label>
                      <NumberInput value={c.raw.buggyFamily ?? ""} onChange={(e) => setItem(idx, { buggyFamily: e.target.value === "" ? "" : e.target.value })} />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-5 pt-4 border-t border-orange-200/60">
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-2">👥 Adultes (info uniquement)</label>
                      <NumberInput value={c.raw.adults ?? ""} onChange={(e) => setItem(idx, { adults: e.target.value === "" ? "" : e.target.value })} />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-2">
                        👶 Enfants{c.act?.ageChild ? <span className="text-slate-400 ml-1">({c.act.ageChild})</span> : ""} (info uniquement)
                      </label>
                      <NumberInput value={c.raw.children ?? ""} onChange={(e) => setItem(idx, { children: e.target.value === "" ? "" : e.target.value })} />
                    </div>
                  </div>
                </div>
              ) : c.act && isMotoCrossActivity(c.act.name) ? (
                <div className="bg-gradient-to-br from-red-50/60 to-orange-50/40 border-2 border-red-200/60 rounded-xl p-4 md:p-5">
                  <label className="block text-xs md:text-sm font-bold text-slate-700 mb-3">🏍️ Motos disponibles</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 md:gap-5">
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-2">YAMAHA 250CC ({getMotoCrossPrices().yamaha250}€)</label>
                      <NumberInput value={c.raw.yamaha250 ?? ""} onChange={(e) => setItem(idx, { yamaha250: e.target.value === "" ? "" : e.target.value })} />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-2">KTM640CC ({getMotoCrossPrices().ktm640}€)</label>
                      <NumberInput value={c.raw.ktm640 ?? ""} onChange={(e) => setItem(idx, { ktm640: e.target.value === "" ? "" : e.target.value })} />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-2">KTM 530CC ({getMotoCrossPrices().ktm530}€)</label>
                      <NumberInput value={c.raw.ktm530 ?? ""} onChange={(e) => setItem(idx, { ktm530: e.target.value === "" ? "" : e.target.value })} />
                    </div>
                  </div>
                </div>
              ) : c.act && (c.act.name.toLowerCase().includes("hurghada") && (c.act.name.toLowerCase().includes("le caire") || c.act.name.toLowerCase().includes("louxor"))) ? (
                <>
                  {/* Message d'avertissement */}
                  <div className="bg-gradient-to-r from-amber-50 to-yellow-50 border-2 border-amber-400 rounded-lg p-4 mb-4 shadow-md">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">⚠️</span>
                      <p className="text-base font-bold text-amber-900">Attention : Maximum 7 personnes</p>
                    </div>
                  </div>
                  
                  {/* Cases Aller simple et Aller retour */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                    <div className="flex items-center gap-3 p-4 border-2 border-slate-200 rounded-lg hover:border-blue-300 transition-all">
                      <input
                        type="checkbox"
                        id={`allerSimple-${idx}`}
                        checked={c.raw.allerSimple || false}
                        onChange={(e) => {
                          setItem(idx, { 
                            allerSimple: e.target.checked,
                            allerRetour: e.target.checked ? false : c.raw.allerRetour // Désactiver aller-retour si on coche aller simple
                          });
                        }}
                        className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <label htmlFor={`allerSimple-${idx}`} className="text-sm font-medium text-gray-700 cursor-pointer flex-1">
                        Aller simple (150€)
                      </label>
                    </div>
                    <div className="flex items-center gap-3 p-4 border-2 border-slate-200 rounded-lg hover:border-blue-300 transition-all">
                      <input
                        type="checkbox"
                        id={`allerRetour-${idx}`}
                        checked={c.raw.allerRetour || false}
                        onChange={(e) => {
                          setItem(idx, { 
                            allerRetour: e.target.checked,
                            allerSimple: e.target.checked ? false : c.raw.allerSimple // Désactiver aller simple si on coche aller-retour
                          });
                        }}
                        className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <label htmlFor={`allerRetour-${idx}`} className="text-sm font-medium text-gray-700 cursor-pointer flex-1">
                        Aller retour (300€)
                      </label>
                    </div>
                  </div>
                  
                  {/* Champs adultes/enfants/bébés (informations uniquement, ne changent pas le prix) */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 md:gap-6 lg:gap-8">
                    <div>
                      <p className="text-xs text-gray-400 mb-2">Adultes (informations uniquement)</p>
                      <NumberInput value={c.raw.adults} onChange={(e) => setItem(idx, { adults: e.target.value })} />
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 mb-2">
                        Enfants{c.act?.ageChild ? <span className="text-gray-400 ml-1">({c.act.ageChild})</span> : ""} (informations uniquement)
                      </p>
                      <NumberInput value={c.raw.children} onChange={(e) => setItem(idx, { children: e.target.value })} />
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 mb-2">
                        Bébés{c.act?.ageBaby ? <span className="text-gray-400 ml-1">({c.act.ageBaby})</span> : ""} (informations uniquement)
                      </p>
                      <NumberInput value={c.raw.babies} onChange={(e) => setItem(idx, { babies: e.target.value })} />
                    </div>
                  </div>
                </>
              ) : c.act && c.act.name.toLowerCase().includes("soma bay") && c.act.name.toLowerCase().includes("aeroport") && c.act.name.toLowerCase().includes("7") ? (
                <>
                  {/* Message d'avertissement */}
                  <div className="bg-gradient-to-r from-amber-50 to-yellow-50 border-2 border-amber-400 rounded-lg p-4 mb-4 shadow-md">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">⚠️</span>
                      <p className="text-base font-bold text-amber-900">Attention : Maximum 7 personnes</p>
                    </div>
                  </div>
                  
                  {/* Cases Aller simple et Aller retour */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                    <div className="flex items-center gap-3 p-4 border-2 border-slate-200 rounded-lg hover:border-blue-300 transition-all">
                      <input
                        type="checkbox"
                        id={`allerSimple-${idx}`}
                        checked={c.raw.allerSimple || false}
                        onChange={(e) => {
                          setItem(idx, { 
                            allerSimple: e.target.checked,
                            allerRetour: e.target.checked ? false : c.raw.allerRetour // Désactiver aller-retour si on coche aller simple
                          });
                        }}
                        className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <label htmlFor={`allerSimple-${idx}`} className="text-sm font-medium text-gray-700 cursor-pointer flex-1">
                        Aller simple (40€)
                      </label>
                    </div>
                    <div className="flex items-center gap-3 p-4 border-2 border-slate-200 rounded-lg hover:border-blue-300 transition-all">
                      <input
                        type="checkbox"
                        id={`allerRetour-${idx}`}
                        checked={c.raw.allerRetour || false}
                        onChange={(e) => {
                          setItem(idx, { 
                            allerRetour: e.target.checked,
                            allerSimple: e.target.checked ? false : c.raw.allerSimple // Désactiver aller simple si on coche aller-retour
                          });
                        }}
                        className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <label htmlFor={`allerRetour-${idx}`} className="text-sm font-medium text-gray-700 cursor-pointer flex-1">
                        Aller retour (80€)
                      </label>
                    </div>
                  </div>
                  
                  {/* Champs adultes/enfants/bébés (informations uniquement, ne changent pas le prix) */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 md:gap-6 lg:gap-8">
                    <div>
                      <p className="text-xs text-gray-400 mb-2">Adultes (informations uniquement)</p>
                      <NumberInput value={c.raw.adults} onChange={(e) => setItem(idx, { adults: e.target.value })} />
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 mb-2">
                        Enfants{c.act?.ageChild ? <span className="text-gray-400 ml-1">({c.act.ageChild})</span> : ""} (informations uniquement)
                      </p>
                      <NumberInput value={c.raw.children} onChange={(e) => setItem(idx, { children: e.target.value })} />
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 mb-2">
                        Bébés{c.act?.ageBaby ? <span className="text-gray-400 ml-1">({c.act.ageBaby})</span> : ""} (informations uniquement)
                      </p>
                      <NumberInput value={c.raw.babies} onChange={(e) => setItem(idx, { babies: e.target.value })} />
                    </div>
                  </div>
                </>
              ) : c.act && c.act.name.toLowerCase().includes("soma bay") && c.act.name.toLowerCase().includes("aeroport") && c.act.name.toLowerCase().includes("4") ? (
                <>
                  {/* Message d'avertissement */}
                  <div className="bg-gradient-to-r from-amber-50 to-yellow-50 border-2 border-amber-400 rounded-lg p-4 mb-4 shadow-md">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">⚠️</span>
                      <p className="text-base font-bold text-amber-900">Attention : Maximum 4 personnes</p>
                    </div>
                  </div>
                  
                  {/* Cases Aller simple et Aller retour */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                    <div className="flex items-center gap-3 p-4 border-2 border-slate-200 rounded-lg hover:border-blue-300 transition-all">
                      <input
                        type="checkbox"
                        id={`allerSimple-${idx}`}
                        checked={c.raw.allerSimple || false}
                        onChange={(e) => {
                          setItem(idx, { 
                            allerSimple: e.target.checked,
                            allerRetour: e.target.checked ? false : c.raw.allerRetour // Désactiver aller-retour si on coche aller simple
                          });
                        }}
                        className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <label htmlFor={`allerSimple-${idx}`} className="text-sm font-medium text-gray-700 cursor-pointer flex-1">
                        Aller simple (35€)
                      </label>
                    </div>
                    <div className="flex items-center gap-3 p-4 border-2 border-slate-200 rounded-lg hover:border-blue-300 transition-all">
                      <input
                        type="checkbox"
                        id={`allerRetour-${idx}`}
                        checked={c.raw.allerRetour || false}
                        onChange={(e) => {
                          setItem(idx, { 
                            allerRetour: e.target.checked,
                            allerSimple: e.target.checked ? false : c.raw.allerRetour // Désactiver aller simple si on coche aller-retour
                          });
                        }}
                        className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <label htmlFor={`allerRetour-${idx}`} className="text-sm font-medium text-gray-700 cursor-pointer flex-1">
                        Aller retour (70€)
                      </label>
                    </div>
                  </div>
                  
                  {/* Champs adultes/enfants/bébés (informations uniquement, ne changent pas le prix) */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 md:gap-6 lg:gap-8">
                    <div>
                      <p className="text-xs text-gray-400 mb-2">Adultes (informations uniquement)</p>
                      <NumberInput value={c.raw.adults} onChange={(e) => setItem(idx, { adults: e.target.value })} />
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 mb-2">
                        Enfants{c.act?.ageChild ? <span className="text-gray-400 ml-1">({c.act.ageChild})</span> : ""} (informations uniquement)
                      </p>
                      <NumberInput value={c.raw.children} onChange={(e) => setItem(idx, { children: e.target.value })} />
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 mb-2">
                        Bébés{c.act?.ageBaby ? <span className="text-gray-400 ml-1">({c.act.ageBaby})</span> : ""} (informations uniquement)
                      </p>
                      <NumberInput value={c.raw.babies} onChange={(e) => setItem(idx, { babies: e.target.value })} />
                    </div>
                  </div>
                </>
              ) : c.act && c.act.name.toLowerCase().includes("hors zone") && (c.act.name.toLowerCase().includes("aeroport") || c.act.name.toLowerCase().includes("aerport")) && c.act.name.toLowerCase().includes("7") ? (
                <>
                  {/* Message d'avertissement */}
                  <div className="bg-gradient-to-r from-amber-50 to-yellow-50 border-2 border-amber-400 rounded-lg p-4 mb-4 shadow-md">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">⚠️</span>
                      <p className="text-base font-bold text-amber-900">Attention : Maximum 7 personnes</p>
                    </div>
                  </div>
                  
                  {/* Cases Aller simple et Aller retour */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                    <div className="flex items-center gap-3 p-4 border-2 border-slate-200 rounded-lg hover:border-blue-300 transition-all">
                      <input
                        type="checkbox"
                        id={`allerSimple-${idx}`}
                        checked={c.raw.allerSimple || false}
                        onChange={(e) => {
                          setItem(idx, { 
                            allerSimple: e.target.checked,
                            allerRetour: e.target.checked ? false : c.raw.allerRetour // Désactiver aller-retour si on coche aller simple
                          });
                        }}
                        className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <label htmlFor={`allerSimple-${idx}`} className="text-sm font-medium text-gray-700 cursor-pointer flex-1">
                        Aller simple (30€)
                      </label>
                    </div>
                    <div className="flex items-center gap-3 p-4 border-2 border-slate-200 rounded-lg hover:border-blue-300 transition-all">
                      <input
                        type="checkbox"
                        id={`allerRetour-${idx}`}
                        checked={c.raw.allerRetour || false}
                        onChange={(e) => {
                          setItem(idx, { 
                            allerRetour: e.target.checked,
                            allerSimple: e.target.checked ? false : c.raw.allerSimple // Désactiver aller simple si on coche aller-retour
                          });
                        }}
                        className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <label htmlFor={`allerRetour-${idx}`} className="text-sm font-medium text-gray-700 cursor-pointer flex-1">
                        Aller retour (60€)
                      </label>
                    </div>
                  </div>
                  
                  {/* Champs adultes/enfants/bébés (informations uniquement, ne changent pas le prix) */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 md:gap-6 lg:gap-8">
                    <div>
                      <p className="text-xs text-gray-400 mb-2">Adultes (informations uniquement)</p>
                      <NumberInput value={c.raw.adults} onChange={(e) => setItem(idx, { adults: e.target.value })} />
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 mb-2">
                        Enfants{c.act?.ageChild ? <span className="text-gray-400 ml-1">({c.act.ageChild})</span> : ""} (informations uniquement)
                      </p>
                      <NumberInput value={c.raw.children} onChange={(e) => setItem(idx, { children: e.target.value })} />
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 mb-2">
                        Bébés{c.act?.ageBaby ? <span className="text-gray-400 ml-1">({c.act.ageBaby})</span> : ""} (informations uniquement)
                      </p>
                      <NumberInput value={c.raw.babies} onChange={(e) => setItem(idx, { babies: e.target.value })} />
                    </div>
                  </div>
                </>
              ) : c.act && c.act.name.toLowerCase().includes("hors zone") && (c.act.name.toLowerCase().includes("aeroport") || c.act.name.toLowerCase().includes("aerport")) && c.act.name.toLowerCase().includes("4") ? (
                <>
                  {/* Message d'avertissement */}
                  <div className="bg-gradient-to-r from-amber-50 to-yellow-50 border-2 border-amber-400 rounded-lg p-4 mb-4 shadow-md">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">⚠️</span>
                      <p className="text-base font-bold text-amber-900">Attention : Maximum 4 personnes</p>
                    </div>
                  </div>
                  
                  {/* Cases Aller simple et Aller retour */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                    <div className="flex items-center gap-3 p-4 border-2 border-slate-200 rounded-lg hover:border-blue-300 transition-all">
                      <input
                        type="checkbox"
                        id={`allerSimple-${idx}`}
                        checked={c.raw.allerSimple || false}
                        onChange={(e) => {
                          setItem(idx, { 
                            allerSimple: e.target.checked,
                            allerRetour: e.target.checked ? false : c.raw.allerRetour // Désactiver aller-retour si on coche aller simple
                          });
                        }}
                        className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <label htmlFor={`allerSimple-${idx}`} className="text-sm font-medium text-gray-700 cursor-pointer flex-1">
                        Aller simple (25€)
                      </label>
                    </div>
                    <div className="flex items-center gap-3 p-4 border-2 border-slate-200 rounded-lg hover:border-blue-300 transition-all">
                      <input
                        type="checkbox"
                        id={`allerRetour-${idx}`}
                        checked={c.raw.allerRetour || false}
                        onChange={(e) => {
                          setItem(idx, { 
                            allerRetour: e.target.checked,
                            allerSimple: e.target.checked ? false : c.raw.allerRetour // Désactiver aller simple si on coche aller-retour
                          });
                        }}
                        className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <label htmlFor={`allerRetour-${idx}`} className="text-sm font-medium text-gray-700 cursor-pointer flex-1">
                        Aller retour (50€)
                      </label>
                    </div>
                  </div>
                  
                  {/* Champs adultes/enfants/bébés (informations uniquement, ne changent pas le prix) */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 md:gap-6 lg:gap-8">
                    <div>
                      <p className="text-xs text-gray-400 mb-2">Adultes (informations uniquement)</p>
                      <NumberInput value={c.raw.adults} onChange={(e) => setItem(idx, { adults: e.target.value })} />
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 mb-2">
                        Enfants{c.act?.ageChild ? <span className="text-gray-400 ml-1">({c.act.ageChild})</span> : ""} (informations uniquement)
                      </p>
                      <NumberInput value={c.raw.children} onChange={(e) => setItem(idx, { children: e.target.value })} />
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 mb-2">
                        Bébés{c.act?.ageBaby ? <span className="text-gray-400 ml-1">({c.act.ageBaby})</span> : ""} (informations uniquement)
                      </p>
                      <NumberInput value={c.raw.babies} onChange={(e) => setItem(idx, { babies: e.target.value })} />
                    </div>
                  </div>
                </>
              ) : c.act && c.act.name.toLowerCase().includes("aeroport") && c.act.name.toLowerCase().includes("7") ? (
                <>
                  {/* Message d'avertissement */}
                  <div className="bg-gradient-to-r from-amber-50 to-yellow-50 border-2 border-amber-400 rounded-lg p-4 mb-4 shadow-md">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">⚠️</span>
                      <p className="text-base font-bold text-amber-900">Attention : Maximum 7 personnes</p>
                    </div>
                  </div>
                  
                  {/* Cases Aller simple et Aller retour */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                    <div className="flex items-center gap-3 p-4 border-2 border-slate-200 rounded-lg hover:border-blue-300 transition-all">
                      <input
                        type="checkbox"
                        id={`allerSimple-${idx}`}
                        checked={c.raw.allerSimple || false}
                        onChange={(e) => {
                          setItem(idx, { 
                            allerSimple: e.target.checked,
                            allerRetour: e.target.checked ? false : c.raw.allerRetour // Désactiver aller-retour si on coche aller simple
                          });
                        }}
                        className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <label htmlFor={`allerSimple-${idx}`} className="text-sm font-medium text-gray-700 cursor-pointer flex-1">
                        Aller simple (25€)
                      </label>
                    </div>
                    <div className="flex items-center gap-3 p-4 border-2 border-slate-200 rounded-lg hover:border-blue-300 transition-all">
                      <input
                        type="checkbox"
                        id={`allerRetour-${idx}`}
                        checked={c.raw.allerRetour || false}
                        onChange={(e) => {
                          setItem(idx, { 
                            allerRetour: e.target.checked,
                            allerSimple: e.target.checked ? false : c.raw.allerRetour // Désactiver aller simple si on coche aller-retour
                          });
                        }}
                        className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <label htmlFor={`allerRetour-${idx}`} className="text-sm font-medium text-gray-700 cursor-pointer flex-1">
                        Aller retour (50€)
                      </label>
                    </div>
                  </div>
                  
                  {/* Champs adultes/enfants/bébés (informations uniquement, ne changent pas le prix) */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 md:gap-6 lg:gap-8">
                    <div>
                      <p className="text-xs text-gray-400 mb-2">Adultes (informations uniquement)</p>
                      <NumberInput value={c.raw.adults} onChange={(e) => setItem(idx, { adults: e.target.value })} />
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 mb-2">
                        Enfants{c.act?.ageChild ? <span className="text-gray-400 ml-1">({c.act.ageChild})</span> : ""} (informations uniquement)
                      </p>
                      <NumberInput value={c.raw.children} onChange={(e) => setItem(idx, { children: e.target.value })} />
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 mb-2">
                        Bébés{c.act?.ageBaby ? <span className="text-gray-400 ml-1">({c.act.ageBaby})</span> : ""} (informations uniquement)
                      </p>
                      <NumberInput value={c.raw.babies} onChange={(e) => setItem(idx, { babies: e.target.value })} />
                    </div>
                  </div>
                </>
              ) : c.act && c.act.name.toLowerCase().includes("soma bay") && (c.act.name.toLowerCase().includes("aeroport") || c.act.name.toLowerCase().includes("aerport")) && c.act.name.toLowerCase().includes("4") ? (
                <>
                  {/* Message d'avertissement */}
                  <div className="bg-gradient-to-r from-amber-50 to-yellow-50 border-2 border-amber-400 rounded-lg p-4 mb-4 shadow-md">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">⚠️</span>
                      <p className="text-base font-bold text-amber-900">Attention : Maximum 4 personnes</p>
                    </div>
                  </div>
                  
                  {/* Cases Aller simple et Aller retour */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                    <div className="flex items-center gap-3 p-4 border-2 border-slate-200 rounded-lg hover:border-blue-300 transition-all">
                      <input
                        type="checkbox"
                        id={`allerSimple-${idx}`}
                        checked={c.raw.allerSimple || false}
                        onChange={(e) => {
                          setItem(idx, { 
                            allerSimple: e.target.checked,
                            allerRetour: e.target.checked ? false : c.raw.allerRetour // Désactiver aller-retour si on coche aller simple
                          });
                        }}
                        className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <label htmlFor={`allerSimple-${idx}`} className="text-sm font-medium text-gray-700 cursor-pointer flex-1">
                        Aller simple (35€)
                      </label>
                    </div>
                    <div className="flex items-center gap-3 p-4 border-2 border-slate-200 rounded-lg hover:border-blue-300 transition-all">
                      <input
                        type="checkbox"
                        id={`allerRetour-${idx}`}
                        checked={c.raw.allerRetour || false}
                        onChange={(e) => {
                          setItem(idx, { 
                            allerRetour: e.target.checked,
                            allerSimple: e.target.checked ? false : c.raw.allerRetour // Désactiver aller simple si on coche aller-retour
                          });
                        }}
                        className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <label htmlFor={`allerRetour-${idx}`} className="text-sm font-medium text-gray-700 cursor-pointer flex-1">
                        Aller retour (70€)
                      </label>
                    </div>
                  </div>
                  
                  {/* Champs adultes/enfants/bébés (informations uniquement, ne changent pas le prix) */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 md:gap-6 lg:gap-8">
                    <div>
                      <p className="text-xs text-gray-400 mb-2">Adultes (informations uniquement)</p>
                      <NumberInput value={c.raw.adults} onChange={(e) => setItem(idx, { adults: e.target.value })} />
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 mb-2">
                        Enfants{c.act?.ageChild ? <span className="text-gray-400 ml-1">({c.act.ageChild})</span> : ""} (informations uniquement)
                      </p>
                      <NumberInput value={c.raw.children} onChange={(e) => setItem(idx, { children: e.target.value })} />
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 mb-2">
                        Bébés{c.act?.ageBaby ? <span className="text-gray-400 ml-1">({c.act.ageBaby})</span> : ""} (informations uniquement)
                      </p>
                      <NumberInput value={c.raw.babies} onChange={(e) => setItem(idx, { babies: e.target.value })} />
                    </div>
                  </div>
                </>
              ) : c.act && c.act.name.toLowerCase().includes("aeroport") && c.act.name.toLowerCase().includes("4") ? (
                <>
                  {/* Message d'avertissement */}
                  <div className="bg-gradient-to-r from-amber-50 to-yellow-50 border-2 border-amber-400 rounded-lg p-4 mb-4 shadow-md">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">⚠️</span>
                      <p className="text-base font-bold text-amber-900">Attention : Maximum 4 personnes</p>
                    </div>
                  </div>
                  
                  {/* Cases Aller simple et Aller retour */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                    <div className="flex items-center gap-3 p-4 border-2 border-slate-200 rounded-lg hover:border-blue-300 transition-all">
                      <input
                        type="checkbox"
                        id={`allerSimple-${idx}`}
                        checked={c.raw.allerSimple || false}
                        onChange={(e) => {
                          setItem(idx, { 
                            allerSimple: e.target.checked,
                            allerRetour: e.target.checked ? false : c.raw.allerRetour // Désactiver aller-retour si on coche aller simple
                          });
                        }}
                        className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <label htmlFor={`allerSimple-${idx}`} className="text-sm font-medium text-gray-700 cursor-pointer flex-1">
                        Aller simple (20€)
                      </label>
                    </div>
                    <div className="flex items-center gap-3 p-4 border-2 border-slate-200 rounded-lg hover:border-blue-300 transition-all">
                      <input
                        type="checkbox"
                        id={`allerRetour-${idx}`}
                        checked={c.raw.allerRetour || false}
                        onChange={(e) => {
                          setItem(idx, { 
                            allerRetour: e.target.checked,
                            allerSimple: e.target.checked ? false : c.raw.allerRetour // Désactiver aller simple si on coche aller-retour
                          });
                        }}
                        className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <label htmlFor={`allerRetour-${idx}`} className="text-sm font-medium text-gray-700 cursor-pointer flex-1">
                        Aller retour (40€)
                      </label>
                    </div>
                  </div>
                  
                  {/* Champs adultes/enfants/bébés (informations uniquement, ne changent pas le prix) */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 md:gap-6 lg:gap-8">
                    <div>
                      <p className="text-xs text-gray-400 mb-2">Adultes (informations uniquement)</p>
                      <NumberInput value={c.raw.adults} onChange={(e) => setItem(idx, { adults: e.target.value })} />
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 mb-2">
                        Enfants{c.act?.ageChild ? <span className="text-gray-400 ml-1">({c.act.ageChild})</span> : ""} (informations uniquement)
                      </p>
                      <NumberInput value={c.raw.children} onChange={(e) => setItem(idx, { children: e.target.value })} />
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 mb-2">
                        Bébés{c.act?.ageBaby ? <span className="text-gray-400 ml-1">({c.act.ageBaby})</span> : ""} (informations uniquement)
                      </p>
                      <NumberInput value={c.raw.babies} onChange={(e) => setItem(idx, { babies: e.target.value })} />
                    </div>
                  </div>
                </>
              ) : (
                <div className="bg-gradient-to-br from-slate-50/80 to-gray-50/60 border-2 border-slate-200/60 rounded-xl p-4 md:p-5">
                  <label className="block text-xs md:text-sm font-bold text-slate-700 mb-3">👥 Participants</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 md:gap-5">
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-2">Adultes</label>
                      <NumberInput value={c.raw.adults} onChange={(e) => setItem(idx, { adults: e.target.value })} placeholder="0" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-2">
                        Enfants{c.act?.ageChild ? <span className="text-slate-500 ml-1 font-normal">({c.act.ageChild})</span> : ""}
                      </label>
                      <NumberInput value={c.raw.children} onChange={(e) => setItem(idx, { children: e.target.value })} placeholder="0" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-2">
                        Bébés{c.act?.ageBaby ? <span className="text-slate-500 ml-1 font-normal">({c.act.ageBaby})</span> : ""}
                      </label>
                      <NumberInput value={c.raw.babies} onChange={(e) => setItem(idx, { babies: e.target.value })} placeholder="0" />
                    </div>
                  </div>
                </div>
              )}

              {/* Champs spécifiques pour ZERO TRACAS et ZERO TRACAS HORS ZONE */}
              {(c.act && isZeroTracasActivity(c.act.name)) || (c.act && isZeroTracasHorsZoneActivity(c.act.name)) ? (
                  <div className="bg-gradient-to-br from-indigo-50/80 to-purple-50/70 rounded-xl p-5 md:p-6 border-2 border-indigo-300/70 shadow-lg mt-4">
                  <p className="text-sm md:text-base font-bold text-slate-800 mb-4 flex items-center gap-2">
                    <span className="text-xl">🎯</span>
                    <span>Types de services {isZeroTracasHorsZoneActivity(c.act.name) ? "ZERO TRACAS HORS ZONE" : "ZERO TRACAS"}</span>
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
                    <div>
                      <label className="block text-xs md:text-sm font-bold text-slate-800 mb-2">
                        🚗 Transfert + Visa + SIM ({isZeroTracasHorsZoneActivity(c.act.name) ? "50€" : "45€"})
                      </label>
                      <NumberInput 
                        value={c.raw.zeroTracasTransfertVisaSim ?? ""} 
                        onChange={(e) => setItem(idx, { zeroTracasTransfertVisaSim: e.target.value === "" ? "" : e.target.value })}
                        placeholder="0"
                        className="text-base md:text-lg py-2"
                      />
                    </div>
                    <div>
                      <label className="block text-xs md:text-sm font-bold text-slate-800 mb-2">
                        🚗 Transfert + Visa ({isZeroTracasHorsZoneActivity(c.act.name) ? "45€" : "40€"})
                      </label>
                      <NumberInput 
                        value={c.raw.zeroTracasTransfertVisa ?? ""} 
                        onChange={(e) => setItem(idx, { zeroTracasTransfertVisa: e.target.value === "" ? "" : e.target.value })}
                        placeholder="0"
                        className="text-base md:text-lg py-2"
                      />
                    </div>
                    <div>
                      <label className="block text-xs md:text-sm font-bold text-slate-800 mb-2">
                        🚗 Transfert 3 personnes ({isZeroTracasHorsZoneActivity(c.act.name) ? "25€" : "20€"})
                      </label>
                      <NumberInput 
                        value={c.raw.zeroTracasTransfert3Personnes ?? ""} 
                        onChange={(e) => setItem(idx, { zeroTracasTransfert3Personnes: e.target.value === "" ? "" : e.target.value })}
                        placeholder="0"
                        className="text-base md:text-lg py-2"
                      />
                    </div>
                    <div>
                      <label className="block text-xs md:text-sm font-bold text-slate-800 mb-2">
                        🚗 Transfert + de 3 personnes ({isZeroTracasHorsZoneActivity(c.act.name) ? "30€" : "25€"})
                      </label>
                      <NumberInput 
                        value={c.raw.zeroTracasTransfertPlus3Personnes ?? ""} 
                        onChange={(e) => setItem(idx, { zeroTracasTransfertPlus3Personnes: e.target.value === "" ? "" : e.target.value })}
                        placeholder="0"
                        className="text-base md:text-lg py-2"
                      />
                    </div>
                    <div>
                      <label className="block text-xs md:text-sm font-bold text-slate-800 mb-2">
                        📱 Visa + SIM (40€)
                      </label>
                      <NumberInput 
                        value={c.raw.zeroTracasVisaSim ?? ""} 
                        onChange={(e) => setItem(idx, { zeroTracasVisaSim: e.target.value === "" ? "" : e.target.value })}
                        placeholder="0"
                        className="text-base md:text-lg py-2"
                      />
                    </div>
                    <div>
                      <label className="block text-xs md:text-sm font-bold text-slate-800 mb-2">
                        📄 Visa seul (30€)
                      </label>
                      <NumberInput 
                        value={c.raw.zeroTracasVisaSeul ?? ""} 
                        onChange={(e) => setItem(idx, { zeroTracasVisaSeul: e.target.value === "" ? "" : e.target.value })}
                        placeholder="0"
                        className="text-base md:text-lg py-2"
                      />
                    </div>
                  </div>
                </div>
              ) : null}

              {/* Extra dauphin (uniquement pour Speed Boat) */}
              {c.act && c.act.name && c.act.name.toLowerCase().includes("speed boat") && (
                <div className="flex items-center gap-2 mt-2">
                  <input
                    type="checkbox"
                    id={`extraDolphin-${idx}`}
                    checked={c.raw.extraDolphin || false}
                    onChange={(e) => setItem(idx, { extraDolphin: e.target.checked })}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <label htmlFor={`extraDolphin-${idx}`} className="text-sm text-gray-700 cursor-pointer">
                    Extra dauphin 20€
                  </label>
                </div>
              )}

              {/* Sous-total de l'activité */}
              <div className="mt-6 pt-6 border-t border-slate-200">
                <div className="flex items-center justify-between bg-slate-50 rounded-lg p-4 border border-slate-200">
                  <p className="text-sm font-medium text-slate-700">Sous-total de cette activité</p>
                  <p className="text-xl font-bold text-slate-900">
                    {currencyNoCents(Math.round(c.lineTotal), c.currency)}
                  </p>
                </div>
              </div>
              </div>
            </div>
          ))}
        </div>

        {/* Section Total et Actions */}
        <QuoteSummary
          computed={computed}
          grandTotalCash={grandTotalCash}
          grandTotalCard={grandTotalCard}
          grandCurrency={grandCurrency}
          onAddItem={addItem}
        />

        {/* Notes */}
        <NotesSection notes={notes} onNotesChange={setNotes} />

        {/* Bouton de soumission */}
        <PrimaryBtn 
          type="submit" 
          className="w-full text-base font-semibold py-3"
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <span className="flex items-center justify-center gap-2">
              <span className="animate-spin">⏳</span>
              Création en cours...
            </span>
          ) : (
            <span className="flex items-center justify-center gap-2">
              ✨ Créer le devis
            </span>
          )}
        </PrimaryBtn>
      </form>

      {/* Modale de paiement */}
      <PaymentModal
        show={showPaymentModal}
        selectedQuote={selectedQuote}
        quotes={quotes}
        setQuotes={setQuotes}
        user={user}
        onClose={() => {
          setShowPaymentModal(false);
          setSelectedQuote(null);
          setTicketNumbers({});
          setPaymentMethods({});
        }}
      />

      {/* Dialogs de confirmation */}
      {/* Modale de confirmation de suppression désactivée - suppression directe */}

      <ConfirmDialog
        isOpen={confirmResetForm}
        onClose={() => setConfirmResetForm(false)}
        onConfirm={() => {
          resetQuoteForm();
          toast.success("Formulaire réinitialisé.");
          setConfirmResetForm(false);
        }}
        title="Tout effacer"
        message="Êtes-vous sûr de vouloir tout effacer ?\n\nCette action supprimera toutes les activités et les informations client du formulaire.\n\nCette action est irréversible."
        confirmText="Effacer"
        cancelText="Annuler"
        type="danger"
      />

      {/* Modal de suggestions d'activités */}
      {showSuggestionsModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-3 md:p-4" style={{ WebkitOverflowScrolling: 'touch' }}>
          <div className="rounded-xl md:rounded-2xl border-2 border-indigo-200 bg-white shadow-2xl p-4 md:p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
            <div className="flex items-start justify-between gap-4 mb-4">
              <div className="flex items-center gap-3">
                <span className="text-3xl md:text-4xl">💡</span>
                <div>
                  <h3 className="text-lg md:text-xl font-bold text-slate-900">Suggestions d'activités</h3>
                  <p className="text-sm text-slate-600 mt-1">
                    Activités disponibles pour les dates sélectionnées
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowSuggestionsModal(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors text-2xl font-bold"
                aria-label="Fermer"
              >
                ×
              </button>
            </div>

            <div className="space-y-4 max-h-[60vh] overflow-y-auto">
              {suggestionsByCategory.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  <p className="text-lg font-medium">Aucune activité disponible</p>
                  <p className="text-sm mt-2">Aucune activité n'est disponible pour les dates sélectionnées.</p>
                </div>
              ) : (
                suggestionsByCategory.map((categoryData) => {
                  const isOpen = openCategories.has(categoryData.key);
                  return (
                    <div
                      key={categoryData.key}
                      className="border-2 border-indigo-200 rounded-xl bg-gradient-to-br from-indigo-50/30 to-white shadow-lg overflow-hidden transition-all"
                    >
                      <button
                        onClick={() => {
                          setOpenCategories((prev) => {
                            const next = new Set(prev);
                            if (next.has(categoryData.key)) {
                              next.delete(categoryData.key);
                            } else {
                              next.add(categoryData.key);
                            }
                            return next;
                          });
                        }}
                        className="w-full flex items-center justify-between gap-3 p-4 md:p-5 hover:bg-indigo-100/50 transition-colors cursor-pointer"
                      >
                        <div className="flex items-center gap-3 flex-1">
                          <span className="text-xl md:text-2xl transition-transform duration-200" style={{ transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}>
                            ▶
                          </span>
                          <span className="text-xl md:text-2xl">📋</span>
                          <h4 className="text-lg md:text-xl font-bold text-indigo-900">
                            {categoryData.label}
                          </h4>
                          <span className="px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full text-xs font-bold">
                            {categoryData.activities.length} activité{categoryData.activities.length > 1 ? "s" : ""}
                          </span>
                        </div>
                      </button>
                      
                      {isOpen && (
                        <div className="px-4 md:px-5 pb-4 md:pb-5 space-y-3 animate-fade-in">
                          {categoryData.activities.map((suggestion, idx) => {
                            const activity = suggestion.activity;
                            return (
                              <div
                                key={idx}
                                className="border-2 border-slate-200 rounded-xl p-4 hover:border-indigo-400 transition-all bg-white shadow-sm"
                              >
                                <div className="flex items-start justify-between gap-4 mb-3">
                                  <div className="flex-1">
                                    <h5 className="text-base md:text-lg font-bold text-slate-900 mb-1">
                                      {activity.name || "Activité sans nom"}
                                    </h5>
                                    <p className="text-sm text-slate-600">
                                      Disponible sur <span className="font-bold text-indigo-600">{suggestion.count}</span> date{suggestion.count > 1 ? "s" : ""}
                                    </p>
                                  </div>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      // Ajouter la première date disponible comme nouvel item
                                      const newItem = blankItemMemo();
                                      newItem.activityId = activity.id || activity.supabase_id || "";
                                      newItem.date = suggestion.availableDates[0];
                                      setItems((prev) => [...prev, newItem]);
                                      toast.success(`Activité "${activity.name}" ajoutée pour le ${new Date(suggestion.availableDates[0] + "T12:00:00").toLocaleDateString("fr-FR")}`);
                                    }}
                                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-semibold whitespace-nowrap shadow-md hover:shadow-lg"
                                  >
                                    Ajouter
                                  </button>
                                </div>
                                <div className="flex flex-wrap gap-2 mt-3">
                                  {suggestion.availableDates.slice(0, 10).map((date) => (
                                    <span
                                      key={date}
                                      className="px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-medium border border-indigo-200"
                                    >
                                      {new Date(date + "T12:00:00").toLocaleDateString("fr-FR", {
                                        weekday: "short",
                                        day: "numeric",
                                        month: "short",
                                      })}
                                    </span>
                                  ))}
                                  {suggestion.availableDates.length > 10 && (
                                    <span className="px-3 py-1.5 bg-slate-100 text-slate-600 rounded-lg text-xs font-medium">
                                      +{suggestion.availableDates.length - 10} autres
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-200">
              <button
                onClick={() => setShowSuggestionsModal(false)}
                className="px-5 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-700 font-medium hover:bg-slate-50 transition-colors"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

