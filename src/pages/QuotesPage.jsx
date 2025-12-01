import { useState, useMemo, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { SITE_KEY, LS_KEYS, NEIGHBORHOODS } from "../constants";
import { SPEED_BOAT_EXTRAS } from "../constants/activityExtras";
import { uuid, currency, currencyNoCents, calculateCardPrice, saveLS, loadLS, cleanPhoneNumber } from "../utils";
import { isBuggyActivity, getBuggyPrices, isMotoCrossActivity, getMotoCrossPrices } from "../utils/activityHelpers";
import { TextInput, NumberInput, PrimaryBtn, GhostBtn } from "../components/ui";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { ColoredDatePicker } from "../components/ColoredDatePicker";
import { toast } from "../utils/toast.js";
import { StopPushSalesSummary } from "../components/quotes/StopPushSalesSummary";
import { PaymentModal } from "../components/quotes/PaymentModal";
import { QuoteSummary } from "../components/quotes/QuoteSummary";
import { NotesSection } from "../components/quotes/NotesSection";
import { useActivityPriceCalculator } from "../hooks/useActivityPriceCalculator";
import { useAutoFillDates } from "../hooks/useAutoFillDates";

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

  // Charger les hôtels depuis Supabase
  useEffect(() => {
    async function loadHotels() {
      if (!supabase) return;
      try {
        const { data, error } = await supabase
          .from("hotels")
          .select("*")
          .eq("site_key", SITE_KEY)
          .order("name", { ascending: true });

        if (error) {
          console.error("Erreur lors du chargement des hôtels:", error);
        } else {
          setHotels(data || []);
        }
      } catch (err) {
        console.error("Erreur lors du chargement des hôtels:", err);
      }
    }

    loadHotels();
  }, []);

  // Charger les stop sales et push sales depuis Supabase avec cache
  useEffect(() => {
    async function loadStopSalesAndPushSales() {
      if (!supabase) return;
      try {
        const today = new Date().toISOString().split('T')[0];
        const cacheKey = createCacheKey("sales", SITE_KEY, today);
        
        // Vérifier le cache
        const cached = salesCache.get(cacheKey);
        if (cached) {
          setStopSales(cached.stopSales || []);
          setPushSales(cached.pushSales || []);
          return;
        }

        // Charger les stop sales et push sales en parallèle avec filtrage côté serveur (optimisé)
        const [stopSalesResult, pushSalesResult] = await Promise.all([
          supabase.from("stop_sales").select("*").eq("site_key", SITE_KEY).gte("date", today),
          supabase.from("push_sales").select("*").eq("site_key", SITE_KEY).gte("date", today),
        ]);

        // Traiter les stop sales (déjà filtrés côté serveur)
        const stopSalesData = (!stopSalesResult.error && stopSalesResult.data) ? stopSalesResult.data : [];
        const pushSalesData = (!pushSalesResult.error && pushSalesResult.data) ? pushSalesResult.data : [];
        
        setStopSales(stopSalesData);
        setPushSales(pushSalesData);
        
        // Mettre en cache
        salesCache.set(cacheKey, { stopSales: stopSalesData, pushSales: pushSalesData });
      } catch (err) {
        console.error("Erreur lors du chargement des stop sales/push sales:", err);
      }
    }

    loadStopSalesAndPushSales();
    
    // Recharger toutes les 60 secondes pour avoir les données à jour (optimisé avec cache)
    const interval = setInterval(loadStopSalesAndPushSales, 60000);
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


  // Hook pour le remplissage automatique des dates
  const handleAutoFillDates = useAutoFillDates(client, items, setItems, activitiesMap, stopSalesMap, pushSalesMap);

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
      toast.warning("Les dates passées ou du jour même ont été automatiquement corrigées pour demain.");
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
    <div className="space-y-8 md:space-y-10 p-4 md:p-6 lg:p-8">
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
          className="space-y-6 md:space-y-8"
        >
        {/* Barre d'information et actions */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 bg-gradient-to-r from-slate-50 to-blue-50 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="text-xl">💾</span>
            <p className="text-sm font-medium text-slate-700">
              Les modifications sont sauvegardées automatiquement
            </p>
          </div>
          <GhostBtn
            type="button"
            variant="danger"
            size="sm"
            onClick={() => setConfirmResetForm(true)}
            className="whitespace-nowrap"
          >
            🧹 Tout effacer
          </GhostBtn>
        </div>
        
        {/* Infos client */}
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border border-blue-200 shadow-sm p-6 md:p-8">
          <h3 className="text-xl md:text-2xl font-bold text-blue-900 mb-6 flex items-center gap-3">
            <span className="text-2xl">👤</span>
            <span>Informations client</span>
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-6">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700">Nom complet *</label>
              <TextInput 
                value={client.name} 
                onChange={(e) => setClient((c) => ({ ...c, name: e.target.value }))}
                placeholder="Jean Dupont"
                className="w-full"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700">Téléphone *</label>
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
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700">Email</label>
              <TextInput 
                type="email"
                value={client.email || ""} 
                onChange={(e) => setClient((c) => ({ ...c, email: e.target.value }))} 
                placeholder="email@exemple.com"
                className="w-full"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700">Hôtel</label>
              <div className="flex gap-2">
                <TextInput 
                  value={client.hotel} 
                  onChange={(e) => {
                    const hotelName = e.target.value;
                    setClient((c) => ({ ...c, hotel: hotelName }));
                    
                    // Rechercher l'hôtel dans la base de données (recherche insensible à la casse et partielle)
                    if (hotelName.trim().length >= 3) {
                      const hotelNameLower = hotelName.toLowerCase().trim();
                      // D'abord chercher une correspondance exacte
                      let foundHotel = hotels.find((h) => 
                        h.name.toLowerCase().trim() === hotelNameLower
                      );
                      
                      // Si pas de correspondance exacte, chercher une correspondance partielle
                      if (!foundHotel) {
                        foundHotel = hotels.find((h) => 
                          h.name.toLowerCase().trim().includes(hotelNameLower) ||
                          hotelNameLower.includes(h.name.toLowerCase().trim())
                        );
                      }
                      
                      if (foundHotel && foundHotel.neighborhood_key !== client.neighborhood) {
                        // Auto-sélectionner le quartier si l'hôtel est trouvé et que le quartier est différent
                        setClient((c) => ({ 
                          ...c, 
                          hotel: hotelName,
                          neighborhood: foundHotel.neighborhood_key 
                        }));
                        const neighborhoodLabel = NEIGHBORHOODS.find((n) => n.key === foundHotel.neighborhood_key)?.label || foundHotel.neighborhood_key;
                        toast.success(`Quartier détecté automatiquement : ${neighborhoodLabel}`, { duration: 3000 });
                      }
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
                    className="px-4 py-2.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-semibold whitespace-nowrap flex items-center gap-2"
                    title="Ouvrir sur Google Maps"
                  >
                    📍 Maps
                  </button>
                )}
              </div>
              {client.hotel && hotels.some((h) => h.name.toLowerCase().trim() === client.hotel.toLowerCase().trim()) && (
                <p className="text-xs text-green-600 mt-1">
                  ✓ Hôtel reconnu dans la base de données
                </p>
              )}
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700">Numéro de chambre</label>
              <TextInput 
                value={client.room} 
                onChange={(e) => setClient((c) => ({ ...c, room: e.target.value }))}
                placeholder="Ex: 205"
                className="w-full"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700">Quartier</label>
              <select
                value={client.neighborhood}
                onChange={(e) => setClient((c) => ({ ...c, neighborhood: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-normal text-slate-700 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
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
        <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-xl border border-indigo-200 shadow-sm p-6 md:p-8">
          <h3 className="text-lg md:text-xl font-bold text-indigo-900 mb-6 flex items-center gap-3">
            <span className="text-xl">📅</span>
            <span>Dates du séjour</span>
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-6">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700">Date d'arrivée *</label>
              <TextInput 
                type="date" 
                value={client.arrivalDate || ""} 
                onChange={(e) => setClient((c) => ({ ...c, arrivalDate: e.target.value }))}
                className="w-full"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700">Date de départ *</label>
              <div className="flex flex-col sm:flex-row gap-3">
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
                    title="Remplir automatiquement les dates des activités"
                    className="whitespace-nowrap"
                  >
                    ✨ Auto-dates
                  </GhostBtn>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Champ global pour le nombre d'adultes */}
        <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-xl border border-emerald-200 shadow-sm p-6 md:p-8">
          <div className="flex flex-col md:flex-row items-start md:items-center gap-5">
            <div className="flex items-center gap-3">
              <span className="text-2xl">👥</span>
              <div>
                <label className="block text-base md:text-lg font-bold text-emerald-900">
                  Nombre d'adultes global
                </label>
                <p className="text-sm text-emerald-700 mt-1">
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
                className="w-full text-base"
              />
              <p className="text-xs text-slate-500 mt-2">
                💡 Modifiable individuellement pour chaque activité
              </p>
            </div>
          </div>
        </div>

        {/* Lignes */}
        <div className="space-y-6 md:space-y-8">
          <h3 className="text-lg md:text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
            <span className="text-xl">🎯</span>
            <span>Activités ({computed.length})</span>
          </h3>
          {computed.map((c, idx) => (
            <div key={idx} className="bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden">
              {/* En-tête de l'activité */}
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-blue-200 px-6 py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-blue-600 text-white text-sm font-semibold">
                    {idx + 1}
                  </span>
                  <p className="text-base font-semibold text-blue-900">Activité #{idx + 1}</p>
                </div>
                <GhostBtn 
                  type="button" 
                  onClick={() => removeItem(idx)} 
                  variant="danger" 
                  size="sm"
                >
                  🗑️ Supprimer
                </GhostBtn>
              </div>
              
              {/* Contenu de l'activité */}
              <div className="p-6 md:p-8 space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-6">
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
                    stopSales={stopSales}
                    pushSales={pushSales}
                  />
                  {c.act && c.isStopSale && (
                    <div className="mt-3 p-3 rounded-lg border border-red-300 bg-red-50">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">🛑</span>
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-red-900">
                            STOP SALE
                          </p>
                          <p className="text-xs text-red-700 mt-0.5">
                            Cette activité est bloquée à la vente pour cette date
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                  {c.act && c.isPushSale && (
                    <div className="mt-3 p-3 rounded-lg border border-green-300 bg-green-50">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">✅</span>
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-green-900">
                            PUSH SALE
                          </p>
                          <p className="text-xs text-green-700 mt-0.5">
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
                        💰 Supplément transfert: {currency(c.transferInfo.surcharge || 0, c.currency)} / adulte
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

