import { useState, useMemo } from "react";
import { calculateCardPrice, cleanPhoneNumber, exportTicketsToCSV } from "../utils";
import { PrimaryBtn, NumberInput } from "../components/ui";
import { toast } from "../utils/toast.js";

export function TicketPage({ quotes }) {
  const [minTicket, setMinTicket] = useState("");
  const [maxTicket, setMaxTicket] = useState("");
  const [showModifiedOrCancelled, setShowModifiedOrCancelled] = useState(false);
  
  // Extraire tous les items avec tickets renseignés depuis les devis complets
  const allTicketRows = useMemo(() => {
    const rows = [];
    
    quotes.forEach((quote) => {
      // Vérifier que tous les tickets sont renseignés pour ce devis
      const allTicketsFilled = quote.items?.every((item) => item.ticketNumber && item.ticketNumber.trim());
      
      if (allTicketsFilled && quote.items) {
        // Pour chaque item du devis, créer une ligne dans le tableau
        quote.items.forEach((item) => {
          
          if (item.ticketNumber && item.ticketNumber.trim()) {
            // Calculer le prix du transfert
            let transferTotal = 0;
            if (item.transferSurchargePerAdult) {
              // Pour Buggy + Show et Buggy Safari Matin, utiliser buggySimple + buggyFamily
              if (item.activityName?.toLowerCase().includes("buggy")) {
                const totalBuggys = (Number(item.buggySimple || 0) + Number(item.buggyFamily || 0));
                transferTotal = item.transferSurchargePerAdult * totalBuggys;
              } else {
                // Pour les autres activités, utiliser adults
                transferTotal = item.transferSurchargePerAdult * (Number(item.adults || 0));
              }
            }
            
            // Calculer le prix de l'activité : lineTotal inclut activité + transfert + extras
            // Prix activité = lineTotal - transferTotal (les extras font partie du prix de l'activité)
            const activityPrice = Math.max(0, (item.lineTotal || 0) - transferTotal);
            
            // Méthode de paiement : afficher "Cash" ou "Stripe" selon ce qui a été sélectionné
            const paymentMethodDisplay = (item.paymentMethod === "cash" || item.paymentMethod === "stripe") 
              ? item.paymentMethod.charAt(0).toUpperCase() + item.paymentMethod.slice(1) // Capitaliser la première lettre
              : "";
            
            const isModified = item.modifications && item.modifications.length > 0 && item.modifications.some(m => m.type === "modified");
            const isCancelled = item.isCancelled || false;
            
            rows.push({
              ticket: item.ticketNumber || "",
              date: item.date || "",
              clientName: quote.client?.name || "",
              clientPhone: cleanPhoneNumber(quote.client?.phone || ""), // Nettoyer le numéro pour l'affichage
              hotel: quote.client?.hotel || "",
              room: quote.client?.room || "",
              adults: item.adults || 0,
              children: item.children || 0,
              babies: item.babies || 0,
              activityName: item.activityName || "",
              pickupTime: item.pickupTime || "",
              comment: "", // Colonne commentaire vide pour l'instant
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
    
    // Trier par numéro de ticket
    return rows.sort((a, b) => {
      return (a.ticket || "").localeCompare(b.ticket || "");
    });
  }, [quotes]);

  // Filtrer les tickets selon la plage sélectionnée et le filtre modifié/annulé
  const ticketRows = useMemo(() => {
    let filtered = allTicketRows;
    
    // Filtre modifié/annulé
    if (showModifiedOrCancelled) {
      filtered = filtered.filter((row) => row.isModified || row.isCancelled);
    } else {
      // Exclure les annulées quand le filtre n'est pas actif
      filtered = filtered.filter((row) => !row.isCancelled);
    }
    
    // Filtre par plage de tickets
    if (minTicket || maxTicket) {
      filtered = filtered.filter((row) => {
        const ticketNum = parseInt(row.ticket.replace(/\D/g, ""), 10) || 0;
        const min = parseInt(minTicket.replace(/\D/g, ""), 10) || 0;
        const max = parseInt(maxTicket.replace(/\D/g, ""), 10) || Infinity;
        
        if (minTicket && maxTicket) {
          return ticketNum >= min && ticketNum <= max;
        } else if (minTicket) {
          return ticketNum >= min;
        } else if (maxTicket) {
          return ticketNum <= max;
        }
        return true;
      });
    }
    
    return filtered;
  }, [allTicketRows, minTicket, maxTicket, showModifiedOrCancelled]);

  return (
    <>
      {/* Barre de filtrage par plage de tickets */}
      <div className="bg-white/90 rounded-2xl border border-blue-100/60 p-4 shadow-sm mb-4">
        <div className="flex flex-col md:flex-row gap-4 items-end">
          {/* Bouton pour filtrer les modifiés/annulés */}
          <button
            onClick={() => setShowModifiedOrCancelled(!showModifiedOrCancelled)}
            className={`px-4 py-2 text-sm rounded-xl border transition-colors ${
              showModifiedOrCancelled
                ? "bg-amber-100 text-amber-700 border-amber-300 hover:bg-amber-200"
                : "bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100"
            }`}
          >
            {showModifiedOrCancelled ? "✅ Modifiés/Annulés" : "🔄 Modifiés/Annulés"}
          </button>
          <div className="flex-1 grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-gray-500 mb-1">Ticket minimum</p>
              <NumberInput
                placeholder="Ex: 164500"
                value={minTicket}
                onChange={(e) => setMinTicket(e.target.value)}
              />
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">Ticket maximum</p>
              <NumberInput
                placeholder="Ex: 164550"
                value={maxTicket}
                onChange={(e) => setMaxTicket(e.target.value)}
              />
            </div>
          </div>
          <div className="flex gap-2">
            {(minTicket || maxTicket) && (
              <button
                onClick={() => {
                  setMinTicket("");
                  setMaxTicket("");
                }}
                className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-xl border border-gray-200 hover:bg-gray-200 transition-colors"
              >
                Réinitialiser
              </button>
            )}
            <PrimaryBtn
              onClick={() => {
                exportTicketsToCSV(ticketRows);
                toast.success("Export Excel des tickets généré avec succès !");
              }}
              disabled={ticketRows.length === 0}
            >
              📊 Exporter Excel
            </PrimaryBtn>
          </div>
        </div>
        {(minTicket || maxTicket) && (
          <p className="text-xs text-gray-500 mt-2">
            Affichage de {ticketRows.length} ticket(s) sur {allTicketRows.length} total
          </p>
        )}
      </div>
      <div className="overflow-x-auto" style={{ paddingLeft: '40px' }}>
        {/* Tableau style Excel pour faciliter le copier-coller */}
        <table className="w-full border-collapse bg-white" style={{ border: '1px solid #ddd', position: 'relative' }}>
            <thead>
              <tr style={{ backgroundColor: '#f0f0f0', borderBottom: '2px solid #333' }}>
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
            {ticketRows.length === 0 ? (
              <tr>
                <td colSpan="12" style={{ padding: '16px', textAlign: 'center', color: '#666', fontSize: '14px' }}>
                  Aucun ticket disponible. Les tickets apparaîtront automatiquement lorsque tous les numéros de ticket d'un devis seront renseignés.
                </td>
              </tr>
            ) : (
              ticketRows.map((row) => {
                // Clé unique basée sur ticket + date + client pour éviter les re-renders inutiles
                const uniqueKey = `${row.ticket}-${row.date}-${row.clientPhone || ''}`;
                return (
                <tr
                  key={uniqueKey}
                  style={{ 
                    borderBottom: '1px solid #ddd', 
                    position: 'relative',
                    backgroundColor: row.isCancelled ? '#fee2e2' : 'transparent',
                    opacity: row.isCancelled ? 0.6 : 1
                  }}
                >
                  {(row.isModified || row.isCancelled) && (
                    <div style={{
                      position: 'absolute',
                      left: '-35px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      fontSize: '16px',
                      width: '30px',
                      textAlign: 'center',
                      userSelect: 'none',
                      pointerEvents: 'none',
                      zIndex: 10
                    }}>
                      {row.isCancelled ? '❌' : '🔄'}
                    </div>
                  )}
                  <td style={{ border: '1px solid #ddd', padding: '8px', fontSize: '13px' }}>
                    {row.ticket}
                  </td>
                  <td style={{ border: '1px solid #ddd', padding: '8px', fontSize: '13px' }}>
                    {row.date ? new Date(row.date + "T12:00:00").toLocaleDateString("fr-FR") : ""}
                  </td>
                  <td style={{ border: '1px solid #ddd', padding: '8px', fontSize: '13px' }}>
                    {row.clientName || ""}{row.clientName && row.clientPhone ? " " : ""}{row.clientPhone ? `+${row.clientPhone}` : ""}
                  </td>
                  <td style={{ border: '1px solid #ddd', padding: '8px', fontSize: '13px' }}>
                    {row.hotel || ""}
                  </td>
                  <td style={{ border: '1px solid #ddd', padding: '8px', fontSize: '13px' }}>
                    {row.room || ""}
                  </td>
                  <td style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'center', fontSize: '13px' }}>
                    {row.adults || 0}
                  </td>
                  <td style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'center', fontSize: '13px' }}>
                    {row.children || 0}
                  </td>
                  <td style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'center', fontSize: '13px' }}>
                    {row.babies || 0}
                  </td>
                  <td style={{ border: '1px solid #ddd', padding: '8px', fontSize: '13px' }}>
                    {row.activityName || ""}
                  </td>
                  <td style={{ border: '1px solid #ddd', padding: '8px', fontSize: '13px' }}>
                    {row.pickupTime || ""}
                  </td>
                  <td style={{ border: '1px solid #ddd', padding: '8px', fontSize: '13px' }}>
                    {row.comment || ""}
                  </td>
                  <td style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'right', fontSize: '13px' }}>
                    {row.activityPrice ? `${Math.round(row.activityPrice)}€` : ""}
                  </td>
                  <td style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'right', fontSize: '13px' }}>
                    {row.transferTotal ? `${Math.round(row.transferTotal)}€` : ""}
                  </td>
                  <td style={{ border: '1px solid #ddd', padding: '8px', fontSize: '13px' }}>
                    {row.paymentMethod || ""}
                  </td>
                  <td style={{ border: '1px solid #ddd', padding: '8px', fontSize: '13px' }}>
                    {row.sellerName || ""}
                  </td>
                </tr>
                );
              })
            )}
          </tbody>
          </table>
        </div>
      </div>
      
      {ticketRows.length > 0 && (
        <div className="mt-4 text-xs text-gray-500 text-center">
          Total : {ticketRows.length} ticket(s)
        </div>
      )}
    </>
  );
}
