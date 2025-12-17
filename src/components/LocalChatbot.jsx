import { useState, useRef, useEffect } from "react";

export function LocalChatbot({ activities, quotes, clients, hotels, user }) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content: "Bonjour ! 👋 Je suis votre assistant local. Je peux vous aider avec toutes les questions sur les activités, les devis, les clients et bien plus encore. Posez-moi vos questions !",
    },
  ]);
  const [inputValue, setInputValue] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Fonction de recherche dans les activités
  const searchActivities = (query) => {
    const lowerQuery = query.toLowerCase();
    return activities.filter((act) => {
      const name = (act.name || "").toLowerCase();
      const category = (act.category || "").toLowerCase();
      const notes = (act.notes || "").toLowerCase();
      return (
        name.includes(lowerQuery) ||
        category.includes(lowerQuery) ||
        notes.includes(lowerQuery)
      );
    });
  };

  // Fonction de recherche dans les devis
  const searchQuotes = (query) => {
    const lowerQuery = query.toLowerCase();
    return quotes.filter((quote) => {
      const clientName = (quote.client?.name || "").toLowerCase();
      const hotel = (quote.hotel || "").toLowerCase();
      const id = (quote.id || "").toString().toLowerCase();
      return (
        clientName.includes(lowerQuery) ||
        hotel.includes(lowerQuery) ||
        id.includes(lowerQuery)
      );
    });
  };

  // Fonction de recherche dans les clients
  const searchClients = (query) => {
    const lowerQuery = query.toLowerCase();
    const clientNames = new Set();
    quotes.forEach((quote) => {
      if (quote.client?.name) {
        const name = quote.client.name.toLowerCase();
        if (name.includes(lowerQuery)) {
          clientNames.add(quote.client.name);
        }
      }
    });
    return Array.from(clientNames);
  };

  // Fonction principale pour générer une réponse
  const generateResponse = (userMessage) => {
    const lowerMessage = userMessage.toLowerCase();

    // Statistiques générales
    if (
      lowerMessage.includes("statistique") ||
      lowerMessage.includes("nombre") ||
      lowerMessage.includes("combien") ||
      lowerMessage.includes("total")
    ) {
      const totalActivities = activities.length;
      const totalQuotes = quotes.length;
      const paidQuotes = quotes.filter((q) => q.allTicketsFilled).length;
      const pendingQuotes = totalQuotes - paidQuotes;
      const totalRevenue = quotes
        .filter((q) => q.allTicketsFilled)
        .reduce((sum, q) => sum + (q.total || 0), 0);

      return `📊 **Statistiques du site :**

• **Activités** : ${totalActivities} activité${totalActivities > 1 ? "s" : ""}
• **Devis** : ${totalQuotes} devis au total
  - ✅ Payés : ${paidQuotes}
  - ⏳ En attente : ${pendingQuotes}
• **Revenus** : ${totalRevenue.toFixed(2)} ${quotes[0]?.currency || "EUR"}

Que souhaitez-vous savoir d'autre ?`;
    }

    // Recherche d'activités
    if (
      lowerMessage.includes("activité") ||
      lowerMessage.includes("activite") ||
      lowerMessage.includes("excursion")
    ) {
      // Extraire les mots-clés de recherche
      const keywords = lowerMessage
        .replace(/activité|activite|excursion|quelle|quelles|liste|montre|cherche/g, "")
        .trim()
        .split(/\s+/)
        .filter((w) => w.length > 2);

      let results = activities;
      if (keywords.length > 0) {
        results = searchActivities(keywords.join(" "));
      }

      if (results.length === 0) {
        return `❌ Aucune activité trouvée pour "${userMessage}".\n\nEssayez avec d'autres mots-clés ou demandez-moi la liste complète des activités.`;
      }

      let response = `🎯 **${results.length} activité${results.length > 1 ? "s trouvée" : " trouvée"}** :\n\n`;
      results.slice(0, 10).forEach((act, idx) => {
        response += `${idx + 1}. **${act.name}**\n`;
        response += `   📂 Catégorie : ${act.category || "Non définie"}\n`;
        response += `   💰 Prix adulte : ${act.priceAdult || 0} ${act.currency || "EUR"}\n`;
        if (act.priceChild) {
          response += `   👶 Prix enfant : ${act.priceChild} ${act.currency || "EUR"}\n`;
        }
        if (act.notes) {
          response += `   📝 Notes : ${act.notes}\n`;
        }
        response += `\n`;
      });

      if (results.length > 10) {
        response += `\n... et ${results.length - 10} autre${results.length - 10 > 1 ? "s" : ""} activité${results.length - 10 > 1 ? "s" : ""}`;
      }

      return response;
    }

    // Recherche de devis
    if (
      lowerMessage.includes("devis") ||
      lowerMessage.includes("commande") ||
      lowerMessage.includes("réservation") ||
          lowerMessage.includes("reservation")
    ) {
      const keywords = lowerMessage
        .replace(/devis|commande|réservation|reservation|quelle|quelles|liste|montre|cherche/g, "")
        .trim()
        .split(/\s+/)
        .filter((w) => w.length > 2);

      let results = quotes;
      if (keywords.length > 0) {
        results = searchQuotes(keywords.join(" "));
      }

      if (results.length === 0) {
        return `❌ Aucun devis trouvé pour "${userMessage}".\n\nEssayez avec un nom de client ou un numéro de devis.`;
      }

      let response = `📋 **${results.length} devis trouvé${results.length > 1 ? "s" : ""}** :\n\n`;
      results.slice(0, 5).forEach((quote, idx) => {
        response += `${idx + 1}. **Devis #${quote.id || "N/A"}**\n`;
        response += `   👤 Client : ${quote.client?.name || "Non renseigné"}\n`;
        response += `   🏨 Hôtel : ${quote.hotel || "Non renseigné"}\n`;
        response += `   💰 Total : ${quote.total || 0} ${quote.currency || "EUR"}\n`;
        response += `   📅 Date : ${quote.createdAt ? new Date(quote.createdAt).toLocaleDateString("fr-FR") : "Non renseignée"}\n`;
        response += `   ${quote.allTicketsFilled ? "✅ Payé" : "⏳ En attente"}\n`;
        response += `\n`;
      });

      if (results.length > 5) {
        response += `\n... et ${results.length - 5} autre${results.length - 5 > 1 ? "s" : ""} devis`;
      }

      return response;
    }

    // Recherche de clients
    if (
      lowerMessage.includes("client") ||
      lowerMessage.includes("qui") ||
      lowerMessage.includes("nom")
    ) {
      const keywords = lowerMessage
        .replace(/client|qui|nom|quelle|quelles|liste|montre|cherche/g, "")
        .trim()
        .split(/\s+/)
        .filter((w) => w.length > 2);

      let results = [];
      if (keywords.length > 0) {
        results = searchClients(keywords.join(" "));
      } else {
        // Liste tous les clients uniques
        const allClients = new Set();
        quotes.forEach((quote) => {
          if (quote.client?.name) {
            allClients.add(quote.client.name);
          }
        });
        results = Array.from(allClients);
      }

      if (results.length === 0) {
        return `❌ Aucun client trouvé pour "${userMessage}".`;
      }

      let response = `👥 **${results.length} client${results.length > 1 ? "s trouvé" : " trouvé"}** :\n\n`;
      results.slice(0, 10).forEach((clientName, idx) => {
        const clientQuotes = quotes.filter((q) => q.client?.name === clientName);
        response += `${idx + 1}. **${clientName}**\n`;
        response += `   📋 ${clientQuotes.length} devis\n`;
        response += `\n`;
      });

      return response;
    }

    // Questions sur les prix
    if (
      lowerMessage.includes("prix") ||
      lowerMessage.includes("coût") ||
          lowerMessage.includes("cout") ||
      lowerMessage.includes("tarif")
    ) {
      const activityMatch = lowerMessage.match(/(?:prix|coût|cout|tarif)\s+(?:de|du|pour)?\s*(.+)/i);
      if (activityMatch) {
        const activityName = activityMatch[1].trim();
        const foundActivities = searchActivities(activityName);
        
        if (foundActivities.length > 0) {
          const act = foundActivities[0];
          let response = `💰 **Prix pour "${act.name}"** :\n\n`;
          response += `• Adulte : ${act.priceAdult || 0} ${act.currency || "EUR"}\n`;
          if (act.priceChild) {
            response += `• Enfant : ${act.priceChild} ${act.currency || "EUR"}\n`;
          }
          if (act.priceBaby !== undefined && act.priceBaby !== null) {
            response += `• Bébé : ${act.priceBaby} ${act.currency || "EUR"}\n`;
          }
          if (act.notes) {
            response += `\n📝 ${act.notes}`;
          }
          return response;
        }
      }
      return `❌ Je n'ai pas trouvé d'activité correspondante. Pouvez-vous préciser le nom de l'activité ?`;
    }

    // Questions sur les catégories
    if (
      lowerMessage.includes("catégorie") ||
          lowerMessage.includes("categorie") ||
      lowerMessage.includes("type")
    ) {
      const categories = {};
      activities.forEach((act) => {
        const cat = act.category || "Non catégorisée";
        if (!categories[cat]) {
          categories[cat] = [];
        }
        categories[cat].push(act.name);
      });

      let response = `📂 **Catégories d'activités :**\n\n`;
      Object.keys(categories).forEach((cat) => {
        response += `**${cat}** : ${categories[cat].length} activité${categories[cat].length > 1 ? "s" : ""}\n`;
        response += `  ${categories[cat].slice(0, 5).join(", ")}`;
        if (categories[cat].length > 5) {
          response += ` ... (+${categories[cat].length - 5})`;
        }
        response += `\n\n`;
      });

      return response;
    }

    // Aide générale
    if (
      lowerMessage.includes("aide") ||
      lowerMessage.includes("help") ||
      lowerMessage.includes("que puis") ||
      lowerMessage.includes("comment")
    ) {
      return `💡 **Je peux vous aider avec :**

• 📊 **Statistiques** : "Combien de devis ?", "Statistiques"
• 🎯 **Activités** : "Liste des activités", "Activité plongée"
• 📋 **Devis** : "Devis de [nom client]", "Liste des devis"
• 👥 **Clients** : "Clients", "Qui est [nom]"
• 💰 **Prix** : "Prix de [activité]"
• 📂 **Catégories** : "Quelles sont les catégories ?"

Posez-moi une question ! 😊`;
    }

    // Réponse par défaut
    return `🤔 Je n'ai pas bien compris votre question. 

Essayez de me demander :
• Des statistiques ("Combien de devis ?")
• Des activités ("Liste des activités")
• Des devis ("Devis de [nom]")
• Des prix ("Prix de [activité]")

Ou tapez "aide" pour voir toutes mes capacités ! 😊`;
  };

  const handleSend = async () => {
    if (!inputValue.trim() || isProcessing) return;

    const userMessage = inputValue.trim();
    setInputValue("");
    
    // Ajouter le message de l'utilisateur
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setIsProcessing(true);

    // Simuler un délai de traitement pour une meilleure UX
    await new Promise((resolve) => setTimeout(resolve, 500));

    try {
      // Générer la réponse
      const response = generateResponse(userMessage);
      
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: response,
        },
      ]);
    } catch (error) {
      console.error("Erreur lors de la génération de la réponse:", error);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `❌ Désolé, une erreur s'est produite. Veuillez réessayer.`,
        },
      ]);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <>
      {/* Bouton flottant */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-24 w-16 h-16 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-full shadow-2xl hover:shadow-3xl flex items-center justify-center text-white text-3xl z-[9999] transition-all duration-200 hover:scale-110 cursor-pointer"
          style={{ zIndex: 9999 }}
          aria-label="Ouvrir l'assistant"
        >
          💬
        </button>
      )}

      {/* Fenêtre du chatbot */}
      {isOpen && (
        <div 
          className="fixed bottom-6 right-24 w-96 h-[600px] bg-white rounded-2xl shadow-2xl flex flex-col border-2 border-gray-200" 
          style={{ zIndex: 9999 }}
        >
          {/* En-tête */}
          <div className="bg-gradient-to-r from-purple-500 to-indigo-600 text-white p-4 rounded-t-2xl flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-2xl">💬</span>
              <h3 className="font-bold">Assistant Local</h3>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="text-white hover:bg-white/20 rounded-full w-8 h-8 flex items-center justify-center transition-colors"
              aria-label="Fermer l'assistant"
            >
              ✕
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg p-3 ${
                    msg.role === "user"
                      ? "bg-purple-500 text-white"
                      : "bg-gray-100 text-gray-800"
                  }`}
                >
                  <p className="whitespace-pre-wrap text-sm">{msg.content}</p>
                </div>
              </div>
            ))}
            {isProcessing && (
              <div className="flex justify-start">
                <div className="bg-gray-100 rounded-lg p-3">
                  <div className="flex gap-1">
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }}></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></div>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Zone de saisie */}
          <div className="border-t border-gray-200 p-4">
            <div className="flex gap-2">
              <textarea
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Posez votre question..."
                className="flex-1 border border-gray-300 rounded-lg p-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-purple-500"
                rows={3}
                disabled={isProcessing}
              />
              <button
                onClick={handleSend}
                disabled={!inputValue.trim() || isProcessing}
                className="bg-purple-500 text-white px-4 py-2 rounded-lg hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Envoyer
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

