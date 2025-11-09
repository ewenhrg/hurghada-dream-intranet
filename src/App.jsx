import { useEffect, useState, useRef, lazy, Suspense } from "react";
import { supabase } from "./lib/supabase";
import { SITE_KEY, PIN_CODE, LS_KEYS, getDefaultActivities } from "./constants";
import { uuid, emptyTransfers, calculateCardPrice, saveLS, loadLS } from "./utils";
import { Pill, GhostBtn, Section } from "./components/ui";
import { LoginPage } from "./pages/LoginPage";
import { useLanguage } from "./contexts/LanguageContext";
import { useTranslation } from "./hooks/useTranslation";
import PageLoader from "./components/PageLoader";

const ActivitiesPage = lazy(() => import("./pages/ActivitiesPage").then(module => ({ default: module.ActivitiesPage })));
const QuotesPage = lazy(() => import("./pages/QuotesPage").then(module => ({ default: module.QuotesPage })));
const HistoryPage = lazy(() => import("./pages/HistoryPage").then(module => ({ default: module.HistoryPage })));
const UsersPage = lazy(() => import("./pages/UsersPage").then(module => ({ default: module.UsersPage })));
const TicketPage = lazy(() => import("./pages/TicketPage").then(module => ({ default: module.TicketPage })));
const ModificationsPage = lazy(() => import("./pages/ModificationsPage").then(module => ({ default: module.ModificationsPage })));
const SituationPage = lazy(() => import("./pages/SituationPage").then(module => ({ default: module.SituationPage })));

export default function App() {
  const [ok, setOk] = useState(false);
  const [tab, setTab] = useState("devis");
  // Forcer la lecture uniquement depuis Supabase, ignorer le localStorage local
  const [activities, setActivities] = useState(() => getDefaultActivities());
  const [quotes, setQuotes] = useState(() => loadLS(LS_KEYS.quotes, []));
  const [quoteDraft, setQuoteDraft] = useState(() => loadLS(LS_KEYS.quoteForm, null));
  const [remoteEnabled, setRemoteEnabled] = useState(false);
  const [user, setUser] = useState(null);
  const { language, setLanguage } = useLanguage();
  const { t } = useTranslation();

  // Vérifier si l'utilisateur est déjà connecté
  useEffect(() => {
    const already = sessionStorage.getItem("hd_ok") === "1";
    if (already) {
      const userStr = sessionStorage.getItem("hd_user");
      if (userStr) {
        try {
          const userData = JSON.parse(userStr);
          // S'assurer que les valeurs par défaut sont correctes pour l'accès aux pages
          if (userData.canAccessActivities === undefined) userData.canAccessActivities = true;
          if (userData.canAccessHistory === undefined) userData.canAccessHistory = true;
          if (userData.canAccessTickets === undefined) userData.canAccessTickets = true;
          // Donner tous les accès à Léa sauf canResetData
          if (userData.name === "Léa") {
            userData.canDeleteQuote = true;
            userData.canAddActivity = true;
            userData.canEditActivity = true;
            userData.canDeleteActivity = true;
            userData.canAccessActivities = true;
            userData.canAccessHistory = true;
            userData.canAccessTickets = true;
            userData.canAccessModifications = true;
            userData.canAccessSituation = true;
            userData.canAccessUsers = true;
            userData.canResetData = false; // Ne pas donner l'accès au reset
          }
          // Donner tous les accès à Ewen
          if (userData.name === "Ewen") {
            userData.canAccessModifications = true;
            userData.canAccessSituation = true;
            userData.canAccessUsers = true;
          }
          setUser(userData);
        } catch (e) {
          console.error("Erreur lors de la lecture des données utilisateur:", e);
        }
      }
      setOk(true);
    }
  }, []);

  // Fonction pour mettre à jour les permissions utilisateur après connexion
  function handleLoginSuccess() {
    const userStr = sessionStorage.getItem("hd_user");
    if (userStr) {
      try {
        const userData = JSON.parse(userStr);
        // S'assurer que les valeurs par défaut sont correctes pour l'accès aux pages
        if (userData.canAccessActivities === undefined) userData.canAccessActivities = true;
        if (userData.canAccessHistory === undefined) userData.canAccessHistory = true;
        if (userData.canAccessTickets === undefined) userData.canAccessTickets = true;
        // Donner tous les accès à Léa sauf canResetData
        if (userData.name === "Léa") {
          userData.canDeleteQuote = true;
          userData.canAddActivity = true;
          userData.canEditActivity = true;
          userData.canDeleteActivity = true;
          userData.canAccessActivities = true;
          userData.canAccessHistory = true;
          userData.canAccessTickets = true;
          userData.canAccessModifications = true;
          userData.canAccessSituation = true;
          userData.canAccessUsers = true;
          userData.canResetData = false; // Ne pas donner l'accès au reset
        }
        // Donner tous les accès à Ewen
        if (userData.name === "Ewen") {
          userData.canAccessModifications = true;
          userData.canAccessSituation = true;
          userData.canAccessUsers = true;
        }
        setUser(userData);
      } catch (e) {
        console.error("Erreur lors de la lecture des données utilisateur:", e);
      }
    }
    setOk(true);
  }

  function handleLogout() {
    try {
      sessionStorage.removeItem("hd_ok");
      sessionStorage.removeItem("hd_user");
      sessionStorage.removeItem("quotesPageMounted");
    } catch (error) {
      console.warn("Erreur lors de la suppression des informations de session:", error);
    }
    setUser(null);
    setQuoteDraft(null);
    setTab("devis");
    setOk(false);
  }

  // fonction de synchronisation Supabase
  async function syncWithSupabase() {
      if (!supabase) return;
    try {
      // Vérifier si Supabase est configuré (pas un stub)
      const { error: testError } = await supabase.from("activities").select("id").limit(1);
      
      // Si pas d'erreur de connexion/config, Supabase est disponible
      if (!testError || testError.code !== "PGRST116") {
        setRemoteEnabled(true);
      }

      // Récupérer toutes les activités
      const { data, error } = await supabase.from("activities").select("*").eq("site_key", SITE_KEY).order("id", { ascending: false });
      if (!error && Array.isArray(data)) {
        // LIRE UNIQUEMENT depuis Supabase (source de vérité absolue)
        // IGNORER COMPLÈTEMENT le localStorage local pour éviter les doublons
        if (data.length > 0) {
          // Créer un Map des activités Supabase par leur ID Supabase
          const supabaseActivitiesMap = new Map();
          data.forEach((row) => {
            const supabaseId = row.id;
            const localId = supabaseId?.toString?.() || uuid();
            
            supabaseActivitiesMap.set(supabaseId, {
              id: localId,
              supabase_id: supabaseId,
              name: row.name,
              category: row.category || "desert",
              priceAdult: row.price_adult || 0,
              priceChild: row.price_child || 0,
              priceBaby: row.price_baby || 0,
              ageChild: row.age_child || "",
              ageBaby: row.age_baby || "",
              currency: row.currency || "EUR",
              availableDays: row.available_days || [false, false, false, false, false, false, false],
              notes: row.notes || "",
              transfers: row.transfers || emptyTransfers(),
            });
          });

          const supabaseActivities = [];
          const uniqueKeys = new Set();

          // Fonction pour créer une clé unique d'une activité
          const getUniqueKey = (activity) => {
            return `${activity.site_key || SITE_KEY}_${activity.name}_${activity.category || 'desert'}`;
          };

          // Ajouter UNIQUEMENT les activités Supabase (source de vérité absolue)
          supabaseActivitiesMap.forEach((supabaseActivity) => {
            const key = getUniqueKey(supabaseActivity);
            if (!uniqueKeys.has(key)) {
              supabaseActivities.push(supabaseActivity);
              uniqueKeys.add(key);
            }
            // Si uniqueKeys.has(key) est true, on ignore cette activité (doublon dans Supabase)
          });

          // Mettre à jour le state ET le localStorage avec UNIQUEMENT les données Supabase
          setActivities(supabaseActivities);
          saveLS(LS_KEYS.activities, supabaseActivities);
        } else {
          // Si Supabase est vide, vider aussi le state et le localStorage
          console.log("📦 Supabase: aucune activité trouvée, vidage des activités locales");
          setActivities([]);
          saveLS(LS_KEYS.activities, []);
        }
      } else if (error) {
        console.warn("⚠️ Erreur lors de la récupération des activités depuis Supabase:", error);
      }

      // Synchronisation des devis se fait dans un useEffect séparé pour éviter les doublons
    } catch (err) {
      console.warn("Erreur synchronisation Supabase:", err);
    }
  }

  // charger supabase au montage et synchronisation des activités toutes les 3 secondes
  useEffect(() => {
    // Synchronisation immédiate
    syncWithSupabase();

    // Synchronisation des activités toutes les 3 secondes (pas les devis pour éviter les doublons)
    const interval = setInterval(() => {
      syncWithSupabase();
    }, 3000);

    // Nettoyer l'intervalle au démontage
    return () => {
      clearInterval(interval);
    };
  }, []);

  // Persister le brouillon de devis (ou le nettoyer) dès qu'il change
  useEffect(() => {
    if (quoteDraft) {
      saveLS(LS_KEYS.quoteForm, quoteDraft);
    } else {
      try {
        localStorage.removeItem(LS_KEYS.quoteForm);
      } catch (error) {
        console.warn("Impossible de supprimer le brouillon de devis du localStorage", error);
      }
    }
  }, [quoteDraft]);

  // Synchronisation initiale unique des devis depuis Supabase au chargement de la page
  useEffect(() => {
    if (!remoteEnabled) return;
    
    async function syncQuotesOnce() {
      if (!supabase) return;
      
      try {
        const { data: quotesData, error: quotesError } = await supabase
          .from("quotes")
          .select("*")
          .eq("site_key", SITE_KEY)
          .order("created_at", { ascending: false });
        
        if (!quotesError && Array.isArray(quotesData)) {
          setQuotes((prevQuotes) => {
            // Fonction pour convertir un devis Supabase en format local
            const convertSupabaseQuoteToLocal = (row) => {
              let items = [];
              try {
                items = typeof row.items === 'string' ? JSON.parse(row.items) : row.items || [];
              } catch {
                items = [];
              }
              
              const createdAt = row.created_at || row.createdAt || new Date().toISOString();
              
              // Calculer isModified à partir de la présence de modifications
              // Soit dans quote.modifications, soit dans les items (item.modifications)
              const hasQuoteModifications = items.some(item => 
                item.modifications && Array.isArray(item.modifications) && item.modifications.length > 0
              );
              
              return {
                id: row.id?.toString() || uuid(),
                supabase_id: row.id,
                createdAt: createdAt,
                client: {
                  name: row.client_name || "",
                  phone: row.client_phone || "",
                  hotel: row.client_hotel || "",
                  room: row.client_room || "",
                  neighborhood: row.client_neighborhood || "",
                },
                notes: row.notes || "",
                createdByName: row.created_by_name || "",
                items: items,
                total: row.total || 0,
                totalCash: Math.round(row.total || 0),
                totalCard: calculateCardPrice(row.total || 0),
                currency: row.currency || "EUR",
                isModified: hasQuoteModifications || false,
              };
            };

            // Créer un Set des clés uniques des devis Supabase (pour détection doublons)
            const supabaseKeys = new Set();
            quotesData.forEach((row) => {
              const supabaseKey = `${row.client_phone || ''}_${row.created_at}`;
              if (supabaseKey !== '_') { // Ignorer les clés vides
                supabaseKeys.add(supabaseKey);
              }
            });

            // Créer un Map des devis Supabase par leur ID et par leur clé unique
            const supabaseQuotesMap = new Map();
            const supabaseQuotesByKey = new Map();
            quotesData.forEach((row) => {
              if (row.id) {
                const converted = convertSupabaseQuoteToLocal(row);
                supabaseQuotesMap.set(row.id, converted);
                
                const supabaseKey = `${row.client_phone || ''}_${row.created_at}`;
                if (supabaseKey !== '_') {
                  supabaseQuotesByKey.set(supabaseKey, converted);
                }
              }
            });

            // Fusionner : UNIQUEMENT les devis Supabase (source de vérité absolue)
            // IGNORER COMPLÈTEMENT les devis locaux obsolètes pour éviter les doublons
            const merged = [];

            // Ajouter TOUS les devis Supabase (source de vérité absolue)
            supabaseQuotesMap.forEach((supabaseQuote) => {
              merged.push(supabaseQuote);
            });

            // Calculer isModified pour tous les devis Supabase s'ils ne l'ont pas déjà
            merged.forEach((quote) => {
              if (quote.isModified === undefined) {
                const hasItemModifications = quote.items?.some(item => 
                  item.modifications && Array.isArray(item.modifications) && item.modifications.length > 0
                );
                quote.isModified = hasItemModifications || false;
              }
            });

            // Ajouter UNIQUEMENT les devis locaux qui sont vraiment nouveaux et très récents
            // (sans supabase_id ET créés il y a moins de 2 minutes - probablement en cours de création)
            const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
            const supabaseKeysSet = new Set(supabaseKeys);
            
            prevQuotes.forEach((localQuote) => {
              // Ignorer TOUS les devis locaux qui ont un supabase_id (ils doivent être dans Supabase)
              if (localQuote.supabase_id) {
                return; // Ignorer ce devis local s'il a un supabase_id (il doit être dans Supabase)
              }
              
              // Pour les devis locaux sans supabase_id, vérifier s'ils existent dans Supabase
              const localKey = `${localQuote.client?.phone || ''}_${localQuote.createdAt}`;
              
              // Vérifier si c'est un devis très récent (créé il y a moins de 2 minutes)
              const isVeryRecent = localQuote.createdAt && new Date(localQuote.createdAt) > new Date(twoMinutesAgo);
              
              // Si le devis local n'existe PAS dans Supabase ET est très récent, c'est un nouveau devis en cours de création
              if (isVeryRecent && localKey !== '_' && !supabaseKeysSet.has(localKey)) {
                // C'est un devis vraiment nouveau (créé localement il y a moins de 2 minutes, pas encore synchronisé)
                // Calculer isModified pour ce devis local aussi
                const hasItemModifications = localQuote.items?.some(item => 
                  item.modifications && Array.isArray(item.modifications) && item.modifications.length > 0
                );
                localQuote.isModified = hasItemModifications || localQuote.isModified || false;
                merged.push(localQuote);
              }
              // Sinon, ignorer ce devis local (c'est probablement un doublon ou une version obsolète)
            });

            saveLS(LS_KEYS.quotes, merged);
            return merged;
          });
        }
      } catch (err) {
        console.warn("Erreur synchronisation devis Supabase:", err);
      }
    }
    
    syncQuotesOnce();
  }, [remoteEnabled]);

  // Synchronisation en temps réel des devis via Supabase Realtime
  useEffect(() => {
    if (!supabase || !remoteEnabled) return;

    // Fonction pour convertir un devis Supabase en format local
    const convertSupabaseQuoteToLocal = (row) => {
      let items = [];
      try {
        items = typeof row.items === 'string' ? JSON.parse(row.items) : row.items || [];
      } catch {
        items = [];
      }
      
      const createdAt = row.created_at || row.createdAt || new Date().toISOString();
      
      return {
        id: row.id?.toString() || uuid(),
        supabase_id: row.id,
        createdAt: createdAt,
        client: {
          name: row.client_name || "",
          phone: row.client_phone || "",
          hotel: row.client_hotel || "",
          room: row.client_room || "",
          neighborhood: row.client_neighborhood || "",
        },
        notes: row.notes || "",
        createdByName: row.created_by_name || "",
        items: items,
        total: row.total || 0,
        totalCash: Math.round(row.total || 0),
        totalCard: calculateCardPrice(row.total || 0),
        currency: row.currency || "EUR",
      };
    };

    console.log("🔄 Abonnement Realtime aux devis...");

    // S'abonner aux changements sur la table quotes
    const channel = supabase
      .channel('quotes-realtime')
      .on(
        'postgres_changes',
        {
          event: '*', // INSERT, UPDATE, DELETE
          schema: 'public',
          table: 'quotes',
          filter: `site_key=eq.${SITE_KEY}`,
        },
        async (payload) => {
          console.log('📨 Changement Realtime reçu:', payload.eventType, payload);

          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const newQuote = convertSupabaseQuoteToLocal(payload.new);
            
            setQuotes((prevQuotes) => {
              // Chercher si le devis existe déjà localement par supabase_id
              let existingIndex = -1;
              if (newQuote.supabase_id) {
                existingIndex = prevQuotes.findIndex((q) => q.supabase_id === newQuote.supabase_id);
              }
              
              // Si pas trouvé par supabase_id, chercher par téléphone + date
              if (existingIndex === -1) {
                const supabaseKey = `${payload.new.client_phone || ''}_${payload.new.created_at}`;
                existingIndex = prevQuotes.findIndex((q) => {
                  const localKey = `${q.client?.phone || ''}_${q.createdAt}`;
                  return localKey !== '_' && localKey === supabaseKey;
                });
              }

              if (existingIndex >= 0) {
                // Mettre à jour le devis existant (remplacer pour éviter les doublons)
                const updated = [...prevQuotes];
                updated[existingIndex] = newQuote;
                saveLS(LS_KEYS.quotes, updated);
                return updated;
              } else {
                // Ajouter le nouveau devis seulement s'il n'existe pas déjà
                const updated = [newQuote, ...prevQuotes];
                saveLS(LS_KEYS.quotes, updated);
                return updated;
              }
            });
          } else if (payload.eventType === 'DELETE') {
            // Supprimer le devis local correspondant
            setQuotes((prevQuotes) => {
              const deletedId = payload.old.id;
              const deletedPhone = payload.old.client_phone || "";
              const deletedCreatedAt = payload.old.created_at || "";
              
              const filtered = prevQuotes.filter((q) => {
                // Vérifier par ID Supabase si disponible
                if (q.supabase_id && q.supabase_id === deletedId) {
                  return false;
                }
                // Sinon vérifier par téléphone et date de création
                const localPhone = q.client?.phone || "";
                const localCreatedAt = q.createdAt || "";
                return !(localPhone === deletedPhone && localCreatedAt === deletedCreatedAt);
              });
              
              saveLS(LS_KEYS.quotes, filtered);
              return filtered;
            });
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('✅ Abonnement Realtime actif pour les devis');
        } else if (status === 'CHANNEL_ERROR') {
          console.warn('⚠️ Erreur abonnement Realtime:', status);
        }
      });

    // Nettoyer l'abonnement au démontage
    return () => {
      console.log('🔌 Déconnexion de l\'abonnement Realtime');
      supabase.removeChannel(channel);
    };
  }, [remoteEnabled]);

  // Références pour les timeouts de sauvegarde debounce
  const activitiesSaveTimeoutRef = useRef(null);
  const quotesSaveTimeoutRef = useRef(null);

  // Persistance locale avec debounce pour éviter trop d'écritures
  useEffect(() => {
    if (activitiesSaveTimeoutRef.current) {
      clearTimeout(activitiesSaveTimeoutRef.current);
    }
    activitiesSaveTimeoutRef.current = setTimeout(() => {
    saveLS(LS_KEYS.activities, activities);
    }, 300);

    return () => {
      if (activitiesSaveTimeoutRef.current) {
        clearTimeout(activitiesSaveTimeoutRef.current);
      }
    };
  }, [activities]);

  useEffect(() => {
    if (quotesSaveTimeoutRef.current) {
      clearTimeout(quotesSaveTimeoutRef.current);
    }
    quotesSaveTimeoutRef.current = setTimeout(() => {
    saveLS(LS_KEYS.quotes, quotes);
    }, 300);

    return () => {
      if (quotesSaveTimeoutRef.current) {
        clearTimeout(quotesSaveTimeoutRef.current);
      }
    };
  }, [quotes]);

  useEffect(() => {
    if (!ok) return;

    const preload = async () => {
      try {
        await Promise.all([
          import("./pages/QuotesPage"),
          import("./pages/ActivitiesPage"),
          import("./pages/HistoryPage"),
          import("./pages/TicketPage"),
          import("./pages/ModificationsPage"),
          import("./pages/SituationPage"),
          import("./pages/UsersPage"),
        ]);
      } catch (error) {
        console.warn("Préchargement des pages échoué", error);
      }
    };

    const timer = setTimeout(preload, 200);

    return () => clearTimeout(timer);
  }, [ok]);

  if (!ok) {
        return <LoginPage onSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-transparent overflow-hidden">
      {/* HEADER */}
      <header className="sticky top-0 z-50 pt-4 pb-3 px-3 sm:px-6 bg-[rgba(7,13,31,0.9)] backdrop-blur-xl shadow-[0_24px_60px_-32px_rgba(7,13,31,0.65)]">
        <div
          className={`glass-nav mx-auto flex flex-wrap items-center justify-between gap-4 ${(tab === "devis" || tab === "situation") ? "max-w-7xl" : "max-w-6xl"} px-4 py-4 rounded-2xl`}
        >
          <div className="flex items-center gap-3.5">
            <img 
              src="/logo.png" 
              alt="Hurghada Dream Logo" 
              className="w-12 h-12 object-contain rounded-lg shadow-md border border-slate-200/60"
              onError={(e) => {
                // Fallback si le logo n'existe pas - afficher HD
                e.target.style.display = 'none';
                const parent = e.target.parentElement;
                if (parent && !parent.querySelector('.fallback-logo')) {
                  const fallback = document.createElement('div');
                  fallback.className = 'fallback-logo w-12 h-12 rounded-lg bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-600 text-white grid place-items-center font-bold text-base shadow-md';
                  fallback.textContent = 'HD';
                  parent.appendChild(fallback);
                }
              }}
            />
            <div className="space-y-1">
              <h1 className="text-[1.05rem] font-semibold tracking-[-0.03em] bg-gradient-to-r from-[#4f46e5] via-[#5b3ffd] to-[#0ea5e9] bg-clip-text text-transparent">
                {t("header.title")}
              </h1>
              <p className="text-[11px] font-medium text-white/65">{t("header.subtitle")}</p>
              {user && (
                <span className="badge-soft">
                  <span>👤</span>
                  <span>
                    {t("header.connected")} : {user.name}
                  </span>
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Sélecteur de langue */}
            <div className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-2.5 py-1.5 shadow-[0_14px_28px_-20px_rgba(7,13,31,0.45)]">
              <button
                onClick={() => setLanguage("fr")}
                className={`px-2.5 py-1.5 text-[11px] font-semibold rounded-lg transition-colors ${
                  language === "fr"
                    ? "bg-gradient-to-r from-[#4f46e5] to-[#0ea5e9] text-white shadow-[0_14px_28px_-16px_rgba(79,70,229,0.55)]"
                    : "text-white/70 hover:text-[#a5b4fc] hover:bg-white/10"
                }`}
              >
                FR
              </button>
              <button
                onClick={() => setLanguage("en")}
                className={`px-2.5 py-1.5 text-[11px] font-semibold rounded-lg transition-colors ${
                  language === "en"
                    ? "bg-gradient-to-r from-[#4f46e5] to-[#0ea5e9] text-white shadow-[0_14px_28px_-16px_rgba(79,70,229,0.55)]"
                    : "text-white/70 hover:text-[#a5b4fc] hover:bg-white/10"
                }`}
              >
                EN
              </button>
            </div>
            <nav className="flex gap-2.5 flex-wrap">
              <Pill active={tab === "devis"} onClick={() => setTab("devis")}>
                {t("nav.devis")}
              </Pill>
              {user?.canAccessActivities !== false && (
              <Pill active={tab === "activities"} onClick={() => setTab("activities")}>
                {t("nav.activities")}
              </Pill>
              )}
              {user?.canAccessHistory !== false && (
              <Pill active={tab === "history"} onClick={() => setTab("history")}>
                {t("nav.history")}
                </Pill>
              )}
              {user?.canAccessTickets !== false && (
                <Pill active={tab === "tickets"} onClick={() => setTab("tickets")}>
                  {t("nav.tickets")}
                </Pill>
              )}
              {(user?.canAccessModifications || user?.name === "Ewen" || user?.name === "Léa") && (
                <Pill active={tab === "modifications"} onClick={() => setTab("modifications")}>
                  {t("nav.modifications")}
                </Pill>
              )}
              {(user?.canAccessSituation || user?.name === "Ewen" || user?.name === "Léa") && (
                <Pill active={tab === "situation"} onClick={() => setTab("situation")}>
                  {t("nav.situation")}
                </Pill>
              )}
              {(user?.canResetData || user?.canAccessUsers || user?.name === "Ewen") && (
                <Pill active={tab === "users"} onClick={() => setTab("users")}>
                  {t("nav.users")}
                </Pill>
              )}
            </nav>
            {user && (
              <GhostBtn
                type="button"
                size="sm"
                variant="danger"
                onClick={handleLogout}
                className="rounded-xl font-semibold !bg-red-500 !text-white !border-red-500 hover:!bg-red-600 shadow-[0_16px_32px_-20px_rgba(239,68,68,0.55)]"
              >
                🚪 Déconnexion
              </GhostBtn>
            )}
          </div>
        </div>
      </header>

      {/* CONTENU CENTRÉ */}
      <main className="flex-1 overflow-y-auto px-3 sm:px-6 py-10">
        <div
          className={`mx-auto space-y-10 ${(tab === "devis" || tab === "situation") ? "max-w-7xl" : "max-w-6xl"} bg-white/5 border border-white/10 rounded-[32px] p-6 sm:p-8 shadow-[0_30px_60px_-35px_rgba(15,23,42,0.65)] backdrop-blur-2xl`}
        >
          <Suspense fallback={<PageLoader />}>
          {tab === "devis" && (
            <section className="space-y-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <h2 className="text-[1.75rem] font-semibold tracking-[-0.03em] mb-1.5 bg-gradient-to-r from-[#4f46e5] via-[#5b3ffd] to-[#0ea5e9] bg-clip-text text-transparent">
                    {t("page.devis.title")}
                  </h2>
                  <p className="text-sm text-[rgba(71,85,105,0.85)] font-medium leading-relaxed">
                    {t("page.devis.subtitle")}
                  </p>
                </div>
              </div>
              <div className="hd-card p-8 md:p-10 lg:p-12">
                <QuotesPage
                  activities={activities}
                  quotes={quotes}
                  setQuotes={setQuotes}
                  user={user}
                  draft={quoteDraft}
                  setDraft={setQuoteDraft}
                />
              </div>
            </section>
          )}

          {tab === "activities" && user?.canAccessActivities !== false && (
            <Section
              title={t("page.activities.title")}
              subtitle={t("page.activities.subtitle")}
              right={
                user?.canResetData && (
                <GhostBtn
                  onClick={() => {
                    if (!window.confirm("Réinitialiser les données locales ?")) return;
                      const defaultActivities = getDefaultActivities();
                    setActivities(defaultActivities);
                    saveLS(LS_KEYS.activities, defaultActivities);
                }}
              >
                {t("btn.reset")}
              </GhostBtn>
              )
            }
          >
            <ActivitiesPage activities={activities} setActivities={setActivities} user={user} />
          </Section>
        )}

        {tab === "history" && user?.canAccessHistory !== false && (
          <Section title={t("page.history.title")} subtitle={t("page.history.subtitle")}>
            <HistoryPage quotes={quotes} setQuotes={setQuotes} user={user} activities={activities} />
          </Section>
        )}

        {tab === "tickets" && user?.canAccessTickets !== false && (
          <Section title={t("page.tickets.title")} subtitle={t("page.tickets.subtitle")}>
            <TicketPage quotes={quotes} setQuotes={setQuotes} user={user} />
          </Section>
        )}

        {tab === "modifications" && (user?.canAccessModifications || user?.name === "Ewen" || user?.name === "Léa") && (
          <Section
            title={t("page.modifications.title")}
            subtitle={t("page.modifications.subtitle")}
          >
            <ModificationsPage quotes={quotes} setQuotes={setQuotes} activities={activities} user={user} />
          </Section>
        )}

        {tab === "situation" && (user?.canAccessSituation || user?.name === "Ewen" || user?.name === "Léa") && (
          <SituationPage activities={activities} />
        )}

          {tab === "users" && (user?.canResetData || user?.canAccessUsers || user?.name === "Ewen") && (
            <Section title={t("page.users.title")} subtitle={t("page.users.subtitle")}>
              <UsersPage user={user} />
            </Section>
          )}
          </Suspense>
        </div>
      </main>

      <footer className={`mx-auto px-4 py-8 text-[11px] text-white/65 border-t border-white/10 mt-10 font-medium tracking-wide ${(tab === "devis" || tab === "situation") ? "max-w-7xl" : "max-w-6xl"}`}>
        Données stockées en local + Supabase (si dispo). Site interne Hurghada Dream.
      </footer>
    </div>
  );
}
