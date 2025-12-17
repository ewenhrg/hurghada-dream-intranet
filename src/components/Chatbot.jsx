import { useState, useRef, useEffect } from "react";

export function Chatbot({ onExtractInfo, activities, stopSalesMap, pushSalesMap }) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content: "Bonjour ! 👋 Je suis votre assistant. Collez le message du client ici et je vais extraire les informations pour remplir automatiquement le devis.",
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
      // Extraire les informations
      const extractedInfo = extractClientInfo(userMessage, activities);
      
      // Vérifier si les dates de séjour sont manquantes
      if (!extractedInfo.arrivalDate || !extractedInfo.departureDate) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: "⚠️ Les dates de séjour sont manquantes dans le message. Veuillez demander au client de fournir ses dates d'arrivée et de départ pour pouvoir créer le devis.",
          },
        ]);
        setIsProcessing(false);
        return;
      }

      // Si tout est OK, utiliser les informations extraites
      if (onExtractInfo) {
        const result = await onExtractInfo(extractedInfo, activities, stopSalesMap, pushSalesMap);
        
        if (result.success) {
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: `✅ Parfait ! J'ai extrait les informations et rempli le formulaire :\n\n• Nom : ${extractedInfo.name || "Non trouvé"}\n• Téléphone : ${extractedInfo.phone || "Non trouvé"}\n• Email : ${extractedInfo.email || "Non trouvé"}\n• Hôtel : ${extractedInfo.hotel || "Non trouvé"}\n• Chambre : ${extractedInfo.room || "Non trouvé"}\n• Activités : ${result.activitiesFound.length > 0 ? result.activitiesFound.map(a => a.name).join(", ") : "Aucune activité trouvée"}\n• Participants : ${extractedInfo.adults || 0} adulte(s)${extractedInfo.children > 0 ? `, ${extractedInfo.children} enfant(s)` : ""}${extractedInfo.babies > 0 ? `, ${extractedInfo.babies} bébé(s)` : ""}\n• Dates séjour : ${extractedInfo.arrivalDate} → ${extractedInfo.departureDate}`,
            },
          ]);
        } else {
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: `⚠️ ${result.message || "Une erreur s'est produite lors du remplissage du formulaire."}`,
            },
          ]);
        }
      }
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `❌ Erreur : ${error.message || "Une erreur s'est produite."}`,
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
          className="fixed bottom-6 right-6 w-14 h-14 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full shadow-lg hover:shadow-xl flex items-center justify-center text-white text-2xl z-50 transition-all duration-200 hover:scale-110"
          aria-label="Ouvrir le chatbot"
        >
          💬
        </button>
      )}

      {/* Fenêtre du chatbot */}
      {isOpen && (
        <div className="fixed bottom-6 right-6 w-96 h-[600px] bg-white rounded-2xl shadow-2xl flex flex-col z-50 border-2 border-gray-200">
          {/* En-tête */}
          <div className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white p-4 rounded-t-2xl flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-2xl">🤖</span>
              <h3 className="font-bold">Assistant</h3>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="text-white hover:bg-white/20 rounded-full w-8 h-8 flex items-center justify-center transition-colors"
              aria-label="Fermer le chatbot"
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
                      ? "bg-blue-500 text-white"
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
                placeholder="Collez le message du client ici..."
                className="flex-1 border border-gray-300 rounded-lg p-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={3}
                disabled={isProcessing}
              />
              <button
                onClick={handleSend}
                disabled={!inputValue.trim() || isProcessing}
                className="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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

// Fonction d'extraction des informations depuis le texte libre
function extractClientInfo(text, activities) {
  const info = {
    name: "",
    phone: "",
    email: "",
    hotel: "",
    room: "",
    arrivalDate: "",
    departureDate: "",
    activities: [],
    adults: 0,
    children: 0,
    babies: 0,
    childrenAges: [],
  };

  const textLower = text.toLowerCase();
  const lines = text.split("\n").map((line) => line.trim()).filter((line) => line.length > 0);

  // Extraire le téléphone (format: 10 chiffres consécutifs ou avec espaces/tirets)
  const phoneMatch = text.match(/(?:\+33|0)?[\s.-]?[1-9][\s.-]?(\d[\s.-]?){8}/);
  if (phoneMatch) {
    info.phone = phoneMatch[0].replace(/[\s.-]/g, "");
  }

  // Extraire l'email
  const emailMatch = text.match(/[\w.-]+@[\w.-]+\.\w+/);
  if (emailMatch) {
    info.email = emailMatch[0];
  }

  // Extraire le numéro de chambre (motifs: "chambre", "room", "numéro", suivi d'un nombre)
  const roomMatch = text.match(/(?:chambre|room|numéro|n°|#)[\s:]*(\d+)/i);
  if (roomMatch) {
    info.room = roomMatch[1];
  }

  // Extraire les dates de séjour (format: JJ/MM/YYYY, JJ-MM-YYYY, ou texte comme "du X au Y")
  // Chercher spécifiquement les dates de séjour avec des mots-clés
  const dateKeywords = [
    /(?:arrivée|arrivee|arrival|arrive|du|depuis|from|check-in)[\s:]*(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/gi,
    /(?:départ|depart|departure|jusqu'?au|au|until|to|check-out)[\s:]*(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/gi,
    /(?:séjour|sejour|stay|dates?)[\s:]*(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/gi,
  ];

  const dates = [];
  
  // Chercher d'abord avec les mots-clés
  dateKeywords.forEach((pattern) => {
    const matches = [...text.matchAll(pattern)];
    matches.forEach((match) => {
      const day = parseInt(match[1]);
      const month = parseInt(match[2]);
      const year = parseInt(match[3].length === 2 ? "20" + match[3] : match[3]);
      if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
        dates.push(new Date(year, month - 1, day));
      }
    });
  });

  // Si pas de dates trouvées avec mots-clés, chercher toutes les dates au format JJ/MM/YYYY
  if (dates.length === 0) {
    const allDatePatterns = [
      /\b(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})\b/g,
    ];
    
    allDatePatterns.forEach((pattern) => {
      const matches = [...text.matchAll(pattern)];
      matches.forEach((match) => {
        const day = parseInt(match[1]);
        const month = parseInt(match[2]);
        const year = parseInt(match[3].length === 2 ? "20" + match[3] : match[3]);
        if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
          dates.push(new Date(year, month - 1, day));
        }
      });
    });
  }

  // Trier les dates et prendre les deux premières comme arrivée/départ
  dates.sort((a, b) => a - b);
  if (dates.length >= 2) {
    info.arrivalDate = formatDate(dates[0]);
    info.departureDate = formatDate(dates[1]);
  } else if (dates.length === 1) {
    info.arrivalDate = formatDate(dates[0]);
  }

  // Extraire le nombre d'adultes
  const adultsMatch = text.match(/(\d+)\s*(?:adulte|adult|adultes|adults)/i);
  if (adultsMatch) {
    info.adults = parseInt(adultsMatch[1]);
  } else {
    // Chercher juste un nombre suivi de "adultes" ou juste "X adultes"
    const simpleAdultsMatch = text.match(/(\d+)\s*adultes?/i);
    if (simpleAdultsMatch) {
      info.adults = parseInt(simpleAdultsMatch[1]);
    }
  }

  // Extraire les enfants et leurs âges
  const childrenAgesMatch = text.match(/(\d+)\s*(?:ans|an|years?|year)/gi);
  if (childrenAgesMatch) {
    info.childrenAges = childrenAgesMatch.map((m) => parseInt(m));
    info.children = childrenAgesMatch.length;
  } else {
    const childrenMatch = text.match(/(\d+)\s*(?:enfant|child|enfants|children)/i);
    if (childrenMatch) {
      info.children = parseInt(childrenMatch[1]);
    }
  }

  // Extraire les bébés
  const babiesMatch = text.match(/(\d+)\s*(?:bébé|baby|bébés|babies)/i);
  if (babiesMatch) {
    info.babies = parseInt(babiesMatch[1]);
  }

  // Extraire le nom (généralement sur la première ou deuxième ligne, après l'activité)
  // Chercher une ligne qui ressemble à un nom (majuscules/minuscules, pas de chiffres au début)
  // Exemple: "Bourammani Marwa" - généralement après l'activité
  for (let i = 0; i < Math.min(lines.length, 5); i++) {
    const line = lines[i].trim();
    // Ignorer la première ligne si c'est une activité
    const isFirstLineActivity = i === 0 && activities.some((act) =>
      act.name.toLowerCase().includes(line.toLowerCase()) ||
      line.toLowerCase().includes(act.name.toLowerCase())
    );
    
    if (
      !isFirstLineActivity &&
      line.length > 3 &&
      line.length < 50 &&
      !line.match(/^\d/) &&
      !line.includes("@") &&
      !line.match(/^\d+/) &&
      !line.toLowerCase().includes("chambre") &&
      !line.toLowerCase().includes("room") &&
      !line.toLowerCase().includes("hôtel") &&
      !line.toLowerCase().includes("hotel") &&
      !line.toLowerCase().includes("numéro") &&
      !line.toLowerCase().includes("n°") &&
      !line.toLowerCase().includes("adultes") &&
      !line.toLowerCase().includes("enfants") &&
      !line.toLowerCase().includes("ans") &&
      !line.match(/^\d{10}$/) && // Pas un numéro de téléphone seul
      !line.match(/^[\d\s\.-]+$/) // Pas que des chiffres et séparateurs
    ) {
      // Vérifier si ce n'est pas une activité
      const isActivity = activities.some((act) =>
        act.name.toLowerCase().includes(line.toLowerCase()) ||
        line.toLowerCase().includes(act.name.toLowerCase())
      );
      if (!isActivity && !info.name) {
        info.name = line;
        break;
      }
    }
  }

  // Extraire l'hôtel (chercher "hôtel" ou "hotel" suivi du nom)
  const hotelMatch = text.match(/(?:hôtel|hotel)[\s:]*([^\n,]+)/i);
  if (hotelMatch) {
    info.hotel = hotelMatch[1].trim().replace(/^[\s:]+/, "");
  } else {
    // Chercher dans les lignes pour trouver un nom d'hôtel
    // Généralement après le nom du client
    for (let i = 1; i < Math.min(lines.length, 6); i++) {
      const line = lines[i].toLowerCase();
      if (line.includes("hôtel") || line.includes("hotel")) {
        const hotelNameMatch = lines[i].match(/(?:hôtel|hotel)[\s:]*([^\n,]+)/i);
        if (hotelNameMatch) {
          info.hotel = hotelNameMatch[1].trim();
          break;
        }
      }
      // Si la ligne ressemble à un nom d'hôtel (majuscules, plusieurs mots)
      if (lines[i].length > 5 && lines[i].length < 50 && 
          !lines[i].match(/^\d/) && 
          !lines[i].includes("@") &&
          !lines[i].toLowerCase().includes("chambre") &&
          !lines[i].toLowerCase().includes("room") &&
          !info.hotel) {
        // Vérifier si ce n'est pas déjà le nom du client ou une activité
        const isName = info.name && lines[i].toLowerCase().includes(info.name.toLowerCase());
        const isActivity = activities.some((act) =>
          act.name.toLowerCase().includes(lines[i].toLowerCase()) ||
          lines[i].toLowerCase().includes(act.name.toLowerCase())
        );
        if (!isName && !isActivity) {
          // Peut-être un nom d'hôtel
          info.hotel = lines[i];
        }
      }
    }
  }

  // Extraire les activités (chercher dans la liste des activités disponibles)
  // Chercher d'abord les correspondances exactes ou partielles dans les premières lignes
  const firstLines = lines.slice(0, 3).join(" ").toLowerCase();
  
  activities.forEach((activity) => {
    const activityNameLower = activity.name.toLowerCase();
    const activityWords = activityNameLower.split(/\s+/).filter(w => w.length > 2);
    
    // Vérifier si le nom complet de l'activité apparaît dans le texte
    if (textLower.includes(activityNameLower)) {
      info.activities.push(activity);
      return;
    }
    
    // Vérifier si plusieurs mots clés de l'activité apparaissent (au moins 2 mots significatifs)
    const matchingWords = activityWords.filter(word => textLower.includes(word));
    if (matchingWords.length >= 2) {
      // Vérifier que ce n'est pas une correspondance accidentelle
      const isLikelyMatch = firstLines.includes(activityNameLower) || 
                           matchingWords.length >= Math.min(3, activityWords.length);
      if (isLikelyMatch && !info.activities.find(a => a.id === activity.id)) {
        info.activities.push(activity);
      }
    }
  });
  
  // Si aucune activité trouvée, chercher dans la première ligne seulement
  if (info.activities.length === 0 && lines.length > 0) {
    const firstLineLower = lines[0].toLowerCase();
    activities.forEach((activity) => {
      const activityNameLower = activity.name.toLowerCase();
      if (firstLineLower.includes(activityNameLower) || 
          activityNameLower.split(" ").some((word) => word.length > 3 && firstLineLower.includes(word))) {
        if (!info.activities.find(a => a.id === activity.id)) {
          info.activities.push(activity);
        }
      }
    });
  }

  return info;
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

