import { useMemo } from "react";
import { calculateCardPrice, cleanPhoneNumber, exportTicketsToCSV } from "../utils";
import { PrimaryBtn } from "../components/ui";
import { toast } from "../utils/toast.js";

export function TicketPage({ quotes }) {
  // Extraire tous les items avec tickets renseignés depuis les devis complets
  const ticketRows = useMemo(() => {
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
            });
          }
        });
      }
    });
    
    // Trier par date puis par numéro de ticket
    return rows.sort((a, b) => {
      const dateCompare = new Date(a.date) - new Date(b.date);
      if (dateCompare !== 0) return dateCompare;
      return (a.ticket || "").localeCompare(b.ticket || "");
    });
  }, [quotes]);

  return (
    <>
      <div className="flex justify-end mb-4">
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
      <div className="overflow-x-auto">
        {/* Tableau style Excel pour faciliter le copier-coller */}
        <table className="w-full border-collapse bg-white" style={{ border: '1px solid #ddd' }}>
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
                <td colSpan="15" style={{ padding: '16px', textAlign: 'center', color: '#666', fontSize: '14px' }}>
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
                  style={{ borderBottom: '1px solid #ddd' }}
                >
                  <td style={{ border: '1px solid #ddd', padding: '8px', fontSize: '13px' }}>
                    {row.ticket}
                  </td>
                  <td style={{ border: '1px solid #ddd', padding: '8px', fontSize: '13px' }}>
                    {row.date ? new Date(row.date + "T12:00:00").toLocaleDateString("fr-FR") : ""}
                  </td>
                  <td style={{ border: '1px solid #ddd', padding: '8px', fontSize: '13px' }}>
                    {row.clientName || ""}{row.clientName && row.clientPhone ? " " : ""}{row.clientPhone || ""}
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
      
      {ticketRows.length > 0 && (
        <div className="mt-4 text-xs text-gray-500 text-center">
          Total : {ticketRows.length} ticket(s)
        </div>
      )}
    </>
  );
}
