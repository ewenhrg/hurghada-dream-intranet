import { useState, useMemo, useEffect } from "react";
import { calculateCardPrice, cleanPhoneNumber, exportTicketsToCSV } from "../utils";
import { PrimaryBtn, TextInput } from "../components/ui";
import { toast } from "../utils/toast.js";
import { useDebounce } from "../hooks/useDebounce";

export function TicketPage({ quotes }) {
  const [currentPage, setCurrentPage] = useState(1);
  const [showModifiedOrCancelled, setShowModifiedOrCancelled] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearchQuery = useDebounce(searchQuery, 300);
  
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
              comment: "",
              activityPrice: activityPrice,
              transferTotal: transferTotal,
              paymentMethod: paymentMethodDisplay,
              sellerName: quote.createdByName || "",
              isModified: isModified,
              isCancelled: isCancelled,
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
    
    // Filtre par recherche (numéro de ticket ou téléphone)
    if (debouncedSearchQuery.trim()) {
      const searchTerm = debouncedSearchQuery.replace(/\D/g, ""); // Extraire uniquement les chiffres
      filtered = filtered.filter((row) => {
        // Rechercher dans le numéro de ticket
        const ticketNum = row.ticket.replace(/\D/g, "");
        const ticketMatch = ticketNum.includes(searchTerm);
        
        // Rechercher dans le numéro de téléphone
        const phoneNum = row.clientPhone.replace(/\D/g, "");
        const phoneMatch = phoneNum.includes(searchTerm);
        
        return ticketMatch || phoneMatch;
      });
    }
    
    return filtered;
  }, [allTicketRows, showModifiedOrCancelled, debouncedSearchQuery]);

  // Définir 10 pages fixes avec des tranches de 50 tickets chacune
  const pages = useMemo(() => {
    const TOTAL_PAGES = 10;
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

  return (
    <>
      {/* Barre de recherche et filtres */}
      <div className="bg-white/90 rounded-2xl border border-blue-100/60 p-4 shadow-sm mb-4">
        <div className="space-y-4">
          {/* Barre de recherche */}
          <div>
            <p className="text-xs text-gray-500 mb-1">Rechercher par numéro de ticket ou téléphone</p>
            <TextInput
              placeholder="Ex: 163400 ou +20123456789"
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
                  : "bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100"
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
      <div className="overflow-x-auto">
        <table className="w-full border-collapse bg-white" style={{ border: '1px solid #ddd' }}>
          <thead>
            <tr style={{ backgroundColor: '#f0f0f0', borderBottom: '2px solid #333' }}>
              <th style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'center', fontWeight: 'bold', fontSize: '12px', width: '30px' }}>
                {/* Colonne pour les logos modifiés/annulés */}
              </th>
              <th style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'left', fontWeight: 'bold', fontSize: '12px' }}>
                Ticket
              </th>
              <th style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'left', fontWeight: 'bold', fontSize: '12px' }}>
                Date
              </th>
              <th style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'left', fontWeight: 'bold', fontSize: '12px' }}>
                Prénom + Téléphone
              </th>
              <th style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'left', fontWeight: 'bold', fontSize: '12px' }}>
                Hôtel
              </th>
              <th style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'left', fontWeight: 'bold', fontSize: '12px' }}>
                Chambre
              </th>
              <th style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'center', fontWeight: 'bold', fontSize: '12px' }}>
                Adultes
              </th>
              <th style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'center', fontWeight: 'bold', fontSize: '12px' }}>
                Enfants
              </th>
              <th style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'center', fontWeight: 'bold', fontSize: '12px' }}>
                Bébés
              </th>
              <th style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'left', fontWeight: 'bold', fontSize: '12px' }}>
                Activité
              </th>
              <th style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'left', fontWeight: 'bold', fontSize: '12px' }}>
                Heure prise en charge
              </th>
              <th style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'left', fontWeight: 'bold', fontSize: '12px' }}>
                Commentaire
              </th>
              <th style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'right', fontWeight: 'bold', fontSize: '12px' }}>
                Prix activité
              </th>
              <th style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'right', fontWeight: 'bold', fontSize: '12px' }}>
                Prix transfert
              </th>
              <th style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'left', fontWeight: 'bold', fontSize: '12px' }}>
                Méthode de paiement
              </th>
              <th style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'left', fontWeight: 'bold', fontSize: '12px' }}>
                Vendeur
              </th>
            </tr>
          </thead>
          <tbody>
            {currentPageData.rows.length === 0 ? (
              <tr>
                <td colSpan="16" style={{ padding: '16px', textAlign: 'center', color: '#666', fontSize: '14px' }}>
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
                        padding: '8px', 
                        textAlign: 'center',
                        fontSize: '16px',
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
                    <td style={{ border: '1px solid #ddd', padding: '8px', fontSize: '13px' }}>
                      {row.isEmpty ? row.ticketNum : row.ticket}
                    </td>
                    <td style={{ border: '1px solid #ddd', padding: '8px', fontSize: '13px' }}>
                      {row.isEmpty ? "" : (row.date ? new Date(row.date + "T12:00:00").toLocaleDateString("fr-FR") : "")}
                    </td>
                    <td style={{ border: '1px solid #ddd', padding: '8px', fontSize: '13px' }}>
                      {row.isEmpty ? "" : (row.clientName || "") + (row.clientName && row.clientPhone ? " " : "") + (row.clientPhone ? `+${row.clientPhone}` : "")}
                    </td>
                    <td style={{ border: '1px solid #ddd', padding: '8px', fontSize: '13px' }}>
                      {row.isEmpty ? "" : (row.hotel || "")}
                    </td>
                    <td style={{ border: '1px solid #ddd', padding: '8px', fontSize: '13px' }}>
                      {row.isEmpty ? "" : (row.room || "")}
                    </td>
                    <td style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'center', fontSize: '13px' }}>
                      {row.isEmpty ? "" : (row.adults || 0)}
                    </td>
                    <td style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'center', fontSize: '13px' }}>
                      {row.isEmpty ? "" : (row.children || 0)}
                    </td>
                    <td style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'center', fontSize: '13px' }}>
                      {row.isEmpty ? "" : (row.babies || 0)}
                    </td>
                    <td style={{ border: '1px solid #ddd', padding: '8px', fontSize: '13px' }}>
                      {row.isEmpty ? "" : (row.activityName || "")}
                    </td>
                    <td style={{ border: '1px solid #ddd', padding: '8px', fontSize: '13px' }}>
                      {row.isEmpty ? "" : (row.pickupTime || "")}
                    </td>
                    <td style={{ border: '1px solid #ddd', padding: '8px', fontSize: '13px' }}>
                      {row.isEmpty ? "" : (row.comment || "")}
                    </td>
                    <td style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'right', fontSize: '13px' }}>
                      {row.isEmpty ? "" : (row.activityPrice ? `${Math.round(row.activityPrice)}€` : "")}
                    </td>
                    <td style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'right', fontSize: '13px' }}>
                      {row.isEmpty ? "" : (row.transferTotal ? `${Math.round(row.transferTotal)}€` : "")}
                    </td>
                    <td style={{ border: '1px solid #ddd', padding: '8px', fontSize: '13px' }}>
                      {row.isEmpty ? "" : (row.paymentMethod || "")}
                    </td>
                    <td style={{ border: '1px solid #ddd', padding: '8px', fontSize: '13px' }}>
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
