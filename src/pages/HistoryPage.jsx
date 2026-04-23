import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { SITE_KEY, LS_KEYS } from "../constants";
import { currencyNoCents, calculateCardPrice, generateQuoteHTML, saveLS, cleanPhoneNumber, calculateTransferSurcharge } from "../utils";
import { TextInput, NumberInput, GhostBtn, PrimaryBtn, Pill } from "../components/ui";
import { useDebounce } from "../hooks/useDebounce";
import { toast } from "../utils/toast.js";
import { logger } from "../utils/logger";

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

  const handleInvoiceClick = useCallback(() => {
    const htmlContent = generateQuoteHTML(d, { variant: "facture" });
    const clientPhone = d.client?.phone || "";
    const fileName = `Facture - ${clientPhone}`;
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
              <button
                type="button"
                className="flex items-center gap-2 rounded-xl px-4 md:px-5 py-2.5 md:py-3 text-sm md:text-base font-bold text-white border-2 border-slate-600 bg-gradient-to-r from-slate-600 to-slate-800 hover:from-slate-700 hover:to-slate-900 shadow-lg transition-opacity duration-150 min-h-[44px] hover:opacity-90 active:opacity-75 hover:shadow-xl"
                onClick={handleInvoiceClick}
              >
                📄 Facture
              </button>
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
export function HistoryPage({ quotes, setQuotes, user }) {
  const [q, setQ] = useState("");
  const debouncedQ = useDebounce(q, 300); // Debounce de 300ms pour la recherche
  const [statusFilter, setStatusFilter] = useState("all"); // "all", "paid", "pending", "modified"
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedQuote, setSelectedQuote] = useState(null);
  const [ticketNumbers, setTicketNumbers] = useState({});
  const [stripeAmount, setStripeAmount] = useState("");
  const [cashAmount, setCashAmount] = useState("");
  
  // Pagination pour améliorer les performances
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 20; // Nombre de devis par page
  
  // Références pour le conteneur de la modale de paiement
  const paymentModalRef = useRef(null);
  const paymentModalContainerRef = useRef(null);

  // État pour le bouton "remonter en haut"
  const [showScrollToTop, setShowScrollToTop] = useState(false);

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
    </div>
  );
}

