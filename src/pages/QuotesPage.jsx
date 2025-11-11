import { useState, useMemo, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { SITE_KEY, LS_KEYS, NEIGHBORHOODS } from "../constants";
import { SPEED_BOAT_EXTRAS } from "../constants/activityExtras";
import { uuid, currency, currencyNoCents, calculateCardPrice, saveLS, cleanPhoneNumber } from "../utils";
import { TextInput, NumberInput, PrimaryBtn, GhostBtn } from "../components/ui";
import { toast } from "../utils/toast.js";
import { isBuggyActivity, getBuggyPrices, isMotoCrossActivity, getMotoCrossPrices } from "../utils/activityHelpers";

// Composant calendrier personnalisé avec jours colorés
function ColoredDatePicker({ value, onChange, activity, stopSales, pushSales }) {
  const [showCalendar, setShowCalendar] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(() => {
    const date = value ? new Date(value + "T12:00:00") : new Date();
    return new Date(date.getFullYear(), date.getMonth(), 1);
  });

  // Mettre à jour le mois affiché quand la valeur change
  useEffect(() => {
    if (value) {
      const date = new Date(value + "T12:00:00");
      setCurrentMonth(new Date(date.getFullYear(), date.getMonth(), 1));
    }
  }, [value]);

  const getDayStatus = useCallback((date) => {
    if (!activity) return null; // Pas d'activité sélectionnée
    
    // Utiliser une méthode qui ne dépend pas du fuseau horaire
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;
    
    const weekday = date.getDay();
    const baseAvailable = activity.availableDays?.[weekday] === true;
    
    // Vérifier stop sales et push sales
    const isStopSale = stopSales.some(s => s.activity_id === activity.id && s.date === dateStr);
    const isPushSale = pushSales.some(p => p.activity_id === activity.id && p.date === dateStr);
    
    if (isStopSale) return 'stop-sale';
    if (isPushSale) return 'push-sale';
    if (baseAvailable) return 'available';
    return 'unavailable';
  }, [activity, stopSales, pushSales]);

  const getDaysInMonth = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();
    
    const days = [];
    
    // Jours du mois précédent (pour compléter la première semaine)
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    for (let i = startingDayOfWeek - 1; i >= 0; i--) {
      days.push({
        date: new Date(year, month - 1, prevMonthLastDay - i),
        isCurrentMonth: false
      });
    }
    
    // Jours du mois actuel
    for (let day = 1; day <= daysInMonth; day++) {
      days.push({
        date: new Date(year, month, day),
        isCurrentMonth: true
      });
    }
    
    // Jours du mois suivant (pour compléter la dernière semaine)
    const remainingDays = 42 - days.length; // 6 semaines * 7 jours
    for (let day = 1; day <= remainingDays; day++) {
      days.push({
        date: new Date(year, month + 1, day),
        isCurrentMonth: false
      });
    }
    
    return days;
  };

  const days = useMemo(() => getDaysInMonth(currentMonth), [currentMonth]);
  const monthNames = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
  const dayNames = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];

  const handleDateClick = (date) => {
    if (!activity) {
      toast.warning("Veuillez d'abord sélectionner une activité");
      return;
    }
    // Utiliser une méthode qui ne dépend pas du fuseau horaire
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;
    onChange(dateStr);
    setShowCalendar(false);
  };

  const prevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };

  const getDayClassName = (day, status) => {
    const baseClasses = "w-10 h-10 flex items-center justify-center text-sm font-medium rounded-lg cursor-pointer transition-all hover:scale-110 ";
    const today = new Date();
    const isToday = day.date.toDateString() === today.toDateString();
    // Comparer les dates sans dépendre du fuseau horaire
    const year = day.date.getFullYear();
    const month = String(day.date.getMonth() + 1).padStart(2, '0');
    const dayNum = String(day.date.getDate()).padStart(2, '0');
    const dayDateStr = `${year}-${month}-${dayNum}`;
    const isSelected = value && dayDateStr === value;
    
    if (!day.isCurrentMonth) {
      return baseClasses + "text-gray-300 cursor-not-allowed";
    }
    
    let colorClasses = "";
    switch (status) {
      case 'available':
        colorClasses = "bg-green-100 text-green-800 border-2 border-green-400 hover:bg-green-200";
        break;
      case 'unavailable':
        colorClasses = "bg-red-100 text-red-800 border-2 border-red-400 hover:bg-red-200";
        break;
      case 'stop-sale':
        colorClasses = "bg-red-500 text-white border-2 border-red-700 hover:bg-red-600 animate-pulse";
        break;
      case 'push-sale':
        colorClasses = "bg-green-500 text-white border-2 border-green-700 hover:bg-green-600";
        break;
      default:
        colorClasses = "bg-gray-100 text-gray-600 border border-gray-300 hover:bg-gray-200";
    }
    
    if (isSelected) {
      colorClasses += " ring-4 ring-blue-400 ring-offset-2";
    }
    
    if (isToday) {
      colorClasses += " font-bold";
    }
    
    return baseClasses + colorClasses;
  };

  return (
    <div className="relative">
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <TextInput
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onFocus={() => activity && setShowCalendar(true)}
            placeholder="YYYY-MM-DD"
            pattern="\d{4}-\d{2}-\d{2}"
            className="w-full"
          />
          {/* Masquer le picker natif en utilisant un input text au lieu de date */}
        </div>
        {activity && (
          <button
            type="button"
            onClick={() => setShowCalendar(!showCalendar)}
            className="px-4 py-2 bg-blue-500 text-white rounded-xl hover:bg-blue-600 transition-colors font-semibold"
            title="Ouvrir le calendrier avec disponibilités"
          >
            📅
          </button>
        )}
      </div>
      
      {showCalendar && activity && (
        <>
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setShowCalendar(false)}
          />
          <div className="absolute z-50 mt-2 bg-white rounded-xl shadow-2xl border-2 border-gray-200 p-4 w-[320px]">
            <div className="flex items-center justify-between mb-4">
              <button
                onClick={prevMonth}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                ‹
              </button>
              <h3 className="text-lg font-bold text-gray-800">
                {monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}
              </h3>
              <button
                onClick={nextMonth}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                ›
              </button>
            </div>
            
            <div className="grid grid-cols-7 gap-1 mb-2">
              {dayNames.map(day => (
                <div key={day} className="text-center text-xs font-semibold text-gray-600 py-1">
                  {day}
                </div>
              ))}
            </div>
            
            <div className="grid grid-cols-7 gap-1">
              {days.map((day, idx) => {
                const status = getDayStatus(day.date);
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => day.isCurrentMonth && handleDateClick(day.date)}
                    className={getDayClassName(day, status)}
                    disabled={!day.isCurrentMonth}
                    title={
                      !day.isCurrentMonth ? "" :
                      status === 'available' ? "Disponible" :
                      status === 'unavailable' ? "Non disponible" :
                      status === 'stop-sale' ? "STOP SALE" :
                      status === 'push-sale' ? "PUSH SALE" : ""
                    }
                  >
                    {day.date.getDate()}
                  </button>
                );
              })}
            </div>
            
            <div className="mt-4 pt-4 border-t border-gray-200 space-y-2 text-xs">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-green-100 border-2 border-green-400 rounded"></div>
                <span>Disponible</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-red-100 border-2 border-red-400 rounded"></div>
                <span>Non disponible</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-red-500 border-2 border-red-700 rounded animate-pulse"></div>
                <span>STOP SALE</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-green-500 border-2 border-green-700 rounded"></div>
                <span>PUSH SALE</span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// Composant compact pour afficher les stop sales et push sales
function StopPushSalesSummary({ stopSales, pushSales, activities }) {
  const [expanded, setExpanded] = useState(false);
  const totalCount = stopSales.length + pushSales.length;

  // Grouper par date pour un affichage plus compact
  const stopSalesByDate = useMemo(() => {
    const grouped = {};
    stopSales.forEach((stop) => {
      if (!grouped[stop.date]) {
        grouped[stop.date] = [];
      }
      grouped[stop.date].push(stop);
    });
    return grouped;
  }, [stopSales]);

  const pushSalesByDate = useMemo(() => {
    const grouped = {};
    pushSales.forEach((push) => {
      if (!grouped[push.date]) {
        grouped[push.date] = [];
      }
      grouped[push.date].push(push);
    });
    return grouped;
  }, [pushSales]);

  if (totalCount === 0) return null;

  return (
    <div className="bg-gradient-to-r from-red-50 via-amber-50 to-green-50 border-2 border-red-400 rounded-xl p-4 shadow-lg">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between gap-3 text-left hover:opacity-90 transition-opacity"
      >
        <div className="flex items-center gap-4 flex-1">
          <div className="flex items-center gap-2 bg-red-500/10 px-3 py-2 rounded-lg border-2 border-red-400">
            <span className="text-2xl">🛑</span>
            {stopSales.length > 0 && (
              <span className="text-sm font-bold bg-red-600 text-white px-3 py-1 rounded-full shadow-md">
                {stopSales.length}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 bg-green-500/10 px-3 py-2 rounded-lg border-2 border-green-400">
            <span className="text-2xl">✅</span>
            {pushSales.length > 0 && (
              <span className="text-sm font-bold bg-green-600 text-white px-3 py-1 rounded-full shadow-md">
                {pushSales.length}
              </span>
            )}
          </div>
          <span className="text-base font-bold text-gray-800">
            {totalCount} activité{totalCount > 1 ? "s" : ""} en Stop/Push Sale
          </span>
        </div>
        <span className="text-gray-600 text-sm font-semibold bg-white/80 px-3 py-2 rounded-lg border border-gray-300">
          {expanded ? "▼ Réduire" : "▶ Voir les détails"}
        </span>
      </button>

      {expanded && (
        <div className="mt-3 space-y-3 pt-3 border-t border-red-200/50">
          {/* Stop Sales */}
          {stopSales.length > 0 && (
            <div>
              <h4 className="text-base font-bold text-red-900 mb-3 flex items-center gap-2 bg-red-100 px-3 py-2 rounded-lg border-2 border-red-400">
                <span className="text-xl">🛑</span> Stop Sales ({stopSales.length})
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[300px] overflow-y-auto">
                {Object.entries(stopSalesByDate)
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([date, stops]) => (
                    <div key={date} className="bg-white rounded-lg p-3 border-2 border-red-300 shadow-md hover:shadow-lg transition-shadow">
                      <p className="text-sm font-bold text-red-900 mb-2">
                        {new Date(date + "T12:00:00").toLocaleDateString("fr-FR", {
                          weekday: "short",
                          day: "numeric",
                          month: "short",
                        })}
                      </p>
                      <div className="space-y-1.5">
                        {stops.map((stop, idx) => (
                          <p key={idx} className="text-xs font-medium text-red-800 truncate" title={stop.activityName}>
                            • {stop.activityName}
                          </p>
                        ))}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Push Sales */}
          {pushSales.length > 0 && (
            <div>
              <h4 className="text-base font-bold text-green-900 mb-3 flex items-center gap-2 bg-green-100 px-3 py-2 rounded-lg border-2 border-green-400">
                <span className="text-xl">✅</span> Push Sales ({pushSales.length})
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[300px] overflow-y-auto">
                {Object.entries(pushSalesByDate)
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([date, pushes]) => (
                    <div key={date} className="bg-white rounded-lg p-3 border-2 border-green-300 shadow-md hover:shadow-lg transition-shadow">
                      <p className="text-sm font-bold text-green-900 mb-2">
                        {new Date(date + "T12:00:00").toLocaleDateString("fr-FR", {
                          weekday: "short",
                          day: "numeric",
                          month: "short",
                        })}
                      </p>
                      <div className="space-y-1.5">
                        {pushes.map((push, idx) => (
                          <p key={idx} className="text-xs font-medium text-green-800 truncate" title={push.activityName}>
                            • {push.activityName}
                          </p>
                        ))}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function QuotesPage({ activities, quotes, setQuotes, user, draft, setDraft, onUsedDatesChange }) {
  const [stopSales, setStopSales] = useState([]);
  const [pushSales, setPushSales] = useState([]);

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
      setItems(
        selectedQuote.items?.length
          ? selectedQuote.items.map((item) => ({
              ...item,
              speedBoatExtra: Array.isArray(item.speedBoatExtra)
                ? item.speedBoatExtra
                : item.speedBoatExtra
                  ? [item.speedBoatExtra]
                  : [],
            }))
          : [blankItemMemo()]
      );
      setNotes(selectedQuote.notes || "");
    }
  }, [selectedQuote, blankItemMemo]);

  const setItem = useCallback((i, patch) => {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }, []);
  
  const addItem = useCallback(() => {
    setItems((prev) => [...prev, blankItemMemo()]);
  }, [blankItemMemo]);
  
  const removeItem = useCallback((i) => {
    const itemToRemove = items[i];
    const activityName = activities.find(a => a.id === itemToRemove?.activityId)?.name || "cette activité";
    
    if (window.confirm(`Êtes-vous sûr de vouloir supprimer "${activityName}" de ce devis ?\n\nCette action est irréversible.`)) {
      setItems((prev) => prev.filter((_, idx) => idx !== i));
      toast.success("Activité supprimée du devis.");
    }
  }, [items, activities]);
  
  const resetQuoteForm = useCallback(() => {
    const emptyClient = {
      name: "",
      phone: "",
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
    if (setDraft) {
      setDraft(null);
    }
  }, [blankItemMemo, setDraft]);

  // Charger les stop sales et push sales depuis Supabase
  useEffect(() => {
    async function loadStopSalesAndPushSales() {
      if (!supabase) return;
      try {
        // Charger les stop sales
        const { data: stopSalesData, error: stopSalesError } = await supabase
          .from("stop_sales")
          .select("*")
          .eq("site_key", SITE_KEY);

        if (!stopSalesError && stopSalesData) {
          setStopSales(stopSalesData || []);
        }

        // Charger les push sales
        const { data: pushSalesData, error: pushSalesError } = await supabase
          .from("push_sales")
          .select("*")
          .eq("site_key", SITE_KEY);

        if (!pushSalesError && pushSalesData) {
          setPushSales(pushSalesData || []);
        }
      } catch (err) {
        console.error("Erreur lors du chargement des stop sales/push sales:", err);
      }
    }

    loadStopSalesAndPushSales();
    
    // Recharger toutes les 10 secondes pour avoir les données à jour (optimisé: réduit de 5s à 10s)
    const interval = setInterval(loadStopSalesAndPushSales, 10000);
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

  // Formater les stop sales avec les noms d'activités
  const formattedStopSales = useMemo(() => {
    return stopSales
      .map((stop) => {
        const activity = activities.find((a) => a.id === stop.activity_id);
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
  }, [stopSales, activities]);

  // Formater les push sales avec les noms d'activités
  const formattedPushSales = useMemo(() => {
    return pushSales
      .map((push) => {
        const activity = activities.find((a) => a.id === push.activity_id);
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
  }, [pushSales, activities]);

  const computed = useMemo(() => {
    return items.map((it) => {
      const act = activities.find((a) => a.id === it.activityId);
      const weekday = it.date ? new Date(it.date + "T12:00:00").getDay() : null;
      const baseAvailable = act && weekday != null ? !!act.availableDays?.[weekday] : true;
      
      // Vérifier les stop sales et push sales
      let isStopSale = false;
      let isPushSale = false;
      if (act && it.date) {
        // Vérifier si cette activité/date est en stop sale
        isStopSale = stopSales.some(
          (s) => s.activity_id === act.id && s.date === it.date
        );
        // Vérifier si cette activité/date est en push sale
        isPushSale = pushSales.some(
          (p) => p.activity_id === act.id && p.date === it.date
        );
      }
      
      // Disponibilité finale : disponible si push sale OU (baseAvailable ET pas de stop sale)
      const available = isPushSale || (baseAvailable && !isStopSale);
      
      const transferInfo = act && client.neighborhood ? act.transfers?.[client.neighborhood] || null : null;

      let lineTotal = 0;
      const currencyCode = act?.currency || "EUR";

      // cas spécial Speed Boat
      if (act && act.name.toLowerCase().includes("speed boat")) {
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

      // supplément transfert PAR ADULTE (sauf pour les activités buggy et moto cross où on utilise les quantités spécifiques)
      if (transferInfo && transferInfo.surcharge) {
        if (act && isBuggyActivity(act.name)) {
          // Pour les activités buggy, le supplément est calculé sur le nombre total de buggys
          const totalBuggys = Number(it.buggySimple || 0) + Number(it.buggyFamily || 0);
          lineTotal += Number(transferInfo.surcharge || 0) * totalBuggys;
        } else if (act && isMotoCrossActivity(act.name)) {
          // Pour MOTO CROSS, le supplément est calculé sur le nombre total de motos
          const totalMotos = Number(it.yamaha250 || 0) + Number(it.ktm640 || 0) + Number(it.ktm530 || 0);
          lineTotal += Number(transferInfo.surcharge || 0) * totalMotos;
        } else {
          lineTotal += Number(transferInfo.surcharge || 0) * Number(it.adults || 0);
        }
      }

      // extra (pour les autres activités, pas Speed Boat)
      if (!act || !act.name.toLowerCase().includes("speed boat")) {
        if (it.extraAmount) {
          lineTotal += Number(it.extraAmount || 0);
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
  }, [items, activities, client.neighborhood, stopSales, pushSales]);

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
          client_hotel: q.client.hotel || "",
          client_room: q.client.room || "",
          client_neighborhood: q.client.neighborhood || "",
          notes: q.notes || "",
          total: q.total,
          currency: q.currency,
          items: JSON.stringify(q.items),
          created_by_name: q.createdByName || "",
          created_at: q.createdAt,
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
                    id: data.id.toString(), // Utiliser l'ID Supabase comme ID local
                  };
                }
                return quote;
              });
              saveLS(LS_KEYS.quotes, updated);
              return updated;
            });
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
        <div className="flex flex-col sm:flex-row flex-wrap items-start sm:items-center justify-between gap-3">
          <p className="text-xs text-gray-500 font-medium">
            Les modifications sont sauvegardées automatiquement en brouillon.
          </p>
          <GhostBtn
            type="button"
            variant="danger"
            size="sm"
            onClick={() => {
              if (window.confirm("Êtes-vous sûr de vouloir tout effacer ?\n\nCette action supprimera toutes les activités et les informations client du formulaire.\n\nCette action est irréversible.")) {
                resetQuoteForm();
                toast.success("Formulaire réinitialisé.");
              }
            }}
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 lg:gap-8">
          <div>
            <p className="text-xs text-gray-500 mb-2">Date d'arrivée</p>
            <TextInput 
              type="date" 
              value={client.arrivalDate || ""} 
              onChange={(e) => setClient((c) => ({ ...c, arrivalDate: e.target.value }))} 
            />
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-2">Date de départ</p>
            <TextInput 
              type="date" 
              value={client.departureDate || ""} 
              onChange={(e) => setClient((c) => ({ ...c, departureDate: e.target.value }))} 
            />
          </div>
        </div>

        {/* Lignes */}
        <div className="space-y-6 md:space-y-7">
          {computed.map((c, idx) => (
            <div key={idx} className="bg-white/90 border border-blue-100/60 rounded-xl md:rounded-2xl p-4 md:p-7 lg:p-10 space-y-4 md:space-y-6 lg:space-y-7 shadow-sm">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mb-2">
                <p className="text-sm font-medium text-gray-700">Activité #{idx + 1}</p>
                <GhostBtn type="button" onClick={() => removeItem(idx)} variant="danger" className="w-full sm:w-auto">
                  🗑️ Supprimer
                </GhostBtn>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4 md:gap-6 lg:gap-8 items-end">
                <div className="sm:col-span-2 md:col-span-2">
                  <p className="text-xs text-gray-500 mb-2">Activité</p>
                  <select
                    value={c.raw.activityId}
                    onChange={(e) => setItem(idx, { activityId: e.target.value })}
                    className="w-full rounded-xl border border-blue-200/50 bg-white px-3 py-2 text-sm"
                  >
                    <option value="">— Choisir —</option>
                    {sortedActivities.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-2">Date</p>
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
                    className="w-full rounded-xl border border-blue-200/50 bg-white px-3 py-2 text-sm"
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
              {c.act && c.act.name.toLowerCase().includes("speed boat") ? (
                <div>
                  <p className="text-xs text-gray-500 mb-2">Extras (plusieurs sélections possibles)</p>
                  <div className="space-y-2 border border-blue-200/50 rounded-xl p-3 bg-white">
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
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 lg:gap-8">
                  <div className="md:col-span-2">
                    <p className="text-xs text-gray-500 mb-2">Extra (ex: photos, bateau privé…)</p>
                    <TextInput
                      placeholder="Libellé extra"
                      value={c.raw.extraLabel}
                      onChange={(e) => setItem(idx, { extraLabel: e.target.value })}
                    />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-2">Montant Extra</p>
                    <NumberInput
                      value={c.raw.extraAmount}
                      onChange={(e) => setItem(idx, { extraAmount: e.target.value })}
                    />
                  </div>
                </div>
              )}

              {/* passagers - Champs spéciaux pour activités buggy */}
              {c.act && isBuggyActivity(c.act.name) ? (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6 lg:gap-8">
                    <div>
                      <p className="text-xs text-gray-500 mb-2">Buggy Simple ({getBuggyPrices(c.act.name).simple}€)</p>
                      <NumberInput value={c.raw.buggySimple ?? ""} onChange={(e) => setItem(idx, { buggySimple: e.target.value === "" ? "" : e.target.value })} />
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-2">Buggy Family ({getBuggyPrices(c.act.name).family}€)</p>
                      <NumberInput value={c.raw.buggyFamily ?? ""} onChange={(e) => setItem(idx, { buggyFamily: e.target.value === "" ? "" : e.target.value })} />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6 lg:gap-8 mt-4 md:mt-6">
                    <div>
                      <p className="text-xs text-gray-400 mb-2">Adultes (informations uniquement)</p>
                      <NumberInput value={c.raw.adults ?? ""} onChange={(e) => setItem(idx, { adults: e.target.value === "" ? "" : e.target.value })} />
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 mb-2">
                        Enfants{c.act?.ageChild ? <span className="text-gray-400 ml-1">({c.act.ageChild})</span> : ""} (informations uniquement)
                      </p>
                      <NumberInput value={c.raw.children ?? ""} onChange={(e) => setItem(idx, { children: e.target.value === "" ? "" : e.target.value })} />
                    </div>
                  </div>
                </>
              ) : c.act && isMotoCrossActivity(c.act.name) ? (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 md:gap-6 lg:gap-8">
                    <div>
                      <p className="text-xs text-gray-500 mb-2">YAMAHA 250CC ({getMotoCrossPrices().yamaha250}€)</p>
                      <NumberInput value={c.raw.yamaha250 ?? ""} onChange={(e) => setItem(idx, { yamaha250: e.target.value === "" ? "" : e.target.value })} />
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-2">KTM640CC ({getMotoCrossPrices().ktm640}€)</p>
                      <NumberInput value={c.raw.ktm640 ?? ""} onChange={(e) => setItem(idx, { ktm640: e.target.value === "" ? "" : e.target.value })} />
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-2">KTM 530CC ({getMotoCrossPrices().ktm530}€)</p>
                      <NumberInput value={c.raw.ktm530 ?? ""} onChange={(e) => setItem(idx, { ktm530: e.target.value === "" ? "" : e.target.value })} />
                    </div>
                  </div>
                </>
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
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 md:gap-6 lg:gap-8">
                  <div>
                    <p className="text-xs text-gray-500 mb-2">Adultes</p>
                    <NumberInput value={c.raw.adults} onChange={(e) => setItem(idx, { adults: e.target.value })} />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-2">
                      Enfants{c.act?.ageChild ? <span className="text-gray-400 ml-1">({c.act.ageChild})</span> : ""}
                    </p>
                    <NumberInput value={c.raw.children} onChange={(e) => setItem(idx, { children: e.target.value })} />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-2">
                      Bébés{c.act?.ageBaby ? <span className="text-gray-400 ml-1">({c.act.ageBaby})</span> : ""}
                    </p>
                    <NumberInput value={c.raw.babies} onChange={(e) => setItem(idx, { babies: e.target.value })} />
                  </div>
                </div>
              )}

              {/* Extra dauphin (uniquement pour Speed Boat) */}
              {c.act && c.act.name.toLowerCase().includes("speed boat") && (
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

              <div className="flex items-center justify-between mt-1">
                <p className="text-xs text-gray-500">Sous-total</p>
                <div className="text-right">
                  <p className="text-base font-semibold text-gray-900">
                    Espèces: {currencyNoCents(Math.round(c.lineTotal), c.currency)}
                  </p>
                  <p className="text-sm text-gray-600">
                    Carte: {currencyNoCents(calculateCardPrice(c.lineTotal), c.currency)}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <GhostBtn type="button" onClick={addItem} variant="primary" className="w-full sm:w-auto">
            ➕ Ajouter une activité
          </GhostBtn>
          <div className="text-left sm:text-right w-full sm:w-auto">
            <p className="text-xs text-gray-500">Total</p>
            <p className="text-lg md:text-xl font-bold">Espèces: {currencyNoCents(grandTotalCash, grandCurrency)}</p>
            <p className="text-base md:text-lg font-semibold text-gray-700">Carte: {currencyNoCents(grandTotalCard, grandCurrency)}</p>
          </div>
        </div>

        <div>
          <p className="text-xs text-gray-500 mb-2">Notes</p>
          <TextInput
            placeholder="Infos supplémentaires : langue du guide, pick-up, etc."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
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
      {showPaymentModal && selectedQuote && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-2 md:p-4">
          <div className="bg-white rounded-xl md:rounded-2xl border border-blue-100/50 shadow-2xl p-4 md:p-6 max-w-2xl w-full max-h-[95vh] md:max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-3 md:mb-4">
              <h3 className="text-base md:text-lg font-semibold">Enregistrer les numéros de ticket</h3>
              <button
                onClick={() => {
                  setShowPaymentModal(false);
                  setSelectedQuote(null);
                  setTicketNumbers({});
                  setPaymentMethods({});
                }}
                className="text-gray-400 hover:text-gray-600 text-2xl leading-none min-w-[44px] min-h-[44px] flex items-center justify-center"
              >
                &times;
              </button>
            </div>

            <div className="space-y-4 mb-6">
              {selectedQuote.items?.map((item, idx) => (
                <div key={idx} className="border border-blue-100/60 rounded-xl p-4 bg-blue-50/50 shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="font-medium text-sm">{item.activityName}</p>
                      <p className="text-xs text-gray-500">
                        {new Date(item.date + "T12:00:00").toLocaleDateString("fr-FR")} — {item.adults} adulte(s),{" "}
                        {item.children} enfant(s)
                      </p>
                    </div>
                    <p className="text-sm font-semibold">{currency(item.lineTotal, selectedQuote.currency)}</p>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Numéro de ticket unique</p>
                      <TextInput
                        placeholder="Ex: T-12345"
                        value={ticketNumbers[idx] || ""}
                        onChange={(e) => {
                          setTicketNumbers((prev) => ({
                            ...prev,
                            [idx]: e.target.value,
                          }));
                        }}
                        disabled={user?.name !== "Ewen" && item.ticketNumber && item.ticketNumber.trim() ? true : false}
                        readOnly={user?.name !== "Ewen" && item.ticketNumber && item.ticketNumber.trim() ? true : false}
                        className={user?.name !== "Ewen" && item.ticketNumber && item.ticketNumber.trim() ? "bg-gray-100 cursor-not-allowed" : ""}
                      />
                      {user?.name !== "Ewen" && item.ticketNumber && item.ticketNumber.trim() && (
                        <p className="text-xs text-green-600 mt-1">✅ Ticket verrouillé (non modifiable)</p>
                      )}
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-2">Méthode de paiement</p>
                      <div className="flex gap-4">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={paymentMethods[idx] === "cash" || item.paymentMethod === "cash"}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setPaymentMethods((prev) => ({
                                  ...prev,
                                  [idx]: "cash",
                                }));
                              }
                            }}
                            disabled={item.paymentMethod && item.paymentMethod.trim() ? true : false}
                            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                          />
                          <span className="text-sm text-gray-700">Cash</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={paymentMethods[idx] === "stripe" || item.paymentMethod === "stripe"}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setPaymentMethods((prev) => ({
                                  ...prev,
                                  [idx]: "stripe",
                                }));
                              }
                            }}
                            disabled={item.paymentMethod && item.paymentMethod.trim() ? true : false}
                            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                          />
                          <span className="text-sm text-gray-700">Stripe</span>
                        </label>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-col sm:flex-row gap-3 justify-end mt-4 md:mt-6 pt-4 border-t">
              <GhostBtn
                onClick={() => {
                  setShowPaymentModal(false);
                  setSelectedQuote(null);
                  setTicketNumbers({});
                  setPaymentMethods({});
                }}
                className="w-full sm:w-auto order-2 sm:order-1"
              >
                Annuler
              </GhostBtn>
              <PrimaryBtn
                className="w-full sm:w-auto order-1 sm:order-2"
                onClick={async () => {
                  // Vérifier que tous les tickets sont renseignés
                  const allFilled = selectedQuote.items?.every((_, idx) => ticketNumbers[idx]?.trim());
                  if (!allFilled) {
                    toast.warning("Veuillez renseigner tous les numéros de ticket.");
                    return;
                  }

                  // Vérifier que toutes les méthodes de paiement sont sélectionnées
                  const allPaymentMethodsSelected = selectedQuote.items?.every((_, idx) => {
                    // Si le ticket existe déjà, garder la méthode existante, sinon vérifier que c'est renseigné
                    if (selectedQuote.items[idx].paymentMethod && selectedQuote.items[idx].paymentMethod.trim()) {
                      return true;
                    }
                    return paymentMethods[idx] === "cash" || paymentMethods[idx] === "stripe";
                  });
                  if (!allPaymentMethodsSelected) {
                    toast.warning("Veuillez sélectionner une méthode de paiement pour chaque activité.");
                    return;
                  }

                  // Mettre à jour le devis avec les numéros de ticket et les méthodes de paiement
                  const updatedQuote = {
                    ...selectedQuote,
                    items: selectedQuote.items.map((item, idx) => ({
                      ...item,
                      ticketNumber: ticketNumbers[idx]?.trim() || "",
                      paymentMethod: item.paymentMethod || paymentMethods[idx] || "",
                    })),
                  };

                  const updatedQuotes = quotes.map((q) => (q.id === selectedQuote.id ? updatedQuote : q));
                  setQuotes(updatedQuotes);
                  saveLS(LS_KEYS.quotes, updatedQuotes);

                  // Mettre à jour dans Supabase si configuré
                  if (supabase) {
                    try {
                      const supabaseUpdate = {
                        items: JSON.stringify(updatedQuote.items),
                      };
                      
                      const { error: updateError } = await supabase
                        .from("quotes")
                        .update(supabaseUpdate)
                        .eq("site_key", SITE_KEY)
                        .eq("client_phone", updatedQuote.client.phone || "")
                        .eq("created_at", updatedQuote.createdAt);
                      
                      if (updateError) {
                        console.warn("⚠️ Erreur mise à jour Supabase:", updateError);
                      }
                    } catch (updateErr) {
                      console.warn("⚠️ Erreur lors de la mise à jour Supabase:", updateErr);
                    }
                  }

                  setShowPaymentModal(false);
                  setSelectedQuote(null);
                  setTicketNumbers({});
                  setPaymentMethods({});
                  toast.success("Numéros de ticket enregistrés avec succès !");
                }}
              >
                Enregistrer les tickets
              </PrimaryBtn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

