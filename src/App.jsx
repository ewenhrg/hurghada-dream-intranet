import { useEffect, useState } from "react";
import { supabase } from "./lib/supabase";
import { SITE_KEY, PIN_CODE, LS_KEYS, getDefaultActivities } from "./constants";
import { uuid, emptyTransfers, calculateCardPrice, saveLS, loadLS } from "./utils";
import { Pill, GhostBtn, Section } from "./components/ui";
import { LoginPage } from "./pages/LoginPage";
import { ActivitiesPage } from "./pages/ActivitiesPage";
import { QuotesPage } from "./pages/QuotesPage";
import { HistoryPage } from "./pages/HistoryPage";
import { UsersPage } from "./pages/UsersPage";
import { TicketPage } from "./pages/TicketPage";

export default function App() {
  const [ok, setOk] = useState(false);
  const [tab, setTab] = useState("devis");
  const [activities, setActivities] = useState(() => loadLS(LS_KEYS.activities, getDefaultActivities()));
  const [quotes, setQuotes] = useState(() => loadLS(LS_KEYS.quotes, []));
  const [remoteEnabled, setRemoteEnabled] = useState(false);
  const [user, setUser] = useState(null);

  // Vérifier si l'utilisateur est déjà connecté
  useEffect(() => {
    const already = sessionStorage.getItem("hd_ok") === "1";
    if (already) {
      const userStr = sessionStorage.getItem("hd_user");
      if (userStr) {
        try {
          setUser(JSON.parse(userStr));
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
        setUser(JSON.parse(userStr));
      } catch (e) {
        console.error("Erreur lors de la lecture des données utilisateur:", e);
      }
    }
    setOk(true);
  }

  // fonction de synchronisation Supabase
  async function syncWithSupabase() {
      if (!supabase) return;
    try {
      // Vérifier si Supabase est configuré (pas un stub)
      const { data: testData, error: testError } = await supabase.from("activities").select("id").limit(1);
      
      // Si pas d'erreur de connexion/config, Supabase est disponible
      if (!testError || testError.code !== "PGRST116") {
        setRemoteEnabled(true);
      }

      // Récupérer toutes les activités
      const { data, error } = await supabase.from("activities").select("*").eq("site_key", SITE_KEY).order("id", { ascending: false });
      if (!error && Array.isArray(data)) {
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

          // Fusionner avec les activités locales en préservant les modifications locales récentes
          setActivities((prevActivities) => {
            // Créer un Set des clés uniques (site_key + name + category) pour détecter les doublons
            const uniqueKeys = new Set();
            const merged = [];
            const processedSupabaseIds = new Set();
            const processedLocalIds = new Set();

            // Fonction pour créer une clé unique d'une activité
            const getUniqueKey = (activity) => {
              return `${activity.site_key || SITE_KEY}_${activity.name}_${activity.category || 'desert'}`;
            };

            // D'abord, traiter les activités locales qui ont un supabase_id
            prevActivities.forEach((localActivity) => {
              if (localActivity.supabase_id) {
                const supabaseActivity = supabaseActivitiesMap.get(localActivity.supabase_id);
                if (supabaseActivity) {
                  // L'activité existe dans Supabase, utiliser les données Supabase (qui sont à jour)
                  const key = getUniqueKey(supabaseActivity);
                  if (!uniqueKeys.has(key)) {
                    merged.push(supabaseActivity);
                    uniqueKeys.add(key);
                    processedSupabaseIds.add(localActivity.supabase_id);
                    processedLocalIds.add(localActivity.id);
                  }
                } else {
                  // L'activité locale a un supabase_id mais n'existe plus dans Supabase
                  // Conserver l'activité locale (peut-être supprimée) si elle n'est pas un doublon
                  const key = getUniqueKey(localActivity);
                  if (!uniqueKeys.has(key)) {
                    merged.push(localActivity);
                    uniqueKeys.add(key);
                    processedLocalIds.add(localActivity.id);
                  }
                }
              } else {
                // Activité locale sans supabase_id (nouvelle, pas encore synchronisée)
                // La conserver pour qu'elle soit envoyée à Supabase plus tard
                // MAIS vérifier d'abord qu'elle n'existe pas déjà dans Supabase
                const key = getUniqueKey(localActivity);
                const existingSupabaseActivity = Array.from(supabaseActivitiesMap.values()).find(
                  (supaActivity) => getUniqueKey(supaActivity) === key
                );
                
                if (existingSupabaseActivity && !uniqueKeys.has(key)) {
                  // L'activité existe déjà dans Supabase, utiliser celle de Supabase avec son supabase_id
                  merged.push(existingSupabaseActivity);
                  uniqueKeys.add(key);
                  processedSupabaseIds.add(existingSupabaseActivity.supabase_id);
                  processedLocalIds.add(localActivity.id);
                } else if (!uniqueKeys.has(key)) {
                  // Activité locale sans supabase_id (nouvelle, pas encore synchronisée)
                  // La conserver pour qu'elle soit envoyée à Supabase plus tard
                  merged.push(localActivity);
                  uniqueKeys.add(key);
                  processedLocalIds.add(localActivity.id);
                }
                // Si uniqueKeys.has(key) est true, on ignore cette activité (doublon)
              }
            });

            // Ajouter les activités Supabase qui n'ont pas encore été traitées (nouvelles activités)
            supabaseActivitiesMap.forEach((supabaseActivity, supabaseId) => {
              if (!processedSupabaseIds.has(supabaseId)) {
                const key = getUniqueKey(supabaseActivity);
                if (!uniqueKeys.has(key)) {
                  merged.push(supabaseActivity);
                  uniqueKeys.add(key);
                }
                // Sinon, on ignore cette activité (doublon)
              }
            });

            // Mettre à jour aussi le localStorage
            saveLS(LS_KEYS.activities, merged);

            return merged;
          });
        }
      }

      // Désactivation de la synchronisation automatique des devis depuis Supabase
      // Les devis sont créés localement et envoyés à Supabase, mais on ne les récupère plus automatiquement
      // pour éviter les problèmes de doublons et de devis vierges
      // La synchronisation se fait uniquement via Realtime pour les mises à jour (tickets, etc.)
    } catch (err) {
      console.warn("Erreur synchronisation Supabase:", err);
    }
  }

  // charger supabase au montage et synchronisation toutes les 3 secondes
  useEffect(() => {
    // Synchronisation immédiate
    syncWithSupabase();

    // Synchronisation toutes les 3 secondes
    const interval = setInterval(() => {
      syncWithSupabase();
    }, 3000);

    // Nettoyer l'intervalle au démontage
    return () => {
      clearInterval(interval);
    };
  }, []);

  // Synchronisation en temps réel des devis via Supabase Realtime
  useEffect(() => {
    if (!supabase || !remoteEnabled) return;

    // Fonction pour faire correspondre un devis Supabase avec un devis local
    const findMatchingLocalQuote = (supabaseQuote, localQuotes) => {
      const supabasePhone = supabaseQuote.client_phone || "";
      const supabaseCreatedAt = supabaseQuote.created_at || "";
      
      return localQuotes.find((localQuote) => {
        const localPhone = localQuote.client?.phone || "";
        const localCreatedAt = localQuote.createdAt || "";
        
        // Correspondre par téléphone et date de création
        return localPhone === supabasePhone && localCreatedAt === supabaseCreatedAt;
      });
    };

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
              // Chercher si le devis existe déjà localement
              const existingIndex = prevQuotes.findIndex((q) => {
                const match = findMatchingLocalQuote(payload.new, [q]);
                return match !== undefined;
              });

              if (existingIndex >= 0) {
                // Mettre à jour le devis existant
                const updated = [...prevQuotes];
                updated[existingIndex] = newQuote;
                saveLS(LS_KEYS.quotes, updated);
                return updated;
              } else {
                // Ajouter le nouveau devis
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

  // persistance locale
  useEffect(() => {
    saveLS(LS_KEYS.activities, activities);
  }, [activities]);
  useEffect(() => {
    saveLS(LS_KEYS.quotes, quotes);
  }, [quotes]);

  if (!ok) {
        return <LoginPage onSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#f5efe4] via-[#e9dccb] to-[#f5efe4]">
      {/* HEADER */}
      <header className="sticky top-0 z-10 bg-white/90 backdrop-blur-md border-b border-blue-200/50 shadow-sm">
        <div className="max-w-6xl mx-auto px-3 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <img 
              src="/logo.png" 
              alt="Hurghada Dream Logo" 
              className="w-10 h-10 object-contain rounded-lg"
              onError={(e) => {
                // Fallback si le logo n'existe pas - afficher HD
                e.target.style.display = 'none';
                const parent = e.target.parentElement;
                if (parent && !parent.querySelector('.fallback-logo')) {
                  const fallback = document.createElement('div');
                  fallback.className = 'fallback-logo w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-600 to-blue-700 text-white grid place-items-center font-bold text-sm shadow-md';
                  fallback.textContent = 'HD';
                  parent.appendChild(fallback);
                }
              }}
            />
            <div>
              <h1 className="text-sm font-semibold text-gray-800">Hurghada Dream — Bureaux</h1>
              <p className="text-[10px] text-gray-600">Mini site interne (devis, activités, historique)</p>
              {user && (
                <p className="text-[10px] text-blue-600 mt-0.5">Connecté en tant que : {user.name}</p>
              )}
            </div>
          </div>
          <nav className="flex gap-2">
            <Pill active={tab === "devis"} onClick={() => setTab("devis")}>
              Devis
            </Pill>
            <Pill active={tab === "activities"} onClick={() => setTab("activities")}>
              Activités
            </Pill>
            <Pill active={tab === "history"} onClick={() => setTab("history")}>
              Historique
            </Pill>
            <Pill active={tab === "tickets"} onClick={() => setTab("tickets")}>
              Tickets
            </Pill>
            {user?.canResetData && (
              <Pill active={tab === "users"} onClick={() => setTab("users")}>
                Utilisateurs
              </Pill>
            )}
          </nav>
        </div>
      </header>

      {/* CONTENU CENTRÉ */}
      <main className="max-w-6xl mx-auto px-3 py-6 space-y-6">
        {tab === "devis" && (
          <Section
            title="Créer & gérer les devis (multi-activités)"
            subtitle="Supplément transfert = (par adulte) × (nombre d'adultes). Alerte si jour hors-dispo, mais le devis peut être créé."
          >
            <QuotesPage activities={activities} quotes={quotes} setQuotes={setQuotes} user={user} />
          </Section>
        )}

        {tab === "activities" && (
          <Section
            title="Gestion des activités"
            subtitle="Ajoutez, modifiez les prix, jours, transferts par quartier."
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
                Réinitialiser les données
              </GhostBtn>
              )
            }
          >
            <ActivitiesPage activities={activities} setActivities={setActivities} remoteEnabled={remoteEnabled} user={user} />
          </Section>
        )}

        {tab === "history" && (
          <Section title="Historique des devis" subtitle="Recherchez un devis par numéro de téléphone.">
            <HistoryPage quotes={quotes} setQuotes={setQuotes} user={user} activities={activities} />
          </Section>
        )}

        {tab === "tickets" && (
          <Section title="Liste des tickets" subtitle="Tableau automatique de tous les tickets renseignés (devis avec tous les tickets complétés)">
            <TicketPage quotes={quotes} />
          </Section>
        )}

        {tab === "users" && user?.canResetData && (
          <Section title="Gestion des utilisateurs" subtitle="Créez et gérez les utilisateurs avec leurs codes d'accès et permissions.">
            <UsersPage user={user} />
          </Section>
        )}
      </main>

      <footer className="max-w-6xl mx-auto px-3 py-8 text-[10px] text-gray-500">
        Données stockées en local + Supabase (si dispo). Site interne Hurghada Dream.
      </footer>
    </div>
  );
}
