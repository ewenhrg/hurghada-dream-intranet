import { useEffect, useState, useRef, lazy, Suspense, useMemo, useCallback } from "react";

// Composant pour optimiser le scroll en désactivant les animations pendant le scroll
function ScrollOptimizer({ children }) {
  const scrollTimeoutRef = useRef(null);
  const rafIdRef = useRef(null);

  useEffect(() => {
    let isScrolling = false;
    
    const handleScroll = () => {
      // Utiliser requestAnimationFrame pour éviter les re-renders
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
      }
      
      rafIdRef.current = requestAnimationFrame(() => {
        if (!isScrolling) {
          isScrolling = true;
          document.body.classList.add('scrolling');
        }
        
        // Réactiver les animations après 200ms sans scroll
        if (scrollTimeoutRef.current) {
          clearTimeout(scrollTimeoutRef.current);
        }
        
        scrollTimeoutRef.current = setTimeout(() => {
          isScrolling = false;
          document.body.classList.remove('scrolling');
        }, 200);
      });
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, []);

  return <>{children}</>;
}
import { Routes, Route, useLocation, useNavigate } from "react-router-dom";
import { supabase, __SUPABASE_DEBUG__ } from "./lib/supabase";
import { SITE_KEY, PIN_CODE, LS_KEYS, getDefaultActivities } from "./constants";
import { uuid, emptyTransfers, mergeTransfers, calculateCardPrice, saveLS, loadLS } from "./utils";
import { configureUserPermissions, loadUserFromSession } from "./utils/userPermissions";
import { Pill, GhostBtn, Section } from "./components/ui";
import { LoginPage } from "./pages/LoginPage";
import { useLanguage } from "./contexts/LanguageContext";
import { useTranslation } from "./hooks/useTranslation";
import PageLoader from "./components/PageLoader";
import ErrorBoundary from "./components/ErrorBoundary";
import { PageTransition } from "./components/PageTransition";
import { toast } from "./utils/toast.js";
import { logger } from "./utils/logger";
import { activitiesCache, createCacheKey } from "./utils/cache";

// Fonction helper pour le lazy loading avec gestion d'erreur et retry
const lazyWithRetry = (importFn, retries = 3) => {
  return lazy(() => {
    const loadModule = (attempt = 0) => {
      return importFn().catch((error) => {
        logger.warn(`Erreur de chargement du module (tentative ${attempt + 1}/${retries + 1})...`, error);
        if (attempt < retries) {
          // Retry après un court délai exponentiel
          const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
          return new Promise((resolve) => {
            setTimeout(() => {
              resolve(loadModule(attempt + 1));
            }, delay);
          });
        }
        // Si toutes les tentatives échouent, recharger la page
        logger.error("Impossible de charger le module après plusieurs tentatives, rechargement de la page...");
        setTimeout(() => {
          window.location.reload();
        }, 2000);
        throw error;
      });
    };
    return loadModule();
  });
};

const ActivitiesPage = lazyWithRetry(() => import("./pages/ActivitiesPage").then(module => ({ default: module.ActivitiesPage })));
const QuotesPage = lazyWithRetry(() => import("./pages/QuotesPage").then(module => ({ default: module.QuotesPage })));
const HistoryPage = lazyWithRetry(() => import("./pages/HistoryPage").then(module => ({ default: module.HistoryPage })));
const UsersPage = lazyWithRetry(() => import("./pages/UsersPage").then(module => ({ default: module.UsersPage })));
const HotelsPage = lazyWithRetry(() => import("./pages/HotelsPage").then(module => ({ default: module.HotelsPage })));
const TicketPage = lazyWithRetry(() => import("./pages/TicketPage").then(module => ({ default: module.TicketPage })));
// Page Modifications désactivée temporairement
// const ModificationsPage = lazyWithRetry(() => import("./pages/ModificationsPage").then(module => ({ default: module.ModificationsPage })));
const SituationPage = lazyWithRetry(() => import("./pages/SituationPage").then(module => ({ default: module.SituationPage })));
const StopSalePage = lazyWithRetry(() => import("./pages/StopSalePage").then(module => ({ default: module.StopSalePage })));
const RequestPage = lazyWithRetry(() => import("./pages/RequestPage").then(module => ({ default: module.RequestPage })));

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const [ok, setOk] = useState(false);
  const [tab, setTab] = useState("devis");
  // Source de vérité: Supabase (les données locales servent seulement de cache temporaire d'affichage).
  const [activities, setActivities] = useState(() => loadLS(LS_KEYS.activities, getDefaultActivities()));
  const [quotes, setQuotes] = useState(() => loadLS(LS_KEYS.quotes, []));
  const [quoteDraft, setQuoteDraft] = useState(() => loadLS(LS_KEYS.quoteForm, null));
  const [remoteEnabled, setRemoteEnabled] = useState(false);
  const [user, setUser] = useState(null);
  const [usedDates, setUsedDates] = useState([]);
  const [showDatesModal, setShowDatesModal] = useState(false);
  const { language, setLanguage } = useLanguage();
  const { t } = useTranslation();

  // Map des activités pour des recherches O(1) au lieu de O(n)
  const activitiesMap = useMemo(() => {
    const map = new Map();
    activities.forEach((activity) => {
      if (activity.id) map.set(activity.id, activity);
      if (activity.supabase_id) map.set(activity.supabase_id, activity);
    });
    return map;
  }, [activities]);

  // Réinitialiser les dates utilisées quand on change d'onglet
  useEffect(() => {
    if (tab !== "devis") {
      setUsedDates([]);
    }
  }, [tab]);

  // Vérifier si l'utilisateur est déjà connecté
  useEffect(() => {
    const already = sessionStorage.getItem("hd_ok") === "1";
    if (already) {
      const userData = loadUserFromSession();
      if (userData) {
        setUser(userData);
      }
      setOk(true);
    }
  }, []);

  // Fonction pour mettre à jour les permissions utilisateur après connexion
  const handleLoginSuccess = useCallback(() => {
    const userData = loadUserFromSession();
    if (userData) {
      setUser(userData);
    }
    setOk(true);
  }, []);

  const handleLogout = useCallback(() => {
    try {
      sessionStorage.removeItem("hd_ok");
      sessionStorage.removeItem("hd_user");
      sessionStorage.removeItem("quotesPageMounted");
    } catch (error) {
      logger.warn("Erreur lors de la suppression des informations de session:", error);
    }
    setUser(null);
    setQuoteDraft(null);
    setTab("devis");
    setOk(false);
  }, []);

  // fonction de synchronisation Supabase - mémoïsée avec useCallback et cache
  // Note: setActivities et setRemoteEnabled sont des setters stables de React, pas besoin de dépendances
  const syncWithSupabase = useCallback(async () => {
    if (!supabase) return;
    try {
      // Invalider le cache à chaque sync pour toujours avoir la liste à jour (évite les activités "disparues")
      const cacheKey = createCacheKey("activities", SITE_KEY);
      activitiesCache.delete(cacheKey);

      // Vérifier si Supabase est configuré (pas un stub)
      const { error: testError } = await supabase.from("activities").select("id").limit(1);
      
      // Supabase est considéré disponible uniquement sans erreur.
      if (!testError) {
        setRemoteEnabled(true);
      } else {
        setRemoteEnabled(false);
        logger.warn("⚠️ Supabase indisponible, conservation des activités locales.", testError);
      }

      // Récupérer toutes les activités - une ligne par activité (pas de déduplication pour ne rien perdre)
      const selectColumns = "id, name, category, price_adult, price_child, price_baby, age_child, age_baby, currency, available_days, notes, description, transfers";
      const mapActivitiesFromRows = (rows) =>
        rows.map((row) => {
          const supabaseId = row.id;
          const localId = supabaseId?.toString?.() || uuid();
          return {
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
            description: row.description || "",
            transfers: mergeTransfers(row.transfers),
          };
        });

      const { data, error } = await supabase
        .from("activities")
        .select(selectColumns)
        .eq("site_key", SITE_KEY)
        .order("id", { ascending: false });
      if (!error && Array.isArray(data)) {
        let finalRows = data;
        let finalSource = `site_key=${SITE_KEY}`;

        // Comparer plusieurs sources et garder automatiquement la liste la plus complète.
        const fallbackSiteKey = __SUPABASE_DEBUG__?.supabaseUrl;
        const checks = [];

        if (fallbackSiteKey && fallbackSiteKey !== SITE_KEY) {
          checks.push(
            supabase
              .from("activities")
              .select(selectColumns)
              .eq("site_key", fallbackSiteKey)
              .order("id", { ascending: false })
              .then((res) => ({ source: `site_key=${fallbackSiteKey}`, ...res }))
          );
        }

        checks.push(
          supabase
            .from("activities")
            .select(selectColumns)
            .order("id", { ascending: false })
            .then((res) => ({ source: "sans filtre site_key", ...res }))
        );

        const checkedResults = await Promise.all(checks);
        checkedResults.forEach((result) => {
          if (!result?.error && Array.isArray(result?.data) && result.data.length > finalRows.length) {
            finalRows = result.data;
            finalSource = result.source;
          }
        });

        if (finalSource !== `site_key=${SITE_KEY}`) {
          logger.warn(
            `⚠️ Source activités basculée automatiquement: site_key=${SITE_KEY} (${data.length}) -> ${finalSource} (${finalRows.length}).`
          );
        }

        // LIRE depuis Supabase (source de vérité partagée). Ne jamais écraser par une liste vide si on a déjà des données (évite perte en cas d'erreur/filtre).
        if (finalRows.length > 0) {
          const supabaseActivities = mapActivitiesFromRows(finalRows);
          setActivities(supabaseActivities);
          saveLS(LS_KEYS.activities, supabaseActivities);
          activitiesCache.set(cacheKey, supabaseActivities);
        } else {
          const current = loadLS(LS_KEYS.activities, []);
          logger.warn(`📦 Supabase: aucune activité pour ${finalSource}. Conservation des ${current.length} activité(s) actuelles.`);
          if (current.length === 0) {
            setActivities([]);
            saveLS(LS_KEYS.activities, []);
          }
          // Sinon on ne touche pas à la liste (évite suppression automatique)
        }
      } else if (error) {
        logger.warn("⚠️ Erreur lors de la récupération des activités depuis Supabase:", error);
      }

      // Synchronisation des devis se fait dans un useEffect séparé pour éviter les doublons
    } catch (err) {
      logger.warn("Erreur synchronisation Supabase:", err);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fonction pour créer un devis à partir d'une demande (conservée pour usage futur)
  const handleCreateQuoteFromRequest = useCallback(async (request) => {
    if (!request) return;

    // Convertir les activités sélectionnées de la demande en items de devis
    const items = [];
    if (request.selected_activities && Array.isArray(request.selected_activities)) {
      request.selected_activities.forEach((selectedActivity) => {
        // Trouver l'activité correspondante (optimisé avec Map pour O(1))
        const activityId = selectedActivity.activityId?.toString();
        const activity = activitiesMap.get(activityId) || 
          activities.find((a) => a.supabase_id?.toString() === activityId);

        if (activity) {
          // Créer un item de devis à partir de l'activité sélectionnée
          const item = {
            activityId: activity.id || activity.supabase_id || selectedActivity.activityId,
            date: selectedActivity.date || new Date().toISOString().slice(0, 10),
            adults: selectedActivity.adults || "",
            children: selectedActivity.children || 0,
            babies: selectedActivity.babies || 0,
            extraLabel: selectedActivity.extraLabel || "",
            extraAmount: selectedActivity.extraAmount || "",
            slot: selectedActivity.slot || "",
            extraDolphin: selectedActivity.extraDolphin || false,
            speedBoatExtra: selectedActivity.speedBoatExtra || [],
            buggySimple: selectedActivity.buggySimple || "",
            buggyFamily: selectedActivity.buggyFamily || "",
            yamaha250: selectedActivity.yamaha250 || "",
            ktm640: selectedActivity.ktm640 || "",
            ktm530: selectedActivity.ktm530 || "",
            allerSimple: selectedActivity.allerSimple || false,
            allerRetour: selectedActivity.allerRetour || false,
          };
          items.push(item);
        }
      });
    }

    // Si aucune activité n'a été trouvée, créer un item vide
    if (items.length === 0) {
      items.push({
        activityId: "",
        date: new Date().toISOString().slice(0, 10),
        adults: "",
        children: 0,
        babies: 0,
        extraLabel: "",
        extraAmount: "",
        slot: "",
        extraDolphin: false,
        speedBoatExtra: [],
        buggySimple: "",
        buggyFamily: "",
        yamaha250: "",
        ktm640: "",
        ktm530: "",
        allerSimple: false,
        allerRetour: false,
      });
    }

    // Créer le draft avec les informations du client
    const draft = {
      client: {
        name: request.client_name || "",
        phone: request.client_phone || "",
        email: request.client_email || "",
        hotel: request.client_hotel || "",
        room: request.client_room || "",
        neighborhood: request.client_neighborhood || "",
        arrivalDate: request.arrival_date || "",
        departureDate: request.departure_date || "",
      },
      items: items,
      notes: request.notes || "",
    };

    // Marquer la demande comme "convertie en devis" au lieu de la supprimer
    if (supabase && request.id) {
      try {
        const { error } = await supabase
          .from("client_requests")
          .update({ 
            status: "converted",
            converted_at: new Date().toISOString(),
            converted_by: user?.name || ""
          })
          .eq("id", request.id)
          .eq("site_key", SITE_KEY);

        if (error) {
          logger.warn("Erreur lors de la mise à jour du statut de la demande:", error);
          // Continuer quand même même si la mise à jour échoue
        } else {
          logger.log("✅ Demande marquée comme convertie en devis");
        }
      } catch (err) {
        logger.warn("Exception lors de la mise à jour du statut de la demande:", err);
        // Continuer quand même même si la mise à jour échoue
      }
    }

    // Mettre à jour le draft et changer d'onglet
    setQuoteDraft(draft);
         setTab("devis");
    
    toast.success("Demande chargée dans le formulaire de devis !");
  }, [activitiesMap, activities, user?.name, setQuoteDraft, setTab]);

  // charger supabase au montage et synchronisation des activités toutes les 10 secondes (optimisé)
  useEffect(() => {
    // Synchronisation immédiate
    syncWithSupabase();

    // Synchronisation des activités toutes les 60 secondes (optimisé: réduit pour moins de charge)
    const interval = setInterval(() => {
      syncWithSupabase();
    }, 60000);

    // Nettoyer l'intervalle au démontage
    return () => {
      clearInterval(interval);
    };
  }, [syncWithSupabase]);

  // Persister le brouillon de devis avec debounce pour éviter trop d'écritures
  const quoteDraftSaveTimeoutRef = useRef(null);
  useEffect(() => {
    if (quoteDraftSaveTimeoutRef.current) {
      clearTimeout(quoteDraftSaveTimeoutRef.current);
    }
    quoteDraftSaveTimeoutRef.current = setTimeout(() => {
      if (quoteDraft) {
        saveLS(LS_KEYS.quoteForm, quoteDraft);
      } else {
        try {
          localStorage.removeItem(LS_KEYS.quoteForm);
        } catch (error) {
          logger.warn("Impossible de supprimer le brouillon de devis du localStorage", error);
        }
      }
    }, 500); // Debounce de 500ms

    return () => {
      if (quoteDraftSaveTimeoutRef.current) {
        clearTimeout(quoteDraftSaveTimeoutRef.current);
      }
    };
  }, [quoteDraft]);

  // Synchronisation initiale unique des devis depuis Supabase au chargement de la page
  useEffect(() => {
    if (!remoteEnabled) return;
    
    async function syncQuotesOnce() {
      if (!supabase) return;
      
      try {
        // Sélection spécifique pour réduire la taille des données transférées
        const { data: quotesData, error: quotesError } = await supabase
          .from("quotes")
          .select("id, client_name, client_phone, client_email, client_hotel, client_room, client_neighborhood, client_arrival_date, client_departure_date, notes, created_at, updated_at, created_by_name, items, total, currency")
          .eq("site_key", SITE_KEY)
          .order("created_at", { ascending: false })
          .limit(1000); // Limiter à 1000 devis pour éviter de surcharger
        
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
              const updatedAt = row.updated_at || row.updatedAt || createdAt;
              
              // Calculer isModified à partir de la présence de modifications
              // Soit dans quote.modifications, soit dans les items (item.modifications)
              const hasQuoteModifications = items.some(item => 
                item.modifications && Array.isArray(item.modifications) && item.modifications.length > 0
              );
              
              return {
                id: row.id?.toString() || uuid(),
                supabase_id: row.id,
                createdAt: createdAt,
                updated_at: updatedAt,
                client: {
                  name: row.client_name || "",
                  phone: row.client_phone || "",
                  email: row.client_email || "",
                  hotel: row.client_hotel || "",
                  room: row.client_room || "",
                  neighborhood: row.client_neighborhood || "",
                  arrivalDate: row.client_arrival_date || "",
                  departureDate: row.client_departure_date || "",
                },
                clientArrivalDate: row.client_arrival_date || "",
                clientDepartureDate: row.client_departure_date || "",
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
        logger.warn("Erreur synchronisation devis Supabase:", err);
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
      const updatedAt = row.updated_at || row.updatedAt || createdAt;
      
      return {
        id: row.id?.toString() || uuid(),
        supabase_id: row.id,
        createdAt: createdAt,
        updated_at: updatedAt,
        client: {
          name: row.client_name || "",
          phone: row.client_phone || "",
          email: row.client_email || "",
          hotel: row.client_hotel || "",
          room: row.client_room || "",
          neighborhood: row.client_neighborhood || "",
          arrivalDate: row.client_arrival_date || "",
          departureDate: row.client_departure_date || "",
        },
        clientArrivalDate: row.client_arrival_date || "",
        clientDepartureDate: row.client_departure_date || "",
        notes: row.notes || "",
        createdByName: row.created_by_name || "",
        items: items,
        total: row.total || 0,
        totalCash: Math.round(row.total || 0),
        totalCard: calculateCardPrice(row.total || 0),
        currency: row.currency || "EUR",
      };
    };

    logger.log("🔄 Abonnement Realtime aux devis...");

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
          logger.log('📨 Changement Realtime reçu:', payload.eventType, payload);

          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const newQuote = convertSupabaseQuoteToLocal(payload.new);
            
            setQuotes((prevQuotes) => {
              // Créer un Map pour des recherches O(1) au lieu de O(n)
              const quotesMap = new Map();
              prevQuotes.forEach((q, idx) => {
                if (q.supabase_id) {
                  quotesMap.set(`id_${q.supabase_id}`, idx);
                }
                const phoneDateKey = `${q.client?.phone || ''}_${q.createdAt}`;
                if (phoneDateKey !== '_') {
                  quotesMap.set(`phone_${phoneDateKey}`, idx);
                }
              });

              // Chercher si le devis existe déjà localement (optimisé avec Map O(1))
              let existingIndex = -1;
              if (newQuote.supabase_id) {
                existingIndex = quotesMap.get(`id_${newQuote.supabase_id}`) ?? -1;
              }
              
              // Si pas trouvé par supabase_id, chercher par téléphone + date
              if (existingIndex === -1) {
                const supabaseKey = `${payload.new.client_phone || ''}_${payload.new.created_at}`;
                existingIndex = quotesMap.get(`phone_${supabaseKey}`) ?? -1;
              }

              if (existingIndex >= 0) {
                // Mettre à jour le devis existant seulement si les données Supabase sont plus récentes
                const existingQuote = prevQuotes[existingIndex];
                const existingUpdatedAt = existingQuote.updated_at || existingQuote.createdAt;
                const newUpdatedAt = payload.new.updated_at || payload.new.created_at || newQuote.createdAt;
                
                // Comparer les timestamps pour éviter d'écraser des modifications locales récentes
                if (new Date(newUpdatedAt) >= new Date(existingUpdatedAt)) {
                  // Les données Supabase sont plus récentes ou égales, mettre à jour
                  const updated = [...prevQuotes];
                  updated[existingIndex] = newQuote;
                  saveLS(LS_KEYS.quotes, updated);
                  return updated;
                } else {
                  // Les données locales sont plus récentes, garder les données locales
                  logger.log("⚠️ Ignoré mise à jour Realtime (données locales plus récentes)");
                  return prevQuotes;
                }
              } else {
                // Ajouter le nouveau devis seulement s'il n'existe pas déjà
                const updated = [newQuote, ...prevQuotes];
                saveLS(LS_KEYS.quotes, updated);
                return updated;
              }
            });
          } else if (payload.eventType === 'DELETE') {
            // Supprimer le devis local correspondant (optimisé)
            setQuotes((prevQuotes) => {
              const deletedId = payload.old.id;
              const deletedPhone = payload.old.client_phone || "";
              const deletedCreatedAt = payload.old.created_at || "";
              const deletedKey = `${deletedPhone}_${deletedCreatedAt}`;
              
              // Filtrer en une seule passe (plus efficace que plusieurs vérifications)
              const filtered = prevQuotes.filter((q) => {
                // Vérifier par ID Supabase si disponible
                if (q.supabase_id === deletedId) {
                  return false;
                }
                // Sinon vérifier par téléphone et date de création
                if (deletedKey !== '_') {
                  const localKey = `${q.client?.phone || ''}_${q.createdAt}`;
                  if (localKey === deletedKey) {
                    return false;
                  }
                }
                return true;
              });
              
              saveLS(LS_KEYS.quotes, filtered);
              return filtered;
            });
          }
        }
      )
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          logger.log('✅ Abonnement Realtime actif pour les devis');
        } else if (status === 'CHANNEL_ERROR') {
          logger.warn('⚠️ Erreur abonnement Realtime:', status, err);
          // Réessayer de s'abonner après un délai en cas d'erreur
          setTimeout(() => {
            logger.log('🔄 Tentative de reconnexion Realtime...');
            // Le channel sera recréé au prochain render si remoteEnabled change
          }, 5000);
        } else if (status === 'TIMED_OUT') {
          logger.warn('⏱️ Timeout abonnement Realtime, reconnexion...');
        } else if (status === 'CLOSED') {
          logger.log('🔌 Abonnement Realtime fermé');
        }
      });

    // Nettoyer l'abonnement au démontage
    return () => {
      logger.log('🔌 Déconnexion de l\'abonnement Realtime pour les devis');
      supabase.removeChannel(channel);
    };
  }, [remoteEnabled]);

  // Synchronisation en temps réel des activités via Supabase Realtime
  useEffect(() => {
    if (!supabase || !remoteEnabled) return;

    logger.log("🔄 Abonnement Realtime aux activités...");

    // Fonction pour convertir une activité Supabase en format local
    const convertSupabaseActivityToLocal = (row) => {
      return {
        id: row.id?.toString() || uuid(),
        supabase_id: row.id,
        name: row.name || "",
        category: row.category || "desert",
        priceAdult: row.price_adult || 0,
        priceChild: row.price_child || 0,
        priceBaby: row.price_baby || 0,
        ageChild: row.age_child || "",
        ageBaby: row.age_baby || "",
        currency: row.currency || "EUR",
        availableDays: Array.isArray(row.available_days) && row.available_days.length === 7
          ? row.available_days
          : [false, false, false, false, false, false, false],
        notes: row.notes || "",
        description: row.description || "",
        transfers: mergeTransfers(row.transfers),
      };
    };

    // S'abonner aux changements sur la table activities
    const activitiesChannel = supabase
      .channel('activities-realtime')
      .on(
        'postgres_changes',
        {
          event: '*', // INSERT, UPDATE, DELETE
          schema: 'public',
          table: 'activities',
          filter: `site_key=eq.${SITE_KEY}`,
        },
        async (payload) => {
          logger.log('📨 Changement Realtime activités reçu:', payload.eventType, payload);

          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const newActivity = convertSupabaseActivityToLocal(payload.new);
            
            setActivities((prevActivities) => {
              // Créer un Map pour des recherches O(1)
              const activitiesMap = new Map();
              prevActivities.forEach((a, idx) => {
                if (a.supabase_id) {
                  activitiesMap.set(a.supabase_id, idx);
                }
                if (a.id) {
                  activitiesMap.set(a.id, idx);
                }
              });

              // Chercher si l'activité existe déjà
              let existingIndex = -1;
              if (newActivity.supabase_id) {
                existingIndex = activitiesMap.get(newActivity.supabase_id) ?? -1;
              }
              if (existingIndex === -1 && newActivity.id) {
                existingIndex = activitiesMap.get(newActivity.id) ?? -1;
              }

              if (existingIndex >= 0) {
                // Mettre à jour l'activité existante
                const updated = [...prevActivities];
                updated[existingIndex] = newActivity;
                saveLS(LS_KEYS.activities, updated);
                return updated;
              } else {
                // Ajouter la nouvelle activité
                const updated = [newActivity, ...prevActivities];
                saveLS(LS_KEYS.activities, updated);
                return updated;
              }
            });
          } else if (payload.eventType === 'DELETE') {
            // Ne pas appliquer le DELETE en local : refaire une sync pour avoir l'état réel (évite suppression automatique intempestive).
            const deletedId = payload.old?.id;
            const deletedActivity = payload.old;
            logger.warn("🗑️ SUPPRESSION D'ACTIVITÉ DÉTECTÉE VIA REALTIME (resync au lieu de retirer en local):", {
              supabase_id: deletedId,
              activity_name: deletedActivity?.name,
              activity_site_key: deletedActivity?.site_key
            });
            syncWithSupabase();
          }
        }
      )
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          logger.log('✅ Abonnement Realtime actif pour les activités');
        } else if (status === 'CHANNEL_ERROR') {
          logger.warn('⚠️ Erreur abonnement Realtime activités:', status, err);
        } else if (status === 'TIMED_OUT') {
          logger.warn('⏱️ Timeout abonnement Realtime activités, reconnexion...');
        } else if (status === 'CLOSED') {
          logger.log('🔌 Abonnement Realtime activités fermé');
        }
      });

    // Nettoyer l'abonnement au démontage
    return () => {
      logger.log('🔌 Déconnexion de l\'abonnement Realtime pour les activités');
      supabase.removeChannel(activitiesChannel);
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
        logger.warn("Préchargement des pages échoué", error);
      }
    };

    const timer = setTimeout(preload, 200);

    return () => clearTimeout(timer);
  }, [ok]);

  // Si on est sur la route publique /request (avec ou sans token), afficher RequestPage sans authentification
  if (location.pathname.startsWith("/request")) {
    return (
      <ErrorBoundary>
        <Suspense fallback={<PageLoader />}>
          <RequestPage />
        </Suspense>
      </ErrorBoundary>
    );
  }

  if (!ok) {
        return <LoginPage onSuccess={handleLoginSuccess} />;
  }

  // Calculer la largeur maximale pour le header et le footer
  const maxWidthClass = (tab === "devis" || tab === "situation") ? "max-w-7xl" : "max-w-6xl";
  // Calculer le padding pour le main
  const mainPaddingClass = tab === "devis" ? "px-0" : "px-2 md:px-3 lg:px-6";
  // Construire les className complets
  const headerNavClassName = `glass-nav mx-auto flex flex-col md:flex-row md:flex-wrap items-start md:items-center justify-between gap-3 md:gap-4 ${maxWidthClass} px-3 md:px-4 py-3 md:py-4 rounded-xl md:rounded-2xl`;
  const mainClassName = `flex-1 py-4 md:py-10 ${mainPaddingClass} scroll-container`;
  const footerClassName = `mx-auto px-4 py-8 border-t mt-10 font-medium tracking-wide ${maxWidthClass}`;
  const contentContainerClassName = `mx-auto space-y-6 md:space-y-10 ${maxWidthClass} rounded-2xl p-4 md:p-6 lg:p-8`;
  // Construire les className pour les boutons de langue
  const langButtonBaseClass = "px-2 md:px-2.5 py-1.5 font-semibold rounded-lg transition-colors";
  const langButtonActiveClass = "bg-gradient-to-r from-[#4f46e5] to-[#0ea5e9] text-white";
  const langButtonInactiveClass = "hover:text-[#a5b4fc]";
  const langButtonFrClassName = langButtonBaseClass + " " + (language === "fr" ? langButtonActiveClass : langButtonInactiveClass);
  const langButtonEnClassName = langButtonBaseClass + " " + (language === "en" ? langButtonActiveClass : langButtonInactiveClass);
  const footerText = "support 7 sur 7 = +33619921449";

  return (
    <div className="min-h-screen flex flex-col bg-transparent overflow-x-hidden">
      {/* HEADER */}
      <header className="sticky top-0 z-50 pt-2 md:pt-4 pb-2 md:pb-3 px-2 md:px-3 lg:px-6" style={{ backgroundColor: 'rgba(7,13,31,0.98)', boxShadow: '0 24px 60px -32px rgba(7,13,31,0.65)' }}>
        <div className={headerNavClassName}>
          <div className="flex items-center gap-2 md:gap-3.5 w-full md:w-auto">
            <img 
              src="/logo.png" 
              alt="Hurghada Dream Logo" 
              className="w-10 h-10 md:w-12 md:h-12 object-contain rounded-lg shadow-md border flex-shrink-0"
              style={{ borderColor: 'rgba(226, 232, 240, 0.6)' }}
              onError={(e) => {
                // Fallback si le logo n'existe pas - afficher HD
                e.target.style.display = 'none';
                const parent = e.target.parentElement;
                if (parent && !parent.querySelector('.fallback-logo')) {
                  const fallback = document.createElement('div');
                  fallback.className = 'fallback-logo w-10 h-10 md:w-12 md:h-12 rounded-lg bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-600 text-white grid place-items-center font-bold text-sm md:text-base shadow-md flex-shrink-0';
                  fallback.textContent = 'HD';
                  parent.appendChild(fallback);
                }
              }}
            />
            <div className="space-y-0.5 md:space-y-1 min-w-0 flex-1">
              <h1 className="text-base font-semibold bg-gradient-to-r from-[#4f46e5] via-[#6366f1] to-[#06b6d4] bg-clip-text text-transparent truncate" style={{ letterSpacing: '-0.03em', fontSize: '1.05rem' }}>
                {t("header.title")}
              </h1>
              <p className="font-medium hidden md:block" style={{ color: 'rgba(255, 255, 255, 0.65)', fontSize: '0.6875rem' }}>{t("header.subtitle")}</p>
              {user && (
                <span className="badge-soft px-2 py-1 md:px-2.5 md:py-1.5" style={{ fontSize: '0.6875rem' }}>
                  <span>👤</span>
                  <span className="truncate" style={{ maxWidth: '120px' }}>
                    {t("header.connected")} : {user.name}
                  </span>
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 md:gap-3 w-full md:w-auto justify-between md:justify-end">
            {/* Sélecteur de langue */}
            <div 
              className="flex items-center gap-1.5 md:gap-2 rounded-xl border px-2 md:px-2.5 py-1.5"
              style={{
                borderColor: 'rgba(255, 255, 255, 0.15)',
                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                boxShadow: '0 14px 28px -20px rgba(7, 13, 31, 0.45)'
              }}
            >
              <button
                onClick={() => setLanguage("fr")}
                  className={langButtonFrClassName}
                  style={language === "fr" 
                    ? { 
                        boxShadow: '0 14px 28px -16px rgba(79,70,229,0.55)',
                        fontSize: '0.625rem',
                        minHeight: '36px',
                        minWidth: '36px'
                      }
                    : { 
                        color: 'rgba(255, 255, 255, 0.7)',
                        fontSize: '0.625rem',
                        minHeight: '36px',
                        minWidth: '36px'
                      }
                  }
                  onMouseEnter={(e) => {
                    if (language !== "fr") {
                      e.target.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (language !== "fr") {
                      e.target.style.backgroundColor = 'transparent';
                    }
                  }}
              >
                FR
              </button>
              <button
                onClick={() => setLanguage("en")}
                className={langButtonEnClassName}
                style={language === "en"
                  ? { 
                      boxShadow: '0 14px 28px -16px rgba(79,70,229,0.55)',
                      fontSize: '0.625rem',
                      minHeight: '36px',
                      minWidth: '36px'
                    }
                  : { 
                      color: 'rgba(255, 255, 255, 0.7)',
                      fontSize: '0.625rem',
                      minHeight: '36px',
                      minWidth: '36px'
                    }
                }
                onMouseEnter={(e) => {
                  if (language !== "en") {
                    e.target.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (language !== "en") {
                    e.target.style.backgroundColor = 'transparent';
                  }
                }}
              >
                EN
              </button>
            </div>
            <nav className="flex gap-2 md:gap-2.5 overflow-x-auto flex-1 md:flex-initial pb-1 md:pb-0 scrollbar-hide -mx-2 md:mx-0 px-2 md:px-0" style={{ WebkitOverflowScrolling: 'touch', scrollSnapType: 'x mandatory' }}>
              <div className="flex gap-2 md:gap-2.5 min-w-max" style={{ scrollSnapAlign: 'start' }}>
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
                {/* Page Modifications désactivée temporairement */}
                {/* {(user?.canAccessModifications || user?.name === "Ewen" || user?.name === "Léa") && (
                  <Pill active={tab === "modifications"} onClick={() => setTab("modifications")}>
                    {t("nav.modifications")}
                  </Pill>
                )} */}
                {(user?.canAccessSituation || user?.name === "Ewen" || user?.name === "Léa") && (
                  <Pill active={tab === "situation"} onClick={() => setTab("situation")}>
                    {t("nav.situation")}
                  </Pill>
                )}
                {(user?.canAccessSituation || user?.name === "Ewen" || user?.name === "Léa" || user?.name === "situation") && (
                  <Pill active={tab === "stopsale"} onClick={() => setTab("stopsale")}>
                    🛑 Stop &amp; Push
                  </Pill>
                )}
                {(user?.canResetData || user?.canAccessUsers || user?.name === "Ewen") && (
                  <Pill active={tab === "users"} onClick={() => setTab("users")}>
                    {t("nav.users")}
                  </Pill>
                )}
                {(user?.name === "Ewen" || user?.name === "Léa") && (
                  <Pill active={tab === "hotels"} onClick={() => setTab("hotels")}>
                    🏨 Hôtels
                  </Pill>
                )}
              </div>
            </nav>
            {user && (
              <GhostBtn
                type="button"
                size="sm"
                variant="danger"
                onClick={handleLogout}
                className="rounded-xl font-semibold !bg-red-500 !text-white !border-red-500 hover:!bg-red-600 flex-shrink-0"
                style={{ boxShadow: '0 16px 32px -20px rgba(239,68,68,0.55)' }}
              >
                <span className="hidden md:inline">🚪 Déconnexion</span>
                <span className="md:hidden">🚪</span>
              </GhostBtn>
            )}
          </div>
        </div>
      </header>

      {/* CONTENU CENTRÉ */}
      <main className={mainClassName}>
        <ScrollOptimizer>
        <PageTransition>
        {tab === "devis" ? (
          <div className="mx-auto max-w-7xl px-2 md:px-3 lg:px-6">
              
              <div 
                  className="space-y-6 md:space-y-10 rounded-2xl p-4 md:p-6 lg:p-8"
                style={{
                  backgroundColor: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  boxShadow: '0 30px 60px -35px rgba(15, 23, 42, 0.65)',
                  borderRadius: '2rem'
                }}
              >
                <ErrorBoundary>
                  <Suspense fallback={<PageLoader />}>
                    <section className="space-y-6">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <h2 className="font-semibold mb-1.5 bg-gradient-to-r from-[#4f46e5] via-[#6366f1] to-[#06b6d4] bg-clip-text text-transparent" style={{ fontSize: '1.75rem', letterSpacing: '-0.03em' }}>
                            {t("page.devis.title")}
                          </h2>
                          <p className="text-sm font-medium leading-relaxed" style={{ color: 'rgba(71, 85, 105, 0.85)' }}>
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
                          onUsedDatesChange={setUsedDates}
                        />
                      </div>
                    </section>
                  </Suspense>
                </ErrorBoundary>
              </div>
          </div>
        ) : (
          <div
            className={`${contentContainerClassName} animate-page-enter`}
            style={{ 
              paddingLeft: '0.5rem', 
              paddingRight: '0.5rem',
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              boxShadow: '0 30px 60px -35px rgba(15, 23, 42, 0.65)'
            }}
          >
            <ErrorBoundary>
              <Suspense fallback={<PageLoader />}>

              {tab === "activities" && user?.canAccessActivities !== false && (
            <Section
              title={t("page.activities.title")}
              subtitle={t("page.activities.subtitle")}
              right={
                user?.canResetData ? (
                <GhostBtn
                  onClick={() => {
                    if (!window.confirm("Réinitialiser les données locales ?")) {
                      return;
                    }
                    const defaultActivities = getDefaultActivities();
                    setActivities(defaultActivities);
                    saveLS(LS_KEYS.activities, defaultActivities);
                }}
              >
                {t("btn.reset")}
              </GhostBtn>
              ) : null
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

        {/* Page Modifications désactivée temporairement */}
        {/* {tab === "modifications" && (user?.canAccessModifications || user?.name === "Ewen" || user?.name === "Léa") && (
          <Section
            title={t("page.modifications.title")}
            subtitle={t("page.modifications.subtitle")}
          >
            <ModificationsPage quotes={quotes} setQuotes={setQuotes} activities={activities} user={user} />
          </Section>
        )} */}

        {tab === "situation" && (user?.canAccessSituation || user?.name === "Ewen" || user?.name === "Léa") && (
          <SituationPage activities={activities} user={user} />
        )}

        {tab === "stopsale" && (user?.canAccessSituation || user?.name === "Ewen" || user?.name === "Léa" || user?.name === "situation") && (
          <Section title="Stop Sale &amp; Push Sale" subtitle="Gérez les arrêts de vente et les ouvertures exceptionnelles">
            <StopSalePage activities={activities} user={user} />
          </Section>
        )}

          {tab === "users" && (user?.canResetData || user?.canAccessUsers || user?.name === "Ewen") && (
            <Section title={t("page.users.title")} subtitle={t("page.users.subtitle")}>
              <UsersPage user={user} />
            </Section>
          )}

          {tab === "hotels" && (user?.name === "Ewen" || user?.name === "Léa") && (
            <Section title="Gestion des hôtels" subtitle="Associez les hôtels à leurs quartiers">
              <ErrorBoundary>
                <Suspense fallback={<PageLoader />}>
                  <HotelsPage user={user} />
                </Suspense>
              </ErrorBoundary>
            </Section>
          )}
              </Suspense>
            </ErrorBoundary>
        </div>
        )}
        </PageTransition>
        </ScrollOptimizer>
      </main>

      <footer 
        className={footerClassName} 
        style={{ 
          color: 'rgba(255, 255, 255, 0.65)', 
          borderTopColor: 'rgba(255, 255, 255, 0.1)', 
          fontSize: '0.6875rem' 
        }}
      >
        {footerText}
      </footer>

      {/* Bouton dates utilisées : fixé au viewport (hors scroll) pour être visible tout le temps sur l'onglet Devis */}
      {tab === "devis" && usedDates.length > 0 && (
        <div className="fixed bottom-6 left-6 z-[9999]" aria-hidden>
          <button
            type="button"
            onClick={() => setShowDatesModal(true)}
            className="relative w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-110 active:scale-95"
            style={{
              backgroundColor: "rgba(251, 191, 36, 0.95)",
              boxShadow: "0 8px 24px -8px rgba(180, 83, 9, 0.6)",
            }}
            title="Voir les dates utilisées"
          >
            <span className="text-2xl">📅</span>
            <span
              className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold text-white"
              style={{ backgroundColor: "rgba(239, 68, 68, 0.9)" }}
            >
              {usedDates.length}
            </span>
          </button>
        </div>
      )}

      {/* Modale des dates utilisées (même niveau que le bouton, hors scroll) */}
      {tab === "devis" && usedDates.length > 0 && showDatesModal && (
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0, 0, 0, 0.5)" }}
          onClick={() => setShowDatesModal(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="px-6 py-4 border-b flex items-center justify-between"
              style={{ backgroundColor: "rgba(255, 251, 235, 0.5)" }}
            >
              <div className="flex items-center gap-3">
                <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                <h3 className="text-lg font-semibold text-amber-900">
                  Dates déjà utilisées ({usedDates.length})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowDatesModal(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-amber-100 transition-colors"
              >
                <span className="text-xl text-amber-700">×</span>
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              <div className="space-y-4">
                {usedDates.map(([date, activities]) => (
                  <div
                    key={date}
                    className="rounded-xl p-4 border border-amber-200"
                    style={{
                      backgroundColor: "rgba(255, 251, 235, 0.5)",
                      boxShadow: "0 2px 8px -4px rgba(217, 119, 6, 0.2)",
                    }}
                  >
                    <p className="text-sm font-semibold text-amber-900 mb-2">
                      {new Date(date + "T12:00:00").toLocaleDateString("fr-FR", {
                        weekday: "long",
                        day: "numeric",
                        month: "long",
                      })}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {activities.map((activity, idx) => (
                        <span
                          key={idx}
                          className="px-3 py-1 rounded-lg text-xs font-medium"
                          style={{
                            backgroundColor: "rgba(255, 255, 255, 0.9)",
                            color: "rgba(180, 83, 9, 0.9)",
                            border: "1px solid rgba(217, 119, 6, 0.3)",
                          }}
                        >
                          {activity}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
