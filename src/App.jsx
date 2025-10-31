import { useEffect, useState } from "react";
import { supabase } from "./lib/supabase";
import { SITE_KEY, PIN_CODE, LS_KEYS, getDefaultActivities } from "./constants";
import { uuid, emptyTransfers, saveLS, loadLS } from "./utils";
import { Pill, GhostBtn, Section } from "./components/ui";
import { LoginPage } from "./pages/LoginPage";
import { ActivitiesPage } from "./pages/ActivitiesPage";
import { QuotesPage } from "./pages/QuotesPage";
import { HistoryPage } from "./pages/HistoryPage";
import { UsersPage } from "./pages/UsersPage";

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
        const mapped = data.map((row) => ({
          id: row.id?.toString?.() || uuid(),
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
        }));
        setActivities(mapped);
        saveLS(LS_KEYS.activities, mapped);
        }
      }

      // Désactivation de la synchronisation automatique des devis depuis Supabase
      // Les devis sont créés localement et envoyés à Supabase, mais on ne les récupère plus automatiquement
      // pour éviter les problèmes de doublons et de devis vierges
      /*
      // Récupérer tous les devis
      const { data: quotesData, error: quotesError } = await supabase.from("quotes").select("*").eq("site_key", SITE_KEY).order("created_at", { ascending: false });
      if (!quotesError && Array.isArray(quotesData)) {
        if (quotesData.length > 0) {
          setQuotes((prevQuotes) => {
            // Créer un Set des identifiants uniques des devis locaux (basé sur client.phone + createdAt)
            const existingQuotes = new Set();
            prevQuotes.forEach(q => {
              const key = `${q.client?.phone || ''}_${q.createdAt}`;
              existingQuotes.add(key);
            });

            // Mapper les devis de Supabase et vérifier les doublons
            const mappedQuotes = quotesData
              .map((row) => {
                let items = [];
                try {
                  items = typeof row.items === 'string' ? JSON.parse(row.items) : row.items || [];
                } catch {
                  items = [];
                }
                const createdAt = row.created_at || row.createdAt || new Date().toISOString();
                const clientPhone = row.client_phone || "";
                
                // Créer une clé unique basée sur le téléphone et la date de création
                const uniqueKey = `${clientPhone}_${createdAt}`;
                
                // Si ce devis existe déjà localement, on le skip
                if (existingQuotes.has(uniqueKey)) {
                  return null;
                }

                return {
                  id: uuid(), // Nouvel ID local
                  createdAt: createdAt,
                  client: {
                    name: row.client_name || "",
                    phone: clientPhone,
                    hotel: row.client_hotel || "",
                    room: row.client_room || "",
                    neighborhood: row.client_neighborhood || "",
                  },
                  notes: row.notes || "",
                  items: items,
                  total: row.total || 0,
                  currency: row.currency || "EUR",
                };
              })
              .filter(q => q !== null); // Filtrer les nulls (doublons)

            // Ne fusionner que s'il y a de nouveaux devis
            if (mappedQuotes.length > 0) {
              const merged = [...prevQuotes, ...mappedQuotes];
              saveLS(LS_KEYS.quotes, merged);
              return merged;
            }
            
            return prevQuotes; // Pas de nouveaux devis, retourner l'état actuel
          });
        }
      }
      */
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
