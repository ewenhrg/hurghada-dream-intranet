import { useMemo } from "react";

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
            rows.push({
              ticket: item.ticketNumber || "",
              date: item.date || "",
              clientName: quote.client?.name || "",
              clientPhone: quote.client?.phone || "",
              hotel: quote.client?.hotel || "",
              room: quote.client?.room || "",
              adults: item.adults || 0,
              children: item.children || 0,
              babies: item.babies || 0,
              activityName: item.activityName || "",
              pickupTime: item.pickupTime || "",
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
      <div className="overflow-x-auto">
        <table className="w-full border-collapse bg-white rounded-lg shadow-sm overflow-hidden">
          <thead>
            <tr className="bg-blue-50 border-b-2 border-blue-200">
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider border-r border-blue-200">
                Ticket
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider border-r border-blue-200">
                Date
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider border-r border-blue-200">
                Prénom + Téléphone
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider border-r border-blue-200">
                Hôtel
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider border-r border-blue-200">
                Chambre
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider border-r border-blue-200">
                Adultes
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider border-r border-blue-200">
                Enfants
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider border-r border-blue-200">
                Bébés
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider border-r border-blue-200">
                Activité
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                Heure prise en charge
              </th>
            </tr>
          </thead>
          <tbody>
            {ticketRows.length === 0 ? (
              <tr>
                <td colSpan="10" className="px-4 py-8 text-center text-sm text-gray-500">
                  Aucun ticket disponible. Les tickets apparaîtront automatiquement lorsque tous les numéros de ticket d'un devis seront renseignés.
                </td>
              </tr>
            ) : (
              ticketRows.map((row, idx) => (
                <tr
                  key={`${row.ticket}-${row.date}-${idx}`}
                  className="border-b border-gray-200 hover:bg-blue-50/30 transition-colors"
                >
                  <td className="px-4 py-3 text-sm text-gray-900 font-medium border-r border-gray-200">
                    {row.ticket}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700 border-r border-gray-200">
                    {row.date ? new Date(row.date + "T12:00:00").toLocaleDateString("fr-FR") : "-"}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700 border-r border-gray-200">
                    <div>
                      <div className="font-medium">{row.clientName || "-"}</div>
                      <div className="text-xs text-gray-500">{row.clientPhone || "-"}</div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700 border-r border-gray-200">
                    {row.hotel || "-"}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700 border-r border-gray-200">
                    {row.room || "-"}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700 text-center border-r border-gray-200">
                    {row.adults || 0}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700 text-center border-r border-gray-200">
                    {row.children || 0}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700 text-center border-r border-gray-200">
                    {row.babies || 0}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700 border-r border-gray-200">
                    {row.activityName || "-"}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">
                    {row.pickupTime || "-"}
                  </td>
                </tr>
              ))
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

