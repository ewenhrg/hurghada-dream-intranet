import { useState, useMemo } from "react";
import { GhostBtn, PrimaryBtn, TextInput } from "../components/ui";
import { toast } from "../utils/toast.js";
import { cleanPhoneNumber } from "../utils";

export function PickUpPage({ quotes, activities }) {
  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().slice(0, 10)
  );

  // Filtrer les devis pour le jour sélectionné qui ont tous leurs tickets remplis
  const todaysPickups = useMemo(() => {
    return quotes.filter((quote) => {
      // Vérifier que tous les tickets sont renseignés
      const allTicketsFilled = quote.items?.every(
        (item) => item.ticketNumber && item.ticketNumber.trim()
      );

      if (!allTicketsFilled) return false;

      // Vérifier qu'au moins un item est pour la date sélectionnée
      const hasItemForDate = quote.items?.some(
        (item) => item.date === selectedDate
      );

      return hasItemForDate;
    });
  }, [quotes, selectedDate]);

  // Groupement par hôtel et heure de pickup
  const groupedPickups = useMemo(() => {
    const grouped = {};

    todaysPickups.forEach((quote) => {
      quote.items?.forEach((item) => {
        if (item.date === selectedDate && item.pickupTime) {
          const key = `${quote.client?.hotel || "Sans hotel"}_${item.pickupTime}`;

          if (!grouped[key]) {
            grouped[key] = {
              hotel: quote.client?.hotel || "Sans hôtel",
              pickupTime: item.pickupTime,
              clients: [],
            };
          }

          // Vérifier si le client n'est pas déjà dans la liste
          const exists = grouped[key].clients.some(
            (c) =>
              c.name === quote.client?.name &&
              c.phone === quote.client?.phone &&
              c.activityName === item.activityName
          );

          if (!exists) {
            grouped[key].clients.push({
              name: quote.client?.name || "",
              phone: quote.client?.phone || "",
              ticket: item.ticketNumber || "",
              activityName: item.activityName || "",
            });
          }
        }
      });
    });

    return Object.values(grouped);
  }, [todaysPickups, selectedDate]);

  // Fonction pour générer le message WhatsApp
  function generateMessage(group) {
    const { hotel, pickupTime, clients } = group;

    let message = `🏨 *${hotel}* - Départ ${pickupTime}\n\n`;
    message += `Bonjour,\n\n`;
    message += `Ceci est un rappel pour demain :\n\n`;

    clients.forEach((client) => {
      message += `• ${client.activityName}`;
      if (client.name) {
        message += ` - ${client.name}`;
      }
      if (client.ticket) {
        message += ` (Ticket: ${client.ticket})`;
      }
      message += `\n`;
    });

    message += `\n⚠️ *Merci de vous tenir devant l'hôtel à ${pickupTime} demain pour que le transfert puisse vous récupérer.*\n\n`;
    message += `En cas de retard ou d'annulation, merci de nous contacter rapidement.\n\n`;
    message += `Bon séjour ! 🏖️`;

    return message;
  }

  // Fonction pour copier le message et ouvrir WhatsApp
  function handleSendMessage(group) {
    const message = generateMessage(group);

    // Copier dans le presse-papier
    navigator.clipboard.writeText(message).then(() => {
      toast.success("Message copié dans le presse-papier !");

      // Ouvrir WhatsApp Web avec le message
      const whatsappUrl = `https://web.whatsapp.com/send?text=${encodeURIComponent(
        message
      )}`;
      window.open(whatsappUrl, "_blank");
    });
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
      </div>

      {/* Liste des pickups groupés */}
      {groupedPickups.length === 0 ? (
        <div className="bg-white/90 rounded-2xl border border-blue-100/60 p-8 shadow-md text-center">
          <p className="text-gray-500">
            Aucun pickup prévu pour cette date.
          </p>
          <p className="text-xs text-gray-400 mt-2">
            Les pickups n'apparaissent que pour les devis avec tous les tickets
            renseignés.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {groupedPickups.map((group, idx) => (
            <div
              key={idx}
              className="bg-white/90 rounded-2xl border border-blue-100/60 p-4 shadow-md"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-lg font-semibold text-gray-800">
                    🏨 {group.hotel}
                  </h3>
                  <p className="text-sm text-blue-600">⏰ {group.pickupTime}</p>
                </div>
                <PrimaryBtn onClick={() => handleSendMessage(group)}>
                  💬 Envoyer message
                </PrimaryBtn>
              </div>

              <div className="space-y-2">
                {group.clients.map((client, clientIdx) => (
                  <div
                    key={clientIdx}
                    className="bg-blue-50/50 rounded-lg p-3 border border-blue-100"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="font-medium text-gray-800">
                          {client.activityName || "—"}
                        </p>
                        {client.name && (
                          <p className="text-sm text-gray-600">
                            👤 {client.name}
                          </p>
                        )}
                        {client.phone && (
                          <p className="text-sm text-blue-600">
                            📱 +{cleanPhoneNumber(client.phone)}
                          </p>
                        )}
                      </div>
                      {client.ticket && (
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded font-mono">
                          🎫 {client.ticket}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Aperçu du message */}
              <div className="mt-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
                <p className="text-xs font-semibold text-gray-600 mb-2">
                  Aperçu du message :
                </p>
                <pre className="text-xs text-gray-700 whitespace-pre-wrap font-sans">
                  {generateMessage(group)}
                </pre>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Statistiques rapides */}
      <div className="bg-gradient-to-r from-blue-50 to-blue-100 rounded-2xl border border-blue-200 p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center">
            <p className="text-2xl font-bold text-blue-600">
              {groupedPickups.length}
            </p>
            <p className="text-xs text-gray-600">Lieux de pickup</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-green-600">
              {todaysPickups.length}
            </p>
            <p className="text-xs text-gray-600">Devis payés</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-purple-600">
              {todaysPickups.reduce(
                (sum, q) => sum + (q.items?.length || 0),
                0
              )}
            </p>
            <p className="text-xs text-gray-600">Activités totales</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-amber-600">
              {groupedPickups.reduce(
                (sum, g) => sum + g.clients.length,
                0
              )}
            </p>
            <p className="text-xs text-gray-600">Clients concernés</p>
          </div>
        </div>
      </div>
    </div>
  );
}

