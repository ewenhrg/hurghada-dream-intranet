import { useEffect, useState } from "react";
import { supabase } from "./lib/supabase";
import { SITE_KEY, PIN_CODE, LS_KEYS, getDefaultActivities } from "./constants";
import { uuid, emptyTransfers, saveLS, loadLS } from "./utils";
import { Pill, GhostBtn, Section } from "./components/ui";
import { LoginPage } from "./pages/LoginPage";
import { ActivitiesPage } from "./pages/ActivitiesPage";
import { QuotesPage } from "./pages/QuotesPage";
import { HistoryPage } from "./pages/HistoryPage";

export default function App() {
  const [ok, setOk] = useState(false);
  const [tab, setTab] = useState("devis");
  const [activities, setActivities] = useState(() => loadLS(LS_KEYS.activities, getDefaultActivities()));
  const [quotes, setQuotes] = useState(() => loadLS(LS_KEYS.quotes, []));
  const [remoteEnabled, setRemoteEnabled] = useState(false);

  // Vérifier si l'utilisateur est déjà connecté
  useEffect(() => {
    const already = sessionStorage.getItem("hd_ok") === "1";
    if (already) {
      setOk(true);
    }
  }, []);

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
          currency: row.currency || "EUR",
          availableDays: row.available_days || [false, false, false, false, false, false, false],
          notes: row.notes || "",
          transfers: row.transfers || emptyTransfers(),
        }));
        setActivities(mapped);
        saveLS(LS_KEYS.activities, mapped);
        }
      }

      // Récupérer tous les devis
      const { data: quotesData, error: quotesError } = await supabase.from("quotes").select("*").eq("site_key", SITE_KEY).order("created_at", { ascending: false });
      if (!quotesError && Array.isArray(quotesData)) {
        if (quotesData.length > 0) {
          const mappedQuotes = quotesData.map((row) => {
            let items = [];
            try {
              items = typeof row.items === 'string' ? JSON.parse(row.items) : row.items || [];
            } catch {
              items = [];
            }
            return {
              id: uuid(), // Nouvel ID local car on n'a peut-être pas l'ID Supabase
              createdAt: row.created_at || row.createdAt || new Date().toISOString(),
              client: {
                name: row.client_name || "",
                phone: row.client_phone || "",
                hotel: row.client_hotel || "",
                room: row.client_room || "",
                neighborhood: row.client_neighborhood || "",
              },
              notes: row.notes || "",
              items: items,
              total: row.total || 0,
              currency: row.currency || "EUR",
            };
          });
          // Fusionner avec les devis locaux (priorité au local pour éviter les doublons)
          setQuotes((prevQuotes) => {
            const existingIds = new Set(prevQuotes.map(q => q.id));
            const newQuotes = mappedQuotes.filter(q => !existingIds.has(q.id));
            const merged = [...prevQuotes, ...newQuotes];
            saveLS(LS_KEYS.quotes, merged);
            return merged;
          });
        }
      }
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
    return <LoginPage onSuccess={() => setOk(true)} />;
  }

  return (
    <div className="min-h-screen bg-[#e9dccb]">
      {/* HEADER */}
      <header className="sticky top-0 z-10 bg-[#e9dccb]/80 backdrop-blur border-b border-[#e9dccb]">
        <div className="max-w-6xl mx-auto px-3 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-black text-white grid place-items-center font-bold text-sm">HD</div>
            <div>
              <h1 className="text-sm font-semibold text-gray-900">Hurghada Dream — Bureaux</h1>
              <p className="text-[10px] text-gray-500">Mini site interne (devis, activités, historique)</p>
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
            <QuotesPage activities={activities} quotes={quotes} setQuotes={setQuotes} />
          </Section>
        )}

        {tab === "activities" && (
          <Section
            title="Gestion des activités"
            subtitle="Ajoutez, modifiez les prix, jours, transferts par quartier."
            right={
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
            }
          >
            <ActivitiesPage activities={activities} setActivities={setActivities} remoteEnabled={remoteEnabled} />
          </Section>
        )}

        {tab === "history" && (
          <Section title="Historique des devis" subtitle="Recherchez un devis par numéro de téléphone.">
            <HistoryPage quotes={quotes} setQuotes={setQuotes} />
          </Section>
        )}
      </main>

      <footer className="max-w-6xl mx-auto px-3 py-8 text-[10px] text-gray-500">
        Données stockées en local + Supabase (si dispo). Site interne Hurghada Dream.
      </footer>
    </div>
  );
}
