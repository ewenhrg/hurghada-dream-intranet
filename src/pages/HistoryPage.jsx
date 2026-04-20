import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { supabase } from "../lib/supabase";
import { SITE_KEY, LS_KEYS, NEIGHBORHOODS } from "../constants";
import { SPEED_BOAT_EXTRAS } from "../constants/activityExtras";
import { currencyNoCents, calculateCardPrice, generateQuoteHTML, saveLS, cleanPhoneNumber, calculateTransferSurcharge } from "../utils";
import { TextInput, NumberInput, GhostBtn, PrimaryBtn, Pill } from "../components/ui";
import { useDebounce } from "../hooks/useDebounce";
import { toast } from "../utils/toast.js";
import { logger } from "../utils/logger";
import { isBuggyActivity, getBuggyPrices, isSpeedBoatActivity, isMotoCrossActivity, getMotoCrossPrices, isZeroTracasActivity, getZeroTracasPrices, isZeroTracasHorsZoneActivity, getZeroTracasHorsZonePrices, isCairePrivatifActivity, getCairePrivatifPrices, isLouxorPrivatifActivity, getLouxorPrivatifPrices } from "../utils/activityHelpers";
import { ColoredDatePicker } from "../components/ColoredDatePicker";
import { salesCache, createCacheKey } from "../utils/cache";

/** Délai avant suppression auto des devis « non payés » (au moins une ligne sans n° de ticket), à l’ouverture de l’historique. */
const UNPAID_QUOTE_AUTO_DELETE_DAYS = 20;

// Composant de carte de devis mémorisé pour améliorer les performances
// Déclarer comme fonction normale pour le hoisting, puis mémoriser
function QuoteCardComponent({ 
  quote: d, 
  quotes, 
  setQuotes, 
  user, 
  setSelectedQuote, 
  setTicketNumbers, 
  setStripeAmount, 
  setCashAmount, 
  setShowPaymentModal, 
  setEditClient, 
  setEditItems, 
  setEditNotes, 
  setShowEditModal 
}) {
  // Calculer allTicketsFilled si ce n'est pas déjà défini
  const allTicketsFilled = d.allTicketsFilled !== undefined 
    ? d.allTicketsFilled 
    : (d.items?.every((item) => item.ticketNumber && item.ticketNumber.trim()) || false);
  
  // Calculer hasTickets si ce n'est pas déjà défini
  const hasTickets = d.hasTickets !== undefined
    ? d.hasTickets
    : (d.items?.some((item) => item.ticketNumber && item.ticketNumber.trim()) || false);
  
  const ticketsCount = useMemo(() => 
    d.items?.filter((item) => item.ticketNumber && item.ticketNumber.trim()).length || 0,
    [d.items]
  );

  const handlePaymentClick = useCallback(() => {
    setSelectedQuote(d);
    const existingTickets = {};
    d.items?.forEach((item, idx) => {
      existingTickets[idx] = item.ticketNumber || "";
    });
    setTicketNumbers(existingTickets);
    setStripeAmount(d.paidStripe ? d.paidStripe.toString() : "");
    setCashAmount(d.paidCash ? d.paidCash.toString() : "");
    setShowPaymentModal(true);
  }, [d, setSelectedQuote, setTicketNumbers, setStripeAmount, setCashAmount, setShowPaymentModal]);

  const handlePrintClick = useCallback(() => {
    const htmlContent = generateQuoteHTML(d);
    const clientPhone = d.client?.phone || "";
    const fileName = `Devis - ${clientPhone}`;
    const newWindow = window.open();
    if (newWindow) {
      newWindow.document.write(htmlContent);
      newWindow.document.title = fileName;
      newWindow.document.close();
      setTimeout(() => {
        newWindow.print();
      }, 500);
    }
  }, [d]);

  // Optimisation : Utiliser useCallback avec une fonction optimisée qui évite les transformations lourdes
  const handleEditClick = useCallback(() => {
    // Préparer les données de manière optimisée avec valeurs par défaut
    const clientData = {
      name: d.client?.name || "",
      phone: d.client?.phone || "",
      email: d.client?.email || "",
      hotel: d.client?.hotel || "",
      room: d.client?.room || "",
      neighborhood: d.client?.neighborhood || "",
      arrivalDate: d.client?.arrivalDate || d.clientArrivalDate || "",
      departureDate: d.client?.departureDate || d.clientDepartureDate || "",
    };
    
    // Transformer les items de manière optimisée (éviter les vérifications répétées)
    const itemsData = d.items.map((item) => {
      const baseItem = {
        activityId: item.activityId || "",
        date: item.date || new Date().toISOString().slice(0, 10),
        extraLabel: item.extraLabel || "",
        extraAmount: item.extraAmount || "",
        extraDolphin: Boolean(item.extraDolphin),
        slot: item.slot || "",
        ticketNumber: item.ticketNumber || "",
      };
      
      // Gérer speedBoatExtra (array ou string)
      if (Array.isArray(item.speedBoatExtra)) {
        baseItem.speedBoatExtra = item.speedBoatExtra;
      } else if (item.speedBoatExtra) {
        baseItem.speedBoatExtra = [item.speedBoatExtra];
      } else {
        baseItem.speedBoatExtra = [];
      }
      
      // Valeurs numériques avec valeurs par défaut
      // IMPORTANT : ne jamais modifier la valeur choisie dans le devis
      baseItem.adults = item.adults ?? 0;
      baseItem.children = item.children ?? 0;
      baseItem.babies = item.babies ?? 0;
      baseItem.buggySimple = item.buggySimple ?? 0;
      baseItem.buggyFamily = item.buggyFamily ?? 0;
      baseItem.yamaha250 = item.yamaha250 ?? 0;
      baseItem.ktm640 = item.ktm640 ?? 0;
      baseItem.ktm530 = item.ktm530 ?? 0;
      
      // Valeurs string avec valeurs par défaut
      baseItem.zeroTracasTransfertVisaSim = item.zeroTracasTransfertVisaSim ?? "";
      baseItem.zeroTracasTransfertVisa = item.zeroTracasTransfertVisa ?? "";
      baseItem.zeroTracasTransfert3Personnes = item.zeroTracasTransfert3Personnes ?? "";
      baseItem.zeroTracasTransfertPlus3Personnes = item.zeroTracasTransfertPlus3Personnes ?? "";
      baseItem.zeroTracasVisaSim = item.zeroTracasVisaSim ?? "";
      baseItem.zeroTracasVisaSeul = item.zeroTracasVisaSeul ?? "";
      
      return baseItem;
    });
    
    // Mettre à jour les états de manière synchrone pour éviter les re-renders multiples
    setSelectedQuote(d);
    setEditClient(clientData);
    setEditItems(itemsData);
    setEditNotes(d.notes || "");
    setShowEditModal(true);
  }, [d, setSelectedQuote, setEditClient, setEditItems, setEditNotes, setShowEditModal]);

  const handleDeleteClick = useCallback(async () => {
    const clientInfo = d.client?.name ? `${d.client.name}${d.client?.phone ? ` (${d.client.phone})` : ''}` : 'ce devis';
    const totalInfo = d.total ? ` (Total: ${Math.round(d.total)}€)` : '';
    
    if (window.confirm(`Êtes-vous sûr de vouloir supprimer le devis de ${clientInfo}${totalInfo} ?\n\nCette action est irréversible et supprimera définitivement le devis.`)) {
      const updatedQuotes = quotes.filter((quote) => quote.id !== d.id);
      setQuotes(updatedQuotes);
      saveLS(LS_KEYS.quotes, updatedQuotes);

      if (supabase) {
        try {
          let deleteQuery = supabase
            .from("quotes")
            .delete()
            .eq("site_key", SITE_KEY);

          if (d.supabase_id) {
            deleteQuery = deleteQuery.eq("id", d.supabase_id);
          } else {
            deleteQuery = deleteQuery
              .eq("client_phone", d.client?.phone || "")
              .eq("created_at", d.createdAt);
          }

          const { error: deleteError } = await deleteQuery;

          if (deleteError) {
            logger.warn("⚠️ Erreur suppression Supabase:", deleteError);
          } else {
            logger.log("✅ Devis supprimé de Supabase!");
          }
        } catch (deleteErr) {
          logger.warn("⚠️ Erreur lors de la suppression Supabase:", deleteErr);
        }
      }
    }
  }, [d, quotes, setQuotes]);

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border transition-shadow duration-200 p-5 md:p-6 lg:p-7 shadow-lg hover:shadow-xl cursor-pointer bg-[#f7f9fc] ${
        allTicketsFilled
          ? "border-emerald-200/70 hover:border-emerald-300/90"
          : "border-amber-200/70 hover:border-amber-300/90"
      }`}
    >
      {/* Barre latérale colorée */}
      <span
        className={`absolute inset-y-0 left-0 w-1.5 ${
          allTicketsFilled
            ? "bg-gradient-to-b from-emerald-500 via-emerald-600 to-teal-500 shadow-lg"
            : "bg-gradient-to-b from-amber-500 via-amber-600 to-orange-500 shadow-lg"
        }`}
      />
      {/* Overlay subtil */}
      <span className="absolute inset-0 pointer-events-none bg-gradient-to-br from-white/40 via-white/10 to-transparent" />
      
      <div className="relative space-y-4 md:space-y-5">
        {/* En-tête avec statut et métadonnées */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 md:gap-3">
            <span className={`px-4 py-2 rounded-xl text-xs md:text-sm font-bold shadow-md border-2 transition-all duration-200 ${
              allTicketsFilled
                ? "bg-gradient-to-r from-emerald-500 to-teal-500 text-white border-emerald-600 shadow-emerald-200/50"
                : "bg-gradient-to-r from-amber-500 to-orange-500 text-white border-amber-600 shadow-amber-200/50"
            }`}>
              {allTicketsFilled ? "✅ Payé" : "⏳ En attente"}
            </span>
            {d.isModified && (
              <span className="px-4 py-2 rounded-xl text-xs md:text-sm font-bold shadow-md border-2 bg-gradient-to-r from-purple-500 to-indigo-500 text-white border-purple-600 shadow-purple-200/50">
                🔄 Modifié
              </span>
            )}
            {hasTickets && (
              <span className="px-4 py-2 rounded-xl text-xs md:text-sm font-bold shadow-md border-2 bg-gradient-to-r from-blue-500 to-cyan-500 text-white border-blue-600 shadow-blue-200/50">
                🎫 Tickets : {ticketsCount}/{d.items.length}
              </span>
            )}
          </div>
          <p className="text-xs md:text-sm text-slate-500 font-medium">
            📅 {d.formattedCreatedAt}
            {d.createdByName && <span className="ml-2 text-blue-600 font-semibold">• {d.createdByName}</span>}
          </p>
        </div>
        
        {/* Informations client améliorées */}
        <div className="bg-white/70 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4 md:p-5 shadow-sm">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 md:gap-4">
            <div className="flex-1 space-y-2 min-w-0">
              {d.client?.name && (
                <p className="text-base md:text-lg lg:text-xl text-slate-900 font-bold break-words flex items-center gap-2">
                  <span className="text-xl">👤</span>
                  {d.client.name}
                </p>
              )}
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-sm md:text-base">
                <p className="text-slate-700 font-semibold break-words flex items-center gap-2">
                  <span className="text-lg">📞</span>
                  {d.client?.phone || "Tél ?"}
                </p>
                <p className="text-slate-700 font-semibold break-words flex items-center gap-2">
                  <span className="text-lg">🏨</span>
                  {d.client?.hotel || "Hôtel ?"}
                  {d.client?.room && <span className="text-slate-600 font-normal">(Chambre {d.client.room})</span>}
                </p>
              </div>
            </div>
            {(d.trip && d.trip.trim() && d.trip !== "Activité ?") || (d.invoiceN && d.invoiceN !== "N/A") ? (
              <div className="flex flex-col items-end gap-2 text-right min-w-[140px]">
                {d.trip && d.trip.trim() && d.trip !== "Activité ?" && (
                  <span className="px-3 py-1.5 rounded-lg text-xs font-bold bg-gradient-to-r from-indigo-500 to-purple-500 text-white border-2 border-indigo-600 shadow-md">
                    ✈️ {d.trip}
                  </span>
                )}
                {d.invoiceN && d.invoiceN !== "N/A" && (
                  <span className="text-xs md:text-sm uppercase tracking-wide text-slate-700 font-bold bg-slate-100 px-3 py-1.5 rounded-lg border-2 border-slate-300/60 shadow-sm">
                    📄 Invoice {d.invoiceN}
                  </span>
                )}
              </div>
            ) : null}
          </div>
        </div>
        
        {/* Section activités et total */}
        <div className="flex flex-col gap-5 md:gap-6 pt-4 md:pt-5 border-t border-slate-200/60 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex-1 space-y-3 min-w-0">
            <div className="space-y-2.5 md:space-y-3">
              {d.itemsWithFormattedDates.map((li, i) => (
                <div
                  key={i}
                  className="flex flex-col sm:flex-row sm:flex-wrap items-start sm:items-center justify-between gap-3 md:gap-4 rounded-xl border border-slate-200/70 bg-white/90 backdrop-blur-sm px-4 md:px-5 py-3 md:py-4 shadow-md transition-all duration-200 hover:shadow-lg hover:border-blue-300/70 hover:bg-white animate-fade-in"
                  style={{ animationDelay: `${i * 50}ms` }}
                >
                  <div className="flex flex-col gap-1.5 min-w-0 flex-1">
                    <span className="text-sm md:text-base font-bold text-slate-900 break-words flex items-center gap-2">
                      <span className="text-lg">🎯</span>
                      {li.activityName || "Activité ?"}
                    </span>
                    <span className="text-xs md:text-sm text-slate-600 font-medium break-words flex items-center gap-3 flex-wrap">
                      <span className="flex items-center gap-1">
                        <span>📅</span>
                        {li.formattedDate}
                      </span>
                      <span className="flex items-center gap-1">
                        <span>👥</span>
                        {li.adults ?? 0} adt / {li.children ?? 0} enf / {li.babies ?? 0} bébé(s)
                      </span>
                    </span>
                  </div>
                  <div className="flex flex-row sm:flex-col items-start sm:items-end gap-2 w-full sm:w-auto">
                    <span className="text-base md:text-lg lg:text-xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                      💵 {currencyNoCents(Math.round(li.lineTotal || 0), d.currency || "EUR")}
                    </span>
                    {li.ticketNumber && li.ticketNumber.trim() !== "" && (
                      <span className="px-3 py-1.5 rounded-lg text-xs font-bold bg-gradient-to-r from-emerald-500 to-teal-500 text-white border-2 border-emerald-600 shadow-md">
                        🎫 {li.ticketNumber}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {d.notes && d.notes.trim() !== "" && (
              <div className="bg-gradient-to-r from-amber-50/80 to-orange-50/60 backdrop-blur-sm border-2 border-amber-200/70 rounded-xl px-4 md:px-5 py-3 md:py-4 shadow-md">
                <p className="text-xs md:text-sm text-slate-700 font-medium flex items-start gap-2">
                  <span className="text-base mt-0.5">📝</span>
                  <span><span className="font-semibold text-slate-900">Notes :</span> {d.notes}</span>
                </p>
              </div>
            )}
          </div>
          
          {/* Zone total améliorée */}
          <div className="flex flex-col items-end gap-4 min-w-[240px] bg-gradient-to-br from-white/90 to-blue-50/50 backdrop-blur-sm rounded-xl p-5 md:p-6 border-2 border-blue-200/60 shadow-lg">
            <div className="text-right w-full">
              <p className="text-xs md:text-sm font-semibold text-slate-500 mb-2 uppercase tracking-wider">Total du devis</p>
              <div className="space-y-1.5">
                <p className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">
                  💵 {currencyNoCents(d.totalCash || Math.round(d.total || 0), d.currency || "EUR")}
                </p>
                <p className="text-lg md:text-xl font-semibold text-slate-700">
                  💳 {currencyNoCents(d.totalCard || calculateCardPrice(d.total || 0), d.currency || "EUR")}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap justify-end gap-2 md:gap-3 w-full pt-2 border-t border-slate-200/60">
              <button
                className={`flex items-center gap-2 rounded-xl px-4 md:px-5 py-2.5 md:py-3 text-sm md:text-base font-bold text-white border-2 shadow-lg transition-opacity duration-150 min-h-[44px] hover:opacity-90 active:opacity-75 hover:shadow-xl ${
                  allTicketsFilled 
                    ? "bg-gradient-to-r from-emerald-600 to-teal-600 border-emerald-500 hover:from-emerald-700 hover:to-teal-700" 
                    : "bg-gradient-to-r from-emerald-500 to-teal-500 border-emerald-400 hover:from-emerald-600 hover:to-teal-600"
                }`}
                onClick={handlePaymentClick}
              >
                {allTicketsFilled ? "✅ Tickets" : "💰 Payer"}
              </button>
              <button
                className="flex items-center gap-2 rounded-xl px-4 md:px-5 py-2.5 md:py-3 text-sm md:text-base font-bold text-white border-2 border-indigo-500 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 shadow-lg transition-opacity duration-150 min-h-[44px] hover:opacity-90 active:opacity-75 hover:shadow-xl"
                onClick={handlePrintClick}
              >
                🖨️ Imprimer
              </button>
              {!allTicketsFilled && (
                <button
                  className="flex items-center gap-2 rounded-xl px-4 md:px-5 py-2.5 md:py-3 text-sm md:text-base font-bold text-white border-2 border-amber-500 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 shadow-lg transition-opacity duration-150 min-h-[44px] hover:opacity-90 active:opacity-75 hover:shadow-xl"
                  onClick={handleEditClick}
                >
                  ✏️ Modifier
                </button>
              )}
              {user?.canDeleteQuote && (
                <button
                  className="flex items-center gap-2 rounded-xl px-4 md:px-5 py-2.5 md:py-3 text-sm md:text-base font-bold text-white border-2 border-red-500 bg-gradient-to-r from-red-500 to-rose-500 hover:from-red-600 hover:to-rose-600 shadow-lg transition-opacity duration-150 min-h-[44px] hover:opacity-90 active:opacity-75 hover:shadow-xl"
                  onClick={handleDeleteClick}
                >
                  🗑️ Supprimer
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// QuoteCard exporté directement (la pagination et les autres optimisations suffisent pour les performances)
const QuoteCard = QuoteCardComponent;

// Exporter HistoryPage après la déclaration de QuoteCard
export function HistoryPage({ quotes, setQuotes, user, activities }) {
  const [q, setQ] = useState("");
  const debouncedQ = useDebounce(q, 300); // Debounce de 300ms pour la recherche
  const [statusFilter, setStatusFilter] = useState("all"); // "all", "paid", "pending", "modified"
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedQuote, setSelectedQuote] = useState(null);
  const [ticketNumbers, setTicketNumbers] = useState({});
  const [stripeAmount, setStripeAmount] = useState("");
  const [cashAmount, setCashAmount] = useState("");
  
  // Pagination pour améliorer les performances
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 20; // Nombre de devis par page
  
  // Tous les utilisateurs peuvent maintenant modifier les activités
  const canModifyActivities = true;
  
  // Références pour le conteneur de la modale de paiement
  const paymentModalRef = useRef(null);
  const paymentModalContainerRef = useRef(null);
  
  // Références pour le conteneur de la modale de modification
  const editModalRef = useRef(null);
  const editModalContainerRef = useRef(null);
  
  // États pour la modale de modification
  const [editClient, setEditClient] = useState(null);
  const [editItems, setEditItems] = useState([]);
  const [editNotes, setEditNotes] = useState("");
  
  // État pour le bouton "remonter en haut"
  const [showScrollToTop, setShowScrollToTop] = useState(false);
  
  // États pour les stop sales et push sales
  const [stopSales, setStopSales] = useState([]);
  const [pushSales, setPushSales] = useState([]);
  
  // Charger les stop sales et push sales depuis Supabase avec cache (optimisé)
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
    
    // Recharger toutes les 2 minutes pour avoir les données à jour (optimisé pour les performances)
    // Le Realtime Supabase gère les mises à jour immédiates
    const interval = setInterval(loadStopSalesAndPushSales, 120000);
    
    // Écouter les changements en temps réel avec Supabase Realtime
    let stopSalesChannel = null;
    let pushSalesChannel = null;
    
    if (supabase) {
      // Canal pour les stop sales
      stopSalesChannel = supabase
        .channel('stop_sales_changes_history')
        .on('postgres_changes', 
          { 
            event: '*', 
            schema: 'public', 
            table: 'stop_sales',
            filter: `site_key=eq.${SITE_KEY}`
          }, 
          () => {
            // Recharger les données quand il y a un changement
            loadStopSalesAndPushSales();
          }
        )
        .subscribe();
      
      // Canal pour les push sales
      pushSalesChannel = supabase
        .channel('push_sales_changes_history')
        .on('postgres_changes', 
          { 
            event: '*', 
            schema: 'public', 
            table: 'push_sales',
            filter: `site_key=eq.${SITE_KEY}`
          }, 
          () => {
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

  // Écouter le scroll pour afficher/masquer le bouton "remonter en haut" (optimisé avec debounce agressif)
  useEffect(() => {
    let ticking = false;
    let lastScrollY = 0;
    let timeoutId = null;
    
    const handleScroll = () => {
      if (!ticking) {
        ticking = true;
        
        // Utiliser requestAnimationFrame pour synchroniser avec le rendu
        window.requestAnimationFrame(() => {
          const scrollY = window.scrollY || document.documentElement.scrollTop;
          
          // Debounce agressif : ne mettre à jour que si le scroll a changé significativement
          if (Math.abs(scrollY - lastScrollY) > 50) {
            // Utiliser un timeout pour éviter les mises à jour trop fréquentes
            if (timeoutId) clearTimeout(timeoutId);
            timeoutId = setTimeout(() => {
              setShowScrollToTop(scrollY > 300);
              lastScrollY = scrollY;
            }, 100); // Debounce de 100ms
          }
          
          ticking = false;
        });
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  // Fonction pour remonter en haut de la page
  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: "smooth"
    });
  };

  // Cache pour les dates formatées (persiste entre les renders)
  const dateFormatterCacheRef = useRef(new Map());
  
  // Optimisation majeure : Filtrer D'ABORD, puis calculer les statuts uniquement pour les devis filtrés
  // Cela évite de calculer les dates formatées pour TOUS les devis quand on n'affiche que 20
  const filtered = useMemo(() => {
    let result = quotes;
    
    // Filtre par statut (payé/en attente/modifié) - calcul rapide sans formatage
    if (statusFilter !== "all") {
      result = result.filter((d) => {
        const allTicketsFilled = d.items?.every((item) => item.ticketNumber && item.ticketNumber.trim()) || false;
        if (statusFilter === "paid") {
          return allTicketsFilled;
        } else if (statusFilter === "pending") {
          return !allTicketsFilled;
        } else if (statusFilter === "modified") {
          return d.isModified === true;
        }
        return true;
      });
    }
    
    // Filtre par recherche téléphone ou email (utilise la valeur debouncée)
    if (debouncedQ.trim()) {
      const searchTerm = debouncedQ.trim().toLowerCase();
      const phoneNeedle = debouncedQ.replace(/\D+/g, ""); // Pour la recherche téléphone (chiffres uniquement)
      
      result = result.filter((d) => {
        // Recherche par téléphone (chiffres uniquement)
        const clientPhone = (d.client?.phone || "").replace(/\D+/g, "");
        const phoneMatch = phoneNeedle && clientPhone.includes(phoneNeedle);
        
        // Recherche par email (texte complet, insensible à la casse)
        const clientEmail = (d.client?.email || "").toLowerCase();
        const emailMatch = clientEmail.includes(searchTerm);
        
        return phoneMatch || emailMatch;
      });
    }
    
    return result;
  }, [debouncedQ, quotes, statusFilter]);
  
  // Calculer les statuts et formater les dates UNIQUEMENT pour les devis filtrés (pas tous les devis)
  const quotesWithStatus = useMemo(() => {
    const dateFormatterCache = dateFormatterCacheRef.current;
    return filtered.map((d) => {
      // Pré-formater la date de création une seule fois avec cache
      let formattedCreatedAt = dateFormatterCache.get(d.createdAt);
      if (!formattedCreatedAt) {
        const createdAtDate = new Date(d.createdAt);
        formattedCreatedAt = createdAtDate.toLocaleString("fr-FR");
        dateFormatterCache.set(d.createdAt, formattedCreatedAt);
      }
      
      // Pré-formater les dates des items avec cache
      const itemsWithFormattedDates = d.items?.map((item) => {
        if (!item.date) return { ...item, formattedDate: "Date ?" };
        let formattedDate = dateFormatterCache.get(item.date);
        if (!formattedDate) {
          formattedDate = new Date(item.date + "T12:00:00").toLocaleDateString("fr-FR");
          dateFormatterCache.set(item.date, formattedDate);
        }
        return { ...item, formattedDate };
      }) || [];
      
      // Calculer les statuts une seule fois
      const allTicketsFilled = d.items?.every((item) => item.ticketNumber && item.ticketNumber.trim()) || false;
      const hasTickets = d.items?.some((item) => item.ticketNumber && item.ticketNumber.trim()) || false;
      
      return {
        ...d,
        allTicketsFilled,
        hasTickets,
        formattedCreatedAt,
        itemsWithFormattedDates,
      };
    });
  }, [filtered]);

  // Pagination : calculer les devis à afficher pour la page courante (utiliser quotesWithStatus qui contient les données formatées)
  const paginatedQuotes = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    return quotesWithStatus.slice(startIndex, endIndex);
  }, [quotesWithStatus, currentPage]);

  // Calculer le nombre total de pages
  const totalPages = useMemo(() => {
    return Math.ceil(filtered.length / ITEMS_PER_PAGE);
  }, [filtered.length]);

  // Réinitialiser la page quand les filtres changent
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedQ, statusFilter]);

  // Scroller en haut de la modale de paiement et de la page quand elle s'ouvre (optimisé avec useCallback)
  const handlePaymentModalScroll = useCallback(() => {
    if (!showPaymentModal) return;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setTimeout(() => {
      if (paymentModalRef.current) {
        paymentModalRef.current.scrollTop = 0;
      }
      if (paymentModalContainerRef.current) {
        paymentModalContainerRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);
  }, [showPaymentModal]);

  useEffect(() => {
    handlePaymentModalScroll();
  }, [handlePaymentModalScroll]);

  // Réinitialiser le scroll interne de la modale quand elle s'ouvre (sans déplacer la page)
  useEffect(() => {
    if (showEditModal && editModalRef.current) {
      // Réinitialiser uniquement le scroll interne de la modale, pas le scroll de la page
      editModalRef.current.scrollTop = 0;
    }
  }, [showEditModal]);

  // Suppression automatique des devis non payés au-delà de UNPAID_QUOTE_AUTO_DELETE_DAYS (exécuté au chargement de l’historique)
  const cleanupOldUnpaidQuotes = useCallback(async () => {
    // Ne pas exécuter si quotes est vide
    if (!quotes || quotes.length === 0) {
      return;
    }
    
    const now = new Date();
    const msPerDay = 24 * 60 * 60 * 1000;
    const cutoffDate = new Date(now.getTime() - UNPAID_QUOTE_AUTO_DELETE_DAYS * msPerDay);
    
    // Identifier les devis à supprimer
    const quotesToDelete = quotes.filter((quote) => {
      // Vérifier si le devis est non payé (tous les tickets ne sont pas remplis)
      const allTicketsFilled = quote.items?.every((item) => item.ticketNumber && item.ticketNumber.trim()) || false;
      if (allTicketsFilled) {
        return false; // Le devis est payé, ne pas le supprimer
      }
      
      // Vérifier si le devis a été créé il y a plus de UNPAID_QUOTE_AUTO_DELETE_DAYS jours
      const createdAt = new Date(quote.createdAt);
      if (isNaN(createdAt.getTime())) {
        return false; // Date invalide, ne pas supprimer
      }
      
      return createdAt < cutoffDate;
    });

    if (quotesToDelete.length > 0) {
      logger.log(
        `🗑️ Suppression automatique de ${quotesToDelete.length} devis non payés de plus de ${UNPAID_QUOTE_AUTO_DELETE_DAYS} jours`
      );
      
      // Supprimer de la liste locale
      const remainingQuotes = quotes.filter((quote) => 
        !quotesToDelete.some((toDelete) => toDelete.id === quote.id)
      );
      setQuotes(remainingQuotes);
      saveLS(LS_KEYS.quotes, remainingQuotes);

      // Supprimer de Supabase si configuré
      if (supabase) {
        for (const quoteToDelete of quotesToDelete) {
          try {
            let deleteQuery = supabase
              .from("quotes")
              .delete()
              .eq("site_key", SITE_KEY);

            // Utiliser supabase_id en priorité pour identifier le devis à supprimer
            if (quoteToDelete.supabase_id) {
              deleteQuery = deleteQuery.eq("id", quoteToDelete.supabase_id);
            } else {
              // Sinon, utiliser client_phone + created_at (pour compatibilité avec les anciens devis)
              deleteQuery = deleteQuery
                .eq("client_phone", quoteToDelete.client?.phone || "")
                .eq("created_at", quoteToDelete.createdAt);
            }
            
            const { error: deleteError } = await deleteQuery;
            
            if (deleteError) {
              logger.warn("⚠️ Erreur suppression Supabase:", deleteError);
            } else {
              logger.log(`✅ Devis supprimé de Supabase (ID: ${quoteToDelete.supabase_id || quoteToDelete.id})`);
            }
          } catch (deleteErr) {
            logger.warn("⚠️ Erreur lors de la suppression Supabase:", deleteErr);
          }
        }
      }
    }
  }, [quotes, setQuotes]);

  // Exécuter le nettoyage au chargement de la page historique (une seule fois)
  useEffect(() => {
    cleanupOldUnpaidQuotes();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-6 md:space-y-8 bg-gradient-to-br from-slate-50/50 via-white to-blue-50/30 min-h-screen">
      {/* Header amélioré */}
      <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-slate-200/60 shadow-lg p-5 md:p-6 lg:p-7">
      <div className="flex flex-col gap-5 md:gap-6">
        <div className="flex flex-col md:flex-row gap-4 md:gap-5 items-start md:items-center justify-between">
          <div className="flex-1 max-w-md">
              <h2 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-slate-800 via-blue-700 to-indigo-700 bg-clip-text text-transparent mb-4 flex items-center gap-3">
                <span className="text-3xl md:text-4xl animate-pulse">📋</span>
                <span>Historique des devis</span>
            </h2>
              <div className="space-y-3">
              <TextInput
                placeholder="Rechercher par téléphone ou email..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
                  className="w-full text-base border-2 border-slate-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-200 rounded-xl shadow-sm"
              />
                <p className="text-xs md:text-sm text-amber-700 bg-gradient-to-r from-amber-50 to-orange-50 px-4 py-2.5 rounded-xl border-2 border-amber-200/70 flex items-center gap-2 font-medium shadow-sm">
                <span className="text-base">⚠️</span>
                <span>N'oubliez pas d'actualiser la page pour voir les dernières informations</span>
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 md:gap-3">
            <Pill
              active={statusFilter === "all"}
              onClick={() => setStatusFilter("all")}
                className="transition-opacity duration-150 hover:opacity-80"
            >
              📊 Tous
            </Pill>
            <Pill
              active={statusFilter === "paid"}
              onClick={() => setStatusFilter("paid")}
                className="transition-opacity duration-150 hover:opacity-80"
            >
              ✅ Payés
            </Pill>
            <Pill
              active={statusFilter === "pending"}
              onClick={() => setStatusFilter("pending")}
                className="transition-opacity duration-150 hover:opacity-80"
            >
              ⏳ En attente
            </Pill>
            <Pill
              active={statusFilter === "modified"}
              onClick={() => setStatusFilter("modified")}
                className="transition-opacity duration-150 hover:opacity-80"
            >
              🔄 Modifié
            </Pill>
            </div>
          </div>
        </div>
      </div>
      
      {/* Indicateur du nombre de résultats amélioré */}
      <div className="flex items-center justify-between bg-gradient-to-r from-blue-50/90 via-indigo-50/80 to-purple-50/70 rounded-xl border-2 border-blue-200/60 p-4 md:p-5 shadow-lg backdrop-blur-sm transition-all duration-200 hover:shadow-xl">
        <div className="flex items-center gap-3">
          <span className="text-2xl md:text-3xl animate-bounce">📊</span>
          <div>
            {filtered.length === 0 ? (
              <p className="text-amber-700 font-bold text-base md:text-lg">Aucun devis trouvé</p>
            ) : filtered.length === 1 ? (
              <p className="text-blue-700 font-bold text-base md:text-lg">1 devis trouvé</p>
            ) : (
              <p className="text-blue-700 font-bold text-base md:text-lg">{filtered.length} devis trouvés</p>
            )}
            {quotes.length !== filtered.length && (
              <p className="text-slate-600 text-sm font-medium mt-1">
                sur {quotes.length} total
              </p>
            )}
          </div>
        </div>
      </div>
      
      <div className="space-y-4 md:space-y-5">
        {paginatedQuotes.map((d) => (
          <QuoteCard
            key={d.id}
            quote={d}
            quotes={quotes}
            setQuotes={setQuotes}
            user={user}
            setSelectedQuote={setSelectedQuote}
            setTicketNumbers={setTicketNumbers}
            setStripeAmount={setStripeAmount}
            setCashAmount={setCashAmount}
            setShowPaymentModal={setShowPaymentModal}
            setEditClient={setEditClient}
            setEditItems={setEditItems}
            setEditNotes={setEditNotes}
            setShowEditModal={setShowEditModal}
          />
        ))}
        {filtered.length === 0 && (
          <div className="bg-gradient-to-br from-slate-50/90 to-blue-50/70 rounded-2xl border-2 border-slate-200/60 p-12 md:p-16 text-center shadow-lg">
            <div className="flex flex-col items-center gap-4">
              <span className="text-5xl md:text-6xl">📭</span>
              <p className="text-lg md:text-xl font-bold text-slate-700">Aucun devis trouvé</p>
              <p className="text-sm md:text-base text-slate-500">Essayez de modifier vos critères de recherche</p>
            </div>
          </div>
        )}
        
        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-6">
            <button
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="px-4 py-2 rounded-xl border-2 border-blue-300 bg-white text-blue-700 font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-50 transition-colors"
            >
              ← Précédent
            </button>
            <span className="px-4 py-2 text-slate-700 font-semibold">
              Page {currentPage} sur {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className="px-4 py-2 rounded-xl border-2 border-blue-300 bg-white text-blue-700 font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-50 transition-colors"
            >
              Suivant →
            </button>
          </div>
        )}
      </div>

      {/* Bouton "Remonter en haut" */}
      {showScrollToTop && (
        <button
          onClick={scrollToTop}
          className="fixed bottom-6 right-6 z-40 w-14 h-14 md:w-16 md:h-16 rounded-full shadow-2xl flex items-center justify-center transition-opacity duration-150 hover:opacity-90 active:opacity-75 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white border-2 border-white/20 backdrop-blur-sm"
          style={{
            boxShadow: '0 8px 24px rgba(79, 70, 229, 0.6)',
          }}
          title="Remonter en haut"
        >
          <span className="text-2xl md:text-3xl font-bold">↑</span>
        </button>
      )}

      {/* Modale de paiement */}
      {showPaymentModal && selectedQuote && (
        <div ref={paymentModalContainerRef} className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-2 md:p-4">
          <div ref={paymentModalRef} className="bg-white/98 backdrop-blur-md rounded-xl md:rounded-2xl border border-blue-100/60 shadow-2xl p-4 md:p-6 max-w-2xl w-full max-h-[95vh] md:max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-3 md:mb-4">
              <h3 className="text-base md:text-lg font-semibold">Enregistrer les numéros de ticket</h3>
              <button
                onClick={() => {
                  setShowPaymentModal(false);
                  setSelectedQuote(null);
                  setTicketNumbers({});
                  setStripeAmount("");
                  setCashAmount("");
                }}
                className="text-slate-400 hover:text-slate-600 text-2xl leading-none min-w-[44px] min-h-[44px] flex items-center justify-center"
              >
                ×
              </button>
            </div>

            <div className="space-y-4 md:space-y-5 mb-6">
              {selectedQuote.items?.map((item, idx) => (
                <div key={idx} className="border-2 border-blue-200/60 rounded-xl p-4 md:p-5 bg-gradient-to-br from-blue-50/80 to-cyan-50/60 shadow-lg backdrop-blur-sm">
                  <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 mb-4">
                    <div className="flex-1">
                      <p className="font-bold text-base md:text-lg text-slate-900 mb-1">{item.activityName}</p>
                      <p className="text-xs md:text-sm text-slate-600 font-medium">
                        📅 {item.date ? new Date(item.date + "T12:00:00").toLocaleDateString("fr-FR") : "Date ?"} — 👥 {item.adults} adulte(s), {item.children} enfant(s), {item.babies ?? 0} bébé(s)
                      </p>
                    </div>
                    <div className="text-right bg-white/80 rounded-lg px-3 py-2 border-2 border-blue-100/60">
                      <p className="text-sm md:text-base font-bold text-slate-900">💵 {currencyNoCents(Math.round(item.lineTotal), selectedQuote.currency)}</p>
                      <p className="text-xs md:text-sm text-slate-600 font-medium">💳 {currencyNoCents(calculateCardPrice(item.lineTotal), selectedQuote.currency)}</p>
                      {calculateTransferSurcharge(item) > 0 && (
                        <p className="text-xs text-cyan-700 font-bold mt-1">
                          🚗 Transfert: {currencyNoCents(calculateTransferSurcharge(item), selectedQuote.currency)}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs md:text-sm font-bold text-slate-700 mb-2">Numéro de ticket unique</label>
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
                        className={`text-base ${user?.name !== "Ewen" && item.ticketNumber && item.ticketNumber.trim() ? "bg-slate-100 cursor-not-allowed" : ""}`}
                      />
                      {user?.name !== "Ewen" && item.ticketNumber && item.ticketNumber.trim() && (
                        <p className="text-xs md:text-sm text-emerald-700 font-bold mt-2 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200 inline-block">
                          ✅ Ticket verrouillé (non modifiable)
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Champs de saisie pour les montants Stripe et Cash */}
            <div className="mt-6 pt-4 border-t border-slate-200">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-xs md:text-sm font-bold text-slate-700 mb-2">
                    💳 Montant payé en Stripe ({selectedQuote.currency || "EUR"})
                  </label>
                  <NumberInput
                    placeholder="0"
                    value={stripeAmount}
                    onChange={(e) => {
                      const value = e.target.value;
                      // Permettre uniquement les nombres et un point décimal
                      if (value === "" || /^\d*\.?\d*$/.test(value)) {
                        setStripeAmount(value);
                      }
                    }}
                    className="text-base"
                    min="0"
                    step="0.01"
                  />
                </div>
                <div>
                  <label className="block text-xs md:text-sm font-bold text-slate-700 mb-2">
                    💵 Montant payé en Cash ({selectedQuote.currency || "EUR"})
                  </label>
                  <NumberInput
                    placeholder="0"
                    value={cashAmount}
                    onChange={(e) => {
                      const value = e.target.value;
                      // Permettre uniquement les nombres et un point décimal
                      if (value === "" || /^\d*\.?\d*$/.test(value)) {
                        setCashAmount(value);
                      }
                    }}
                    className="text-base"
                    min="0"
                    step="0.01"
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 justify-end mt-4 md:mt-6 pt-4 border-t">
              <GhostBtn
                onClick={() => {
                  setShowPaymentModal(false);
                  setSelectedQuote(null);
                  setTicketNumbers({});
                  setStripeAmount("");
                  setCashAmount("");
                }}
                className="w-full sm:w-auto order-2 sm:order-1"
              >
                Annuler
              </GhostBtn>
              <PrimaryBtn
                className="w-full sm:w-auto order-1 sm:order-2"
                variant="success"
                onClick={async () => {
                  // Vérifier que tous les tickets sont renseignés
                  const allFilled = selectedQuote.items?.every((_, idx) => ticketNumbers[idx]?.trim());
                  if (!allFilled) {
                    toast.warning("Veuillez renseigner tous les numéros de ticket.");
                    return;
                  }

                  // Vérifier qu'au moins un montant est renseigné
                  const stripeValue = parseFloat(stripeAmount) || 0;
                  const cashValue = parseFloat(cashAmount) || 0;
                  if (stripeValue === 0 && cashValue === 0) {
                    toast.warning("Veuillez renseigner au moins un montant (Stripe ou Cash).");
                    return;
                  }

                  // Mettre à jour le devis avec les numéros de ticket et les montants de paiement
                  const updatedQuote = {
                    ...selectedQuote,
                    updated_at: new Date().toISOString(),
                    paidStripe: stripeValue,
                    paidCash: cashValue,
                    items: selectedQuote.items.map((item, idx) => ({
                      ...item,
                      ticketNumber: ticketNumbers[idx]?.trim() || "",
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
                        paid_stripe: stripeValue,
                        paid_cash: cashValue,
                        updated_at: new Date().toISOString(),
                      };
                      
                      // Utiliser supabase_id en priorité pour identifier le devis à mettre à jour
                      let updateQuery = supabase
                        .from("quotes")
                        .update(supabaseUpdate)
                        .eq("site_key", SITE_KEY);

                      if (selectedQuote.supabase_id) {
                        // Si le devis a un supabase_id, l'utiliser (le plus fiable)
                        updateQuery = updateQuery.eq("id", selectedQuote.supabase_id);
                      } else {
                        // Sinon, utiliser client_phone + created_at (pour compatibilité avec les anciens devis)
                        updateQuery = updateQuery
                          .eq("client_phone", updatedQuote.client.phone || "")
                          .eq("created_at", updatedQuote.createdAt);
                      }
                      
                      const { data, error: updateError } = await updateQuery.select();
                      
                      if (updateError) {
                        logger.error("❌ Erreur mise à jour Supabase:", updateError);
                        toast.error(`Erreur lors de la sauvegarde sur Supabase: ${updateError.message || 'Erreur inconnue'}. Les modifications sont sauvegardées localement.`);
                      } else {
                        logger.log("✅ Devis mis à jour dans Supabase avec succès:", data);
                        // Mettre à jour le supabase_id si ce n'était pas déjà fait
                        const updatedData = Array.isArray(data) ? data[0] : data;
                        if (updatedData && updatedData.id && !updatedQuote.supabase_id) {
                          const finalUpdatedQuote = { ...updatedQuote, supabase_id: updatedData.id };
                          const finalUpdatedQuotes = quotes.map((q) => (q.id === selectedQuote.id ? finalUpdatedQuote : q));
                          setQuotes(finalUpdatedQuotes);
                          saveLS(LS_KEYS.quotes, finalUpdatedQuotes);
                        }
                      }
                    } catch (updateErr) {
                      logger.error("❌ Exception lors de la mise à jour Supabase:", updateErr);
                      toast.error(`Exception lors de la sauvegarde sur Supabase: ${updateErr.message || 'Erreur inconnue'}. Les modifications sont sauvegardées localement.`);
                    }
                  }

                  setShowPaymentModal(false);
                  setSelectedQuote(null);
                  setTicketNumbers({});
                  setStripeAmount("");
                  setCashAmount("");
                  toast.success("Numéros de ticket et montants enregistrés avec succès !");
                }}
              >
                Enregistrer les tickets
              </PrimaryBtn>
            </div>
          </div>
        </div>
      )}

      {/* Modale de modification de devis - Rendu via Portal directement dans le body */}
      {showEditModal && selectedQuote && editClient && createPortal(
        <EditQuoteModal
          quote={selectedQuote}
          client={editClient}
          setClient={setEditClient}
          items={editItems}
          setItems={setEditItems}
          notes={editNotes}
          setNotes={setEditNotes}
          activities={activities}
          user={user}
          canModifyActivities={canModifyActivities}
          stopSales={stopSales}
          pushSales={pushSales}
          editModalRef={editModalRef}
          editModalContainerRef={editModalContainerRef}
          onClose={() => {
            setShowEditModal(false);
            setSelectedQuote(null);
            setEditClient(null);
            setEditItems([]);
            setEditNotes("");
          }}
          onSave={async (updatedQuote) => {
            const finalUpdatedQuote = {
              ...updatedQuote,
              updated_at: new Date().toISOString(),
            };
            const updatedQuotes = quotes.map((q) => (q.id === selectedQuote.id ? finalUpdatedQuote : q));
            setQuotes(updatedQuotes);
            saveLS(LS_KEYS.quotes, updatedQuotes);

            // Mettre à jour dans Supabase si configuré
            if (supabase) {
              try {
                const supabaseUpdate = {
                  client_name: finalUpdatedQuote.client.name || "",
                  client_phone: finalUpdatedQuote.client.phone || "",
                  client_hotel: finalUpdatedQuote.client.hotel || "",
                  client_room: finalUpdatedQuote.client.room || "",
                  client_neighborhood: finalUpdatedQuote.client.neighborhood || "",
                  client_arrival_date: finalUpdatedQuote.client.arrivalDate || null,
                  client_departure_date: finalUpdatedQuote.client.departureDate || null,
                  notes: finalUpdatedQuote.notes || "",
                  total: finalUpdatedQuote.total,
                  currency: finalUpdatedQuote.currency,
                  items: JSON.stringify(finalUpdatedQuote.items),
                  created_by_name: finalUpdatedQuote.createdByName || "",
                  updated_at: finalUpdatedQuote.updated_at,
                };

                // Utiliser supabase_id en priorité pour identifier le devis à mettre à jour
                let updateQuery = supabase
                  .from("quotes")
                  .update(supabaseUpdate)
                  .eq("site_key", SITE_KEY);

                if (selectedQuote.supabase_id) {
                  // Si le devis a un supabase_id, l'utiliser (le plus fiable)
                  updateQuery = updateQuery.eq("id", selectedQuote.supabase_id);
                } else {
                  // Sinon, utiliser client_phone + created_at (pour compatibilité avec les anciens devis)
                  updateQuery = updateQuery
                    .eq("client_phone", selectedQuote.client?.phone || "")
                    .eq("created_at", selectedQuote.createdAt);
                }

                const { data, error: updateError } = await updateQuery.select();

                if (updateError) {
                  logger.error("❌ Erreur mise à jour Supabase:", updateError);
                  toast.error(`Erreur lors de la sauvegarde sur Supabase: ${updateError.message || 'Erreur inconnue'}. Les modifications sont sauvegardées localement.`);
                } else {
                  logger.log("✅ Devis mis à jour dans Supabase avec succès:", data);
                  // Mettre à jour le supabase_id dans le devis local si ce n'était pas déjà fait
                  const updatedData = Array.isArray(data) ? data[0] : data;
                  if (updatedData && updatedData.id && !finalUpdatedQuote.supabase_id) {
                    const quoteWithSupabaseId = { ...finalUpdatedQuote, supabase_id: updatedData.id };
                    const finalUpdatedQuotes = quotes.map((q) => (q.id === selectedQuote.id ? quoteWithSupabaseId : q));
                    setQuotes(finalUpdatedQuotes);
                    saveLS(LS_KEYS.quotes, finalUpdatedQuotes);
                  }
                }
              } catch (updateErr) {
                logger.error("❌ Exception lors de la mise à jour Supabase:", updateErr);
                toast.error(`Exception lors de la sauvegarde sur Supabase: ${updateErr.message || 'Erreur inconnue'}. Les modifications sont sauvegardées localement.`);
              }
            }

            setShowEditModal(false);
            setSelectedQuote(null);
            setEditClient(null);
            setEditItems([]);
            setEditNotes("");
            toast.success("Devis modifié avec succès !");
          }}
        />,
        document.body
      )}
    </div>
  );
}

// Composant modale de modification de devis
function EditQuoteModal({ quote, client, setClient, items, setItems, notes, setNotes, activities, stopSales = [], pushSales = [], onClose, onSave, editModalRef, editModalContainerRef }) {
  // Map des activités pour des recherches O(1) au lieu de O(n)
  const activitiesMap = useMemo(() => {
    const map = new Map();
    activities.forEach((activity) => {
      if (activity.id) map.set(activity.id, activity);
      if (activity.supabase_id) map.set(activity.supabase_id, activity);
    });
    return map;
  }, [activities]);

  const blankItem = () => ({
    activityId: "",
    date: new Date().toISOString().slice(0, 10),
    adults: 2,
    children: 0,
    babies: 0,
    extraLabel: "",
    extraAmount: "",
    slot: "",
    extraDolphin: false,
    speedBoatExtra: [],
    buggySimple: "",
    buggyFamily: "",
    yamaha250: "",
    ktm640: "",
    ktm530: "",
    zeroTracasTransfertVisaSim: "",
    zeroTracasTransfertVisa: "",
    zeroTracasTransfert3Personnes: "",
    zeroTracasTransfertPlus3Personnes: "",
    zeroTracasVisaSim: "",
    zeroTracasVisaSeul: "",
    cairePrivatif4pax: false, // Pour CAIRE PRIVATIF
    cairePrivatif5pax: false, // Pour CAIRE PRIVATIF
    cairePrivatif6pax: false, // Pour CAIRE PRIVATIF
    louxorPrivatif4pax: false, // Pour LOUXOR PRIVATIF
    louxorPrivatif5pax: false, // Pour LOUXOR PRIVATIF
    louxorPrivatif6pax: false, // Pour LOUXOR PRIVATIF
  });

  const sortedActivities = useMemo(() => {
    return [...activities].sort((a, b) => (a.name || "").localeCompare(b.name || "", "fr", { sensitivity: "base" }));
  }, [activities]);

  function setItem(i, patch) {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }
  function addItem() {
    setItems((prev) => [...prev, blankItem()]);
  }
  function removeItem(i) {
    // Protection contre les doubles appels
    setItems((prev) => {
      // Vérifier que l'index existe avant de supprimer
      if (i < 0 || i >= prev.length) {
        console.warn("Tentative de suppression d'un index invalide:", i);
        return prev;
      }
      return prev.filter((_, idx) => idx !== i);
    });
  }

  // Cache pour SPEED_BOAT_EXTRAS (évite les recherches répétées)
  const speedBoatExtrasMapRef = useRef(new Map());
  useEffect(() => {
    // Construire le Map une seule fois au montage
    if (speedBoatExtrasMapRef.current.size === 0) {
      SPEED_BOAT_EXTRAS.forEach((extra) => {
        speedBoatExtrasMapRef.current.set(extra.id, extra);
      });
    }
  }, []);

  // Calcul des totaux (similaire à QuotesPage) - optimisé avec Map et cache
  const computed = useMemo(() => {
    if (!items || items.length === 0 || !client) return [];
    const speedBoatExtrasMap = speedBoatExtrasMapRef.current;
    return items.map((it) => {
      const act = activitiesMap.get(it.activityId);
      const weekday = it.date ? new Date(it.date + "T12:00:00").getDay() : null;
      const available = act && weekday != null ? !!act.availableDays?.[weekday] : true;
      const transferInfo = act && client?.neighborhood ? act.transfers?.[client.neighborhood] || null : null;

      let lineTotal = 0;
      const currencyCode = act?.currency || "EUR";

      // cas spécial Speed Boat
      if (act && isSpeedBoatActivity(act.name)) {
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
        if (it.speedBoatExtra) {
          // Gérer le nouveau format (array) et l'ancien format (string) pour compatibilité
          const extrasArray = Array.isArray(it.speedBoatExtra) 
            ? it.speedBoatExtra 
            : (typeof it.speedBoatExtra === "string" && it.speedBoatExtra !== "" 
              ? [it.speedBoatExtra] 
              : []);
          
          // Utiliser le Map au lieu de find() pour O(1) au lieu de O(n)
          extrasArray.forEach((extraId) => {
            if (extraId) { // Ignorer les valeurs vides
              const selectedExtra = speedBoatExtrasMap.get(extraId);
              if (selectedExtra) {
                lineTotal += ad * selectedExtra.priceAdult;
                lineTotal += ch * selectedExtra.priceChild;
              }
            }
          });
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
      } else if (act && isCairePrivatifActivity(act.name)) {
        // cas spécial CAIRE PRIVATIF : calcul basé sur les cases à cocher (4pax, 5pax, 6pax)
        const prices = getCairePrivatifPrices();
        if (it.cairePrivatif4pax) {
          lineTotal = prices.pax4;
        } else if (it.cairePrivatif5pax) {
          lineTotal = prices.pax5;
        } else if (it.cairePrivatif6pax) {
          lineTotal = prices.pax6;
        }
      } else if (act && isLouxorPrivatifActivity(act.name)) {
        // cas spécial LOUXOR PRIVATIF : calcul basé sur les cases à cocher (4pax, 5pax, 6pax)
        const prices = getLouxorPrivatifPrices();
        if (it.louxorPrivatif4pax) {
          lineTotal = prices.pax4;
        } else if (it.louxorPrivatif5pax) {
          lineTotal = prices.pax5;
        } else if (it.louxorPrivatif6pax) {
          lineTotal = prices.pax6;
        }
      } else if (act && isZeroTracasHorsZoneActivity(act.name)) {
        // cas spécial ZERO TRACAS HORS ZONE : calcul basé sur les différents types de services
        const prices = getZeroTracasHorsZonePrices();
        const transfertVisaSim = Number(it.zeroTracasTransfertVisaSim || 0);
        const transfertVisa = Number(it.zeroTracasTransfertVisa || 0);
        const transfert3Personnes = Number(it.zeroTracasTransfert3Personnes || 0);
        const transfertPlus3Personnes = Number(it.zeroTracasTransfertPlus3Personnes || 0);
        const visaSim = Number(it.zeroTracasVisaSim || 0);
        const visaSeul = Number(it.zeroTracasVisaSeul || 0);
        
        lineTotal = 
          transfertVisaSim * prices.transfertVisaSim +
          transfertVisa * prices.transfertVisa +
          transfert3Personnes * prices.transfert3Personnes +
          transfertPlus3Personnes * prices.transfertPlus3Personnes +
          visaSim * prices.visaSim +
          visaSeul * prices.visaSeul;
      } else if (act && isZeroTracasActivity(act.name)) {
        // cas spécial ZERO TRACAS : calcul basé sur les différents types de services
        const prices = getZeroTracasPrices();
        const transfertVisaSim = Number(it.zeroTracasTransfertVisaSim || 0);
        const transfertVisa = Number(it.zeroTracasTransfertVisa || 0);
        const transfert3Personnes = Number(it.zeroTracasTransfert3Personnes || 0);
        const transfertPlus3Personnes = Number(it.zeroTracasTransfertPlus3Personnes || 0);
        const visaSim = Number(it.zeroTracasVisaSim || 0);
        const visaSeul = Number(it.zeroTracasVisaSeul || 0);
        
        lineTotal = 
          transfertVisaSim * prices.transfertVisaSim +
          transfertVisa * prices.transfertVisa +
          transfert3Personnes * prices.transfert3Personnes +
          transfertPlus3Personnes * prices.transfertPlus3Personnes +
          visaSim * prices.visaSim +
          visaSeul * prices.visaSeul;
      } else if (act) {
        lineTotal += Number(it.adults || 0) * Number(act.priceAdult || 0);
        lineTotal += Number(it.children || 0) * Number(act.priceChild || 0);
        lineTotal += (act.babiesForbidden ? 0 : Number(it.babies || 0) * Number(act.priceBaby || 0));
      }

      // supplément transfert PAR ADULTE ET ENFANT (bébés gratuits)
      // Ne pas appliquer pour ZERO TRACAS, ZERO TRACAS HORS ZONE, CAIRE PRIVATIF et LOUXOR PRIVATIF car le transfert est déjà inclus dans les prix
      // IMPORTANT : cette logique doit rester strictement identique à celle utilisée dans `useActivityPriceCalculator`
      if (transferInfo && transferInfo.surcharge && !isZeroTracasActivity(act?.name) && !isZeroTracasHorsZoneActivity(act?.name) && !isCairePrivatifActivity(act?.name) && !isLouxorPrivatifActivity(act?.name)) {
        if (act && isMotoCrossActivity(act.name)) {
          // Pour MOTO CROSS, le supplément est calculé sur le nombre total de motos
          const totalMotos = Number(it.yamaha250 || 0) + Number(it.ktm640 || 0) + Number(it.ktm530 || 0);
          lineTotal += Number(transferInfo.surcharge || 0) * totalMotos;
        } else {
          // Pour toutes les autres activités (y compris buggy), le supplément est calculé sur le nombre d'adultes + enfants (bébés gratuits)
          const adults = Number(it.adults || 0);
          const children = Number(it.children || 0);
          lineTotal += Number(transferInfo.surcharge || 0) * (adults + children);
        }
      }

      // extra (montant à ajouter ou soustraire) - s'applique à toutes les activités
      // Convertir en string d'abord pour gérer les cas où c'est déjà un nombre
      const extraAmountStr = String(it.extraAmount || "").trim();
      if (extraAmountStr !== "" && extraAmountStr !== "0" && extraAmountStr !== "0.00") {
        const extraAmountValue = Number(extraAmountStr);
        if (!isNaN(extraAmountValue) && extraAmountValue !== 0) {
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
        transferInfo,
        lineTotal,
        pickupTime,
        currency: currencyCode,
      };
    });
  }, [items, activitiesMap, client?.neighborhood]);

  const grandCurrency = computed.find((c) => c.currency)?.currency || "EUR";
  const grandTotal = computed.reduce((s, c) => s + (c.lineTotal || 0), 0);
  const grandTotalCash = Math.round(grandTotal); // Prix espèces (arrondi sans centimes)
  const grandTotalCard = calculateCardPrice(grandTotal); // Prix carte (espèces + 3% arrondi à l'euro supérieur)

  function handleSave() {
    // Filtrer les items vides (sans activité sélectionnée)
    const validComputed = computed.filter((c) => c.act && c.act.id);

    // Vérifier qu'il y a au moins un item valide
    if (validComputed.length === 0) {
      toast.warning("Veuillez sélectionner au moins une activité.");
      return;
    }

    // Calculer le total uniquement avec les items valides
    const validGrandTotal = validComputed.reduce((s, c) => s + (c.lineTotal || 0), 0);
    const validGrandCurrency = validComputed.find((c) => c.currency)?.currency || "EUR";

    // Nettoyer le numéro de téléphone avant de sauvegarder
    const cleanedClient = {
      ...client,
      phone: cleanPhoneNumber(client.phone || ""),
    };

    const updatedQuote = {
      ...quote,
      client: cleanedClient,
      clientArrivalDate: cleanedClient.arrivalDate || "",
      clientDepartureDate: cleanedClient.departureDate || "",
      notes: notes.trim(),
      createdByName: quote.createdByName || "", // Garder le créateur original
      items: validComputed.map((c, idx) => {
        const originalItem = quote.items?.[idx];

        const rawAdults = c.raw.adults;
        const rawChildren = c.raw.children;
        const rawBabies = c.raw.babies;

        const adults =
          rawAdults === "" || rawAdults === null || rawAdults === undefined
            ? (typeof originalItem?.adults === "number" ? originalItem.adults : 0)
            : Number(rawAdults || 0);

        const children =
          rawChildren === "" || rawChildren === null || rawChildren === undefined
            ? (typeof originalItem?.children === "number" ? originalItem.children : 0)
            : Number(rawChildren || 0);

        const babies =
          rawBabies === "" || rawBabies === null || rawBabies === undefined
            ? (typeof originalItem?.babies === "number" ? originalItem.babies : 0)
            : Number(rawBabies || 0);

        return ({
          activityId: c.act.id,
          activityName: c.act.name || "",
          date: c.raw.date,
          adults,
          children,
          babies,
          extraLabel: c.raw.extraLabel || "",
          extraAmount: Number(c.raw.extraAmount || 0),
          extraDolphin: c.raw.extraDolphin || false,
          speedBoatExtra: Array.isArray(c.raw.speedBoatExtra) ? c.raw.speedBoatExtra : (c.raw.speedBoatExtra ? [c.raw.speedBoatExtra] : []),
          buggySimple: Number(c.raw.buggySimple || 0),
          buggyFamily: Number(c.raw.buggyFamily || 0),
          yamaha250: Number(c.raw.yamaha250 || 0),
          ktm640: Number(c.raw.ktm640 || 0),
          ktm530: Number(c.raw.ktm530 || 0),
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
          // Préserver le ticketNumber existant - ne peut pas être modifié si déjà rempli
          ticketNumber: (c.raw.ticketNumber && c.raw.ticketNumber.trim()) 
            ? c.raw.ticketNumber 
            : (quote.items?.find((item) => item.activityId === c.act.id && item.date === c.raw.date)?.ticketNumber || ""),
        });
      }),
      total: validGrandTotal,
      totalCash: Math.round(validGrandTotal),
      totalCard: calculateCardPrice(validGrandTotal),
      currency: validGrandCurrency,
    };

    onSave(updatedQuote);
  }

  return (
    <div 
      ref={editModalContainerRef} 
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-2 md:p-4"
      style={{ 
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflowY: 'auto',
        // S'assurer que la modale reste visible dans le viewport
        paddingTop: '2rem',
        paddingBottom: '2rem'
      }}
      onClick={(e) => {
        // Fermer la modale si on clique sur le fond
        if (e.target === editModalContainerRef.current) {
          onClose();
        }
      }}
    >
      <div 
        ref={editModalRef} 
        className="bg-white rounded-2xl border-2 border-blue-300/80 shadow-2xl p-6 md:p-8 lg:p-10 max-w-6xl w-full overflow-y-auto"
        style={{
          maxHeight: 'calc(100vh - 4rem)',
          margin: 'auto',
          // S'assurer que la modale reste centrée même si le contenu est long
          alignSelf: 'center'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6 md:mb-8 pb-5 border-b-2 border-slate-300/80">
          <h3 className="text-xl md:text-2xl lg:text-3xl font-bold text-slate-900 flex items-center gap-3">
            <span className="text-3xl md:text-4xl">✏️</span>
            <span>Modifier le devis</span>
          </h3>
          <button 
            onClick={onClose} 
            className="text-slate-500 hover:text-slate-700 text-4xl leading-none min-w-[48px] min-h-[48px] flex items-center justify-center transition-all duration-200 hover:bg-slate-100 rounded-full hover:scale-110"
            aria-label="Fermer la modale"
          >
            ×
          </button>
        </div>

        <div className="space-y-8 md:space-y-10">
          {/* Infos client - Modifiables par tous */}
          <div className="bg-gradient-to-br from-blue-50/90 to-indigo-50/80 rounded-2xl p-6 md:p-7 lg:p-8 border-2 border-blue-300/70 shadow-lg">
            <h4 className="text-base md:text-lg lg:text-xl font-bold text-slate-900 mb-6 flex items-center gap-3">
              <span className="text-2xl md:text-3xl">👤</span>
              <span>Informations client</span>
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-6">
              <div>
                <label className="block text-sm md:text-base font-bold text-slate-800 mb-3">👤 Nom du client</label>
                <TextInput 
                  value={client.name || ""} 
                  onChange={(e) => setClient((c) => ({ ...c, name: e.target.value }))} 
                  className="text-base md:text-lg py-3"
                />
              </div>
              <div>
                <label className="block text-sm md:text-base font-bold text-slate-800 mb-3">📞 Téléphone</label>
                <TextInput 
                  value={client.phone || ""} 
                  onChange={(e) => {
                    // Nettoyer automatiquement le numéro de téléphone (supprimer espaces, parenthèses, etc.)
                    const cleaned = cleanPhoneNumber(e.target.value);
                    setClient((c) => ({ ...c, phone: cleaned }));
                  }} 
                  className="text-base md:text-lg py-3"
                />
              </div>
              <div>
                <label className="block text-sm md:text-base font-bold text-slate-800 mb-3">🏨 Hôtel</label>
                <TextInput 
                  value={client.hotel || ""} 
                  onChange={(e) => setClient((c) => ({ ...c, hotel: e.target.value }))} 
                  className="text-base md:text-lg py-3"
                />
              </div>
              <div>
                <label className="block text-sm md:text-base font-bold text-slate-800 mb-3">🚪 Chambre</label>
                <TextInput 
                  value={client.room || ""} 
                  onChange={(e) => setClient((c) => ({ ...c, room: e.target.value }))} 
                  className="text-base md:text-lg py-3"
                />
              </div>
              <div>
                <label className="block text-sm md:text-base font-bold text-slate-800 mb-3">📍 Quartier</label>
                <select
                  value={client.neighborhood || ""}
                  onChange={(e) => setClient((c) => ({ ...c, neighborhood: e.target.value }))}
                  className="w-full rounded-xl border-2 border-blue-300/70 bg-white/99 backdrop-blur-sm px-4 py-3 md:py-4 text-base md:text-lg font-medium text-slate-900 shadow-md focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-all"
                >
                  <option value="">— Choisir un quartier —</option>
                  {NEIGHBORHOODS.map((n) => (
                    <option key={n.key} value={n.key}>
                      {n.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 md:gap-6 mt-5 md:mt-6">
              <div>
                <label className="block text-sm md:text-base font-bold text-slate-800 mb-3">📅 Date d'arrivée</label>
                <TextInput 
                  type="date"
                  value={client.arrivalDate || ""} 
                  onChange={(e) => setClient((c) => ({ ...c, arrivalDate: e.target.value }))} 
                  className="text-base md:text-lg py-3"
                />
              </div>
              <div>
                <label className="block text-sm md:text-base font-bold text-slate-800 mb-3">📅 Date de départ</label>
                <TextInput 
                  type="date"
                  value={client.departureDate || ""} 
                  onChange={(e) => setClient((c) => ({ ...c, departureDate: e.target.value }))} 
                  className="text-base md:text-lg py-3"
                />
              </div>
            </div>
          </div>

          {/* Activités */}
          <div className="space-y-6 md:space-y-8">
            <h4 className="text-base md:text-lg lg:text-xl font-bold text-slate-900 flex items-center gap-3">
              <span className="text-2xl md:text-3xl">🎯</span>
              <span>Activités</span>
            </h4>
            {computed.map((c, idx) => (
              <div key={idx} className="bg-gradient-to-br from-white/98 to-slate-50/90 backdrop-blur-sm border-2 border-blue-300/70 rounded-2xl p-6 md:p-7 lg:p-8 space-y-5 md:space-y-6 shadow-lg transition-all duration-200 hover:shadow-xl hover:border-blue-400/80">
                <div className="flex items-center justify-between pb-4 border-b-2 border-blue-200/70">
                  <p className="text-base md:text-lg lg:text-xl font-bold text-slate-900 flex items-center gap-2">
                    <span className="text-xl md:text-2xl">🎯</span>
                    <span>Activité #{idx + 1}</span>
                  </p>
                  <GhostBtn type="button" onClick={() => removeItem(idx)} variant="danger" size="md" className="text-sm md:text-base px-4 py-2">
                    🗑️ Supprimer
                  </GhostBtn>
                </div>
                {/* Première ligne : Activité et Date - Modifiables par tous */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-5">
                  <div className="lg:col-span-2">
                    <p className="text-sm md:text-base font-bold text-slate-800 mb-3">🎯 Sélectionner une activité</p>
                    <select
                      value={c.raw.activityId || ""}
                      onChange={(e) => setItem(idx, { activityId: e.target.value })}
                      className="w-full rounded-xl border-2 border-blue-300/70 bg-white/99 backdrop-blur-sm px-4 py-3 md:py-4 text-base md:text-lg font-medium text-slate-900 shadow-md focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-all"
                    >
                      <option value="">— Choisir une activité —</option>
                      {sortedActivities.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <p className="text-sm md:text-base font-bold text-slate-800 mb-3">📅 Date de l'activité</p>
                    <ColoredDatePicker
                      value={c.raw.date}
                      onChange={(date) => setItem(idx, { date })}
                      activity={c.act}
                      stopSales={stopSales}
                      pushSales={pushSales}
                    />
                    {c.act && !c.available && (
                      <p className="text-xs md:text-sm text-amber-700 font-semibold mt-2 bg-amber-50 px-3 py-2 rounded-lg border border-amber-200">⚠️ Activité non disponible ce jour-là</p>
                    )}
                  </div>
                </div>
                {/* Deuxième ligne : Nombre de personnes - Modifiables par tous */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-5 bg-cyan-50/60 p-5 md:p-6 rounded-xl border-2 border-cyan-300/70">
                  <div>
                    <p className="text-sm md:text-base font-bold text-slate-800 mb-3">👥 Adultes</p>
                    <NumberInput 
                      value={c.raw.adults || 0} 
                      onChange={(e) => setItem(idx, { adults: e.target.value })}
                      className="text-base md:text-lg py-3"
                    />
                  </div>
                  <div>
                    <p className="text-sm md:text-base font-bold text-slate-800 mb-3">
                      👶 Enfants{c.act?.ageChild ? <span className="text-slate-600 font-normal ml-2 text-sm">({c.act.ageChild})</span> : ""}
                    </p>
                    <NumberInput 
                      value={c.raw.children || 0} 
                      onChange={(e) => setItem(idx, { children: e.target.value })}
                      className="text-base md:text-lg py-3"
                    />
                  </div>
                  <div>
                    <p className="text-sm md:text-base font-bold text-slate-800 mb-3">
                      🍼 Bébés{c.act?.ageBaby ? <span className="text-slate-600 font-normal ml-2 text-sm">({c.act.ageBaby})</span> : ""}
                    </p>
                    <NumberInput 
                      value={c.raw.babies || 0} 
                      onChange={(e) => setItem(idx, { babies: e.target.value })}
                      className="text-base md:text-lg py-3"
                    />
                  </div>
                </div>
                {/* Champs spécifiques pour Buggy - Modifiables par tous */}
                {c.act && isBuggyActivity(c.act.name) && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-5 mt-4 bg-purple-50/60 p-5 md:p-6 rounded-xl border-2 border-purple-300/70">
                    <div>
                      <p className="text-sm md:text-base font-bold text-slate-800 mb-3">🛵 Buggy Simple ({getBuggyPrices(c.act.name).simple}€)</p>
                      <NumberInput 
                        value={c.raw.buggySimple ?? ""} 
                        onChange={(e) => setItem(idx, { buggySimple: e.target.value === "" ? "" : e.target.value })}
                        className="text-base md:text-lg py-3"
                      />
                    </div>
                    <div>
                      <p className="text-sm md:text-base font-bold text-slate-800 mb-3">🛵 Buggy Family ({getBuggyPrices(c.act.name).family}€)</p>
                      <NumberInput 
                        value={c.raw.buggyFamily ?? ""} 
                        onChange={(e) => setItem(idx, { buggyFamily: e.target.value === "" ? "" : e.target.value })}
                        className="text-base md:text-lg py-3"
                      />
                    </div>
                  </div>
                )}
                {/* Champs spécifiques pour MotoCross - Modifiables par tous */}
                {c.act && isMotoCrossActivity(c.act.name) && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5 mt-4 bg-purple-50/60 p-5 md:p-6 rounded-xl border-2 border-purple-300/70">
                    <div>
                      <p className="text-sm md:text-base font-bold text-slate-800 mb-3">🏍️ YAMAHA 250CC ({getMotoCrossPrices().yamaha250}€)</p>
                      <NumberInput 
                        value={c.raw.yamaha250 ?? ""} 
                        onChange={(e) => setItem(idx, { yamaha250: e.target.value === "" ? "" : e.target.value })}
                        className="text-base md:text-lg py-3"
                      />
                    </div>
                    <div>
                      <p className="text-sm md:text-base font-bold text-slate-800 mb-3">🏍️ KTM640CC ({getMotoCrossPrices().ktm640}€)</p>
                      <NumberInput 
                        value={c.raw.ktm640 ?? ""} 
                        onChange={(e) => setItem(idx, { ktm640: e.target.value === "" ? "" : e.target.value })}
                        className="text-base md:text-lg py-3"
                      />
                    </div>
                    <div>
                      <p className="text-sm md:text-base font-bold text-slate-800 mb-3">🏍️ KTM 530CC ({getMotoCrossPrices().ktm530}€)</p>
                      <NumberInput 
                        value={c.raw.ktm530 ?? ""} 
                        onChange={(e) => setItem(idx, { ktm530: e.target.value === "" ? "" : e.target.value })}
                        className="text-base md:text-lg py-3"
                      />
                    </div>
                  </div>
                )}
                {/* Champs spécifiques pour CAIRE PRIVATIF - Modifiables par tous */}
                {c.act && isCairePrivatifActivity(c.act.name) && (
                  <div className="bg-gradient-to-br from-blue-50/80 to-cyan-50/70 rounded-xl p-5 md:p-6 border-2 border-blue-300/70 shadow-lg mt-4">
                    <p className="text-sm md:text-base font-bold text-slate-800 mb-4 flex items-center gap-2">
                      <span className="text-xl">✈️</span>
                      <span>Nombre de personnes</span>
                    </p>
                    <div className="space-y-3">
                      <label className="flex items-center gap-3 p-3 bg-white rounded-lg border-2 border-blue-200 hover:border-blue-400 cursor-pointer transition-all">
                        <input
                          type="radio"
                          name={`caire-privatif-${idx}`}
                          checked={c.raw.cairePrivatif4pax || false}
                          onChange={() => {
                            setItem(idx, {
                              cairePrivatif4pax: true,
                              cairePrivatif5pax: false,
                              cairePrivatif6pax: false,
                            });
                          }}
                          className="w-5 h-5 text-blue-600 border-gray-300 focus:ring-blue-500"
                        />
                        <span className="text-sm md:text-base font-semibold text-slate-700 flex-1">
                          4 pax - {getCairePrivatifPrices().pax4}€
                        </span>
                      </label>
                      <label className="flex items-center gap-3 p-3 bg-white rounded-lg border-2 border-blue-200 hover:border-blue-400 cursor-pointer transition-all">
                        <input
                          type="radio"
                          name={`caire-privatif-${idx}`}
                          checked={c.raw.cairePrivatif5pax || false}
                          onChange={() => {
                            setItem(idx, {
                              cairePrivatif4pax: false,
                              cairePrivatif5pax: true,
                              cairePrivatif6pax: false,
                            });
                          }}
                          className="w-5 h-5 text-blue-600 border-gray-300 focus:ring-blue-500"
                        />
                        <span className="text-sm md:text-base font-semibold text-slate-700 flex-1">
                          5 pax - {getCairePrivatifPrices().pax5}€
                        </span>
                      </label>
                      <label className="flex items-center gap-3 p-3 bg-white rounded-lg border-2 border-blue-200 hover:border-blue-400 cursor-pointer transition-all">
                        <input
                          type="radio"
                          name={`caire-privatif-${idx}`}
                          checked={c.raw.cairePrivatif6pax || false}
                          onChange={() => {
                            setItem(idx, {
                              cairePrivatif4pax: false,
                              cairePrivatif5pax: false,
                              cairePrivatif6pax: true,
                            });
                          }}
                          className="w-5 h-5 text-blue-600 border-gray-300 focus:ring-blue-500"
                        />
                        <span className="text-sm md:text-base font-semibold text-slate-700 flex-1">
                          6 pax - {getCairePrivatifPrices().pax6}€
                        </span>
                      </label>
                    </div>
                  </div>
                )}

                {/* Champs spécifiques pour LOUXOR PRIVATIF - Modifiables par tous */}
                {c.act && isLouxorPrivatifActivity(c.act.name) && (
                  <div className="bg-gradient-to-br from-blue-50/80 to-cyan-50/70 rounded-xl p-5 md:p-6 border-2 border-blue-300/70 shadow-lg mt-4">
                    <p className="text-sm md:text-base font-bold text-slate-800 mb-4 flex items-center gap-2">
                      <span className="text-xl">✈️</span>
                      <span>Nombre de personnes</span>
                    </p>
                    <div className="space-y-3">
                      <label className="flex items-center gap-3 p-3 bg-white rounded-lg border-2 border-blue-200 hover:border-blue-400 cursor-pointer transition-all">
                        <input
                          type="radio"
                          name={`louxor-privatif-${idx}`}
                          checked={c.raw.louxorPrivatif4pax || false}
                          onChange={() => {
                            setItem(idx, {
                              louxorPrivatif4pax: true,
                              louxorPrivatif5pax: false,
                              louxorPrivatif6pax: false,
                            });
                          }}
                          className="w-5 h-5 text-blue-600 border-gray-300 focus:ring-blue-500"
                        />
                        <span className="text-sm md:text-base font-semibold text-slate-700 flex-1">
                          4 pax - {getLouxorPrivatifPrices().pax4}€
                        </span>
                      </label>
                      <label className="flex items-center gap-3 p-3 bg-white rounded-lg border-2 border-blue-200 hover:border-blue-400 cursor-pointer transition-all">
                        <input
                          type="radio"
                          name={`louxor-privatif-${idx}`}
                          checked={c.raw.louxorPrivatif5pax || false}
                          onChange={() => {
                            setItem(idx, {
                              louxorPrivatif4pax: false,
                              louxorPrivatif5pax: true,
                              louxorPrivatif6pax: false,
                            });
                          }}
                          className="w-5 h-5 text-blue-600 border-gray-300 focus:ring-blue-500"
                        />
                        <span className="text-sm md:text-base font-semibold text-slate-700 flex-1">
                          5 pax - {getLouxorPrivatifPrices().pax5}€
                        </span>
                      </label>
                      <label className="flex items-center gap-3 p-3 bg-white rounded-lg border-2 border-blue-200 hover:border-blue-400 cursor-pointer transition-all">
                        <input
                          type="radio"
                          name={`louxor-privatif-${idx}`}
                          checked={c.raw.louxorPrivatif6pax || false}
                          onChange={() => {
                            setItem(idx, {
                              louxorPrivatif4pax: false,
                              louxorPrivatif5pax: false,
                              louxorPrivatif6pax: true,
                            });
                          }}
                          className="w-5 h-5 text-blue-600 border-gray-300 focus:ring-blue-500"
                        />
                        <span className="text-sm md:text-base font-semibold text-slate-700 flex-1">
                          6 pax - {getLouxorPrivatifPrices().pax6}€
                        </span>
                      </label>
                    </div>
                  </div>
                )}

                {/* Champs spécifiques pour ZERO TRACAS et ZERO TRACAS HORS ZONE - Modifiables par tous */}
                {(c.act && isZeroTracasActivity(c.act.name)) || (c.act && isZeroTracasHorsZoneActivity(c.act.name)) ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5 mt-4 bg-indigo-50/60 p-5 md:p-6 rounded-xl border-2 border-indigo-300/70">
                    <div>
                      <p className="text-sm md:text-base font-bold text-slate-800 mb-3">🚗 Transfert + Visa + SIM ({isZeroTracasHorsZoneActivity(c.act.name) ? "55€" : "50€"})</p>
                      <NumberInput 
                        value={c.raw.zeroTracasTransfertVisaSim ?? ""} 
                        onChange={(e) => setItem(idx, { zeroTracasTransfertVisaSim: e.target.value === "" ? "" : e.target.value })}
                        className="text-base md:text-lg py-3"
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <p className="text-sm md:text-base font-bold text-slate-800 mb-3">🚗 Transfert + Visa ({isZeroTracasHorsZoneActivity(c.act.name) ? "50€" : "45€"})</p>
                      <NumberInput 
                        value={c.raw.zeroTracasTransfertVisa ?? ""} 
                        onChange={(e) => setItem(idx, { zeroTracasTransfertVisa: e.target.value === "" ? "" : e.target.value })}
                        className="text-base md:text-lg py-3"
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <p className="text-sm md:text-base font-bold text-slate-800 mb-3">🚗 Transfert 3 personnes ({isZeroTracasHorsZoneActivity(c.act.name) ? "25€" : "20€"})</p>
                      <NumberInput 
                        value={c.raw.zeroTracasTransfert3Personnes ?? ""} 
                        onChange={(e) => setItem(idx, { zeroTracasTransfert3Personnes: e.target.value === "" ? "" : e.target.value })}
                        className="text-base md:text-lg py-3"
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <p className="text-sm md:text-base font-bold text-slate-800 mb-3">🚗 Transfert + de 3 personnes ({isZeroTracasHorsZoneActivity(c.act.name) ? "30€" : "25€"})</p>
                      <NumberInput 
                        value={c.raw.zeroTracasTransfertPlus3Personnes ?? ""} 
                        onChange={(e) => setItem(idx, { zeroTracasTransfertPlus3Personnes: e.target.value === "" ? "" : e.target.value })}
                        className="text-base md:text-lg py-3"
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <p className="text-sm md:text-base font-bold text-slate-800 mb-3">📱 Visa + SIM (45€)</p>
                      <NumberInput 
                        value={c.raw.zeroTracasVisaSim ?? ""} 
                        onChange={(e) => setItem(idx, { zeroTracasVisaSim: e.target.value === "" ? "" : e.target.value })}
                        className="text-base md:text-lg py-3"
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <p className="text-sm md:text-base font-bold text-slate-800 mb-3">📄 Visa seul (35€)</p>
                      <NumberInput 
                        value={c.raw.zeroTracasVisaSeul ?? ""} 
                        onChange={(e) => setItem(idx, { zeroTracasVisaSeul: e.target.value === "" ? "" : e.target.value })}
                        className="text-base md:text-lg py-3"
                        placeholder="0"
                      />
                    </div>
                  </div>
                ) : null}
                {/* Créneaux et Extras - Modifiables par tous */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-5">
                  {c.transferInfo && (
                    <div>
                      <p className="text-sm md:text-base font-bold text-slate-800 mb-3">⏰ Créneau de transfert</p>
                      <select
                        value={c.raw.slot || ""}
                        onChange={(e) => setItem(idx, { slot: e.target.value })}
                        className="w-full rounded-xl border-2 border-blue-300/70 bg-white/99 backdrop-blur-sm px-4 py-3 md:py-4 text-base md:text-lg font-medium text-slate-900 shadow-md focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-all"
                      >
                        <option value="">— Choisir un créneau —</option>
                        {c.transferInfo.morningEnabled && <option value="morning">🌅 Matin ({c.transferInfo.morningTime})</option>}
                        {c.transferInfo.afternoonEnabled && <option value="afternoon">☀️ Après-midi ({c.transferInfo.afternoonTime})</option>}
                        {c.transferInfo.eveningEnabled && <option value="evening">🌆 Soir ({c.transferInfo.eveningTime})</option>}
                      </select>
                    </div>
                  )}
                  {c.act && isSpeedBoatActivity(c.act.name) ? (
                    <div className="lg:col-span-2 space-y-4 md:space-y-5">
                      <div>
                        <p className="text-sm md:text-base font-bold text-slate-800 mb-3">⚡ Extras Speed Boat (plusieurs sélections possibles)</p>
                        <div className="space-y-3 border-2 border-blue-300/70 rounded-xl p-4 md:p-5 bg-white/99 shadow-md">
                          {SPEED_BOAT_EXTRAS.filter((extra) => extra.id !== "").map((extra) => {
                            // Gérer la compatibilité avec l'ancien format (string) et le nouveau format (array)
                            const currentExtras = Array.isArray(c.raw.speedBoatExtra) 
                              ? c.raw.speedBoatExtra 
                              : (c.raw.speedBoatExtra && typeof c.raw.speedBoatExtra === "string" && c.raw.speedBoatExtra !== "" 
                                ? [c.raw.speedBoatExtra] 
                                : []);
                            const isChecked = currentExtras.includes(extra.id);
                            
                            return (
                              <label key={extra.id} className="flex items-center gap-2 p-2 rounded-lg transition-colors cursor-pointer hover:bg-blue-50/50">
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
                      <div>
                        <p className="text-sm md:text-base font-bold text-slate-800 mb-3">💰 Ajustement de prix (montant à ajouter ou soustraire)</p>
                        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                          <NumberInput
                            value={c.raw.extraAmount || ""}
                            onChange={(e) => setItem(idx, { extraAmount: e.target.value })}
                            placeholder="0.00"
                            className="flex-1 text-base md:text-lg py-3"
                          />
                          <span className="text-sm md:text-base text-slate-600 font-medium whitespace-nowrap">
                            € (positif = +, négatif = -)
                          </span>
                        </div>
                        <p className="text-xs md:text-sm text-slate-500 font-medium mt-2 bg-slate-50 px-3 py-2 rounded-lg border border-slate-200">
                          💡 Utilisez un nombre positif pour augmenter le prix, négatif pour le diminuer
                        </p>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div>
                        <p className="text-sm md:text-base font-bold text-slate-800 mb-3">🏷️ Extra (label)</p>
                        <TextInput 
                          value={c.raw.extraLabel || ""} 
                          onChange={(e) => setItem(idx, { extraLabel: e.target.value })}
                          className="text-base md:text-lg py-3"
                        />
                      </div>
                      <div>
                        <p className="text-sm md:text-base font-bold text-slate-800 mb-3">💰 Extra (montant)</p>
                        <NumberInput 
                          value={c.raw.extraAmount || ""} 
                          onChange={(e) => setItem(idx, { extraAmount: e.target.value })}
                          className="text-base md:text-lg py-3"
                        />
                      </div>
                    </>
                  )}
                </div>
                {/* Extra dauphin (uniquement pour Speed Boat) - Modifiable par tous */}
                {c.act && isSpeedBoatActivity(c.act.name) && (
                  <div className="flex items-center gap-3 mt-4 p-4 bg-cyan-50/60 rounded-xl border-2 border-cyan-300/70">
                    <input
                      type="checkbox"
                      id={`edit-extraDolphin-${idx}`}
                      checked={c.raw.extraDolphin || false}
                      onChange={(e) => setItem(idx, { extraDolphin: e.target.checked })}
                      className="w-5 h-5 text-blue-600 border-gray-400 rounded focus:ring-blue-500 cursor-pointer"
                    />
                    <label htmlFor={`edit-extraDolphin-${idx}`} className="text-sm md:text-base font-bold text-slate-800 cursor-pointer flex items-center gap-2">
                      <span>🐬</span>
                      <span>Extra dauphin (+20€)</span>
                    </label>
                  </div>
                )}
                {/* Afficher le numéro de ticket si présent (non modifiable) */}
                {((c.raw.ticketNumber || quote.items?.find((item) => item.activityId === c.act?.id && item.date === c.raw.date)?.ticketNumber)) && (
                  <div className="mt-4 p-4 md:p-5 bg-emerald-50/80 border-2 border-emerald-300/70 rounded-xl">
                    <p className="text-sm md:text-base text-emerald-800 font-bold mb-2 flex items-center gap-2">
                      <span>🎫</span>
                      <span>Numéro de ticket: {(c.raw.ticketNumber || quote.items?.find((item) => item.activityId === c.act?.id && item.date === c.raw.date)?.ticketNumber)}</span>
                    </p>
                    <p className="text-xs md:text-sm text-emerald-700 font-semibold">🔒 Ticket verrouillé (non modifiable)</p>
                  </div>
                )}
                {c.lineTotal > 0 && (
                  <div className="text-right bg-gradient-to-r from-blue-50/80 to-indigo-50/70 p-4 md:p-5 rounded-xl border-2 border-blue-300/70 mt-4">
                    <p className="text-base md:text-lg font-bold text-emerald-700 mb-1">💵 Espèces: {currencyNoCents(Math.round(c.lineTotal), c.currency)}</p>
                    <p className="text-sm md:text-base font-semibold text-slate-700">💳 Carte: {currencyNoCents(calculateCardPrice(c.lineTotal), c.currency)}</p>
                    {calculateTransferSurcharge(c.raw) > 0 && (
                      <p className="text-sm md:text-base text-cyan-700 font-bold mt-2">
                        🚗 Transfert: {currencyNoCents(calculateTransferSurcharge(c.raw), c.currency)}
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 bg-gradient-to-r from-emerald-50/80 to-teal-50/70 p-6 md:p-7 rounded-2xl border-2 border-emerald-300/70 shadow-lg">
            <GhostBtn type="button" onClick={addItem} className="text-base md:text-lg px-6 py-3">
              ➕ Ajouter une autre activité
            </GhostBtn>
            <div className="text-right lg:text-right w-full lg:w-auto">
              <p className="text-sm md:text-base font-semibold text-slate-700 mb-2">💰 Total du devis</p>
              <p className="text-2xl md:text-3xl font-bold text-emerald-700 mb-1">💵 Espèces: {currencyNoCents(grandTotalCash, grandCurrency)}</p>
              <p className="text-xl md:text-2xl font-bold text-slate-700">💳 Carte: {currencyNoCents(grandTotalCard, grandCurrency)}</p>
            </div>
          </div>

          <div className="bg-gradient-to-br from-amber-50/80 to-orange-50/70 rounded-xl p-5 md:p-6 border-2 border-amber-300/70">
            <p className="text-sm md:text-base font-bold text-slate-800 mb-3">📝 Notes supplémentaires</p>
            <TextInput
              placeholder="Infos supplémentaires : langue du guide, pick-up, préférences, etc."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="text-base md:text-lg py-3"
            />
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 justify-end mt-6 md:mt-8 pt-6 border-t-2 border-slate-300/80">
          <GhostBtn onClick={onClose} className="w-full sm:w-auto text-base md:text-lg px-6 py-3">
            ❌ Annuler
          </GhostBtn>
          <PrimaryBtn onClick={handleSave} className="w-full sm:w-auto text-base md:text-lg px-8 py-3">
            ✅ Enregistrer les modifications
          </PrimaryBtn>
        </div>
      </div>
    </div>
  );
}

