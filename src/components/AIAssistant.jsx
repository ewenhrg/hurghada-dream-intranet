import { useState, useRef, useEffect } from "react";

export function AIAssistant({ activities, quotes, user, activitiesMap }) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content: "Bonjour ! 👋 Je suis votre assistant IA gratuit. Je peux vous aider avec toutes les questions sur les activités, les devis, les clients et bien plus encore. Posez-moi vos questions !",
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

  const handleSend = async () => {
    if (!inputValue.trim() || isProcessing) return;

    const userMessage = inputValue.trim();
    setInputValue("");
    
    // Ajouter le message de l'utilisateur
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setIsProcessing(true);

    try {
      // Préparer le contexte avec les données du site
      const context = buildContext(activities, quotes, user, activitiesMap);
      
      // Appeler l'API IA gratuite (Google Gemini)
      const response = await callGeminiAI(userMessage, context, messages);
      
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: response,
        },
      ]);
    } catch (error) {
      console.error("Erreur lors de l'appel à l'IA:", error);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `❌ Désolé, une erreur s'est produite : ${error.message || "Erreur inconnue"}. Veuillez réessayer.`,
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
          className="fixed bottom-6 right-6 w-16 h-16 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-full shadow-2xl hover:shadow-3xl flex items-center justify-center text-white text-3xl z-[9999] transition-all duration-200 hover:scale-110 cursor-pointer"
          style={{ zIndex: 9999 }}
          aria-label="Ouvrir l'assistant IA"
        >
          🤖
        </button>
      )}

      {/* Fenêtre du chatbot */}
      {isOpen && (
        <div 
          className="fixed bottom-6 right-6 w-96 h-[600px] bg-white rounded-2xl shadow-2xl flex flex-col border-2 border-gray-200" 
          style={{ zIndex: 9999 }}
        >
          {/* En-tête */}
          <div className="bg-gradient-to-r from-purple-500 to-indigo-600 text-white p-4 rounded-t-2xl flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-2xl">🤖</span>
              <h3 className="font-bold">Assistant IA (Gratuit)</h3>
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

// Fonction pour construire le contexte avec les données du site
function buildContext(activities, quotes, user, activitiesMap) {
  const context = {
    activities: activities.map(act => ({
      id: act.id,
      name: act.name,
      category: act.category,
      priceAdult: act.priceAdult,
      priceChild: act.priceChild,
      priceBaby: act.priceBaby,
      availableDays: act.availableDays,
      notes: act.notes,
    })),
    quotesCount: quotes.length,
    recentQuotes: quotes.slice(0, 10).map(q => ({
      id: q.id,
      clientName: q.client?.name,
      total: q.total,
      currency: q.currency,
      createdAt: q.createdAt,
      itemsCount: q.items?.length || 0,
    })),
    user: user ? {
      name: user.name,
      permissions: {
        canDeleteQuote: user.can_delete_quote,
        canAddActivity: user.can_add_activity,
        canEditActivity: user.can_edit_activity,
        canDeleteActivity: user.can_delete_activity,
      }
    } : null,
    stats: {
      totalActivities: activities.length,
      totalQuotes: quotes.length,
      paidQuotes: quotes.filter(q => q.allTicketsFilled).length,
      pendingQuotes: quotes.filter(q => !q.allTicketsFilled).length,
    }
  };

  return JSON.stringify(context, null, 2);
}

// Fonction pour appeler Google Gemini API (GRATUIT)
async function callGeminiAI(userMessage, context, previousMessages) {
  // Récupérer la clé API depuis les variables d'environnement ou localStorage
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY || localStorage.getItem('gemini_api_key');

  if (!apiKey) {
    return `⚠️ **Configuration requise (GRATUIT)**

Pour utiliser l'assistant IA gratuit, vous devez obtenir une clé API Google Gemini :

**Comment obtenir votre clé API GRATUITE :**
1. Allez sur https://makersuite.google.com/app/apikey
2. Connectez-vous avec votre compte Google
3. Cliquez sur "Create API Key"
4. Copiez la clé

**Comment configurer la clé :**
1. Ouvrez la console du navigateur (F12)
2. Tapez : \`localStorage.setItem('gemini_api_key', 'VOTRE_CLE_ICI')\`
3. Rechargez la page

Ou ajoutez-la dans un fichier .env.local à la racine :
\`VITE_GEMINI_API_KEY=votre_cle_ici\`

✅ **C'est 100% GRATUIT** avec un quota généreux (15 requêtes/min, 1500/jour) !`;
  }

  // Construire le prompt avec le contexte
  const systemInstruction = `Tu es un assistant IA spécialisé dans la gestion d'activités touristiques à Hurghada. 
Tu as accès aux données suivantes du système :
${context}

Réponds aux questions de l'utilisateur en utilisant ces informations. Sois concis, précis et utile.
Si tu n'as pas l'information dans le contexte, dis-le clairement.`;

  // Construire l'historique des messages pour Gemini
  const geminiMessages = [];
  
  // Ajouter l'instruction système comme premier message
  geminiMessages.push({
    role: "user",
    parts: [{ text: systemInstruction }]
  });
  geminiMessages.push({
    role: "model",
    parts: [{ text: "D'accord, j'ai compris le contexte. Je suis prêt à répondre à vos questions sur les activités, devis et clients." }]
  });

  // Ajouter les messages précédents (limiter à 10 pour éviter les tokens)
  const recentMessages = previousMessages.slice(-10);
  recentMessages.forEach(msg => {
    if (msg.role === "user") {
      geminiMessages.push({
        role: "user",
        parts: [{ text: msg.content }]
      });
    } else {
      geminiMessages.push({
        role: "model",
        parts: [{ text: msg.content }]
      });
    }
  });

  // Ajouter le message actuel
  geminiMessages.push({
    role: "user",
    parts: [{ text: userMessage }]
  });

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: geminiMessages,
          generationConfig: {
            temperature: 0.7,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 1024,
          },
        })
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Erreur API Gemini');
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!text) {
      throw new Error("Aucune réponse générée");
    }

    return text;
  } catch (error) {
    if (error.message?.includes('API key')) {
      throw new Error("Clé API invalide. Vérifiez votre clé Gemini.");
    }
    throw error;
  }
}

