import { useState, useMemo, useEffect } from "react";
import { cleanPhoneNumber, exportTicketsToCSV, saveLS } from "../utils";
import { PrimaryBtn, TextInput } from "../components/ui";
import { toast } from "../utils/toast.js";
import { useDebounce } from "../hooks/useDebounce";
import { supabase } from "../lib/supabase";
import { SITE_KEY, LS_KEYS } from "../constants";

export function TicketPage({ quotes, setQuotes, user }) {
  const [currentPage, setCurrentPage] = useState(1);
  const [showModifiedOrCancelled, setShowModifiedOrCancelled] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearchQuery = useDebounce(searchQuery, 300);
  
  // Vérifier si l'utilisateur peut modifier (Ewen, Léa ou canAccessSituation)
  const canEdit = useMemo(() => {
    return user?.name === "Ewen" || user?.name === "Léa" || user?.canAccessSituation;
  }, [user]);
  
  // État pour l'édition des cellules
  const [editingCell, setEditingCell] = useState(null); // { rowKey: string, field: string }
  
  // Extraire tous les items avec tickets renseignés depuis les devis complets
  const allTicketRows = useMemo(() => {
    const rows = [];
    
    quotes.forEach((quote) => {
      // Vérifier que tous les tickets sont renseignés pour ce devis
      const allTicketsFilled = quote.items?.every((item) => item.ticketNumber && item.ticketNumber.trim());
      
      if (allTicketsFilled && quote.items) {
        quote.items.forEach((item) => {
          if (item.ticketNumber && item.ticketNumber.trim()) {
            // Calculer le prix du transfert
            let transferTotal = 0;
            if (item.transferSurchargePerAdult) {
              if (item.activityName?.toLowerCase().includes("buggy")) {
                const totalBuggys = (Number(item.buggySimple || 0) + Number(item.buggyFamily || 0));
                transferTotal = item.transferSurchargePerAdult * totalBuggys;
              } else {
                transferTotal = item.transferSurchargePerAdult * (Number(item.adults || 0));
              }
            }
            
            const activityPrice = Math.max(0, (item.lineTotal || 0) - transferTotal);
            const paymentMethodDisplay = (item.paymentMethod === "cash" || item.paymentMethod === "stripe") 
              ? item.paymentMethod.charAt(0).toUpperCase() + item.paymentMethod.slice(1)
              : "";
            
            const isModified = item.modifications && item.modifications.length > 0 && item.modifications.some(m => m.type === "modified");
            const isCancelled = item.isCancelled || false;
            
            // Extraire le numéro numérique du ticket
            const ticketNum = parseInt(item.ticketNumber.replace(/\D/g, ""), 10) || 0;
            
            rows.push({
              ticket: item.ticketNumber || "",
              ticketNum: ticketNum, // Numéro numérique pour tri et pagination
              date: item.date || "",
              clientName: quote.client?.name || "",
              clientPhone: cleanPhoneNumber(quote.client?.phone || ""),
              hotel: quote.client?.hotel || "",
              room: quote.client?.room || "",
              adults: item.adults || 0,
              children: item.children || 0,
              babies: item.babies || 0,
              activityName: item.activityName || "",
              pickupTime: item.pickupTime || "",
              comment: item.comment || "",
              activityPrice: activityPrice,
              transferTotal: transferTotal,
              paymentMethod: paymentMethodDisplay,
              sellerName: quote.createdByName || "",
              isModified: isModified,
              isCancelled: isCancelled,
              // Références pour l'édition
              quoteId: quote.id,
              itemIndex: quote.items.findIndex((i) => i === item),
              quote: quote,
              item: item,
            });
          }
        });
      }
    });
    
    // Trier par numéro de ticket (numérique)
    return rows.sort((a, b) => a.ticketNum - b.ticketNum);
  }, [quotes]);

  // Filtrer les tickets modifiés/annulés et par recherche
  const filteredTicketRows = useMemo(() => {
    let filtered = allTicketRows;
    
    // Filtre modifié/annulé
    if (showModifiedOrCancelled) {
      filtered = filtered.filter((row) => row.isModified || row.isCancelled);
    } else {
      filtered = filtered.filter((row) => !row.isCancelled);
    }
    
    // Filtre par recherche (numéro de ticket, téléphone, nom ou prénom)
    if (debouncedSearchQuery.trim()) {
      const searchTerm = debouncedSearchQuery.toLowerCase().trim();
      const searchTermNumbers = searchTerm.replace(/\D/g, ""); // Extraire uniquement les chiffres pour ticket/téléphone
      
      filtered = filtered.filter((row) => {
        // Rechercher dans le numéro de ticket (chiffres uniquement)
        const ticketNum = row.ticket.replace(/\D/g, "");
        const ticketMatch = searchTermNumbers && ticketNum.includes(searchTermNumbers);
        
        // Rechercher dans le numéro de téléphone (chiffres uniquement)
        const phoneNum = row.clientPhone.replace(/\D/g, "");
        const phoneMatch = searchTermNumbers && phoneNum.includes(searchTermNumbers);
        
        // Rechercher dans le nom/prénom du client (texte)
        const clientName = (row.clientName || "").toLowerCase();
        const nameMatch = clientName.includes(searchTerm);
        
        return ticketMatch || phoneMatch || nameMatch;
      });
    }
    
    return filtered;
  }, [allTicketRows, showModifiedOrCancelled, debouncedSearchQuery]);

  // Définir 120 pages fixes avec des tranches de 50 tickets chacune
  const pages = useMemo(() => {
    const TOTAL_PAGES = 120;
    const TICKETS_PER_PAGE = 50;
    const START_TICKET = 163401; // Première page commence à 163401
    
    const pageList = [];
    
    for (let pageIndex = 1; pageIndex <= TOTAL_PAGES; pageIndex++) {
      const startTicket = START_TICKET + ((pageIndex - 1) * TICKETS_PER_PAGE);
      const endTicket = startTicket + (TICKETS_PER_PAGE - 1); // 50 tickets : start à start+49
      
      // Si une recherche est active, filtrer les tickets qui correspondent à cette page ET à la recherche
      // Sinon, utiliser tous les tickets qui correspondent à cette page
      const pageRows = filteredTicketRows.filter(row => 
        row.ticketNum >= startTicket && row.ticketNum <= endTicket
      );
      
      // Si recherche active, créer uniquement les lignes avec résultats
      // Sinon, créer 50 lignes (même si certaines sont vides)
      const rows = [];
      if (debouncedSearchQuery.trim()) {
        // Avec recherche : afficher uniquement les tickets qui matchent
        for (let ticketNum = startTicket; ticketNum <= endTicket; ticketNum++) {
          const matchingRow = pageRows.find(row => row.ticketNum === ticketNum);
          if (matchingRow) {
            rows.push(matchingRow);
          }
        }
      } else {
        // Sans recherche : créer 50 lignes (remplies ou vides)
        for (let ticketNum = startTicket; ticketNum <= endTicket; ticketNum++) {
          const matchingRow = pageRows.find(row => row.ticketNum === ticketNum);
          if (matchingRow) {
            rows.push(matchingRow);
          } else {
            // Ligne vide - sera remplie plus tard
            rows.push({
              ticket: "",
              ticketNum: ticketNum,
              isEmpty: true,
              date: "",
              clientName: "",
              clientPhone: "",
              hotel: "",
              room: "",
              adults: 0,
              children: 0,
              babies: 0,
              activityName: "",
              pickupTime: "",
              comment: "",
              activityPrice: 0,
              transferTotal: 0,
              paymentMethod: "",
              sellerName: "",
              isModified: false,
              isCancelled: false,
            });
          }
        }
      }
      
      // Ajouter la page seulement si elle contient des résultats (avec recherche) ou toujours (sans recherche)
      if (!debouncedSearchQuery.trim() || rows.length > 0) {
        pageList.push({
          page: pageIndex,
          startTicket: startTicket,
          endTicket: endTicket,
          rows: rows,
        });
      }
    }
    
    return pageList;
  }, [filteredTicketRows, debouncedSearchQuery]);

  // Récupérer les lignes de la page courante
  const currentPageData = useMemo(() => {
    if (pages.length === 0) return { rows: [], startTicket: 0, endTicket: 0 };
    const page = pages[currentPage - 1];
    if (!page) return { rows: [], startTicket: 0, endTicket: 0 };
    return {
      rows: page.rows, // Toujours 50 lignes
      startTicket: page.startTicket,
      endTicket: page.endTicket,
    };
  }, [pages, currentPage]);

  // Ajuster la page courante quand la recherche change ou quand les pages changent
  useEffect(() => {
    if (debouncedSearchQuery.trim()) {
      // Si recherche active, trouver la première page qui contient des résultats
      const firstPageWithResults = pages.findIndex(page => page.rows.length > 0);
      if (firstPageWithResults !== -1 && currentPage !== firstPageWithResults + 1) {
        setCurrentPage(firstPageWithResults + 1);
      } else if (pages.length > 0 && currentPage > pages.length) {
        setCurrentPage(pages.length);
      }
    } else {
      // Sans recherche, ajuster si nécessaire
      if (currentPage > pages.length && pages.length > 0) {
        setCurrentPage(pages.length);
      } else if (currentPage < 1 && pages.length > 0) {
        setCurrentPage(1);
      }
    }
  }, [debouncedSearchQuery, pages, currentPage]);
  
  // Fonction pour modifier une cellule
  const handleCellEdit = (row, field, value) => {
    if (!row.quote || row.itemIndex === undefined || row.itemIndex === -1) {
      toast.error("Impossible de modifier cette ligne");
      return;
    }
    
    const quote = row.quote;
    const itemIndex = row.itemIndex;
    
    // Mettre à jour le quote localement
    const updatedQuotes = quotes.map((q) => {
      if (q.id === quote.id) {
        const updatedItems = q.items.map((item, idx) => {
          if (idx === itemIndex) {
            const updatedItem = { ...item };
            
            // Mapper les champs du tableau aux champs de l'item
            if (field === "date") {
              updatedItem.date = value;
            } else if (field === "clientName") {
              // Mettre à jour le nom du client dans le quote
              return item; // On gérera ça séparément
            } else if (field === "clientPhone") {
              // Mettre à jour le téléphone du client dans le quote
              return item; // On gérera ça séparément
            } else if (field === "hotel") {
              // Mettre à jour l'hôtel du client dans le quote
              return item; // On gérera ça séparément
            } else if (field === "room") {
              // Mettre à jour la chambre du client dans le quote
              return item; // On gérera ça séparément
            } else if (field === "adults") {
              updatedItem.adults = Number(value) || 0;
            } else if (field === "children") {
              updatedItem.children = Number(value) || 0;
            } else if (field === "babies") {
              updatedItem.babies = Number(value) || 0;
            } else if (field === "activityName") {
              updatedItem.activityName = value;
            } else if (field === "pickupTime") {
              updatedItem.pickupTime = value;
            } else if (field === "comment") {
              updatedItem.comment = value;
            }
            
            return updatedItem;
          }
          return item;
        });
        
        // Mettre à jour les champs du client si nécessaire
        let updatedClient = { ...q.client };
        if (field === "clientName") {
          updatedClient.name = value;
        } else if (field === "clientPhone") {
          updatedClient.phone = value;
        } else if (field === "hotel") {
          updatedClient.hotel = value;
        } else if (field === "room") {
          updatedClient.room = value;
        }
        
        return {
          ...q,
          client: updatedClient,
          items: updatedItems,
        };
      }
      return q;
    });
    
    setQuotes(updatedQuotes);
    saveLS(LS_KEYS.quotes, updatedQuotes);
    
    // Sauvegarder en base de données Supabase
    handleSaveToDatabase(updatedQuotes.find((q) => q.id === quote.id));
  };
  
  // Fonction pour sauvegarder un quote en base de données
  const handleSaveToDatabase = async (quote) => {
    if (!quote || !supabase) return;
    
    try {
      const supabaseUpdate = {
        client_name: quote.client?.name || "",
        client_phone: quote.client?.phone || "",
        client_hotel: quote.client?.hotel || "",
        client_room: quote.client?.room || "",
        client_neighborhood: quote.client?.neighborhood || "",
        notes: quote.notes || "",
        total: quote.total || 0,
        currency: quote.currency || "EUR",
        items: JSON.stringify(quote.items || []),
        created_by_name: quote.createdByName || "",
      };
      
      // Utiliser supabase_id en priorité pour identifier le devis à mettre à jour
      let updateQuery = supabase
        .from("quotes")
        .update(supabaseUpdate)
        .eq("site_key", SITE_KEY);
      
      if (quote.supabase_id) {
        // Si le devis a un supabase_id, l'utiliser (le plus fiable)
        updateQuery = updateQuery.eq("id", quote.supabase_id);
      } else {
        // Sinon, utiliser client_phone + created_at (pour compatibilité avec les anciens devis)
        updateQuery = updateQuery
          .eq("client_phone", quote.client?.phone || "")
          .eq("created_at", quote.createdAt);
      }
      
      const { error: updateError } = await updateQuery;
      
      if (updateError) {
        console.warn("⚠️ Erreur mise à jour Supabase:", updateError);
        toast.error("Erreur lors de la sauvegarde en base de données.");
      } else {
        console.log("✅ Devis mis à jour dans Supabase!");
        toast.success("Modifications sauvegardées en base de données !");
      }
    } catch (error) {
      console.error("❌ Erreur lors de la sauvegarde:", error);
      toast.error("Erreur lors de la sauvegarde en base de données.");
    }
  };

  return (
    <>
      {/* Barre de recherche et filtres */}
      <div className="bg-white/95 backdrop-blur-sm rounded-2xl border border-blue-100/60 p-4 shadow-md mb-4">
        <div className="space-y-4">
          {/* Barre de recherche */}
          <div>
            <p className="text-xs text-gray-500 mb-1">Rechercher par numéro de ticket, téléphone, nom ou prénom</p>
            <TextInput
              placeholder="Ex: 163400, +20123456789, Jean, Dupont"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1); // Réinitialiser à la première page lors de la recherche
              }}
            />
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery("");
                  setCurrentPage(1);
                }}
                className="mt-2 text-xs text-blue-600 hover:text-blue-800"
              >
                Effacer la recherche
              </button>
            )}
          </div>

          {/* Boutons de filtre et info */}
          <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
            <button
              onClick={() => {
                setShowModifiedOrCancelled(!showModifiedOrCancelled);
                setCurrentPage(1); // Réinitialiser à la première page
              }}
              className={`px-4 py-2 text-sm rounded-xl border transition-colors ${
                showModifiedOrCancelled
                  ? "bg-amber-100 text-amber-700 border-amber-300 hover:bg-amber-200"
                  : "bg-white/95 backdrop-blur-sm text-gray-700 border-gray-200/60 hover:bg-gray-50/80 shadow-sm"
              }`}
            >
              {showModifiedOrCancelled ? "✅ Modifiés/Annulés" : "🔄 Modifiés/Annulés"}
            </button>

            <div className="flex items-center gap-4">
              <p className="text-sm text-gray-600">
                Total : <span className="font-semibold">{filteredTicketRows.length}</span> ticket(s)
              </p>
              {pages.length > 0 && (
                <p className="text-sm text-gray-600">
                  Page <span className="font-semibold">{currentPage}</span> sur <span className="font-semibold">{pages.length}</span>
                </p>
              )}
              <PrimaryBtn
                onClick={() => {
                  exportTicketsToCSV(filteredTicketRows);
                  toast.success("Export Excel des tickets généré avec succès !");
                }}
                disabled={filteredTicketRows.length === 0}
              >
                📊 Exporter Excel
              </PrimaryBtn>
            </div>
          </div>
        </div>
      </div>

      {/* Tableau */}
      <div className="overflow-x-auto" style={{ width: '100%' }}>
        <table className="border-collapse bg-white" style={{ border: '1px solid #ddd', width: '100%', tableLayout: 'fixed' }}>
          <thead>
            <tr style={{ backgroundColor: '#f0f0f0', borderBottom: '2px solid #333' }}>
              <th style={{ border: '1px solid #ddd', padding: '6px', textAlign: 'center', fontWeight: 'bold', fontSize: '11px', width: '2%' }}>
                {/* Colonne pour les logos modifiés/annulés */}
              </th>
              <th style={{ border: '1px solid #ddd', padding: '6px', textAlign: 'left', fontWeight: 'bold', fontSize: '11px', width: '5%' }}>
                Ticket
              </th>
              <th style={{ border: '1px solid #ddd', padding: '6px', textAlign: 'left', fontWeight: 'bold', fontSize: '11px', width: '6%' }}>
                Date
              </th>
              <th style={{ border: '1px solid #ddd', padding: '6px', textAlign: 'left', fontWeight: 'bold', fontSize: '11px', width: '10%' }}>
                Prénom + Téléphone
              </th>
              <th style={{ border: '1px solid #ddd', padding: '6px', textAlign: 'left', fontWeight: 'bold', fontSize: '11px', width: '8%' }}>
                Hôtel
              </th>
              <th style={{ border: '1px solid #ddd', padding: '6px', textAlign: 'left', fontWeight: 'bold', fontSize: '11px', width: '5%' }}>
                Chambre
              </th>
              <th style={{ border: '1px solid #ddd', padding: '6px', textAlign: 'center', fontWeight: 'bold', fontSize: '11px', width: '4%' }}>
                Adultes
              </th>
              <th style={{ border: '1px solid #ddd', padding: '6px', textAlign: 'center', fontWeight: 'bold', fontSize: '11px', width: '4%' }}>
                Enfants
              </th>
              <th style={{ border: '1px solid #ddd', padding: '6px', textAlign: 'center', fontWeight: 'bold', fontSize: '11px', width: '4%' }}>
                Bébés
              </th>
              <th style={{ border: '1px solid #ddd', padding: '6px', textAlign: 'left', fontWeight: 'bold', fontSize: '11px', width: '12%' }}>
                Activité
              </th>
              <th style={{ border: '1px solid #ddd', padding: '6px', textAlign: 'left', fontWeight: 'bold', fontSize: '11px', width: '8%' }}>
                Heure prise en charge
              </th>
              <th style={{ border: '1px solid #ddd', padding: '6px', textAlign: 'left', fontWeight: 'bold', fontSize: '11px', width: '8%' }}>
                Commentaire
              </th>
              <th style={{ border: '1px solid #ddd', padding: '6px', textAlign: 'right', fontWeight: 'bold', fontSize: '11px', width: '6%' }}>
                Prix activité
              </th>
              <th style={{ border: '1px solid #ddd', padding: '6px', textAlign: 'right', fontWeight: 'bold', fontSize: '11px', width: '6%' }}>
                Prix transfert
              </th>
              <th style={{ border: '1px solid #ddd', padding: '6px', textAlign: 'left', fontWeight: 'bold', fontSize: '11px', width: '8%' }}>
                Méthode de paiement
              </th>
              <th style={{ border: '1px solid #ddd', padding: '6px', textAlign: 'left', fontWeight: 'bold', fontSize: '11px', width: '6%' }}>
                Vendeur
              </th>
            </tr>
          </thead>
          <tbody>
            {currentPageData.rows.length === 0 ? (
              <tr>
                <td colSpan="16" style={{ padding: '12px', textAlign: 'center', color: '#666', fontSize: '11px' }}>
                  Aucun ticket disponible. Les tickets apparaîtront automatiquement lorsque tous les numéros de ticket d'un devis seront renseignés.
                </td>
              </tr>
            ) : (
              currentPageData.rows.map((row, index) => {
                // Utiliser ticketNum pour les lignes vides aussi
                const uniqueKey = row.isEmpty ? `empty-${row.ticketNum}-${index}` : `${row.ticket}-${row.date}-${row.clientPhone || ''}`;
                return (
                  <tr
                    key={uniqueKey}
                    style={{ 
                      borderBottom: '1px solid #ddd',
                      backgroundColor: row.isCancelled ? '#fee2e2' : (row.isEmpty ? '#f9f9f9' : 'transparent'),
                      opacity: row.isCancelled ? 0.6 : (row.isEmpty ? 0.5 : 1)
                    }}
                  >
                    <td 
                      style={{ 
                        border: '1px solid #ddd', 
                        padding: '6px', 
                        textAlign: 'center',
                        fontSize: '14px',
                        userSelect: 'none',
                        WebkitUserSelect: 'none',
                        MozUserSelect: 'none',
                        msUserSelect: 'none',
                        width: '30px'
                      }}
                      className="no-select"
                    >
                      {!row.isEmpty && row.isModified && '🔄'}
                      {!row.isEmpty && row.isCancelled && '❌'}
                    </td>
                    <td style={{ border: '1px solid #ddd', padding: '6px', fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {row.isEmpty ? row.ticketNum : row.ticket}
                    </td>
                    <td style={{ border: '1px solid #ddd', padding: '6px', fontSize: '11px' }}>
                      {canEdit && !row.isEmpty && editingCell?.rowKey === uniqueKey && editingCell?.field === "date" ? (
                        <input
                          type="date"
                          value={row.date || ""}
                          onChange={(e) => {
                            const dateValue = e.target.value;
                            handleCellEdit(row, "date", dateValue);
                          }}
                          onBlur={() => setEditingCell(null)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") setEditingCell(null);
                          }}
                          style={{ width: '100%', padding: '3px', fontSize: '11px', border: '1px solid #2563eb', borderRadius: '4px' }}
                          autoFocus
                        />
                      ) : (
                        <span 
                          style={{ cursor: canEdit && !row.isEmpty ? 'pointer' : 'default', padding: canEdit && !row.isEmpty ? '4px' : '0', borderRadius: canEdit && !row.isEmpty ? '4px' : '0', display: 'inline-block', width: '100%' }}
                          onClick={() => canEdit && !row.isEmpty && setEditingCell({ rowKey: uniqueKey, field: "date" })}
                          onMouseEnter={(e) => canEdit && !row.isEmpty && (e.target.style.backgroundColor = '#f0f0f0')}
                          onMouseLeave={(e) => canEdit && !row.isEmpty && (e.target.style.backgroundColor = 'transparent')}
                        >
                          {row.isEmpty ? "" : (row.date ? new Date(row.date + "T12:00:00").toLocaleDateString("fr-FR") : "")}
                        </span>
                      )}
                    </td>
                    <td style={{ border: '1px solid #ddd', padding: '6px', fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {canEdit && !row.isEmpty && editingCell?.rowKey === uniqueKey && editingCell?.field === "clientName" ? (
                        <input
                          type="text"
                          value={row.clientName || ""}
                          onChange={(e) => handleCellEdit(row, "clientName", e.target.value)}
                          onBlur={() => setEditingCell(null)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") setEditingCell(null);
                          }}
                          style={{ width: '100%', padding: '3px', fontSize: '11px', border: '1px solid #2563eb', borderRadius: '4px' }}
                          autoFocus
                        />
                      ) : (
                        <span 
                          style={{ cursor: canEdit && !row.isEmpty ? 'pointer' : 'default', padding: canEdit && !row.isEmpty ? '4px' : '0', borderRadius: canEdit && !row.isEmpty ? '4px' : '0', display: 'inline-block', width: '100%' }}
                          onClick={() => canEdit && !row.isEmpty && setEditingCell({ rowKey: uniqueKey, field: "clientName" })}
                          onMouseEnter={(e) => canEdit && !row.isEmpty && (e.target.style.backgroundColor = '#f0f0f0')}
                          onMouseLeave={(e) => canEdit && !row.isEmpty && (e.target.style.backgroundColor = 'transparent')}
                        >
                          {row.isEmpty ? "" : (row.clientName || "") + (row.clientName && row.clientPhone ? " " : "") + (row.clientPhone ? `+${row.clientPhone}` : "")}
                        </span>
                      )}
                    </td>
                    <td style={{ border: '1px solid #ddd', padding: '6px', fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {canEdit && !row.isEmpty && editingCell?.rowKey === uniqueKey && editingCell?.field === "hotel" ? (
                        <input
                          type="text"
                          value={row.hotel || ""}
                          onChange={(e) => handleCellEdit(row, "hotel", e.target.value)}
                          onBlur={() => setEditingCell(null)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") setEditingCell(null);
                          }}
                          style={{ width: '100%', padding: '3px', fontSize: '11px', border: '1px solid #2563eb', borderRadius: '4px' }}
                          autoFocus
                        />
                      ) : (
                        <span 
                          style={{ cursor: canEdit && !row.isEmpty ? 'pointer' : 'default', padding: canEdit && !row.isEmpty ? '4px' : '0', borderRadius: canEdit && !row.isEmpty ? '4px' : '0', display: 'inline-block', width: '100%' }}
                          onClick={() => canEdit && !row.isEmpty && setEditingCell({ rowKey: uniqueKey, field: "hotel" })}
                          onMouseEnter={(e) => canEdit && !row.isEmpty && (e.target.style.backgroundColor = '#f0f0f0')}
                          onMouseLeave={(e) => canEdit && !row.isEmpty && (e.target.style.backgroundColor = 'transparent')}
                        >
                          {row.isEmpty ? "" : (row.hotel || "")}
                        </span>
                      )}
                    </td>
                    <td style={{ border: '1px solid #ddd', padding: '6px', fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {canEdit && !row.isEmpty && editingCell?.rowKey === uniqueKey && editingCell?.field === "room" ? (
                        <input
                          type="text"
                          value={row.room || ""}
                          onChange={(e) => handleCellEdit(row, "room", e.target.value)}
                          onBlur={() => setEditingCell(null)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") setEditingCell(null);
                          }}
                          style={{ width: '100%', padding: '3px', fontSize: '11px', border: '1px solid #2563eb', borderRadius: '4px' }}
                          autoFocus
                        />
                      ) : (
                        <span 
                          style={{ cursor: canEdit && !row.isEmpty ? 'pointer' : 'default', padding: canEdit && !row.isEmpty ? '4px' : '0', borderRadius: canEdit && !row.isEmpty ? '4px' : '0', display: 'inline-block', width: '100%' }}
                          onClick={() => canEdit && !row.isEmpty && setEditingCell({ rowKey: uniqueKey, field: "room" })}
                          onMouseEnter={(e) => canEdit && !row.isEmpty && (e.target.style.backgroundColor = '#f0f0f0')}
                          onMouseLeave={(e) => canEdit && !row.isEmpty && (e.target.style.backgroundColor = 'transparent')}
                        >
                          {row.isEmpty ? "" : (row.room || "")}
                        </span>
                      )}
                    </td>
                    <td style={{ border: '1px solid #ddd', padding: '6px', textAlign: 'center', fontSize: '11px' }}>
                      {canEdit && !row.isEmpty && editingCell?.rowKey === uniqueKey && editingCell?.field === "adults" ? (
                        <input
                          type="number"
                          value={row.adults || 0}
                          onChange={(e) => handleCellEdit(row, "adults", e.target.value)}
                          onBlur={() => setEditingCell(null)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") setEditingCell(null);
                          }}
                          style={{ width: '100%', padding: '3px', fontSize: '11px', border: '1px solid #2563eb', borderRadius: '4px', textAlign: 'center' }}
                          autoFocus
                        />
                      ) : (
                        <span 
                          style={{ cursor: canEdit && !row.isEmpty ? 'pointer' : 'default', padding: canEdit && !row.isEmpty ? '4px' : '0', borderRadius: canEdit && !row.isEmpty ? '4px' : '0', display: 'inline-block', width: '100%' }}
                          onClick={() => canEdit && !row.isEmpty && setEditingCell({ rowKey: uniqueKey, field: "adults" })}
                          onMouseEnter={(e) => canEdit && !row.isEmpty && (e.target.style.backgroundColor = '#f0f0f0')}
                          onMouseLeave={(e) => canEdit && !row.isEmpty && (e.target.style.backgroundColor = 'transparent')}
                        >
                          {row.isEmpty ? "" : (row.adults || 0)}
                        </span>
                      )}
                    </td>
                    <td style={{ border: '1px solid #ddd', padding: '6px', textAlign: 'center', fontSize: '11px' }}>
                      {canEdit && !row.isEmpty && editingCell?.rowKey === uniqueKey && editingCell?.field === "children" ? (
                        <input
                          type="number"
                          value={row.children || 0}
                          onChange={(e) => handleCellEdit(row, "children", e.target.value)}
                          onBlur={() => setEditingCell(null)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") setEditingCell(null);
                          }}
                          style={{ width: '100%', padding: '3px', fontSize: '11px', border: '1px solid #2563eb', borderRadius: '4px', textAlign: 'center' }}
                          autoFocus
                        />
                      ) : (
                        <span 
                          style={{ cursor: canEdit && !row.isEmpty ? 'pointer' : 'default', padding: canEdit && !row.isEmpty ? '4px' : '0', borderRadius: canEdit && !row.isEmpty ? '4px' : '0', display: 'inline-block', width: '100%' }}
                          onClick={() => canEdit && !row.isEmpty && setEditingCell({ rowKey: uniqueKey, field: "children" })}
                          onMouseEnter={(e) => canEdit && !row.isEmpty && (e.target.style.backgroundColor = '#f0f0f0')}
                          onMouseLeave={(e) => canEdit && !row.isEmpty && (e.target.style.backgroundColor = 'transparent')}
                        >
                          {row.isEmpty ? "" : (row.children || 0)}
                        </span>
                      )}
                    </td>
                    <td style={{ border: '1px solid #ddd', padding: '6px', textAlign: 'center', fontSize: '11px' }}>
                      {canEdit && !row.isEmpty && editingCell?.rowKey === uniqueKey && editingCell?.field === "babies" ? (
                        <input
                          type="number"
                          value={row.babies || 0}
                          onChange={(e) => handleCellEdit(row, "babies", e.target.value)}
                          onBlur={() => setEditingCell(null)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") setEditingCell(null);
                          }}
                          style={{ width: '100%', padding: '3px', fontSize: '11px', border: '1px solid #2563eb', borderRadius: '4px', textAlign: 'center' }}
                          autoFocus
                        />
                      ) : (
                        <span 
                          style={{ cursor: canEdit && !row.isEmpty ? 'pointer' : 'default', padding: canEdit && !row.isEmpty ? '4px' : '0', borderRadius: canEdit && !row.isEmpty ? '4px' : '0', display: 'inline-block', width: '100%' }}
                          onClick={() => canEdit && !row.isEmpty && setEditingCell({ rowKey: uniqueKey, field: "babies" })}
                          onMouseEnter={(e) => canEdit && !row.isEmpty && (e.target.style.backgroundColor = '#f0f0f0')}
                          onMouseLeave={(e) => canEdit && !row.isEmpty && (e.target.style.backgroundColor = 'transparent')}
                        >
                          {row.isEmpty ? "" : (row.babies || 0)}
                        </span>
                      )}
                    </td>
                    <td style={{ border: '1px solid #ddd', padding: '6px', fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {canEdit && !row.isEmpty && editingCell?.rowKey === uniqueKey && editingCell?.field === "activityName" ? (
                        <input
                          type="text"
                          value={row.activityName || ""}
                          onChange={(e) => handleCellEdit(row, "activityName", e.target.value)}
                          onBlur={() => setEditingCell(null)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") setEditingCell(null);
                          }}
                          style={{ width: '100%', padding: '3px', fontSize: '11px', border: '1px solid #2563eb', borderRadius: '4px' }}
                          autoFocus
                        />
                      ) : (
                        <span 
                          style={{ cursor: canEdit && !row.isEmpty ? 'pointer' : 'default', padding: canEdit && !row.isEmpty ? '4px' : '0', borderRadius: canEdit && !row.isEmpty ? '4px' : '0', display: 'inline-block', width: '100%' }}
                          onClick={() => canEdit && !row.isEmpty && setEditingCell({ rowKey: uniqueKey, field: "activityName" })}
                          onMouseEnter={(e) => canEdit && !row.isEmpty && (e.target.style.backgroundColor = '#f0f0f0')}
                          onMouseLeave={(e) => canEdit && !row.isEmpty && (e.target.style.backgroundColor = 'transparent')}
                        >
                          {row.isEmpty ? "" : (row.activityName || "")}
                        </span>
                      )}
                    </td>
                    <td style={{ border: '1px solid #ddd', padding: '6px', fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {canEdit && !row.isEmpty && editingCell?.rowKey === uniqueKey && editingCell?.field === "pickupTime" ? (
                        <input
                          type="text"
                          value={row.pickupTime || ""}
                          onChange={(e) => handleCellEdit(row, "pickupTime", e.target.value)}
                          onBlur={() => setEditingCell(null)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") setEditingCell(null);
                          }}
                          style={{ width: '100%', padding: '3px', fontSize: '11px', border: '1px solid #2563eb', borderRadius: '4px' }}
                          autoFocus
                        />
                      ) : (
                        <span 
                          style={{ cursor: canEdit && !row.isEmpty ? 'pointer' : 'default', padding: canEdit && !row.isEmpty ? '4px' : '0', borderRadius: canEdit && !row.isEmpty ? '4px' : '0', display: 'inline-block', width: '100%' }}
                          onClick={() => canEdit && !row.isEmpty && setEditingCell({ rowKey: uniqueKey, field: "pickupTime" })}
                          onMouseEnter={(e) => canEdit && !row.isEmpty && (e.target.style.backgroundColor = '#f0f0f0')}
                          onMouseLeave={(e) => canEdit && !row.isEmpty && (e.target.style.backgroundColor = 'transparent')}
                        >
                          {row.isEmpty ? "" : (row.pickupTime || "")}
                        </span>
                      )}
                    </td>
                    <td style={{ border: '1px solid #ddd', padding: '6px', fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {canEdit && !row.isEmpty && editingCell?.rowKey === uniqueKey && editingCell?.field === "comment" ? (
                        <input
                          type="text"
                          value={row.comment || ""}
                          onChange={(e) => handleCellEdit(row, "comment", e.target.value)}
                          onBlur={() => setEditingCell(null)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") setEditingCell(null);
                          }}
                          style={{ width: '100%', padding: '3px', fontSize: '11px', border: '1px solid #2563eb', borderRadius: '4px' }}
                          autoFocus
                        />
                      ) : (
                        <span 
                          style={{ cursor: canEdit && !row.isEmpty ? 'pointer' : 'default', padding: canEdit && !row.isEmpty ? '4px' : '0', borderRadius: canEdit && !row.isEmpty ? '4px' : '0', display: 'inline-block', width: '100%' }}
                          onClick={() => canEdit && !row.isEmpty && setEditingCell({ rowKey: uniqueKey, field: "comment" })}
                          onMouseEnter={(e) => canEdit && !row.isEmpty && (e.target.style.backgroundColor = '#f0f0f0')}
                          onMouseLeave={(e) => canEdit && !row.isEmpty && (e.target.style.backgroundColor = 'transparent')}
                        >
                          {row.isEmpty ? "" : (row.comment || "")}
                        </span>
                      )}
                    </td>
                    <td style={{ border: '1px solid #ddd', padding: '6px', textAlign: 'right', fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {row.isEmpty ? "" : (row.activityPrice ? `${Math.round(row.activityPrice)}€` : "")}
                    </td>
                    <td style={{ border: '1px solid #ddd', padding: '6px', textAlign: 'right', fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {row.isEmpty ? "" : (row.transferTotal ? `${Math.round(row.transferTotal)}€` : "")}
                    </td>
                    <td style={{ border: '1px solid #ddd', padding: '6px', fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {row.isEmpty ? "" : (row.paymentMethod || "")}
                    </td>
                    <td style={{ border: '1px solid #ddd', padding: '6px', fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {row.isEmpty ? "" : (row.sellerName || "")}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination en bas */}
      {pages.length > 0 && (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <button
            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
            disabled={currentPage === 1}
            className={`px-3 py-2 text-sm rounded-lg border transition-colors ${
              currentPage === 1
                ? "bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed"
                : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
            }`}
          >
            ← Précédent
          </button>
          
          {pages.map((page, index) => {
            const pageNum = index + 1;
            // Afficher la première page, la dernière, la page courante, et quelques pages autour
            const shouldShow = 
              pageNum === 1 || 
              pageNum === pages.length || 
              (pageNum >= currentPage - 2 && pageNum <= currentPage + 2);
            
            if (!shouldShow) {
              // Afficher des points de suspension
              if (pageNum === currentPage - 3 || pageNum === currentPage + 3) {
                return <span key={`dots-${pageNum}`} className="px-2 text-gray-400">...</span>;
              }
              return null;
            }
            
            return (
              <button
                key={page.page}
                onClick={() => setCurrentPage(pageNum)}
                className={`px-4 py-2 text-sm rounded-lg border transition-colors ${
                  currentPage === pageNum
                    ? "bg-blue-600 text-white border-blue-600 font-semibold"
                    : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                }`}
              >
                {pageNum}
              </button>
            );
          })}
          
          <button
            onClick={() => setCurrentPage(prev => Math.min(pages.length, prev + 1))}
            disabled={currentPage === pages.length}
            className={`px-3 py-2 text-sm rounded-lg border transition-colors ${
              currentPage === pages.length
                ? "bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed"
                : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
            }`}
          >
            Suivant →
          </button>
        </div>
      )}

      {/* Info sur la plage de tickets de la page courante */}
      {pages.length > 0 && currentPageData.startTicket > 0 && (
        <div className="mt-4 text-center text-xs text-gray-500">
          Page {currentPage} : Tickets {currentPageData.startTicket} à {currentPageData.endTicket} (50 lignes)
        </div>
      )}
    </>
  );
}
