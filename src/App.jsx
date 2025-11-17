import { useEffect, useState, useRef, lazy, Suspense, useMemo, useCallback } from "react";
import { Routes, Route, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "./lib/supabase";
import { SITE_KEY, PIN_CODE, LS_KEYS, getDefaultActivities } from "./constants";
import { uuid, emptyTransfers, calculateCardPrice, saveLS, loadLS } from "./utils";
import { configureUserPermissions, loadUserFromSession } from "./utils/userPermissions";
import { Pill, GhostBtn, Section } from "./components/ui";
import { LoginPage } from "./pages/LoginPage";
import { useLanguage } from "./contexts/LanguageContext";
import { useTranslation } from "./hooks/useTranslation";
import PageLoader from "./components/PageLoader";
import ErrorBoundary from "./components/ErrorBoundary";
import { toast } from "./utils/toast.js";

// Fonction helper pour le lazy loading avec gestion d'erreur et retry
const lazyWithRetry = (importFn, retries = 3) => {
  return lazy(() => {
    const loadModule = (attempt = 0) => {
      return importFn().catch((error) => {
        console.warn(`Erreur de chargement du module (tentative ${attempt + 1}/${retries + 1})...`, error);
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
        console.error("Impossible de charger le module après plusieurs tentatives, rechargement de la page...");
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
const TicketPage = lazyWithRetry(() => import("./pages/TicketPage").then(module => ({ default: module.TicketPage })));
const ModificationsPage = lazyWithRetry(() => import("./pages/ModificationsPage").then(module => ({ default: module.ModificationsPage })));
const SituationPage = lazyWithRetry(() => import("./pages/SituationPage").then(module => ({ default: module.SituationPage })));
const StopSalePage = lazyWithRetry(() => import("./pages/StopSalePage").then(module => ({ default: module.StopSalePage })));
const DemandesPage = lazyWithRetry(() => import("./pages/DemandesPage").then(module => ({ default: module.DemandesPage })));
const RequestPage = lazyWithRetry(() => import("./pages/RequestPage").then(module => ({ default: module.RequestPage })));

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const [ok, setOk] = useState(false);
  const [tab, setTab] = useState("devis");
  // Forcer la lecture uniquement depuis Supabase, ignorer le localStorage local
  const [activities, setActivities] = useState(() => getDefaultActivities());
  const [quotes, setQuotes] = useState(() => loadLS(LS_KEYS.quotes, []));
  const [quoteDraft, setQuoteDraft] = useState(() => loadLS(LS_KEYS.quoteForm, null));
  const [remoteEnabled, setRemoteEnabled] = useState(false);
  const [user, setUser] = useState(null);
  const [usedDates, setUsedDates] = useState([]);
  const [showDatesModal, setShowDatesModal] = useState(false);
  const [pendingRequestsCount, setPendingRequestsCount] = useState(0);
  const { language, setLanguage } = useLanguage();
  const { t } = useTranslation();

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
      console.warn("Erreur lors de la suppression des informations de session:", error);
    }
    setUser(null);
    setQuoteDraft(null);
    setTab("devis");
    setOk(false);
  }, []);

  // fonction de synchronisation Supabase - mémoïsée avec useCallback
  // Note: setActivities et setRemoteEnabled sont des setters stables de React, pas besoin de dépendances
  const syncWithSupabase = useCallback(async () => {
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
            return `${SITE_KEY}_${activity.name}_${activity.category || 'desert'}`;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fonction pour charger le nombre de demandes en attente
  const loadPendingRequestsCount = useCallback(async () => {
    if (!supabase || !ok) return;
    try {
      const { count, error } = await supabase
        .from("client_requests")
        .select("*", { count: "exact", head: true })
        .eq("site_key", SITE_KEY)
        .eq("status", "pending");

      if (!error) {
        setPendingRequestsCount(count || 0);
      }
    } catch (err) {
      console.warn("Erreur lors du chargement du nombre de demandes:", err);
    }
  }, [ok]);

  // Fonction pour créer un devis à partir d'une demande
  const handleCreateQuoteFromRequest = useCallback(async (request) => {
    if (!request) return;

    // Convertir les activités sélectionnées de la demande en items de devis
    const items = [];
    if (request.selected_activities && Array.isArray(request.selected_activities)) {
      request.selected_activities.forEach((selectedActivity) => {
        // Trouver l'activité correspondante
        const activity = activities.find(
          (a) => 
            a.id?.toString() === selectedActivity.activityId?.toString() ||
            a.supabase_id?.toString() === selectedActivity.activityId?.toString()
        );

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
        hotel: request.client_hotel || "",
        room: request.client_room || "",
        neighborhood: request.client_neighborhood || "",
        arrivalDate: request.arrival_date || "",
        departureDate: request.departure_date || "",
      },
      items: items,
      notes: request.notes || "",
    };

    // Supprimer la demande de Supabase
    if (supabase && request.id) {
      try {
        const { error } = await supabase
          .from("client_requests")
          .delete()
          .eq("id", request.id)
          .eq("site_key", SITE_KEY);

        if (error) {
          console.warn("Erreur lors de la suppression de la demande:", error);
          // Continuer quand même même si la suppression échoue
        } else {
          // Mettre à jour le compteur de demandes en attente
          if (loadPendingRequestsCount) {
            loadPendingRequestsCount();
          }
        }
      } catch (err) {
        console.warn("Exception lors de la suppression de la demande:", err);
        // Continuer quand même même si la suppression échoue
      }
    }

    // Mettre à jour le draft et changer d'onglet
    setQuoteDraft(draft);
    setTab("devis");
    
    toast.success("Demande chargée dans le formulaire de devis !");
  }, [activities, loadPendingRequestsCount]);

  // charger supabase au montage et synchronisation des activités toutes les 10 secondes (optimisé)
  useEffect(() => {
    // Synchronisation immédiate
    syncWithSupabase();

    // Synchronisation des activités toutes les 10 secondes (optimisé: réduit de 3s à 10s pour moins de charge)
    const interval = setInterval(() => {
      syncWithSupabase();
    }, 10000);

    // Nettoyer l'intervalle au démontage
    return () => {
      clearInterval(interval);
    };
  }, [syncWithSupabase]);

  // Charger le nombre de demandes en attente au montage et périodiquement
  useEffect(() => {
    if (!ok) return;
    
    // Charger immédiatement
    loadPendingRequestsCount();

    // Recharger toutes les 10 secondes
    const interval = setInterval(() => {
      loadPendingRequestsCount();
    }, 10000);

    return () => {
      clearInterval(interval);
    };
  }, [ok, loadPendingRequestsCount]);

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
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          console.log('✅ Abonnement Realtime actif pour les devis');
        } else if (status === 'CHANNEL_ERROR') {
          console.warn('⚠️ Erreur abonnement Realtime:', status, err);
          // Réessayer de s'abonner après un délai en cas d'erreur
          setTimeout(() => {
            console.log('🔄 Tentative de reconnexion Realtime...');
            // Le channel sera recréé au prochain render si remoteEnabled change
          }, 5000);
        } else if (status === 'TIMED_OUT') {
          console.warn('⏱️ Timeout abonnement Realtime, reconnexion...');
        } else if (status === 'CLOSED') {
          console.log('🔌 Abonnement Realtime fermé');
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

  // Si on est sur la route publique /request/:token, afficher RequestPage sans authentification
  if (location.pathname.startsWith("/request/")) {
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
  const mainClassName = `flex-1 overflow-y-auto py-4 md:py-10 ${mainPaddingClass}`;
  const footerClassName = `mx-auto px-4 py-8 border-t mt-10 font-medium tracking-wide ${maxWidthClass}`;
  const contentContainerClassName = `mx-auto space-y-6 md:space-y-10 ${maxWidthClass} rounded-2xl p-4 md:p-6 lg:p-8 backdrop-blur-2xl`;
  // Construire les className pour les boutons de langue
  const langButtonBaseClass = "px-2 md:px-2.5 py-1.5 font-semibold rounded-lg transition-colors";
  const langButtonActiveClass = "bg-gradient-to-r from-[#4f46e5] to-[#0ea5e9] text-white";
  const langButtonInactiveClass = "hover:text-[#a5b4fc]";
  const langButtonFrClassName = langButtonBaseClass + " " + (language === "fr" ? langButtonActiveClass : langButtonInactiveClass);
  const langButtonEnClassName = langButtonBaseClass + " " + (language === "en" ? langButtonActiveClass : langButtonInactiveClass);
  const footerText = "support 7 sur 7 = +33619921449";

  return (
    <div className="min-h-screen flex flex-col bg-transparent overflow-hidden">
      {/* HEADER */}
      <header className="sticky top-0 z-50 pt-2 md:pt-4 pb-2 md:pb-3 px-2 md:px-3 lg:px-6 backdrop-blur-xl" style={{ backgroundColor: 'rgba(7,13,31,0.9)', boxShadow: '0 24px 60px -32px rgba(7,13,31,0.65)' }}>
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
            <nav className="flex gap-2 md:gap-2.5 overflow-x-auto flex-1 md:flex-initial pb-1 md:pb-0 scrollbar-hide">
              <div className="flex gap-2 md:gap-2.5 min-w-max">
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
                <Pill active={tab === "demandes"} onClick={() => setTab("demandes")}>
                  <span className="flex items-center gap-2">
                    <span>📋 Demandes</span>
                    {pendingRequestsCount > 0 && (
                      <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-xs font-bold text-white bg-red-500 rounded-full animate-pulse">
                        {pendingRequestsCount > 99 ? '99+' : pendingRequestsCount}
                      </span>
                    )}
                  </span>
                </Pill>
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
        {tab === "devis" ? (
          <div className="mx-auto max-w-7xl px-2 md:px-3 lg:px-6">
              
              <div 
                className="space-y-6 md:space-y-10 rounded-2xl p-4 md:p-6 lg:p-8 backdrop-blur-2xl"
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
              
              {/* Boutons flottants : remonter en haut et dates utilisées */}
              <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3">
                {/* Bouton "Remonter en haut" - Toujours visible */}
                <button
                  onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
                  className="w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-110 active:scale-95"
                  style={{
                    backgroundColor: 'rgba(59, 130, 246, 0.95)',
                    boxShadow: '0 8px 24px -8px rgba(37, 99, 235, 0.6)',
                    backdropFilter: 'blur(12px)'
                  }}
                  title="Remonter en haut"
                  aria-label="Remonter en haut de la page"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-6 w-6 text-white"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                  </svg>
                </button>

                {/* Bouton flottant pour voir les dates utilisées */}
                {usedDates.length > 0 && (
                  <button
                    onClick={() => setShowDatesModal(true)}
                    className="w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-110 active:scale-95"
                    style={{
                      backgroundColor: 'rgba(251, 191, 36, 0.95)',
                      boxShadow: '0 8px 24px -8px rgba(180, 83, 9, 0.6)',
                      backdropFilter: 'blur(12px)'
                    }}
                    title="Voir les dates utilisées"
                  >
                    <div className="relative">
                      <span className="text-2xl">📅</span>
                      <span 
                        className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold text-white"
                        style={{ backgroundColor: 'rgba(239, 68, 68, 0.9)' }}
                      >
                        {usedDates.length}
                      </span>
                    </div>
                  </button>
                )}
              </div>

              {/* Modale des dates utilisées */}
              {usedDates.length > 0 && showDatesModal && (
                    <div 
                      className="fixed inset-0 z-50 flex items-center justify-center p-4"
                      style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
                      onClick={() => setShowDatesModal(false)}
                    >
                      <div 
                        className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div 
                          className="px-6 py-4 border-b flex items-center justify-between"
                          style={{ backgroundColor: 'rgba(255, 251, 235, 0.5)' }}
                        >
                          <div className="flex items-center gap-3">
                            <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                            <h3 className="text-lg font-semibold text-amber-900">
                              Dates déjà utilisées ({usedDates.length})
                            </h3>
                          </div>
                          <button
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
                                  backgroundColor: 'rgba(255, 251, 235, 0.5)',
                                  boxShadow: '0 2px 8px -4px rgba(217, 119, 6, 0.2)'
                                }}
                              >
                                <p className="text-sm font-semibold text-amber-900 mb-2">
                                  {new Date(date + "T12:00:00").toLocaleDateString('fr-FR', { 
                                    weekday: 'long', 
                                    day: 'numeric', 
                                    month: 'long' 
                                  })}
                                </p>
                                <div className="flex flex-wrap gap-2">
                                  {activities.map((activity, idx) => (
                                    <span
                                      key={idx}
                                      className="px-3 py-1 rounded-lg text-xs font-medium"
                                      style={{
                                        backgroundColor: 'rgba(255, 255, 255, 0.9)',
                                        color: 'rgba(180, 83, 9, 0.9)',
                                        border: '1px solid rgba(217, 119, 6, 0.3)'
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
        ) : (
          <div
            className={contentContainerClassName}
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

        {tab === "modifications" && (user?.canAccessModifications || user?.name === "Ewen" || user?.name === "Léa") && (
          <Section
            title={t("page.modifications.title")}
            subtitle={t("page.modifications.subtitle")}
          >
            <ModificationsPage quotes={quotes} setQuotes={setQuotes} activities={activities} user={user} />
          </Section>
        )}

        {tab === "situation" && (user?.canAccessSituation || user?.name === "Ewen" || user?.name === "Léa") && (
          <SituationPage activities={activities} user={user} />
        )}

        {tab === "stopsale" && (user?.canAccessSituation || user?.name === "Ewen" || user?.name === "Léa" || user?.name === "situation") && (
          <Section title="Stop Sale &amp; Push Sale" subtitle="Gérez les arrêts de vente et les ouvertures exceptionnelles">
            <StopSalePage activities={activities} user={user} />
          </Section>
        )}

        {tab === "demandes" && (
          <Section title="📋 Demandes clients" subtitle="Gérer les demandes de devis de vos clients">
            <ErrorBoundary>
              <Suspense fallback={<PageLoader />}>
                <DemandesPage 
                  activities={activities} 
                  onRequestStatusChange={loadPendingRequestsCount}
                  onCreateQuoteFromRequest={handleCreateQuoteFromRequest}
                />
              </Suspense>
            </ErrorBoundary>
          </Section>
        )}

          {tab === "users" && (user?.canResetData || user?.canAccessUsers || user?.name === "Ewen") && (
            <Section title={t("page.users.title")} subtitle={t("page.users.subtitle")}>
              <UsersPage user={user} />
            </Section>
          )}
              </Suspense>
            </ErrorBoundary>
        </div>
        )}
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
    </div>
  );
}
