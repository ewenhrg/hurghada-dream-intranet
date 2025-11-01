import { useState, useMemo } from "react";
import { TextInput, PrimaryBtn, GhostBtn } from "../components/ui";
import { toast } from "../utils/toast.js";
import { cleanPhoneNumber } from "../utils";

export function PickUpPage({ quotes, setQuotes }) {
  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [sendProgress, setSendProgress] = useState(null);

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

    // Trier par activité, puis par heure de pickup, puis par ticket
    return rows.sort((a, b) => {
      const activityCompare = (a.activityName || "").localeCompare(b.activityName || "");
      if (activityCompare !== 0) return activityCompare;
      
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

  // Fonction pour générer le message WhatsApp pour un client
  function generateWhatsAppMessage(row) {
    const dateStr = row.date ? new Date(row.date + "T12:00:00").toLocaleDateString("fr-FR") : "";
    
    let message = `Bonjour ${row.clientName || ""},\n\n`;
    message += `Ceci est un rappel pour ${dateStr} :\n\n`;
    message += `🏃 *${row.activityName}*\n`;
    message += `🎫 Ticket: ${row.ticket}\n`;
    message += `🏨 Hôtel: ${row.hotel}\n`;
    message += `⏰ Heure de prise en charge: *${row.pickupTime}*\n\n`;
    message += `⚠️ *Merci de vous tenir devant l'hôtel à ${row.pickupTime} pour que le transfert puisse vous récupérer.*\n\n`;
    message += `En cas de retard ou d'annulation, merci de nous contacter rapidement.\n\n`;
    message += `Bon séjour ! 🏖️`;

    return message;
  }

  // Fonction pour envoyer un message WhatsApp à un client
  function handleSendWhatsApp(row, index) {
    const message = generateWhatsAppMessage(row);
    const phone = cleanPhoneNumber(row.phone);
    
    if (!phone) {
      toast.error("Numéro de téléphone manquant !");
      return;
    }

    // Ouvrir WhatsApp avec le message pré-rempli
    const whatsappUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, "_blank");
    
    toast.success(`Ouverture WhatsApp pour ${row.clientName || row.phone}`);
  }

  // Fonction pour envoyer TOUS les messages automatiquement
  async function handleSendAllMessages() {
    if (pickupRows.length === 0) {
      toast.warning("Aucun message à envoyer !");
      return;
    }

    // Vérifier que tous les numéros sont remplis
    const rowsWithoutPhone = pickupRows.filter(row => !row.phone || !cleanPhoneNumber(row.phone));
    if (rowsWithoutPhone.length > 0) {
      toast.error(`${rowsWithoutPhone.length} ligne(s) sans numéro de téléphone !`);
      return;
    }

    // Vérifier que toutes les heures sont remplies
    const rowsWithoutTime = pickupRows.filter(row => !row.pickupTime || !row.pickupTime.trim());
    if (rowsWithoutTime.length > 0) {
      toast.error(`${rowsWithoutTime.length} ligne(s) sans heure de pickup !`);
      return;
    }

    setSendProgress({ current: 0, total: pickupRows.length });

    // Envoyer les messages un par un avec un délai entre chaque
    for (let i = 0; i < pickupRows.length; i++) {
      const row = pickupRows[i];
      const message = generateWhatsAppMessage(row);
      const phone = cleanPhoneNumber(row.phone);
      
      // Ouvrir WhatsApp pour ce client
      const whatsappUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
      window.open(whatsappUrl, `whatsapp_${i}`);
      
      setSendProgress({ current: i + 1, total: pickupRows.length });
      
      // Attendre 5 secondes avant d'ouvrir le message suivant
      if (i < pickupRows.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }

    setSendProgress(null);
    toast.success(`${pickupRows.length} onglets WhatsApp ouverts ! Cliquez sur chaque message pour envoyer.`);
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Sélecteur de date */}
      <div className="bg-white/90 rounded-2xl border border-blue-100/60 p-4 shadow-md">
        <div className="flex items-center justify-between mb-2">
          <label className="block text-sm font-semibold text-gray-800">
            📅 Date de pickup
          </label>
          {pickupRows.length > 0 && (
            <PrimaryBtn 
              onClick={handleSendAllMessages}
              disabled={sendProgress !== null}
              className="text-xs"
            >
              {sendProgress ? `📤 Envoi... ${sendProgress.current}/${sendProgress.total}` : "📤 Envoyer tous les messages"}
            </PrimaryBtn>
          )}
        </div>
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
                  <th className="px-4 py-3 text-left">Activité</th>
                  <th className="px-4 py-3 text-left">Numéro ticket</th>
                  <th className="px-4 py-3 text-left">Date</th>
                  <th className="px-4 py-3 text-left">Téléphone</th>
                  <th className="px-4 py-3 text-left">Hôtel</th>
                  <th className="px-4 py-3 text-left">Heure prise en charge</th>
                  <th className="px-4 py-3 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pickupRows.map((row, idx) => (
                  <tr key={idx} className="border-t hover:bg-blue-50/30 transition-colors">
                    <td className="px-4 py-3 text-gray-700 font-medium">
                      {row.activityName || "—"}
                    </td>
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
                    <td className="px-4 py-3">
                      <GhostBtn
                        onClick={() => handleSendWhatsApp(row, idx)}
                        size="sm"
                      >
                        💬 Envoyer
                      </GhostBtn>
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
