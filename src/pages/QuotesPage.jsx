import { useState, useMemo, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { SITE_KEY, LS_KEYS, NEIGHBORHOODS } from "../constants";
import { SPEED_BOAT_EXTRAS } from "../constants/activityExtras";
import { uuid, currency, currencyNoCents, calculateCardPrice, saveLS, cleanPhoneNumber } from "../utils";
import { isBuggyActivity, getBuggyPrices, isMotoCrossActivity, getMotoCrossPrices } from "../utils/activityHelpers";
import { TextInput, NumberInput, PrimaryBtn, GhostBtn } from "../components/ui";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { ColoredDatePicker } from "../components/ColoredDatePicker";
import { toast } from "../utils/toast.js";
import { StopPushSalesSummary } from "../components/quotes/StopPushSalesSummary";
import { PaymentModal } from "../components/quotes/PaymentModal";

export function QuotesPage({ activities, quotes, setQuotes, user, draft, setDraft, onUsedDatesChange }) {
  const [stopSales, setStopSales] = useState([]);
  const [pushSales, setPushSales] = useState([]);

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
  const stopSalesMap = useMemo(() => {
    const map = new Map();
    stopSales.forEach((stop) => {
      const key = `${stop.activity_id}_${stop.date}`;
      map.set(key, stop);
    });
    return map;
  }, [stopSales]);

  // Map des push sales pour des recherches O(1) : clé = "activityId_date"
  const pushSalesMap = useMemo(() => {
    const map = new Map();
    pushSales.forEach((push) => {
      const key = `${push.activity_id}_${push.date}`;
      map.set(key, push);
    });
    return map;
  }, [pushSales]);

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
    const itemToRemove = items[i];
    const activityName = activitiesMap.get(itemToRemove?.activityId)?.name || "cette activité";
    setConfirmDeleteItem({ isOpen: true, index: i, activityName });
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

  // Charger les stop sales et push sales depuis Supabase
  useEffect(() => {
    async function loadStopSalesAndPushSales() {
      if (!supabase) return;
      try {
        const today = new Date().toISOString().split('T')[0]; // Date d'aujourd'hui au format YYYY-MM-DD

        // Charger les stop sales et push sales en parallèle pour améliorer les performances
        const [stopSalesResult, pushSalesResult] = await Promise.all([
          supabase.from("stop_sales").select("*").eq("site_key", SITE_KEY),
          supabase.from("push_sales").select("*").eq("site_key", SITE_KEY),
        ]);

        // Traiter les stop sales
        if (!stopSalesResult.error && stopSalesResult.data) {
          const validStopSales = [];
          const expiredStopSales = [];

          stopSalesResult.data.forEach((stopSale) => {
            if (stopSale.date < today) {
              expiredStopSales.push(stopSale.id);
            } else {
              validStopSales.push(stopSale);
            }
          });

          // Supprimer les stop sales expirés de Supabase (en arrière-plan, ne pas bloquer)
          if (expiredStopSales.length > 0) {
            supabase
              .from("stop_sales")
              .delete()
              .in("id", expiredStopSales)
              .catch((err) => console.warn("Erreur suppression stop sales expirés:", err));
          }

          setStopSales(validStopSales);
        }

        // Traiter les push sales
        if (!pushSalesResult.error && pushSalesResult.data) {
          const validPushSales = [];
          const expiredPushSales = [];

          pushSalesResult.data.forEach((pushSale) => {
            if (pushSale.date < today) {
              expiredPushSales.push(pushSale.id);
            } else {
              validPushSales.push(pushSale);
            }
          });

          // Supprimer les push sales expirés de Supabase (en arrière-plan, ne pas bloquer)
          if (expiredPushSales.length > 0) {
            supabase
              .from("push_sales")
              .delete()
              .in("id", expiredPushSales)
              .catch((err) => console.warn("Erreur suppression push sales expirés:", err));
          }

          setPushSales(validPushSales);
        }
      } catch (err) {
        console.error("Erreur lors du chargement des stop sales/push sales:", err);
      }
    }

    loadStopSalesAndPushSales();
    
    // Recharger toutes les 30 secondes pour avoir les données à jour (optimisé: réduit de 10s à 30s)
    const interval = setInterval(loadStopSalesAndPushSales, 30000);
    return () => clearInterval(interval);
  }, []);

  // Trier les activités par ordre alphabétique pour le menu déroulant
  const sortedActivities = useMemo(() => {
    return [...activities].sort((a, b) => {
      const nameA = (a.name || "").toLowerCase();
      const nameB = (b.name || "").toLowerCase();
      return nameA.localeCompare(nameB, "fr");
    });
  }, [activities]);


  // Fonction pour remplir automatiquement les dates des activités
  const handleAutoFillDates = useCallback(() => {
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

    // Générer toutes les dates entre l'arrivée et le départ avec leur jour de la semaine
    // Exclure le jour d'arrivée et le jour de départ
    const allDates = [];
    const currentDate = new Date(arrival);
    currentDate.setDate(currentDate.getDate() + 1); // Commencer le jour après l'arrivée
    const departureMinusOne = new Date(departure);
    departureMinusOne.setDate(departureMinusOne.getDate() - 1); // Terminer le jour avant le départ
    
    while (currentDate <= departureMinusOne) {
      const dateStr = new Date(currentDate).toISOString().slice(0, 10);
      const dayOfWeek = currentDate.getDay(); // 0 = dimanche, 1 = lundi, etc.
      allDates.push({ date: dateStr, dayOfWeek });
      currentDate.setDate(currentDate.getDate() + 1);
    }

    if (allDates.length === 0) {
      toast.warning("Aucune date disponible entre l'arrivée et le départ (les jours d'arrivée et de départ sont exclus).");
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
      return diffDays >= 2; // Au moins 2 jours entre l'activité et le départ
    };

    // Fonction helper pour vérifier si une date/activité est en stop sale (optimisé avec Map O(1))
    const isStopSale = (activityId, dateStr) => {
      const key = `${activityId}_${dateStr}`;
      return stopSalesMap.has(key);
    };

    // Fonction helper pour vérifier si une date/activité est en push sale (optimisé avec Map O(1))
    const isPushSale = (activityId, dateStr) => {
      const key = `${activityId}_${dateStr}`;
      return pushSalesMap.has(key);
    };

    // Fonction helper pour vérifier si une date est disponible pour une activité
    // (disponible si push sale OU (disponible normalement ET pas de stop sale))
    const isDateAvailableForActivity = (activityId, dateStr, dayOfWeek, availableDays) => {
      // Vérifier si c'est un push sale (toujours disponible)
      if (isPushSale(activityId, dateStr)) {
        return true;
      }
      
      // Vérifier si c'est un stop sale (jamais disponible sauf si push sale)
      if (isStopSale(activityId, dateStr)) {
        return false;
      }
      
      // Sinon, vérifier la disponibilité normale selon les jours disponibles
      if (availableDays && dayOfWeek != null) {
        return availableDays[dayOfWeek] === true;
      }
      
      // Si pas de jours définis, considérer comme disponible
      return true;
    };

    // Remplir les dates pour toutes les activités en tenant compte des jours disponibles
    let datesAssigned = 0;
    const usedDates = new Set(); // Pour éviter d'assigner la même date plusieurs fois si possible
    const divingActivitiesWithoutDate = []; // Pour les activités de plongée qui n'ont pas pu être assignées
    
    const updatedItems = items.map((item, idx) => {
      // Si pas d'activité sélectionnée, ne pas assigner de date
      if (!item.activityId) {
        return item;
      }

      // Trouver l'activité correspondante (optimisé avec Map O(1))
      const activity = activitiesMap.get(item.activityId);
      
      if (!activity) {
        // Si l'activité n'existe pas, utiliser la première date disponible non utilisée qui n'est pas en stop sale
        for (const dateInfo of allDates) {
          // Ne pas utiliser les dates en stop sale (sauf si push sale)
          if (!isStopSale(item.activityId, dateInfo.date) || isPushSale(item.activityId, dateInfo.date)) {
            if (!usedDates.has(dateInfo.date)) {
              usedDates.add(dateInfo.date);
              datesAssigned++;
              return { ...item, date: dateInfo.date };
            }
          }
        }
        // Si toutes les dates sont utilisées ou en stop sale, chercher n'importe quelle date disponible
        for (const dateInfo of allDates) {
          if (!isStopSale(item.activityId, dateInfo.date) || isPushSale(item.activityId, dateInfo.date)) {
            datesAssigned++;
            return { ...item, date: dateInfo.date };
          }
        }
        return item;
      }

      // Vérifier si c'est une activité de plongée
      const isDiving = isDivingActivity(activity.name);

      // Vérifier les jours disponibles de l'activité
      const availableDays = activity.availableDays || [false, false, false, false, false, false, false];
      const hasNoDaysDefined = availableDays.every(day => day === false);
      
      // Trouver une date disponible pour cette activité (priorité aux dates non encore utilisées)
      let assignedDate = null;
      
      // D'abord, chercher une date disponible et non utilisée
      for (const dateInfo of allDates) {
        // Pour la plongée, vérifier aussi la règle des 2 jours minimum
        if (isDiving && !isDateSafeForDiving(dateInfo.date)) {
          continue; // Skip cette date pour la plongée
        }
        
        // Vérifier si la date est disponible (push sale OU (disponible normalement ET pas de stop sale))
        if (isDateAvailableForActivity(activity.id, dateInfo.date, dateInfo.dayOfWeek, availableDays)) {
          if (!usedDates.has(dateInfo.date)) {
            assignedDate = dateInfo.date;
            usedDates.add(dateInfo.date);
            datesAssigned++;
            break;
          }
        }
      }
      
      // Si aucune date disponible non utilisée, prendre la première date disponible même si déjà utilisée
      if (!assignedDate) {
        for (const dateInfo of allDates) {
          // Pour la plongée, vérifier aussi la règle des 2 jours minimum
          if (isDiving && !isDateSafeForDiving(dateInfo.date)) {
            continue; // Skip cette date pour la plongée
          }
          
          // Vérifier si la date est disponible (push sale OU (disponible normalement ET pas de stop sale))
          if (isDateAvailableForActivity(activity.id, dateInfo.date, dateInfo.dayOfWeek, availableDays)) {
            assignedDate = dateInfo.date;
            datesAssigned++;
            break;
          }
        }
      }

      // Si aucune date disponible trouvée (activité sans jours définis), utiliser la première date non utilisée qui n'est pas en stop sale
      if (!assignedDate) {
        for (const dateInfo of allDates) {
          // Pour la plongée, vérifier aussi la règle des 2 jours minimum
          if (isDiving && !isDateSafeForDiving(dateInfo.date)) {
            continue; // Skip cette date pour la plongée
          }
          
          // Ne pas utiliser les dates en stop sale (sauf si push sale)
          if (!isStopSale(activity.id, dateInfo.date) || isPushSale(activity.id, dateInfo.date)) {
            if (!usedDates.has(dateInfo.date)) {
              assignedDate = dateInfo.date;
              usedDates.add(dateInfo.date);
              datesAssigned++;
              break;
            }
          }
        }
        // Si toutes les dates sont utilisées ou en stop sale, chercher n'importe quelle date disponible
        if (!assignedDate) {
          for (const dateInfo of allDates) {
            // Pour la plongée, vérifier aussi la règle des 2 jours minimum
            if (isDiving && !isDateSafeForDiving(dateInfo.date)) {
              continue; // Skip cette date pour la plongée
            }
            
            // Vérifier si la date est disponible (push sale OU (disponible normalement ET pas de stop sale))
            if (isDateAvailableForActivity(activity.id, dateInfo.date, dateInfo.dayOfWeek, availableDays)) {
              assignedDate = dateInfo.date;
              datesAssigned++;
              break;
            }
          }
        }
      }

      // Si c'est une activité de plongée et qu'aucune date n'a pu être assignée, noter cela
      if (isDiving && !assignedDate) {
        divingActivitiesWithoutDate.push(activity.name);
      }

      return { ...item, date: assignedDate || item.date };
    });

    // Détecter les conflits (activités avec la même date)
    const conflictsByDate = {};
    updatedItems.forEach((item, idx) => {
      if (item.date && item.activityId) {
        const activity = activitiesMap.get(item.activityId);
        const activityName = activity?.name || `Activité ${idx + 1}`;
        
        if (!conflictsByDate[item.date]) {
          conflictsByDate[item.date] = [];
        }
        conflictsByDate[item.date].push({ idx, name: activityName });
      }
    });

    // Filtrer pour ne garder que les dates avec conflits (plus d'une activité)
    const actualConflicts = Object.entries(conflictsByDate).filter(([date, activities]) => activities.length > 1);

    // Mettre à jour les items
    setItems(updatedItems);

    // Afficher les messages
    if (datesAssigned > 0) {
      let message = "";
      let hasWarnings = false;
      
      if (actualConflicts.length > 0) {
        hasWarnings = true;
        // Construire le message d'avertissement avec les conflits
        const conflictMessages = actualConflicts.map(([date, activities]) => {
          const dateFormatted = new Date(date + "T12:00:00").toLocaleDateString('fr-FR', { 
            weekday: 'long', 
            day: 'numeric', 
            month: 'long' 
          });
          const activityNames = activities.map(a => a.name).join(', ');
          return `le ${dateFormatted} : ${activityNames}`;
        });
        message = `⚠️ Attention : ${datesAssigned} date(s) assignée(s), mais des conflits détectés. Faire un choix entre ${conflictMessages.join(' | ')}`;
      } else {
        message = `${datesAssigned} date(s) assignée(s) automatiquement en tenant compte des jours disponibles !`;
      }
      
      // Ajouter un avertissement pour les activités de plongée non assignées
      if (divingActivitiesWithoutDate.length > 0) {
        hasWarnings = true;
        const divingNames = divingActivitiesWithoutDate.join(', ');
        message += ` ⚠️ ATTENTION SÉCURITÉ : Les activités de plongée (${divingNames}) n'ont pas pu être assignées car il faut un minimum de 2 jours entre la plongée et le départ (risque de décompression).`;
      }
      
      if (hasWarnings) {
        toast.warning(message, { duration: 10000 });
      } else {
        toast.success(message);
      }
    } else {
      let message = "Aucune date n'a pu être assignée. Vérifiez les jours disponibles des activités.";
      if (divingActivitiesWithoutDate.length > 0) {
        const divingNames = divingActivitiesWithoutDate.join(', ');
        message += ` ⚠️ ATTENTION SÉCURITÉ : Les activités de plongée (${divingNames}) nécessitent un minimum de 2 jours entre la plongée et le départ.`;
      }
      toast.warning(message, { duration: 10000 });
    }
  }, [client.arrivalDate, client.departureDate, autoFillDates, activitiesMap, items, stopSalesMap, pushSalesMap]);

  // Formater les stop sales avec les noms d'activités (optimisé avec Map)
  const formattedStopSales = useMemo(() => {
    return stopSales
      .map((stop) => {
        const activity = activitiesMap.get(stop.activity_id);
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
        const activity = activitiesMap.get(push.activity_id);
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

  const computed = useMemo(() => {
    return items.map((it) => {
      // Recherche optimisée O(1) avec Map au lieu de O(n) avec find
      const act = activitiesMap.get(it.activityId);
      const weekday = it.date ? new Date(it.date + "T12:00:00").getDay() : null;
      const baseAvailable = act && weekday != null ? !!act.availableDays?.[weekday] : true;
      
      // Vérifier les stop sales et push sales (optimisé avec Maps O(1))
      let isStopSale = false;
      let isPushSale = false;
      if (act && it.date) {
        const key = `${act.id}_${it.date}`;
        isStopSale = stopSalesMap.has(key);
        isPushSale = pushSalesMap.has(key);
      }
      
      // Disponibilité finale : disponible si push sale OU (baseAvailable ET pas de stop sale)
      const available = isPushSale || (baseAvailable && !isStopSale);
      
      const transferInfo = act && client.neighborhood ? act.transfers?.[client.neighborhood] || null : null;

      let lineTotal = 0;
      const currencyCode = act?.currency || "EUR";

      // cas spécial Speed Boat
      if (act && act.name && act.name.toLowerCase().includes("speed boat")) {
        const ad = Number(it.adults || 0);
        const ch = Number(it.children || 0);

        // Prix de base : 145€ pour 1 ou 2 adultes
        lineTotal = 145;

        // Si plus de 2 adultes : +20€ par adulte supplémentaire (au-delà de 2)
        if (ad > 2) {
          const extraAdults = ad - 2;
          lineTotal += extraAdults * 20;
        }

        // Tous les enfants : +10€ par enfant
        lineTotal += ch * 10;

        // Extra dauphin : +20€ si la case est cochée
        if (it.extraDolphin) {
          lineTotal += 20;
        }

        // Extra Speed Boat (plusieurs extras possibles) : calcul basé sur adultes et enfants
        if (it.speedBoatExtra && Array.isArray(it.speedBoatExtra) && it.speedBoatExtra.length > 0) {
          it.speedBoatExtra.forEach((extraId) => {
            if (extraId) { // Ignorer les valeurs vides
              const selectedExtra = SPEED_BOAT_EXTRAS.find((e) => e.id === extraId);
              if (selectedExtra) {
                lineTotal += ad * selectedExtra.priceAdult;
                lineTotal += ch * selectedExtra.priceChild;
              }
            }
          });
        }
        // Compatibilité avec l'ancien format (string) si présent
        else if (it.speedBoatExtra && typeof it.speedBoatExtra === "string" && it.speedBoatExtra !== "") {
          const selectedExtra = SPEED_BOAT_EXTRAS.find((e) => e.id === it.speedBoatExtra);
          if (selectedExtra) {
            lineTotal += ad * selectedExtra.priceAdult;
            lineTotal += ch * selectedExtra.priceChild;
          }
        }

      } else if (act && isBuggyActivity(act.name)) {
        // cas spécial BUGGY + SHOW et BUGGY SAFARI MATIN : calcul basé sur buggy simple et family
        const buggySimple = Number(it.buggySimple || 0);
        const buggyFamily = Number(it.buggyFamily || 0);
        const prices = getBuggyPrices(act.name);
        lineTotal = buggySimple * prices.simple + buggyFamily * prices.family;
      } else if (act && isMotoCrossActivity(act.name)) {
        // cas spécial MOTO CROSS : calcul basé sur les trois types de moto
        const yamaha250 = Number(it.yamaha250 || 0);
        const ktm640 = Number(it.ktm640 || 0);
        const ktm530 = Number(it.ktm530 || 0);
        const prices = getMotoCrossPrices();
        lineTotal = yamaha250 * prices.yamaha250 + ktm640 * prices.ktm640 + ktm530 * prices.ktm530;
      } else if (act && (act.name.toLowerCase().includes("hurghada") && (act.name.toLowerCase().includes("le caire") || act.name.toLowerCase().includes("louxor")))) {
        // cas spécial HURGHADA - LE CAIRE et HURGHADA - LOUXOR
        // Prix fixe : Aller simple = 150€, Aller retour = 300€
        // Les adultes/enfants/bébés ne changent pas le prix
        if (it.allerSimple) {
          lineTotal = 150;
        } else if (it.allerRetour) {
          lineTotal = 300;
        }
        // Sinon, le prix reste à 0
      } else if (act && act.name.toLowerCase().includes("soma bay") && act.name.toLowerCase().includes("aeroport") && act.name.toLowerCase().includes("7")) {
        // cas spécial SOMA BAY - AEROPORT 7 pax
        // Prix fixe : Aller simple = 40€, Aller retour = 80€
        // Les adultes/enfants/bébés ne changent pas le prix
        if (it.allerSimple) {
          lineTotal = 40;
        } else if (it.allerRetour) {
          lineTotal = 80;
        }
        // Sinon, le prix reste à 0
      } else if (act && act.name.toLowerCase().includes("soma bay") && act.name.toLowerCase().includes("aeroport") && act.name.toLowerCase().includes("4")) {
        // cas spécial SOMA BAY - AEROPORT 4 pax
        // Prix fixe : Aller simple = 35€, Aller retour = 70€
        // Les adultes/enfants/bébés ne changent pas le prix
        if (it.allerSimple) {
          lineTotal = 35;
        } else if (it.allerRetour) {
          lineTotal = 70;
        }
        // Sinon, le prix reste à 0
      } else if (act && act.name.toLowerCase().includes("hors zone") && (act.name.toLowerCase().includes("aeroport") || act.name.toLowerCase().includes("aerport")) && act.name.toLowerCase().includes("7")) {
        // cas spécial HORS ZONE - AERPORT 7 pax
        // Prix fixe : Aller simple = 30€, Aller retour = 60€
        // Les adultes/enfants/bébés ne changent pas le prix
        if (it.allerSimple) {
          lineTotal = 30;
        } else if (it.allerRetour) {
          lineTotal = 60;
        }
        // Sinon, le prix reste à 0
      } else if (act && act.name.toLowerCase().includes("hors zone") && (act.name.toLowerCase().includes("aeroport") || act.name.toLowerCase().includes("aerport")) && act.name.toLowerCase().includes("4")) {
        // cas spécial HORS ZONE - AERPORT 4 pax
        // Prix fixe : Aller simple = 25€, Aller retour = 50€
        // Les adultes/enfants/bébés ne changent pas le prix
        if (it.allerSimple) {
          lineTotal = 25;
        } else if (it.allerRetour) {
          lineTotal = 50;
        }
        // Sinon, le prix reste à 0
      } else if (act && act.name.toLowerCase().includes("aeroport") && act.name.toLowerCase().includes("7")) {
        // cas spécial HURGHADA - AEROPORT 7 pax
        // Prix fixe : Aller simple = 25€, Aller retour = 50€
        // Les adultes/enfants/bébés ne changent pas le prix
        if (it.allerSimple) {
          lineTotal = 25;
        } else if (it.allerRetour) {
          lineTotal = 50;
        }
        // Sinon, le prix reste à 0
      } else if (act && act.name.toLowerCase().includes("soma bay") && (act.name.toLowerCase().includes("aeroport") || act.name.toLowerCase().includes("aerport")) && act.name.toLowerCase().includes("4")) {
        // cas spécial SOMA BAY - AEROPORT 4 pax
        // Prix fixe : Aller simple = 35€, Aller retour = 70€
        // Les adultes/enfants/bébés ne changent pas le prix
        if (it.allerSimple) {
          lineTotal = 35;
        } else if (it.allerRetour) {
          lineTotal = 70;
        }
        // Sinon, le prix reste à 0
      } else if (act && act.name.toLowerCase().includes("aeroport") && act.name.toLowerCase().includes("4")) {
        // cas spécial HURGHADA - AEROPORT 4 pax
        // Prix fixe : Aller simple = 20€, Aller retour = 40€
        // Les adultes/enfants/bébés ne changent pas le prix
        if (it.allerSimple) {
          lineTotal = 20;
        } else if (it.allerRetour) {
          lineTotal = 40;
        }
        // Sinon, le prix reste à 0
      } else if (act) {
        lineTotal += Number(it.adults || 0) * Number(act.priceAdult || 0);
        lineTotal += Number(it.children || 0) * Number(act.priceChild || 0);
        lineTotal += Number(it.babies || 0) * Number(act.priceBaby || 0);
        
      }

      // supplément transfert PAR ADULTE
      if (transferInfo && transferInfo.surcharge) {
        if (act && isMotoCrossActivity(act.name)) {
          // Pour MOTO CROSS, le supplément est calculé sur le nombre total de motos
          const totalMotos = Number(it.yamaha250 || 0) + Number(it.ktm640 || 0) + Number(it.ktm530 || 0);
          lineTotal += Number(transferInfo.surcharge || 0) * totalMotos;
        } else {
          // Pour toutes les autres activités (y compris buggy), le supplément est calculé sur le nombre d'adultes
          lineTotal += Number(transferInfo.surcharge || 0) * Number(it.adults || 0);
        }
      }

      // extra (montant à ajouter ou soustraire) - s'applique à toutes les activités
      if (it.extraAmount !== undefined && it.extraAmount !== null && it.extraAmount !== "") {
        const extraAmountValue = Number(it.extraAmount);
        if (!isNaN(extraAmountValue)) {
          lineTotal += extraAmountValue;
        }
      }

      const pickupTime =
        it.slot === "morning"
          ? transferInfo?.morningTime
          : it.slot === "afternoon"
            ? transferInfo?.afternoonTime
            : it.slot === "evening"
              ? transferInfo?.eveningTime
              : "";

      return {
        raw: it,
        act,
        weekday,
        available,
        baseAvailable,
        isStopSale,
        isPushSale,
        transferInfo,
        lineTotal,
        pickupTime,
        currency: currencyCode,
      };
    });
  }, [items, activitiesMap, client.neighborhood, stopSalesMap, pushSalesMap]);

  const grandCurrency = computed.find((c) => c.currency)?.currency || "EUR";
  const grandTotal = computed.reduce((s, c) => s + (c.lineTotal || 0), 0);
  const grandTotalCash = Math.round(grandTotal); // Prix espèces (arrondi sans centimes)
  const grandTotalCard = calculateCardPrice(grandTotal); // Prix carte (espèces + 3% arrondi à l'euro supérieur)

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
        extraAmount: Number(c.raw.extraAmount || 0),
        extraDolphin: c.raw.extraDolphin || false,
        speedBoatExtra: Array.isArray(c.raw.speedBoatExtra) ? c.raw.speedBoatExtra : (c.raw.speedBoatExtra ? [c.raw.speedBoatExtra] : []),
        buggySimple: Number(c.raw.buggySimple || 0),
        buggyFamily: Number(c.raw.buggyFamily || 0),
        yamaha250: Number(c.raw.yamaha250 || 0),
        ktm640: Number(c.raw.ktm640 || 0),
        ktm530: Number(c.raw.ktm530 || 0),
        allerSimple: c.raw.allerSimple || false,
        allerRetour: c.raw.allerRetour || false,
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
        const supabaseData = {
          site_key: SITE_KEY,
          client_name: q.client.name || "",
          client_phone: q.client.phone || "",
          client_email: q.client.email || "",
          client_hotel: q.client.hotel || "",
          client_room: q.client.room || "",
          client_neighborhood: q.client.neighborhood || "",
          client_arrival_date: q.clientArrivalDate || q.client?.arrivalDate || "",
          client_departure_date: q.clientDepartureDate || q.client?.departureDate || "",
          notes: q.notes || "",
          total: q.total,
          currency: q.currency,
          items: JSON.stringify(q.items),
          created_by_name: q.createdByName || "",
          created_at: q.createdAt,
          updated_at: q.createdAt, // Initialiser updated_at avec la date de création
        };

        console.log("🔄 Envoi du devis à Supabase:", supabaseData);
        const { data, error } = await supabase.from("quotes").insert(supabaseData).select().single();

        if (error) {
          console.error("❌ ERREUR Supabase (création devis):", error);
          console.error("Détails:", JSON.stringify(error, null, 2));
          
          // Toujours afficher l'erreur pour le debug
          toast.error(
            "Erreur Supabase (création devis). Vérifiez la console pour plus de détails. Le devis est quand même enregistré en local."
          );
        } else {
          console.log("✅ Devis créé avec succès dans Supabase!");
          console.log("Réponse:", data);
          
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
            console.warn("⚠️ Supabase a retourné une réponse mais sans ID");
            toast.warning("Devis créé localement mais problème de synchronisation avec Supabase.");
          }
        }
      } catch (err) {
        console.error("❌ EXCEPTION lors de l'envoi du devis à Supabase:", err);
        toast.error(
          "Exception lors de l'envoi à Supabase. Vérifiez la console pour plus de détails. Le devis est quand même enregistré en local."
        );
      }
    } else {
      console.warn("⚠️ Supabase non configuré - le devis n'est enregistré qu'en local");
    }

    // Réinitialiser le formulaire après création réussie
    resetQuoteForm();

    setIsSubmitting(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
    
    // Afficher un message de succès
    toast.success("Devis créé avec succès ! Formulaire réinitialisé.");
  }


  return (
    <div className="space-y-10">
        {/* Section Stop Sales et Push Sales - Compacte et repliable */}
        {(formattedStopSales.length > 0 || formattedPushSales.length > 0) && (
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
          className="space-y-4 md:space-y-8"
        >
        <div className="flex flex-col sm:flex-row flex-wrap items-start sm:items-center justify-between gap-3 mb-2">
          <p className="text-xs md:text-sm text-slate-600 font-medium bg-blue-50/50 px-3 py-2 rounded-lg border border-blue-100/60">
            💾 Les modifications sont sauvegardées automatiquement en brouillon
          </p>
          <GhostBtn
            type="button"
            variant="danger"
            size="sm"
            onClick={() => setConfirmResetForm(true)}
            className="w-full sm:w-auto"
          >
            🧹 Tout effacer
          </GhostBtn>
        </div>
        {/* Infos client */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4 md:gap-6 lg:gap-8">
          <div>
            <p className="text-xs text-gray-500 mb-2">Client</p>
            <TextInput value={client.name} onChange={(e) => setClient((c) => ({ ...c, name: e.target.value }))} />
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-2">Téléphone</p>
            <TextInput 
              value={client.phone} 
              onChange={(e) => {
                // Nettoyer automatiquement le numéro de téléphone (supprimer espaces, parenthèses, etc.)
                const cleaned = cleanPhoneNumber(e.target.value);
                setClient((c) => ({ ...c, phone: cleaned }));
              }} 
            />
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-2">Email</p>
            <TextInput 
              type="email"
              value={client.email || ""} 
              onChange={(e) => setClient((c) => ({ ...c, email: e.target.value }))} 
              placeholder="email@exemple.com"
            />
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-2">Hôtel</p>
            <TextInput value={client.hotel} onChange={(e) => setClient((c) => ({ ...c, hotel: e.target.value }))} />
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-2">Chambre</p>
            <TextInput value={client.room} onChange={(e) => setClient((c) => ({ ...c, room: e.target.value }))} />
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-2">Quartier (client)</p>
            <select
              value={client.neighborhood}
              onChange={(e) => setClient((c) => ({ ...c, neighborhood: e.target.value }))}
              className="w-full rounded-xl border border-blue-200/50 bg-white px-3 py-2 text-sm"
            >
              <option value="">— Choisir —</option>
              {NEIGHBORHOODS.map((n) => (
                <option key={n.key} value={n.key}>
                  {n.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Dates séjour */}
        <div className="bg-gradient-to-br from-indigo-50/80 to-purple-50/60 rounded-2xl border border-indigo-200/60 p-5 md:p-6 lg:p-8 shadow-md backdrop-blur-sm">
          <h3 className="text-base md:text-lg font-semibold text-slate-800 mb-4 md:mb-5 flex items-center gap-2">
            <span className="text-xl">📅</span>
            Dates du séjour
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
            <div>
              <label className="block text-xs md:text-sm font-semibold text-slate-700 mb-2">Date d'arrivée</label>
              <TextInput 
                type="date" 
                value={client.arrivalDate || ""} 
                onChange={(e) => setClient((c) => ({ ...c, arrivalDate: e.target.value }))} 
              />
            </div>
            <div>
              <label className="block text-xs md:text-sm font-semibold text-slate-700 mb-2">Date de départ</label>
              <div className="flex gap-2">
                <TextInput 
                  type="date" 
                  value={client.departureDate || ""} 
                  onChange={(e) => setClient((c) => ({ ...c, departureDate: e.target.value }))} 
                  className="flex-1"
                />
                {client.arrivalDate && client.departureDate && (
                  <GhostBtn
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleAutoFillDates();
                    }}
                    variant="primary"
                    size="sm"
                    title="Remplir automatiquement les dates des activités avec les dates du séjour"
                    className="whitespace-nowrap"
                  >
                    📅 Auto-dates
                  </GhostBtn>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Champ global pour le nombre d'adultes */}
        <div className="mb-4 md:mb-6 p-5 md:p-6 bg-gradient-to-br from-emerald-50/90 to-teal-50/80 rounded-2xl border-2 border-emerald-300/60 shadow-lg backdrop-blur-sm">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="flex-1">
              <label className="block text-sm md:text-base font-bold text-slate-800 mb-3 flex items-center gap-2">
                <span className="text-2xl">👥</span>
                Nombre d'adultes global
              </label>
              <p className="text-xs md:text-sm text-slate-600 mb-3 font-medium">
                Remplit automatiquement toutes les activités ci-dessous
              </p>
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
                className="max-w-xs text-base font-semibold"
              />
              <p className="text-xs text-slate-500 mt-2 italic">
                💡 Vous pouvez toujours modifier individuellement le nombre d'adultes pour chaque activité
              </p>
            </div>
          </div>
        </div>

        {/* Lignes */}
        <div className="space-y-6 md:space-y-8">
          <h3 className="text-lg md:text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
            <span className="text-2xl">🎯</span>
            Activités ({computed.length})
          </h3>
          {computed.map((c, idx) => (
            <div key={idx} className="bg-white/95 backdrop-blur-sm border-2 border-slate-200/60 rounded-2xl p-5 md:p-7 lg:p-9 space-y-5 md:space-y-6 lg:space-y-8 shadow-lg transition-all duration-300 hover:shadow-xl hover:border-blue-300/60">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-1 pb-4 border-b border-slate-200/60">
                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 text-white text-sm font-bold shadow-md">
                    {idx + 1}
                  </span>
                  <p className="text-base md:text-lg font-bold text-slate-800">Activité #{idx + 1}</p>
                </div>
                <GhostBtn type="button" onClick={() => removeItem(idx)} variant="danger" className="w-full sm:w-auto">
                  🗑️ Supprimer
                </GhostBtn>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-5 md:gap-6 lg:gap-8 items-end">
                <div className="sm:col-span-2 md:col-span-2">
                  <label className="block text-xs md:text-sm font-bold text-slate-700 mb-2.5">Activité *</label>
                  <select
                    value={c.raw.activityId}
                    onChange={(e) => setItem(idx, { activityId: e.target.value })}
                    className="w-full rounded-xl border-2 border-blue-300/60 bg-white/98 backdrop-blur-sm px-4 py-3 text-sm md:text-base font-medium text-slate-800 shadow-md focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all"
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
                  <label className="block text-xs md:text-sm font-bold text-slate-700 mb-2.5">Date *</label>
                  <ColoredDatePicker
                    value={c.raw.date}
                    onChange={(date) => setItem(idx, { date })}
                    activity={c.act}
                    stopSales={stopSales}
                    pushSales={pushSales}
                  />
                  {c.act && c.isStopSale && (
                    <div className="mt-3 p-3 rounded-lg border-2 border-red-500 bg-gradient-to-r from-red-50 to-red-100/80 shadow-md animate-pulse">
                      <div className="flex items-center gap-2">
                        <span className="text-2xl">🛑</span>
                        <div className="flex-1">
                          <p className="text-sm font-bold text-red-900 leading-tight">
                            STOP SALE
                          </p>
                          <p className="text-xs text-red-800 mt-0.5">
                            Cette activité est bloquée à la vente pour cette date
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                  {c.act && c.isPushSale && (
                    <div className="mt-3 p-3 rounded-lg border-2 border-green-500 bg-gradient-to-r from-green-50 to-emerald-50 shadow-md">
                      <div className="flex items-center gap-2">
                        <span className="text-2xl">✅</span>
                        <div className="flex-1">
                          <p className="text-sm font-bold text-green-900 leading-tight">
                            PUSH SALE
                          </p>
                          <p className="text-xs text-green-800 mt-0.5">
                            Cette activité est ouverte exceptionnellement pour cette date
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                  {c.act && !c.isStopSale && !c.isPushSale && !c.baseAvailable && (
                    <div className="mt-3 p-3 rounded-lg border-2 border-amber-400 bg-gradient-to-r from-amber-50 to-yellow-50 shadow-md">
                      <div className="flex items-center gap-2">
                        <span className="text-2xl">⚠️</span>
                        <div className="flex-1">
                          <p className="text-sm font-bold text-amber-900 leading-tight">
                            Activité non disponible
                          </p>
                          <p className="text-xs text-amber-800 mt-0.5">
                            Pas disponible ce jour-là (on peut quand même créer)
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-2">Quartier</p>
                  <div className="rounded-xl border border-dashed border-blue-200/50 bg-blue-50/50 px-3 py-2 text-sm text-gray-600">
                    {client.neighborhood
                      ? NEIGHBORHOODS.find((n) => n.key === client.neighborhood)?.label
                      : "— Choisir avec le client"}
                  </div>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-2">Créneau</p>
                  <select
                    value={c.raw.slot}
                    onChange={(e) => setItem(idx, { slot: e.target.value })}
                    className="w-full rounded-xl border border-blue-200/50 bg-white/95 backdrop-blur-sm px-3 py-2 text-sm shadow-sm"
                    disabled={!c.transferInfo || (!c.transferInfo.morningEnabled && !c.transferInfo.afternoonEnabled && !c.transferInfo.eveningEnabled)}
                  >
                    <option value="">— Choisir —</option>
                    {c.transferInfo?.morningEnabled && (
                      <option value="morning">Matin {c.transferInfo.morningTime ? `(${c.transferInfo.morningTime})` : ""}</option>
                    )}
                    {c.transferInfo?.afternoonEnabled && (
                      <option value="afternoon">
                        Après-midi {c.transferInfo.afternoonTime ? `(${c.transferInfo.afternoonTime})` : ""}
                      </option>
                    )}
                    {c.transferInfo?.eveningEnabled && (
                      <option value="evening">
                        Soir {c.transferInfo.eveningTime ? `(${c.transferInfo.eveningTime})` : ""}
                      </option>
                    )}
                  </select>
                  {c.transferInfo && (
                    <p className="text-[10px] text-gray-500 mt-1">
                      Supplément transfert: {currency(c.transferInfo.surcharge || 0, c.currency)} / adulte
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
                                const currentExtras = Array.isArray(c.raw.speedBoatExtra) 
                                  ? c.raw.speedBoatExtra 
                                  : (c.raw.speedBoatExtra && typeof c.raw.speedBoatExtra === "string" && c.raw.speedBoatExtra !== "" 
                                    ? [c.raw.speedBoatExtra] 
                                    : []);
                                
                                if (e.target.checked) {
                                  // Ajouter l'extra s'il n'est pas déjà dans la liste
                                  if (!currentExtras.includes(extra.id)) {
                                    setItem(idx, { speedBoatExtra: [...currentExtras, extra.id] });
                                  }
                                } else {
                                  // Retirer l'extra de la liste
                                  setItem(idx, { speedBoatExtra: currentExtras.filter((id) => id !== extra.id) });
                                }
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

              <div className="flex items-center justify-between mt-6 pt-5 border-t-2 border-slate-200/60 bg-gradient-to-r from-slate-50/60 to-blue-50/40 rounded-xl p-4">
                <p className="text-sm md:text-base font-bold text-slate-700">Sous-total activité</p>
                <div className="text-right">
                  <p className="text-lg md:text-xl font-bold text-slate-900">
                    💵 {currencyNoCents(Math.round(c.lineTotal), c.currency)}
                  </p>
                  <p className="text-sm md:text-base font-semibold text-slate-600">
                    💳 {currencyNoCents(calculateCardPrice(c.lineTotal), c.currency)}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="bg-gradient-to-br from-indigo-50/90 via-purple-50/80 to-pink-50/70 border-2 border-indigo-300/60 rounded-2xl p-5 md:p-7 shadow-xl backdrop-blur-sm">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
            <GhostBtn type="button" onClick={addItem} variant="primary" className="w-full sm:w-auto text-base font-bold px-6 py-3">
              ➕ Ajouter une activité
            </GhostBtn>
            <div className="text-left sm:text-right w-full sm:w-auto bg-white/80 rounded-xl p-4 md:p-5 border-2 border-indigo-200/60 shadow-md">
              <p className="text-xs md:text-sm font-semibold text-slate-600 mb-2 uppercase tracking-wide">Total du devis</p>
              <p className="text-xl md:text-2xl font-bold text-slate-900 mb-1">
                💵 {currencyNoCents(grandTotalCash, grandCurrency)}
              </p>
              <p className="text-lg md:text-xl font-semibold text-slate-700">
                💳 {currencyNoCents(grandTotalCard, grandCurrency)}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-amber-50/80 to-yellow-50/60 border-2 border-amber-200/60 rounded-2xl p-5 md:p-6 shadow-md backdrop-blur-sm">
          <label className="block text-sm md:text-base font-bold text-slate-700 mb-3 flex items-center gap-2">
            <span className="text-xl">📝</span>
            Notes et informations supplémentaires
          </label>
          <TextInput
            placeholder="Langue du guide, point de pick-up, demandes spéciales, etc."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="text-base"
          />
          <p className="text-xs text-slate-500 mt-2 italic">
            Ces informations seront incluses dans le devis final
          </p>
        </div>

        <PrimaryBtn 
          type="submit" 
          className="w-full"
          disabled={isSubmitting}
        >
          {isSubmitting ? "Création en cours..." : "Créer le devis"}
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
      <ConfirmDialog
        isOpen={confirmDeleteItem.isOpen}
        onClose={() => setConfirmDeleteItem({ isOpen: false, index: null, activityName: "" })}
        onConfirm={handleConfirmDeleteItem}
        title="Supprimer l'activité"
        message={`Êtes-vous sûr de vouloir supprimer "${confirmDeleteItem.activityName}" de ce devis ?\n\nCette action est irréversible.`}
        confirmText="Supprimer"
        cancelText="Annuler"
        type="danger"
      />

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
    </div>
  );
}

