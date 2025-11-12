import { useState, useMemo, useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";
import { SITE_KEY, LS_KEYS, NEIGHBORHOODS } from "../constants";
import { SPEED_BOAT_EXTRAS } from "../constants/activityExtras";
import { currencyNoCents, calculateCardPrice, generateQuoteHTML, saveLS, cleanPhoneNumber, calculateTransferSurcharge } from "../utils";
import { TextInput, NumberInput, GhostBtn, PrimaryBtn, Pill } from "../components/ui";
import { useDebounce } from "../hooks/useDebounce";
import { toast } from "../utils/toast.js";
import { isBuggyActivity, getBuggyPrices, isMotoCrossActivity, getMotoCrossPrices } from "../utils/activityHelpers";
import { ColoredDatePicker } from "../components/ColoredDatePicker";

export function HistoryPage({ quotes, setQuotes, user, activities }) {
  const [q, setQ] = useState("");
  const debouncedQ = useDebounce(q, 300); // Debounce de 300ms pour la recherche
  const [statusFilter, setStatusFilter] = useState("all"); // "all", "paid", "pending", "modified"
  
  // États pour la recherche avancée
  const [showAdvancedSearch, setShowAdvancedSearch] = useState(false);
  const [searchName, setSearchName] = useState("");
  const [searchHotel, setSearchHotel] = useState("");
  const [searchTicket, setSearchTicket] = useState("");
  const [searchDateFrom, setSearchDateFrom] = useState("");
  const [searchDateTo, setSearchDateTo] = useState("");
  
  // Debounce pour les recherches avancées
  const debouncedSearchName = useDebounce(searchName, 300);
  const debouncedSearchHotel = useDebounce(searchHotel, 300);
  const debouncedSearchTicket = useDebounce(searchTicket, 300);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedQuote, setSelectedQuote] = useState(null);
  const [ticketNumbers, setTicketNumbers] = useState({});
  const [paymentMethods, setPaymentMethods] = useState({}); // { index: "cash" | "stripe" }
  
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
    
    // Recharger toutes les 10 secondes pour avoir les données à jour
    const interval = setInterval(loadStopSalesAndPushSales, 10000);
    return () => clearInterval(interval);
  }, []);

  // Écouter le scroll pour afficher/masquer le bouton "remonter en haut"
  useEffect(() => {
    const handleScroll = () => {
      const scrollY = window.scrollY || document.documentElement.scrollTop;
      setShowScrollToTop(scrollY > 300); // Afficher le bouton après 300px de scroll
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Fonction pour remonter en haut de la page
  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: "smooth"
    });
  };

  // Mémoriser le calcul des tickets remplis pour éviter de le refaire à chaque render
  const quotesWithStatus = useMemo(() => {
    return quotes.map((d) => ({
      ...d,
      allTicketsFilled: d.items?.every((item) => item.ticketNumber && item.ticketNumber.trim()) || false,
      hasTickets: d.items?.some((item) => item.ticketNumber && item.ticketNumber.trim()) || false,
    }));
  }, [quotes]);
  
  const filtered = useMemo(() => {
    let result = quotesWithStatus;
    
    // Filtre par statut (payé/en attente/modifié)
    if (statusFilter !== "all") {
      result = result.filter((d) => {
        if (statusFilter === "paid") {
          return d.allTicketsFilled;
        } else if (statusFilter === "pending") {
          return !d.allTicketsFilled;
        } else if (statusFilter === "modified") {
          return d.isModified === true;
        }
        return true;
      });
    }
    
    // Filtre par recherche téléphone (utilise la valeur debouncée)
    if (debouncedQ.trim()) {
      const needle = debouncedQ.replace(/\D+/g, "");
      result = result.filter((d) => (d.client?.phone || "").replace(/\D+/g, "").includes(needle));
    }
    
    // Recherche avancée - Nom de client
    if (debouncedSearchName.trim()) {
      const nameLower = debouncedSearchName.toLowerCase().trim();
      result = result.filter((d) => 
        (d.client?.name || "").toLowerCase().includes(nameLower)
      );
    }
    
    // Recherche avancée - Hôtel
    if (debouncedSearchHotel.trim()) {
      const hotelLower = debouncedSearchHotel.toLowerCase().trim();
      result = result.filter((d) => 
        (d.client?.hotel || "").toLowerCase().includes(hotelLower)
      );
    }
    
    // Recherche avancée - Numéro de ticket
    if (debouncedSearchTicket.trim()) {
      const ticketLower = debouncedSearchTicket.toLowerCase().trim();
      result = result.filter((d) => 
        d.items?.some((item) => 
          (item.ticketNumber || "").toLowerCase().includes(ticketLower)
        )
      );
    }
    
    // Recherche avancée - Date de création (du... au...)
    if (searchDateFrom) {
      const fromDate = new Date(searchDateFrom + "T00:00:00");
      result = result.filter((d) => {
        const quoteDate = new Date(d.createdAt);
        return quoteDate >= fromDate;
      });
    }
    
    if (searchDateTo) {
      const toDate = new Date(searchDateTo + "T23:59:59");
      result = result.filter((d) => {
        const quoteDate = new Date(d.createdAt);
        return quoteDate <= toDate;
      });
    }
    
    return result;
  }, [debouncedQ, debouncedSearchName, debouncedSearchHotel, debouncedSearchTicket, searchDateFrom, searchDateTo, quotesWithStatus, statusFilter]);

  // Scroller en haut de la modale de paiement et de la page quand elle s'ouvre
  useEffect(() => {
    if (showPaymentModal) {
      // Scroller la page vers le haut pour que la modale soit visible
      window.scrollTo({ top: 0, behavior: 'smooth' });
      
      // Attendre un court instant pour que la modale soit rendue
      setTimeout(() => {
        // Scroller le contenu de la modale vers le haut
        if (paymentModalRef.current) {
          paymentModalRef.current.scrollTop = 0;
        }
        // Scroller vers le conteneur de la modale si nécessaire
        if (paymentModalContainerRef.current) {
          paymentModalContainerRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
    }
  }, [showPaymentModal]);

  // Scroller en haut de la modale de modification et de la page quand elle s'ouvre
  useEffect(() => {
    if (showEditModal) {
      // Scroller la page vers le haut pour que la modale soit visible
      window.scrollTo({ top: 0, behavior: 'smooth' });
      
      // Attendre un court instant pour que la modale soit rendue
      setTimeout(() => {
        // Scroller le contenu de la modale vers le haut
        if (editModalRef.current) {
          editModalRef.current.scrollTop = 0;
        }
        // Scroller vers le conteneur de la modale si nécessaire
        if (editModalContainerRef.current) {
          editModalContainerRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
    }
  }, [showEditModal]);

  // Fonction pour supprimer automatiquement les devis non payés de plus de 20 jours
  useEffect(() => {
    // Ne pas exécuter si quotes est vide
    if (!quotes || quotes.length === 0) {
      return;
    }

    const cleanupOldUnpaidQuotes = async () => {
      const now = new Date();
      const twentyDaysAgo = new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000); // 20 jours en millisecondes
      
      // Identifier les devis à supprimer
      const quotesToDelete = quotes.filter((quote) => {
        // Vérifier si le devis est non payé (tous les tickets ne sont pas remplis)
        const allTicketsFilled = quote.items?.every((item) => item.ticketNumber && item.ticketNumber.trim()) || false;
        if (allTicketsFilled) {
          return false; // Le devis est payé, ne pas le supprimer
        }
        
        // Vérifier si le devis a été créé il y a plus de 20 jours
        const createdAt = new Date(quote.createdAt);
        if (isNaN(createdAt.getTime())) {
          return false; // Date invalide, ne pas supprimer
        }
        
        return createdAt < twentyDaysAgo;
      });

      if (quotesToDelete.length > 0) {
        console.log(`🗑️ Suppression automatique de ${quotesToDelete.length} devis non payés de plus de 20 jours`);
        
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
                console.warn("⚠️ Erreur suppression Supabase:", deleteError);
              } else {
                console.log(`✅ Devis supprimé de Supabase (ID: ${quoteToDelete.supabase_id || quoteToDelete.id})`);
              }
            } catch (deleteErr) {
              console.warn("⚠️ Erreur lors de la suppression Supabase:", deleteErr);
            }
          }
        }
      }
    };

    // Exécuter le nettoyage au chargement de la page historique
    cleanupOldUnpaidQuotes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Exécuter uniquement une fois au montage du composant

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
          <div className="flex flex-col gap-2 max-w-md">
            <TextInput
              placeholder="Rechercher par numéro de téléphone"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="w-full"
            />
            <p className="text-xs text-amber-700 flex items-center gap-1">
              <span>⚠️</span>
              <span>N'oubliez pas d'actualiser la page pour voir les dernières informations</span>
            </p>
          </div>
          <div className="flex gap-2 items-center">
            <Pill
              active={statusFilter === "all"}
              onClick={() => setStatusFilter("all")}
            >
              Tous
            </Pill>
            <Pill
              active={statusFilter === "paid"}
              onClick={() => setStatusFilter("paid")}
            >
              Payés
            </Pill>
            <Pill
              active={statusFilter === "pending"}
              onClick={() => setStatusFilter("pending")}
            >
              En attente
            </Pill>
            <Pill
              active={statusFilter === "modified"}
              onClick={() => setStatusFilter("modified")}
            >
              Modifié
            </Pill>
          </div>
        </div>
        
        {/* Recherche avancée */}
        <div className="border border-blue-200/50 rounded-xl bg-blue-50/30">
          <button
            onClick={() => setShowAdvancedSearch(!showAdvancedSearch)}
            className="w-full flex items-center justify-between gap-3 p-3 hover:bg-blue-50/50 transition-colors rounded-xl"
          >
            <div className="flex items-center gap-2">
              <span className="text-lg">🔍</span>
              <span className="font-semibold text-sm text-gray-700">Recherche avancée</span>
              {(debouncedSearchName || debouncedSearchHotel || debouncedSearchTicket || searchDateFrom || searchDateTo) && (
                <span className="px-2 py-0.5 bg-blue-500 text-white text-xs rounded-full">
                  Active
                </span>
              )}
            </div>
            <span className="text-gray-600 text-sm">
              {showAdvancedSearch ? "▼ Réduire" : "▶ Développer"}
            </span>
          </button>
          
          {showAdvancedSearch && (
            <div className="p-4 pt-0 space-y-3 border-t border-blue-200/50 mt-2">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                <div>
                  <p className="text-xs text-gray-600 mb-1 font-medium">Nom du client</p>
                  <TextInput
                    placeholder="Rechercher par nom..."
                    value={searchName}
                    onChange={(e) => setSearchName(e.target.value)}
                    className="w-full"
                  />
                </div>
                <div>
                  <p className="text-xs text-gray-600 mb-1 font-medium">Hôtel</p>
                  <TextInput
                    placeholder="Rechercher par hôtel..."
                    value={searchHotel}
                    onChange={(e) => setSearchHotel(e.target.value)}
                    className="w-full"
                  />
                </div>
                <div>
                  <p className="text-xs text-gray-600 mb-1 font-medium">Numéro de ticket</p>
                  <TextInput
                    placeholder="Rechercher par ticket..."
                    value={searchTicket}
                    onChange={(e) => setSearchTicket(e.target.value)}
                    className="w-full"
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-gray-600 mb-1 font-medium">Date de création (du)</p>
                  <TextInput
                    type="date"
                    value={searchDateFrom}
                    onChange={(e) => setSearchDateFrom(e.target.value)}
                    className="w-full"
                  />
                </div>
                <div>
                  <p className="text-xs text-gray-600 mb-1 font-medium">Date de création (au)</p>
                  <TextInput
                    type="date"
                    value={searchDateTo}
                    onChange={(e) => setSearchDateTo(e.target.value)}
                    className="w-full"
                  />
                </div>
              </div>
              
              {(debouncedSearchName || debouncedSearchHotel || debouncedSearchTicket || searchDateFrom || searchDateTo) && (
                <div className="flex justify-end">
                  <GhostBtn
                    onClick={() => {
                      setSearchName("");
                      setSearchHotel("");
                      setSearchTicket("");
                      setSearchDateFrom("");
                      setSearchDateTo("");
                    }}
                    variant="danger"
                    size="sm"
                  >
                    🧹 Réinitialiser les filtres
                  </GhostBtn>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      
      {/* Indicateur du nombre de résultats */}
      <div className="flex items-center justify-between text-sm">
        <p className="text-gray-600">
          {filtered.length === 0 ? (
            <span className="text-amber-600">Aucun devis trouvé</span>
          ) : filtered.length === 1 ? (
            <span className="text-blue-600 font-semibold">1 devis trouvé</span>
          ) : (
            <span className="text-blue-600 font-semibold">{filtered.length} devis trouvés</span>
          )}
          {quotes.length !== filtered.length && (
            <span className="text-gray-500 ml-2">
              (sur {quotes.length} total)
            </span>
          )}
        </p>
      </div>
      
      <div className="space-y-3">
        {filtered.map((d) => {
          const allTicketsFilled = d.allTicketsFilled;
          const hasTickets = d.hasTickets;

          return (
            <div
              key={d.id}
              className={`relative overflow-hidden rounded-2xl border transition-all duration-200 p-5 pl-7 ${
                allTicketsFilled
                  ? "border-[rgba(16,185,129,0.45)] bg-[rgba(234, 255, 247, 0.92)]"
                  : "border-[rgba(245,158,11,0.45)] bg-[rgba(255, 247, 230, 0.94)]"
              }`}
            >
              <span
                className={`absolute inset-y-0 left-0 w-1.5 ${
                  allTicketsFilled
                    ? "bg-gradient-to-b from-emerald-400 via-emerald-500 to-teal-400"
                    : "bg-gradient-to-b from-amber-400 via-amber-500 to-orange-400"
                }`}
              />
              <span className="absolute inset-0 pointer-events-none bg-gradient-to-br from-white/0 via-white/10 to-white/0" />
              <div className="relative space-y-3">
                <div className="flex items-center gap-2">
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold shadow-sm border ${
                    allTicketsFilled
                      ? "bg-[rgba(16,185,129,0.14)] text-[#047857] border-[#34d399]/40"
                      : "bg-[rgba(245,158,11,0.18)] text-[#b45309] border-[#fbbf24]/45"
                  }`}
                  >
                    {allTicketsFilled ? "✅ Payé" : "⏳ En attente"}
                  </span>
                  {d.isModified && (
                    <span className="px-3 py-1 rounded-full text-xs font-semibold shadow-sm border bg-[rgba(147,51,234,0.15)] text-[#6d28d9] border-[rgba(129,140,248,0.35)]">
                      🔄 Modifié
                    </span>
                  )}
                </div>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 space-y-1">
                    <p className="text-xs text-[rgba(71,85,105,0.7)]">
                      {new Date(d.createdAt).toLocaleString("fr-FR")}
                      {d.createdByName && <span className="ml-2 text-[#0284c7] font-semibold">• {d.createdByName}</span>}
                    </p>
                    <p className="text-sm text-slate-800 font-medium">
                      {d.client?.phone || "Tél ?"} — {d.client?.hotel || "Hôtel ?"}
                      {d.client?.room ? ` (${d.client.room})` : ""}
                    </p>
                    {hasTickets && (
                      <span className="tag-success inline-flex items-center gap-1">
                        🎫 Tickets : {d.items.filter((item) => item.ticketNumber && item.ticketNumber.trim()).length}/{d.items.length}
                      </span>
                    )}
                  </div>
                  {(d.trip && d.trip.trim() && d.trip !== "Activité ?") || (d.invoiceN && d.invoiceN !== "N/A") ? (
                    <div className="flex flex-col items-end gap-1 text-right min-w-[140px]">
                      {d.trip && d.trip.trim() && d.trip !== "Activité ?" && (
                        <span className="tag-info inline-flex items-center gap-1 text-xs">
                          {d.trip}
                        </span>
                      )}
                      {d.invoiceN && d.invoiceN !== "N/A" && (
                        <span className="text-[11px] uppercase tracking-wide text-[rgba(71,85,105,0.65)]">
                          Invoice {d.invoiceN}
                        </span>
                      )}
                    </div>
                  ) : null}
                </div>
                <div className="flex flex-col gap-4 pt-3 border-t border-white/40 lg:flex-row lg:items-start lg:justify-between">
                  <div className="flex-1 space-y-2">
                    <div className="space-y-2">
                      {d.items.map((li, i) => (
                        <div
                          key={i}
                          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/60 bg-white/80 px-4 py-2 shadow-sm"
                        >
                          <div className="flex flex-col">
                            <span className="text-sm font-semibold text-slate-800">
                              {li.activityName || "Activité ?"}
                            </span>
                            <span className="text-xs text-[rgba(71,85,105,0.75)]">
                              {li.date ? new Date(li.date + "T12:00:00").toLocaleDateString("fr-FR") : "Date ?"} — {li.adults ?? 0} adt / {li.children ?? 0} enf
                            </span>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <span className="text-sm font-semibold text-slate-700">
                              {currencyNoCents(Math.round(li.lineTotal || 0), d.currency || "EUR")}
                            </span>
                            {li.ticketNumber && li.ticketNumber.trim() !== "" && (
                              <span className="tag-success inline-flex items-center gap-1">
                                🎫 {li.ticketNumber}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                    {d.notes && d.notes.trim() !== "" && (
                      <p className="text-xs text-[rgba(71,85,105,0.75)] bg-white/75 border border-white/60 rounded-xl px-4 py-2 shadow-sm">
                        📝 {d.notes}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-3 min-w-[220px]">
                    <div className="text-right">
                      <p className="text-base font-semibold text-slate-900">
                        Espèces: {currencyNoCents(d.totalCash || Math.round(d.total || 0), d.currency || "EUR")}
                      </p>
                      <p className="text-sm text-[rgba(71,85,105,0.8)]">
                        Carte: {currencyNoCents(d.totalCard || calculateCardPrice(d.total || 0), d.currency || "EUR")}
                      </p>
                    </div>
                    <div className="flex flex-wrap justify-end gap-2">
                      <button
                        className={`flex items-center gap-1 rounded-lg px-4 py-2 text-sm font-semibold text-white border border-emerald-500 shadow-[0_18px_32px_-18px_rgba(16,185,129,0.55)] transition-all duration-200 min-h-[44px] ${
                          allTicketsFilled ? "bg-emerald-600 hover:bg-emerald-700" : "bg-emerald-500 hover:bg-emerald-600"
                        }`}
                        onClick={() => {
                          setSelectedQuote(d);
                          const existingTickets = {};
                          const existingPaymentMethods = {};
                          d.items?.forEach((item, idx) => {
                            existingTickets[idx] = item.ticketNumber || "";
                            existingPaymentMethods[idx] = item.paymentMethod || "";
                          });
                          setTicketNumbers(existingTickets);
                          setPaymentMethods(existingPaymentMethods);
                          setShowPaymentModal(true);
                        }}
                      >
                        {allTicketsFilled ? "✅ Tickets" : "💰 Payer"}
                      </button>
                      <button
                        className="flex items-center gap-1 rounded-lg px-4 py-2 text-sm font-semibold text-white border border-indigo-500 bg-indigo-500 hover:bg-indigo-600 shadow-[0_18px_32px_-18px_rgba(99,102,241,0.5)] transition-all duration-200 min-h-[44px]"
                        onClick={() => {
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
                        }}
                      >
                        🖨️ Imprimer
                      </button>
                      {!allTicketsFilled && (
                        <button
                          className="flex items-center gap-1 rounded-lg px-4 py-2 text-sm font-semibold text-white border border-amber-500 bg-amber-500 hover:bg-amber-600 shadow-[0_18px_32px_-18px_rgba(245,158,11,0.55)] transition-all duration-200 min-h-[44px]"
                          onClick={() => {
                            setSelectedQuote(d);
                            setEditClient({
                              ...d.client,
                              arrivalDate: d.client?.arrivalDate || "",
                              departureDate: d.client?.departureDate || "",
                            });
                            setEditItems(
                              d.items.map((item) => ({
                                activityId: item.activityId || "",
                                date: item.date || new Date().toISOString().slice(0, 10),
                                adults: item.adults !== undefined && item.adults !== null ? item.adults : 2,
                                children: item.children !== undefined && item.children !== null ? item.children : 0,
                                babies: item.babies !== undefined && item.babies !== null ? item.babies : 0,
                                extraLabel: item.extraLabel || "",
                                extraAmount: item.extraAmount || "",
                                extraDolphin: item.extraDolphin || false,
                                speedBoatExtra: Array.isArray(item.speedBoatExtra)
                                  ? item.speedBoatExtra
                                  : item.speedBoatExtra
                                    ? [item.speedBoatExtra]
                                    : [],
                                buggySimple: item.buggySimple !== undefined && item.buggySimple !== null ? item.buggySimple : 0,
                                buggyFamily: item.buggyFamily !== undefined && item.buggyFamily !== null ? item.buggyFamily : 0,
                                yamaha250: item.yamaha250 !== undefined && item.yamaha250 !== null ? item.yamaha250 : 0,
                                ktm640: item.ktm640 !== undefined && item.ktm640 !== null ? item.ktm640 : 0,
                                ktm530: item.ktm530 !== undefined && item.ktm530 !== null ? item.ktm530 : 0,
                                slot: item.slot || "",
                                ticketNumber: item.ticketNumber || "",
                              }))
                            );
                            setEditNotes(d.notes || "");
                            setShowEditModal(true);
                          }}
                        >
                          ✏️ Modifier
                        </button>
                      )}
                      {user?.canDeleteQuote && (
                        <button
                          className="flex items-center gap-1 rounded-lg px-4 py-2 text-sm font-semibold text-white border border-red-500 bg-red-500 hover:bg-red-600 shadow-[0_18px_32px_-18px_rgba(239,68,68,0.55)] transition-all duration-200 min-h-[44px]"
                          onClick={async () => {
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
                                    console.warn("⚠️ Erreur suppression Supabase:", deleteError);
                                  } else {
                                    console.log("✅ Devis supprimé de Supabase!");
                                  }
                                } catch (deleteErr) {
                                  console.warn("⚠️ Erreur lors de la suppression Supabase:", deleteErr);
                                }
                              }
                            }
                          }}
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
        })}
        {filtered.length === 0 && <p className="text-xs text-slate-400 text-center py-6">Aucun devis trouvé.</p>}
      </div>

      {/* Bouton "Remonter en haut" */}
      {showScrollToTop && (
        <button
          onClick={scrollToTop}
          className="fixed bottom-4 right-4 z-40 w-12 h-12 rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-110 active:scale-95 bg-indigo-600 hover:bg-indigo-700 text-white"
          style={{
            boxShadow: '0 4px 16px rgba(79, 70, 229, 0.5)',
          }}
          title="Remonter en haut"
        >
          <span className="text-xl font-bold">↑</span>
        </button>
      )}

      {/* Modale de paiement */}
      {showPaymentModal && selectedQuote && (
        <div ref={paymentModalContainerRef} className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-2 md:p-4">
          <div ref={paymentModalRef} className="bg-white rounded-xl md:rounded-2xl border border-blue-100/50 shadow-2xl p-4 md:p-6 max-w-2xl w-full max-h-[95vh] md:max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-3 md:mb-4">
              <h3 className="text-base md:text-lg font-semibold">Enregistrer les numéros de ticket</h3>
              <button
                onClick={() => {
                  setShowPaymentModal(false);
                  setSelectedQuote(null);
                  setTicketNumbers({});
                  setPaymentMethods({});
                }}
                className="text-slate-400 hover:text-slate-600 text-2xl leading-none min-w-[44px] min-h-[44px] flex items-center justify-center"
              >
                ×
              </button>
            </div>

            <div className="space-y-4 mb-6">
              {selectedQuote.items?.map((item, idx) => (
                <div key={idx} className="border border-cyan-100/60 rounded-xl p-4 bg-cyan-50/50 shadow-md">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="font-medium text-sm text-slate-900">{item.activityName}</p>
                      <p className="text-xs text-slate-500">
                        {new Date(item.date + "T12:00:00").toLocaleDateString("fr-FR")} — {item.adults} adulte(s),{" "}
                        {item.children} enfant(s)
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-slate-900">Espèces: {currencyNoCents(Math.round(item.lineTotal), selectedQuote.currency)}</p>
                      <p className="text-xs text-slate-600">Carte: {currencyNoCents(calculateCardPrice(item.lineTotal), selectedQuote.currency)}</p>
                      {calculateTransferSurcharge(item) > 0 && (
                        <p className="text-xs text-cyan-600 font-medium mt-1">
                          🚗 Transfert: {currencyNoCents(calculateTransferSurcharge(item), selectedQuote.currency)}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs text-slate-500 mb-1">Numéro de ticket unique</p>
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
                        className={user?.name !== "Ewen" && item.ticketNumber && item.ticketNumber.trim() ? "bg-slate-100 cursor-not-allowed" : ""}
                      />
                      {user?.name !== "Ewen" && item.ticketNumber && item.ticketNumber.trim() && (
                        <p className="text-xs text-emerald-600 font-semibold mt-1">✅ Ticket verrouillé (non modifiable)</p>
                      )}
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 mb-2">Méthode de paiement</p>
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
                            className="w-4 h-4 text-cyan-600 border-slate-300 rounded focus:ring-cyan-500"
                          />
                          <span className="text-sm text-slate-700">Cash</span>
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
                            className="w-4 h-4 text-cyan-600 border-slate-300 rounded focus:ring-cyan-500"
                          />
                          <span className="text-sm text-slate-700">Stripe</span>
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
                variant="success"
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
                      
                      const { error: updateError } = await updateQuery;
                      
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

      {/* Modale de modification de devis */}
      {showEditModal && selectedQuote && editClient && (
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
            const updatedQuotes = quotes.map((q) => (q.id === selectedQuote.id ? updatedQuote : q));
            setQuotes(updatedQuotes);
            saveLS(LS_KEYS.quotes, updatedQuotes);

            // Mettre à jour dans Supabase si configuré
            if (supabase) {
              try {
                const supabaseUpdate = {
                  client_name: updatedQuote.client.name || "",
                  client_phone: updatedQuote.client.phone || "",
                  client_hotel: updatedQuote.client.hotel || "",
                  client_room: updatedQuote.client.room || "",
                  client_neighborhood: updatedQuote.client.neighborhood || "",
                  client_arrival_date: updatedQuote.client.arrivalDate || "",
                  client_departure_date: updatedQuote.client.departureDate || "",
                  notes: updatedQuote.notes || "",
                  total: updatedQuote.total,
                  currency: updatedQuote.currency,
                  items: JSON.stringify(updatedQuote.items),
                  created_by_name: updatedQuote.createdByName || "",
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

                const { error: updateError } = await updateQuery;

                if (updateError) {
                  console.warn("⚠️ Erreur mise à jour Supabase:", updateError);
                } else {
                  console.log("✅ Devis mis à jour dans Supabase!");
                  // Mettre à jour le supabase_id dans le devis local si ce n'était pas déjà fait
                  if (!updatedQuote.supabase_id && selectedQuote.supabase_id) {
                    const finalUpdatedQuote = { ...updatedQuote, supabase_id: selectedQuote.supabase_id };
                    const finalUpdatedQuotes = quotes.map((q) => (q.id === selectedQuote.id ? finalUpdatedQuote : q));
                    setQuotes(finalUpdatedQuotes);
                    saveLS(LS_KEYS.quotes, finalUpdatedQuotes);
                  }
                }
              } catch (updateErr) {
                console.warn("⚠️ Erreur lors de la mise à jour Supabase:", updateErr);
              }
            }

            setShowEditModal(false);
            setSelectedQuote(null);
            setEditClient(null);
            setEditItems([]);
            setEditNotes("");
            toast.success("Devis modifié avec succès !");
          }}
        />
      )}
    </div>
  );
}

// Composant modale de modification de devis
function EditQuoteModal({ quote, client, setClient, items, setItems, notes, setNotes, activities, user, canModifyActivities, stopSales = [], pushSales = [], onClose, onSave, editModalRef, editModalContainerRef }) {
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
    setItems((prev) => prev.filter((_, idx) => idx !== i));
  }

  // Calcul des totaux (similaire à QuotesPage)
  const computed = useMemo(() => {
    return items.map((it) => {
      const act = activities.find((a) => a.id === it.activityId);
      const weekday = it.date ? new Date(it.date + "T12:00:00").getDay() : null;
      const available = act && weekday != null ? !!act.availableDays?.[weekday] : true;
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
        if (it.speedBoatExtra) {
          // Gérer le nouveau format (array) et l'ancien format (string) pour compatibilité
          const extrasArray = Array.isArray(it.speedBoatExtra) 
            ? it.speedBoatExtra 
            : (typeof it.speedBoatExtra === "string" && it.speedBoatExtra !== "" 
              ? [it.speedBoatExtra] 
              : []);
          
          extrasArray.forEach((extraId) => {
            if (extraId) { // Ignorer les valeurs vides
              const selectedExtra = SPEED_BOAT_EXTRAS.find((e) => e.id === extraId);
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
        transferInfo,
        lineTotal,
        pickupTime,
        currency: currencyCode,
      };
    });
  }, [items, activities, client.neighborhood]);

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
        neighborhood: client.neighborhood,
        slot: c.raw.slot,
        pickupTime: c.pickupTime || "",
        lineTotal: c.lineTotal,
        transferSurchargePerAdult: c.transferInfo?.surcharge || 0,
        // Préserver le ticketNumber existant - ne peut pas être modifié si déjà rempli
        ticketNumber: (c.raw.ticketNumber && c.raw.ticketNumber.trim()) 
          ? c.raw.ticketNumber 
          : (quote.items?.find((item) => item.activityId === c.act.id && item.date === c.raw.date)?.ticketNumber || ""),
      })),
      total: validGrandTotal,
      totalCash: Math.round(validGrandTotal),
      totalCard: calculateCardPrice(validGrandTotal),
      currency: validGrandCurrency,
    };

    onSave(updatedQuote);
  }

  return (
    <div ref={editModalContainerRef} className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-2 md:p-4">
      <div ref={editModalRef} className="bg-white rounded-xl md:rounded-2xl border border-blue-100/50 shadow-2xl p-4 md:p-6 max-w-4xl w-full max-h-[95vh] md:max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-3 md:mb-4">
          <h3 className="text-base md:text-lg font-semibold">Modifier le devis</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl md:text-2xl leading-none min-w-[44px] min-h-[44px] flex items-center justify-center">
            ×
          </button>
        </div>

        <div className="space-y-5">
          {/* Infos client - Modifiables par tous */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
            <div>
              <p className="text-xs text-gray-500 mb-1">Client</p>
              <TextInput value={client.name || ""} onChange={(e) => setClient((c) => ({ ...c, name: e.target.value }))} />
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">Téléphone</p>
              <TextInput 
                value={client.phone || ""} 
                onChange={(e) => {
                  // Nettoyer automatiquement le numéro de téléphone (supprimer espaces, parenthèses, etc.)
                  const cleaned = cleanPhoneNumber(e.target.value);
                  setClient((c) => ({ ...c, phone: cleaned }));
                }} 
              />
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">Hôtel</p>
              <TextInput value={client.hotel || ""} onChange={(e) => setClient((c) => ({ ...c, hotel: e.target.value }))} />
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">Chambre</p>
              <TextInput value={client.room || ""} onChange={(e) => setClient((c) => ({ ...c, room: e.target.value }))} />
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">Quartier</p>
              <select
                value={client.neighborhood || ""}
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

          {/* Activités */}
          <div className="space-y-4">
            {computed.map((c, idx) => (
              <div key={idx} className="bg-white/90 border border-blue-100/60 rounded-2xl p-4 space-y-3 shadow-sm">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-gray-700">Activité #{idx + 1}</p>
                  <GhostBtn type="button" onClick={() => removeItem(idx)}>
                    Supprimer
                  </GhostBtn>
                </div>
                {/* Première ligne : Activité et Date - Modifiables par tous */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="md:col-span-2">
                    <p className="text-xs text-gray-500 mb-1">Activité</p>
                    <select
                      value={c.raw.activityId || ""}
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
                    <p className="text-xs text-gray-500 mb-1">Date</p>
                    <ColoredDatePicker
                      value={c.raw.date}
                      onChange={(date) => setItem(idx, { date })}
                      activity={c.act}
                      stopSales={stopSales}
                      pushSales={pushSales}
                    />
                    {c.act && !c.available && (
                      <p className="text-[10px] text-amber-700 mt-1">⚠️ activité pas dispo ce jour-là</p>
                    )}
                  </div>
                </div>
                {/* Deuxième ligne : Nombre de personnes - Modifiables par tous */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-cyan-50/50 p-3 md:p-4 rounded-xl border-2 border-cyan-200">
                  <div>
                    <p className="text-xs text-gray-700 font-semibold mb-2">👥 Adultes</p>
                    <NumberInput 
                      value={c.raw.adults || 0} 
                      onChange={(e) => setItem(idx, { adults: e.target.value })}
                    />
                  </div>
                  <div>
                    <p className="text-xs text-gray-700 font-semibold mb-2">
                      👶 Enfants{c.act?.ageChild ? <span className="text-gray-500 ml-1">({c.act.ageChild})</span> : ""}
                    </p>
                    <NumberInput 
                      value={c.raw.children || 0} 
                      onChange={(e) => setItem(idx, { children: e.target.value })}
                    />
                  </div>
                  <div>
                    <p className="text-xs text-gray-700 font-semibold mb-2">
                      🍼 Bébés{c.act?.ageBaby ? <span className="text-gray-500 ml-1">({c.act.ageBaby})</span> : ""}
                    </p>
                    <NumberInput 
                      value={c.raw.babies || 0} 
                      onChange={(e) => setItem(idx, { babies: e.target.value })}
                    />
                  </div>
                </div>
                {/* Champs spécifiques pour Buggy - Modifiables par tous */}
                {c.act && isBuggyActivity(c.act.name) && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Buggy Simple ({getBuggyPrices(c.act.name).simple}€)</p>
                      <NumberInput 
                        value={c.raw.buggySimple ?? ""} 
                        onChange={(e) => setItem(idx, { buggySimple: e.target.value === "" ? "" : e.target.value })}
                      />
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Buggy Family ({getBuggyPrices(c.act.name).family}€)</p>
                      <NumberInput 
                        value={c.raw.buggyFamily ?? ""} 
                        onChange={(e) => setItem(idx, { buggyFamily: e.target.value === "" ? "" : e.target.value })}
                      />
                    </div>
                  </div>
                )}
                {/* Champs spécifiques pour MotoCross - Modifiables par tous */}
                {c.act && isMotoCrossActivity(c.act.name) && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 mt-3">
                    <div>
                      <p className="text-xs text-gray-500 mb-1">YAMAHA 250CC ({getMotoCrossPrices().yamaha250}€)</p>
                      <NumberInput 
                        value={c.raw.yamaha250 ?? ""} 
                        onChange={(e) => setItem(idx, { yamaha250: e.target.value === "" ? "" : e.target.value })}
                      />
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-1">KTM640CC ({getMotoCrossPrices().ktm640}€)</p>
                      <NumberInput 
                        value={c.raw.ktm640 ?? ""} 
                        onChange={(e) => setItem(idx, { ktm640: e.target.value === "" ? "" : e.target.value })}
                      />
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-1">KTM 530CC ({getMotoCrossPrices().ktm530}€)</p>
                      <NumberInput 
                        value={c.raw.ktm530 ?? ""} 
                        onChange={(e) => setItem(idx, { ktm530: e.target.value === "" ? "" : e.target.value })}
                      />
                    </div>
                  </div>
                )}
                {/* Créneaux et Extras - Modifiables par tous */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {c.transferInfo && (
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Créneau</p>
                      <select
                        value={c.raw.slot || ""}
                        onChange={(e) => setItem(idx, { slot: e.target.value })}
                        className="w-full rounded-xl border border-blue-200/50 bg-white px-3 py-2 text-sm"
                      >
                        <option value="">—</option>
                        {c.transferInfo.morningEnabled && <option value="morning">Matin ({c.transferInfo.morningTime})</option>}
                        {c.transferInfo.afternoonEnabled && <option value="afternoon">Après-midi ({c.transferInfo.afternoonTime})</option>}
                        {c.transferInfo.eveningEnabled && <option value="evening">Soir ({c.transferInfo.eveningTime})</option>}
                      </select>
                    </div>
                  )}
                  {c.act && c.act.name.toLowerCase().includes("speed boat") ? (
                    <div className="md:col-span-2">
                      <p className="text-xs text-gray-500 mb-1">Extras (plusieurs sélections possibles)</p>
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
                            <label key={extra.id} className="flex items-center gap-2 p-2 rounded-lg transition-colors cursor-pointer hover:bg-blue-50/50">
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
                    <>
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Extra (label)</p>
                        <TextInput 
                          value={c.raw.extraLabel || ""} 
                          onChange={(e) => setItem(idx, { extraLabel: e.target.value })}
                        />
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Extra (montant)</p>
                        <NumberInput 
                          value={c.raw.extraAmount || ""} 
                          onChange={(e) => setItem(idx, { extraAmount: e.target.value })}
                        />
                      </div>
                    </>
                  )}
                </div>
                {/* Extra dauphin (uniquement pour Speed Boat) - Modifiable par tous */}
                {c.act && c.act.name.toLowerCase().includes("speed boat") && (
                  <div className="flex items-center gap-2 mt-2">
                    <input
                      type="checkbox"
                      id={`edit-extraDolphin-${idx}`}
                      checked={c.raw.extraDolphin || false}
                      onChange={(e) => setItem(idx, { extraDolphin: e.target.checked })}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <label htmlFor={`edit-extraDolphin-${idx}`} className="text-sm text-gray-700 cursor-pointer">
                      Extra dauphin 20€
                    </label>
                  </div>
                )}
                {/* Afficher le numéro de ticket si présent (non modifiable) */}
                {((c.raw.ticketNumber || quote.items?.find((item) => item.activityId === c.act?.id && item.date === c.raw.date)?.ticketNumber)) && (
                  <div className="mt-2 p-2 bg-emerald-50 border border-emerald-200 rounded-lg">
                    <p className="text-xs text-emerald-700 font-medium">🎫 Ticket: {(c.raw.ticketNumber || quote.items?.find((item) => item.activityId === c.act?.id && item.date === c.raw.date)?.ticketNumber)}</p>
                    <p className="text-[10px] text-emerald-600 font-semibold mt-1">Non modifiable</p>
                  </div>
                )}
                {c.lineTotal > 0 && (
                  <div className="text-right text-sm font-semibold text-slate-700">
                    <p>Espèces: {currencyNoCents(Math.round(c.lineTotal), c.currency)}</p>
                    <p className="text-xs text-slate-600">Carte: {currencyNoCents(calculateCardPrice(c.lineTotal), c.currency)}</p>
                    {calculateTransferSurcharge(c.raw) > 0 && (
                      <p className="text-xs text-cyan-600 font-medium mt-1">
                        🚗 Transfert: {currencyNoCents(calculateTransferSurcharge(c.raw), c.currency)}
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between">
            <GhostBtn type="button" onClick={addItem}>
              + Ajouter une autre activité
            </GhostBtn>
            <div className="text-right">
              <p className="text-xs text-gray-500">Total</p>
              <p className="text-xl font-bold">Espèces: {currencyNoCents(grandTotalCash, grandCurrency)}</p>
              <p className="text-lg font-semibold text-gray-700">Carte: {currencyNoCents(grandTotalCard, grandCurrency)}</p>
            </div>
          </div>

          <div>
            <p className="text-xs text-gray-500 mb-1">Notes</p>
            <TextInput
              placeholder="Infos supplémentaires : langue du guide, pick-up, etc."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-end mt-4 md:mt-6 pt-4 border-t">
          <GhostBtn onClick={onClose} className="w-full sm:w-auto">Annuler</GhostBtn>
          <PrimaryBtn onClick={handleSave} className="w-full sm:w-auto">
            Enregistrer les modifications
          </PrimaryBtn>
        </div>
      </div>
    </div>
  );
}

