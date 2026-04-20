import { useEffect, useState, useRef, Suspense, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { supabase, __SUPABASE_DEBUG__ } from "./lib/supabase";
import { SITE_KEY, PIN_CODE, LS_KEYS, getDefaultActivities } from "./constants";
import { uuid, mergeTransfers, calculateCardPrice, saveLS, loadLS } from "./utils";
import { loadUserFromSession } from "./utils/userPermissions";
import {
  ActivitiesPage,
  ActivityUpdatePage,
  ActivityCatalogAdminPage,
  QuotesPage,
  HistoryPage,
  UsersPage,
  HotelsPage,
  TicketPage,
  SITUATION_PAGE_STANDBY,
  SituationPage,
  StopSalePage,
  DocumentsPage,
  RequestPage,
  PublicTarifsPage,
  PublicClientDevisPage,
  PublicCatalogueActivityPage,
  EwenDashboardPage,
} from "./config/lazyPages";
import { ScrollOptimizer } from "./components/ScrollOptimizer";
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
import { mergeActivitiesWhenRemoteShrunk, stripLocalOnlyActivityForStorage } from "./utils/activitiesBackup";
import { normalizeCatalogImageUrlsFromDb } from "./utils/catalogContent";

export default function App() {
  const location = useLocation();
  const [ok, setOk] = useState(false);
  const [tab, setTab] = useState("devis");
  // Source de vérité: Supabase (les données locales servent seulement de cache temporaire d'affichage).
  const [activities, setActivities] = useState(() => loadLS(LS_KEYS.activities, getDefaultActivities()));
  const [quotes, setQuotes] = useState(() => loadLS(LS_KEYS.quotes, []));
  const [quoteDraft, setQuoteDraft] = useState(() => loadLS(LS_KEYS.quoteForm, null));
  const [remoteEnabled, setRemoteEnabled] = useState(false);
  const [user, setUser] = useState(null);
  /** État brut Supabase Presence (canal partagé « qui est en ligne »). */
  const [presenceState, setPresenceState] = useState({});
  const intranetPresenceChannelRef = useRef(null);
  const [usedDates, setUsedDates] = useState([]);
  const [showDatesModal, setShowDatesModal] = useState(false);
  const { language, setLanguage } = useLanguage();
  const { t } = useTranslation();

  // Réinitialiser les dates utilisées quand on change d'onglet
  useEffect(() => {
    if (tab !== "devis") {
      setUsedDates([]);
    }
  }, [tab]);

  /** Maj prix : onglet réservé aux profils avec permission explicite. */
  useEffect(() => {
    if (!user || tab !== "activity-update") return;
    if (user.canAccessActivities === false || user.canAccessActivityPrices !== true) {
      setTab(user.canAccessActivities !== false ? "activities" : "devis");
    }
  }, [user, tab]);

  /** Contenu catalogue public : réservé aux comptes autorisés à modifier les activités. */
  useEffect(() => {
    if (!user || tab !== "catalog-admin") return;
    if (user.canAccessActivities === false || user.canEditActivity !== true) {
      setTab(user.canAccessActivities !== false ? "activities" : "devis");
    }
  }, [user, tab]);

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

  /** Présence en ligne : chaque utilisateur connecté rejoint le même canal Realtime (visible sur le tableau de bord Ewen). */
  useEffect(() => {
    const clearChannel = () => {
      const ch = intranetPresenceChannelRef.current;
      if (ch) {
        supabase.removeChannel(ch).catch(() => {});
        intranetPresenceChannelRef.current = null;
      }
    };

    if (!ok || !user || !__SUPABASE_DEBUG__.isConfigured) {
      setPresenceState({});
      clearChannel();
      return;
    }

    let tabId = sessionStorage.getItem("hd_presence_tab");
    if (!tabId) {
      tabId =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : uuid();
      sessionStorage.setItem("hd_presence_tab", tabId);
    }

    const channel = supabase.channel("hd_intranet_presence", {
      config: { presence: { key: tabId } },
    });

    /** Realtime réutilise le même objet : cloner pour forcer un re-render React à chaque sync/join/leave. */
    const pushPresenceSnapshot = () => {
      try {
        const raw = channel.presenceState();
        setPresenceState(structuredClone(raw));
      } catch {
        try {
          setPresenceState(JSON.parse(JSON.stringify(channel.presenceState())));
        } catch {
          setPresenceState({ ...channel.presenceState() });
        }
      }
    };

    channel
      .on("presence", { event: "sync" }, pushPresenceSnapshot)
      .on("presence", { event: "join" }, pushPresenceSnapshot)
      .on("presence", { event: "leave" }, pushPresenceSnapshot)
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          const { error } = await channel.track({
            name: user.name || "",
            code: user.code != null ? String(user.code) : "",
            id: user.id != null ? user.id : null,
            online_at: Date.now(),
          });
          if (error) {
            logger.warn("Présence intranet : échec du track", error);
          }
          pushPresenceSnapshot();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          logger.warn("Présence intranet : canal", status);
        }
      });

    intranetPresenceChannelRef.current = channel;

    return () => {
      clearChannel();
      setPresenceState({});
    };
  }, [ok, user?.code, user?.name, user?.id]);

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
      /** `*` évite une erreur PostgREST si une colonne (ex. babies_forbidden) n’est pas encore migrée ; elle apparaît dès qu’elle existe en base. */
      const selectColumns = "*";
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
            babiesForbidden: row.babies_forbidden === true,
            currency: row.currency || "EUR",
            availableDays: row.available_days || [false, false, false, false, false, false, false],
            notes: row.notes || "",
            description: row.description || "",
            catalogImageUrls: normalizeCatalogImageUrlsFromDb(row.catalog_image_urls),
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

        // Source de vérité = Supabase (plusieurs PC travaillent dessus).
        const current = loadLS(LS_KEYS.activities, []);
        if (finalRows.length > 0) {
          const supabaseActivities = mapActivitiesFromRows(finalRows);
          // Sécurité : ne jamais remplacer par une liste beaucoup plus courte (évite suppression en masse accidentelle).
          const minAcceptable = current.length > 0 ? Math.max(1, Math.floor(current.length * 0.8)) : 0;
          if (current.length > 0 && supabaseActivities.length < minAcceptable) {
            const { merged, localOnlyAdded, usedMerge } = mergeActivitiesWhenRemoteShrunk(
              finalRows,
              current,
              mapActivitiesFromRows
            );
            logger.warn(
              `🛡️ Sécurité: Supabase a ${supabaseActivities.length} activité(s), la session en avait ${current.length}. Fusion cache + base (comme pour les utilisateurs).`
            );
            toast.warning(
              `Supabase renvoie beaucoup moins d'activités (${supabaseActivities.length}) qu'attendu (${current.length}). ` +
                (usedMerge && localOnlyAdded > 0
                  ? `${localOnlyAdded} activité(s) récupérée(s) depuis le cache — ouvrez « Activités » puis « Réinsérer dans Supabase » pour les recréer en base. `
                  : "Liste locale fusionnée avec la base. ") +
                `Vérifiez la connexion ou restaurez une sauvegarde depuis la page Activités si besoin.`
            );
            setActivities(merged);
            saveLS(LS_KEYS.activities, stripLocalOnlyActivityForStorage(merged));
            activitiesCache.set(cacheKey, merged);
          } else {
            setActivities(supabaseActivities);
            saveLS(LS_KEYS.activities, supabaseActivities);
            activitiesCache.set(cacheKey, supabaseActivities);
          }
        } else {
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
  }, []);

  // NOTE: la conversion d'une demande en devis est désactivée pour l'instant
  // (fonction conservée dans l'historique git si besoin de la réactiver).

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
        babiesForbidden: row.babies_forbidden === true,
        currency: row.currency || "EUR",
        availableDays: Array.isArray(row.available_days) && row.available_days.length === 7
          ? row.available_days
          : [false, false, false, false, false, false, false],
        notes: row.notes || "",
        description: row.description || "",
        catalogImageUrls: normalizeCatalogImageUrlsFromDb(row.catalog_image_urls),
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
            // Sécurité : ne jamais appliquer un DELETE reçu en Realtime (évite que les activités disparaissent toutes seules).
            const deletedId = payload.old?.id;
            const deletedActivity = payload.old;
            logger.warn("🗑️ SUPPRESSION D'ACTIVITÉ DÉTECTÉE VIA REALTIME (ignorée en local pour sécurité):", {
              supabase_id: deletedId,
              activity_name: deletedActivity?.name
            });
            // On n'appelle pas syncWithSupabase() : la liste locale reste inchangée jusqu'au prochain chargement de page.
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
          import("./pages/ActivityUpdatePage"),
          import("./pages/ActivityCatalogAdminPage"),
          import("./pages/HistoryPage"),
          import("./pages/TicketPage"),
          import("./pages/ModificationsPage"),
          import("./pages/SituationPage"),
          import("./pages/UsersPage"),
          import("./pages/EwenDashboardPage"),
        ]);
      } catch (error) {
        logger.warn("Préchargement des pages échoué", error);
      }
    };

    const timer = setTimeout(preload, 200);

    return () => clearTimeout(timer);
  }, [ok]);

  // Page tarifs publique (sans compte)
  if (location.pathname === "/tarifs" || location.pathname === "/tarifs/") {
    return (
      <ErrorBoundary>
        <Suspense fallback={<PageLoader />}>
          <PublicTarifsPage />
        </Suspense>
      </ErrorBoundary>
    );
  }

  // Fiche activité publique (clic depuis le catalogue) — avant la liste /catalogue
  const catalogueActivityMatch = location.pathname.match(/^\/catalogue\/activity\/([^/]+)\/?$/);
  if (catalogueActivityMatch) {
    const catalogueActivityId = decodeURIComponent(catalogueActivityMatch[1]);
    return (
      <ErrorBoundary>
        <Suspense fallback={<PageLoader />}>
          <PublicCatalogueActivityPage activityId={catalogueActivityId} />
        </Suspense>
      </ErrorBoundary>
    );
  }

  // Page publique catalogue + panier + demande de devis
  if (location.pathname === "/catalogue" || location.pathname === "/catalogue/") {
    return (
      <ErrorBoundary>
        <Suspense fallback={<PageLoader />}>
          <PublicClientDevisPage />
        </Suspense>
      </ErrorBoundary>
    );
  }

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
  const headerNavClassName = `glass-nav mx-auto flex flex-col items-stretch gap-3 md:gap-4 ${maxWidthClass} px-3 md:px-4 py-3 md:py-4 rounded-xl md:rounded-2xl`;
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
          <div className="flex w-full min-w-0 flex-col gap-3">
            {/* Ligne 1 : identité + langue + déconnexion (ne mange pas la largeur des onglets) */}
            <div className="flex w-full min-w-0 flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 max-w-full flex-1 items-center gap-2 md:gap-3.5">
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
              <div className="flex shrink-0 items-center gap-2 md:gap-3">
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

            {/* Ligne 2 : onglets sur toute la largeur, retour à la ligne automatique */}
            <nav
              className="w-full min-w-0 border-t border-white/10 pt-3"
              style={{ borderTopColor: "rgba(255,255,255,0.12)" }}
              aria-label="Navigation principale"
            >
              <div className="flex w-full min-w-0 flex-wrap gap-2 md:gap-2.5">
                <Pill active={tab === "devis"} onClick={() => setTab("devis")}>
                  {t("nav.devis")}
                </Pill>
                {user?.canAccessActivities !== false && (
                <Pill active={tab === "activities"} onClick={() => setTab("activities")}>
                  {t("nav.activities")}
                </Pill>
                )}
                {user?.canAccessActivities !== false && user?.canAccessActivityPrices === true && (
                <Pill active={tab === "activity-update"} onClick={() => setTab("activity-update")}>
                  {t("nav.activityUpdate")}
                </Pill>
                )}
                {user?.canAccessActivities !== false && user?.canEditActivity === true && (
                <Pill active={tab === "catalog-admin"} onClick={() => setTab("catalog-admin")}>
                  {t("nav.catalogAdmin")}
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
                {!SITUATION_PAGE_STANDBY && (user?.canAccessSituation || user?.name === "Ewen" || user?.name === "Léa") && (
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
                {user?.name === "Ewen" && (
                  <Pill active={tab === "ewen-dashboard"} onClick={() => setTab("ewen-dashboard")}>
                    {t("nav.ewenDashboard")}
                  </Pill>
                )}
                <Pill active={tab === "documents"} onClick={() => setTab("documents")}>
                  {t("nav.documents")}
                </Pill>
              </div>
            </nav>
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

        {tab === "activity-update" &&
          user?.canAccessActivities !== false &&
          user?.canAccessActivityPrices === true && (
          <Section
            title={t("page.activityUpdate.title")}
            subtitle={t("page.activityUpdate.subtitle")}
          >
            <ActivityUpdatePage activities={activities} setActivities={setActivities} user={user} />
          </Section>
        )}

        {tab === "catalog-admin" && user?.canAccessActivities !== false && user?.canEditActivity === true && (
          <Section title={t("page.catalogAdmin.title")} subtitle={t("page.catalogAdmin.subtitle")}>
            <ActivityCatalogAdminPage activities={activities} setActivities={setActivities} user={user} />
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

        {!SITUATION_PAGE_STANDBY && tab === "situation" && (user?.canAccessSituation || user?.name === "Ewen" || user?.name === "Léa") && (
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

          {tab === "ewen-dashboard" && user?.name === "Ewen" && (
            <Section title={t("page.ewenDashboard.title")} subtitle={t("page.ewenDashboard.subtitle")}>
              <ErrorBoundary>
                <Suspense fallback={<PageLoader />}>
                  <EwenDashboardPage
                    user={user}
                    presenceState={presenceState}
                    supabaseConfigured={__SUPABASE_DEBUG__.isConfigured}
                  />
                </Suspense>
              </ErrorBoundary>
            </Section>
          )}

          {tab === "documents" && (
            <Section title={t("page.documents.title")} subtitle={t("page.documents.subtitle")}>
              <ErrorBoundary>
                <Suspense fallback={<PageLoader />}>
                  <DocumentsPage user={user} />
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
