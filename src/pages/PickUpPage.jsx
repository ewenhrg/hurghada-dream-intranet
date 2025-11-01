import { useState, useMemo } from "react";
import { TextInput } from "../components/ui";
import { toast } from "../utils/toast.js";
import { cleanPhoneNumber } from "../utils";

export function PickUpPage({ quotes, setQuotes }) {
  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().slice(0, 10)
  );

  // Extraire tous les tickets pour la date sélectionnée
  const pickupRows = useMemo(() => {
    const rows = [];

    quotes.forEach((quote) => {
      // Vérifier que tous les tickets sont renseignés pour ce devis
      const allTicketsFilled = quote.items?.every(
        (item) => item.ticketNumber && item.ticketNumber.trim()
      );

      if (allTicketsFilled && quote.items) {
        // Pour chaque item du devis, créer une ligne si c'est pour la date sélectionnée
        quote.items.forEach((item) => {
          if (item.date === selectedDate && item.ticketNumber && item.ticketNumber.trim()) {
            rows.push({
              quoteId: quote.id,
              itemIndex: quote.items.indexOf(item),
              ticket: item.ticketNumber || "",
              date: item.date || "",
              phone: quote.client?.phone || "",
              hotel: quote.client?.hotel || "",
              pickupTime: item.pickupTime || "",
              activityName: item.activityName || "",
              clientName: quote.client?.name || "",
            });
          }
        });
      }
    });

    // Trier par hôtel, puis par heure de pickup, puis par ticket
    return rows.sort((a, b) => {
      const hotelCompare = (a.hotel || "").localeCompare(b.hotel || "");
      if (hotelCompare !== 0) return hotelCompare;
      
      const timeCompare = (a.pickupTime || "").localeCompare(b.pickupTime || "");
      if (timeCompare !== 0) return timeCompare;
      
      return (a.ticket || "").localeCompare(b.ticket || "");
    });
  }, [quotes, selectedDate]);

  // Fonction pour mettre à jour l'heure de pickup
  function handleUpdatePickupTime(quoteId, itemIndex, newTime) {
    setQuotes((prev) => {
      const updated = prev.map((quote) => {
        if (quote.id === quoteId) {
          const newItems = [...quote.items];
          newItems[itemIndex] = {
            ...newItems[itemIndex],
            pickupTime: newTime,
          };
          return { ...quote, items: newItems };
        }
        return quote;
      });
      return updated;
    });
    toast.success("Heure de pickup mise à jour !");
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Sélecteur de date */}
      <div className="bg-white/90 rounded-2xl border border-blue-100/60 p-4 shadow-md">
        <label className="block text-sm font-semibold text-gray-800 mb-2">
          📅 Date de pickup
        </label>
        <TextInput
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="max-w-xs"
        />
        {pickupRows.length > 0 && (
          <p className="text-xs text-blue-600 mt-2">
            {pickupRows.length} activité(s) trouvée(s) pour cette date
          </p>
        )}
      </div>

      {/* Tableau des pickups */}
      {pickupRows.length === 0 ? (
        <div className="bg-white/90 rounded-2xl border border-blue-100/60 p-8 shadow-md text-center">
          <p className="text-gray-500">Aucune activité trouvée pour cette date.</p>
          <p className="text-xs text-gray-400 mt-2">
            Les activités n'apparaissent que pour les devis avec tous les tickets renseignés.
          </p>
        </div>
      ) : (
        <div className="bg-white/90 rounded-2xl border border-blue-100/60 overflow-hidden shadow-md">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-blue-50/70 text-gray-700 text-xs">
                <tr>
                  <th className="px-4 py-3 text-left">Numéro ticket</th>
                  <th className="px-4 py-3 text-left">Date</th>
                  <th className="px-4 py-3 text-left">Téléphone</th>
                  <th className="px-4 py-3 text-left">Hôtel</th>
                  <th className="px-4 py-3 text-left">Heure prise en charge</th>
                  <th className="px-4 py-3 text-left">Activité</th>
                </tr>
              </thead>
              <tbody>
                {pickupRows.map((row, idx) => (
                  <tr key={idx} className="border-t hover:bg-blue-50/30 transition-colors">
                    <td className="px-4 py-3 font-mono text-green-700 font-medium">
                      🎫 {row.ticket}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {row.date ? new Date(row.date + "T12:00:00").toLocaleDateString("fr-FR") : ""}
                    </td>
                    <td className="px-4 py-3 font-mono text-blue-700">
                      {row.phone ? `+${cleanPhoneNumber(row.phone)}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-700 font-medium">
                      {row.hotel || "—"}
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="text"
                        value={row.pickupTime}
                        onChange={(e) => handleUpdatePickupTime(row.quoteId, row.itemIndex, e.target.value)}
                        placeholder="Ex: 07:30"
                        className="w-full rounded-lg border border-blue-200/50 bg-white px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                      />
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {row.activityName || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
