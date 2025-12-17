import { useState, useRef, useEffect } from "react";
import { supabase } from "../lib/supabase";

// Définir SITE_KEY directement ici pour éviter les problèmes d'import
// Utiliser la même logique que dans lib/supabase.js mais avec garantie de la valeur par défaut
function getSiteKey() {
  // Essayer d'abord les variables d'environnement
  if (typeof import.meta !== "undefined" && import.meta.env) {
    const envKey = import.meta.env.VITE_SITE_KEY || import.meta.env.REACT_APP_SITE_KEY;
    if (envKey && envKey !== "https://uvqzqlfzhgbknkpvybbj.supabase.co") {
      return envKey;
    }
  }
  // Toujours retourner la valeur par défaut correcte
  return "hurghada_dream_0606";
}

const SITE_KEY = getSiteKey();

export function AIAssistant({ activities, quotes, user, activitiesMap }) {
  const [isOpen, setIsOpen] = useState(false);
  const [geminiApiKey, setGeminiApiKey] = useState(null);
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

  // Charger la clé API depuis Supabase (partagée entre tous les PC automatiquement)
  useEffect(() => {
    async function loadApiKey() {
      console.log("🔍 [AIAssistant] Début du chargement de la clé API...");
      console.log("🔍 [AIAssistant] SITE_KEY (forcé):", SITE_KEY);
      console.log("🔍 [AIAssistant] Supabase disponible?", !!supabase);
      
      if (!supabase) {
        console.warn("⚠️ [AIAssistant] Supabase non disponible, utilisation du fallback");
        // Si Supabase n'est pas configuré, essayer localStorage ou .env comme fallback
        const fallbackKey = import.meta.env.VITE_GEMINI_API_KEY || localStorage.getItem('gemini_api_key');
        if (fallbackKey) {
          setGeminiApiKey(fallbackKey);
          console.log("✅ [AIAssistant] Clé chargée depuis fallback (localStorage/env)");
        } else {
          console.warn("⚠️ [AIAssistant] Aucune clé trouvée dans le fallback");
        }
        return;
      }
      
      try {
        console.log("🔍 [AIAssistant] Tentative de chargement depuis Supabase...");
        console.log("🔍 [AIAssistant] Requête: SELECT gemini_api_key FROM ai_config WHERE site_key =", SITE_KEY);
        
        // Charger depuis Supabase (source principale - partagée entre tous les PC)
        const { data, error } = await supabase
          .from("ai_config")
          .select("gemini_api_key")
          .eq("site_key", SITE_KEY)
          .single();

        console.log("🔍 [AIAssistant] Réponse Supabase:", { data, error });

        if (error) {
          console.error("❌ [AIAssistant] Erreur Supabase:", error);
          console.error("❌ [AIAssistant] Code d'erreur:", error.code);
          console.error("❌ [AIAssistant] Message:", error.message);
          console.error("❌ [AIAssistant] Détails:", error.details);
          console.error("❌ [AIAssistant] Hint:", error.hint);
          
          // Si l'erreur est "PGRST116" (not found), la table n'existe peut-être pas encore
          if (error.code === 'PGRST116') {
            console.warn("⚠️ [AIAssistant] Aucune ligne trouvée dans ai_config. La table existe-t-elle ?");
            console.warn("⚠️ [AIAssistant] Vérifiez que vous avez exécuté le script SQL: supabase_ai_config_table.sql");
          }
        }

        if (!error && data && data.gemini_api_key) {
          // Clé trouvée dans Supabase - l'utiliser (tous les PC l'auront automatiquement)
          setGeminiApiKey(data.gemini_api_key);
          // Sauvegarder dans localStorage comme cache pour éviter les requêtes répétées
          localStorage.setItem('gemini_api_key', data.gemini_api_key);
          localStorage.setItem('gemini_api_key_source', 'supabase');
          console.log("✅ [AIAssistant] Clé API Gemini chargée depuis Supabase avec succès!");
          console.log("✅ [AIAssistant] Clé (premiers caractères):", data.gemini_api_key.substring(0, 20) + "...");
        } else {
          // Si pas trouvé dans Supabase, essayer localStorage (fallback)
          console.warn("⚠️ [AIAssistant] Clé API non trouvée dans Supabase");
          console.warn("⚠️ [AIAssistant] SITE_KEY utilisé:", SITE_KEY);
          const cachedKey = localStorage.getItem('gemini_api_key');
          if (cachedKey) {
            setGeminiApiKey(cachedKey);
            console.log("✅ [AIAssistant] Utilisation de la clé en cache (localStorage)");
          } else {
            console.warn("⚠️ [AIAssistant] Aucune clé API trouvée (ni Supabase ni localStorage)");
            console.warn("⚠️ [AIAssistant] Solution: Exécutez le script SQL dans Supabase");
          }
        }
      } catch (err) {
        console.error("❌ [AIAssistant] Exception lors du chargement de la clé API:", err);
        console.error("❌ [AIAssistant] Stack:", err.stack);
        // En cas d'erreur, essayer localStorage comme fallback
        const fallbackKey = localStorage.getItem('gemini_api_key') || import.meta.env.VITE_GEMINI_API_KEY;
        if (fallbackKey) {
          setGeminiApiKey(fallbackKey);
          console.log("✅ [AIAssistant] Clé chargée depuis fallback (exception)");
        }
      }
    }

    loadApiKey();
    
    // Écouter les changements en temps réel dans Supabase (si la clé est mise à jour)
    if (supabase) {
      const channel = supabase
        .channel('ai_config_changes')
        .on('postgres_changes', 
          { 
            event: '*', 
            schema: 'public', 
            table: 'ai_config',
            filter: `site_key=eq.${SITE_KEY}`
          }, 
          (payload) => {
            if (payload.new && payload.new.gemini_api_key) {
              setGeminiApiKey(payload.new.gemini_api_key);
              localStorage.setItem('gemini_api_key', payload.new.gemini_api_key);
              localStorage.setItem('gemini_api_key_source', 'supabase');
            }
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, []);

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
      // Vérifier si la clé API est disponible
      if (!geminiApiKey) {
        // Attendre un peu au cas où la clé est en cours de chargement
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Réessayer de charger depuis localStorage (au cas où Supabase n'est pas encore configuré)
        const fallbackKey = localStorage.getItem('gemini_api_key') || import.meta.env.VITE_GEMINI_API_KEY;
        if (!fallbackKey) {
          // Vérifier si Supabase est disponible pour donner des instructions précises
          let errorDetails = "";
          if (supabase) {
            errorDetails = `
**Vérifications à faire :**
1. Ouvrez Supabase → SQL Editor
2. Vérifiez que la table \`ai_config\` existe : \`SELECT * FROM ai_config;\`
3. Si la table n'existe pas, exécutez le script \`supabase_ai_config_table.sql\`
4. Vérifiez que le \`site_key\` correspond : \`${SITE_KEY}\`
5. Vérifiez les politiques RLS (Row Level Security) sont activées

**Solution rapide temporaire (console navigateur) :**
\`\`\`javascript
localStorage.setItem('gemini_api_key', 'AIzaSyA3u5F90QmxDe-YKvLQy31cfkrC5emuhwM');
location.reload();
\`\`\`
`;
          } else {
            errorDetails = `
**Supabase n'est pas configuré.**
Configurez d'abord Supabase dans votre projet, puis exécutez le script SQL.
`;
          }
          
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: `⚠️ **Configuration requise (GRATUIT)**

La clé API Gemini n'a pas été trouvée dans Supabase.

**Solution permanente (pour tous les PC) :**
1. Ouvrez votre projet Supabase
2. Allez dans "SQL Editor"
3. Copiez-collez et exécutez le script SQL suivant :

\`\`\`sql
-- Créer la table pour stocker la configuration de l'IA
CREATE TABLE IF NOT EXISTS public.ai_config (
  id BIGSERIAL PRIMARY KEY,
  site_key TEXT NOT NULL,
  gemini_api_key TEXT NOT NULL,
  provider TEXT DEFAULT 'gemini',
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_by TEXT DEFAULT '',
  UNIQUE(site_key)
);

CREATE INDEX IF NOT EXISTS idx_ai_config_site_key ON public.ai_config(site_key);

ALTER TABLE public.ai_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow select ai_config"
ON public.ai_config FOR SELECT TO public USING (true);

CREATE POLICY "Allow update ai_config"
ON public.ai_config FOR UPDATE TO public USING (true) WITH CHECK (true);

CREATE POLICY "Allow insert ai_config"
ON public.ai_config FOR INSERT TO public WITH CHECK (true);

-- Insérer la clé API
INSERT INTO public.ai_config (site_key, gemini_api_key, provider, updated_by)
VALUES ('${SITE_KEY}', 'AIzaSyA3u5F90QmxDe-YKvLQy31cfkrC5emuhwM', 'gemini', 'System')
ON CONFLICT (site_key) DO UPDATE SET
  gemini_api_key = EXCLUDED.gemini_api_key,
  provider = EXCLUDED.provider,
  updated_at = NOW(),
  updated_by = EXCLUDED.updated_by;
\`\`\`

4. Rechargez cette page

${errorDetails}

✅ **C'est 100% GRATUIT** avec un quota généreux (15 requêtes/min, 1500/jour) !`,
            },
          ]);
          setIsProcessing(false);
          return;
        }
      }

      // Préparer le contexte avec les données du site
      const context = buildContext(activities, quotes, user, activitiesMap);
      
      // Appeler l'API IA gratuite (Google Gemini)
      const response = await callGeminiAI(userMessage, context, messages, geminiApiKey || localStorage.getItem('gemini_api_key') || import.meta.env.VITE_GEMINI_API_KEY);
      
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
async function callGeminiAI(userMessage, context, previousMessages, geminiApiKey) {
  // Utiliser la clé API passée en paramètre (depuis Supabase ou localStorage)
  const apiKey = geminiApiKey || import.meta.env.VITE_GEMINI_API_KEY || localStorage.getItem('gemini_api_key');

  if (!apiKey) {
    // Utiliser la même logique que dans le composant pour obtenir SITE_KEY
    function getSiteKeyForError() {
      if (typeof import.meta !== "undefined" && import.meta.env) {
        const envKey = import.meta.env.VITE_SITE_KEY || import.meta.env.REACT_APP_SITE_KEY;
        if (envKey && envKey !== "https://uvqzqlfzhgbknkpvybbj.supabase.co") {
          return envKey;
        }
      }
      return "hurghada_dream_0606";
    }
    const siteKey = getSiteKeyForError();
    
    return `⚠️ **Configuration requise (GRATUIT)**

La clé API Gemini n'a pas été trouvée dans Supabase.

**Pour activer l'assistant IA sur tous les PC :**

1. Ouvrez votre projet Supabase
2. Allez dans "SQL Editor"
3. Copiez-collez et exécutez le script SQL suivant :

\`\`\`sql
-- Créer la table pour stocker la configuration de l'IA
CREATE TABLE IF NOT EXISTS public.ai_config (
  id BIGSERIAL PRIMARY KEY,
  site_key TEXT NOT NULL,
  gemini_api_key TEXT NOT NULL,
  provider TEXT DEFAULT 'gemini',
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_by TEXT DEFAULT '',
  UNIQUE(site_key)
);

CREATE INDEX IF NOT EXISTS idx_ai_config_site_key ON public.ai_config(site_key);

ALTER TABLE public.ai_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow select ai_config"
ON public.ai_config FOR SELECT TO public USING (true);

CREATE POLICY "Allow update ai_config"
ON public.ai_config FOR UPDATE TO public USING (true) WITH CHECK (true);

CREATE POLICY "Allow insert ai_config"
ON public.ai_config FOR INSERT TO public WITH CHECK (true);

-- Insérer la clé API (site_key: ${siteKey})
INSERT INTO public.ai_config (site_key, gemini_api_key, provider, updated_by)
VALUES ('${siteKey}', 'AIzaSyA3u5F90QmxDe-YKvLQy31cfkrC5emuhwM', 'gemini', 'System')
ON CONFLICT (site_key) DO UPDATE SET
  gemini_api_key = EXCLUDED.gemini_api_key,
  provider = EXCLUDED.provider,
  updated_at = NOW(),
  updated_by = EXCLUDED.updated_by;
\`\`\`

4. Rechargez cette page

**Vérifications :**
- Vérifiez que la table existe : \`SELECT * FROM ai_config WHERE site_key = '${siteKey}';\`
- Vérifiez les politiques RLS sont activées
- Ouvrez la console (F12) pour voir les logs de débogage

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
    // Utiliser l'API v1 avec gemini-pro (modèle standard et stable)
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-pro:generateContent?key=${apiKey}`,
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

