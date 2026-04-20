import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase, __SUPABASE_DEBUG__ } from "../lib/supabase";
import { SITE_KEY } from "../constants";
import { logger } from "../utils/logger";

const ACTIVITY_COLUMNS = "id, name, category, price_adult, price_child, price_baby, currency, notes";

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoney(value, currency = "EUR") {
  const safeValue = toNumber(value);
  try {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: String(currency || "EUR").toUpperCase(),
    }).format(safeValue);
  } catch {
    return `${safeValue} ${currency || "EUR"}`;
  }
}

function buildLineTotal(line, activity) {
  return (
    toNumber(line.adults) * toNumber(activity?.price_adult) +
    toNumber(line.children) * toNumber(activity?.price_child) +
    toNumber(line.babies) * toNumber(activity?.price_baby)
  );
}

export function PublicClientDevisPage() {
  const [activities, setActivities] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [client, setClient] = useState({
    name: "",
    phone: "",
    email: "",
    hotel: "",
    notes: "",
  });

  const [cart, setCart] = useState([]);

  const activityMap = useMemo(() => {
    const map = new Map();
    activities.forEach((activity) => {
      map.set(String(activity.id), activity);
    });
    return map;
  }, [activities]);

  const filteredActivities = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return activities;
    return activities.filter((activity) => {
      const name = String(activity.name || "").toLowerCase();
      const notes = String(activity.notes || "").toLowerCase();
      return name.includes(q) || notes.includes(q);
    });
  }, [activities, search]);

  const cartLines = useMemo(() => {
    return cart
      .map((line) => {
        const activity = activityMap.get(String(line.activityId));
        if (!activity) return null;
        const lineTotal = buildLineTotal(line, activity);
        return {
          ...line,
          activity,
          lineTotal,
        };
      })
      .filter(Boolean);
  }, [cart, activityMap]);

  const cartTotal = useMemo(() => cartLines.reduce((sum, line) => sum + toNumber(line.lineTotal), 0), [cartLines]);

  async function fetchActivities() {
    if (!supabase || !__SUPABASE_DEBUG__.isConfigured) {
      setError("Base indisponible actuellement.");
      setActivities([]);
      setLoading(false);
      return;
    }

    try {
      const { data, error: fetchError } = await supabase
        .from("activities")
        .select(ACTIVITY_COLUMNS)
        .eq("site_key", SITE_KEY)
        .order("name", { ascending: true });

      if (fetchError) {
        setError(fetchError.message || "Impossible de charger le catalogue.");
        setActivities([]);
      } else {
        setError("");
        setActivities(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      logger.error("PublicClientDevisPage fetch activities:", err);
      setError("Erreur inattendue lors du chargement du catalogue.");
      setActivities([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void fetchActivities();
  }, []);

  useEffect(() => {
    if (!supabase || !__SUPABASE_DEBUG__.isConfigured) return undefined;
    const channel = supabase
      .channel("public-client-devis-activities")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "activities", filter: `site_key=eq.${SITE_KEY}` },
        () => {
          void fetchActivities();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  function addToCart(activityId) {
    setSuccess("");
    setError("");
    setCart((prev) => [
      ...prev,
      {
        id: `${activityId}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        activityId: String(activityId),
        date: "",
        adults: 2,
        children: 0,
        babies: 0,
      },
    ]);
  }

  function updateCartLine(lineId, field, value) {
    setCart((prev) => prev.map((line) => (line.id === lineId ? { ...line, [field]: value } : line)));
  }

  function removeCartLine(lineId) {
    setCart((prev) => prev.filter((line) => line.id !== lineId));
  }

  function updateClientField(field, value) {
    setClient((prev) => ({ ...prev, [field]: value }));
  }

  async function submitPublicQuote(event) {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!client.name.trim() || !client.phone.trim()) {
      setError("Le nom et le téléphone sont obligatoires.");
      return;
    }
    if (cartLines.length === 0) {
      setError("Ajoute au moins une activité au panier.");
      return;
    }
    if (!supabase || !__SUPABASE_DEBUG__.isConfigured) {
      setError("Base indisponible. Réessaie dans quelques minutes.");
      return;
    }

    const createdAt = new Date().toISOString();
    const items = cartLines.map((line) => ({
      activityId: String(line.activity.id),
      activityName: line.activity.name || "",
      date: line.date || "",
      adults: toNumber(line.adults),
      children: toNumber(line.children),
      babies: toNumber(line.babies),
      lineTotal: toNumber(line.lineTotal),
    }));

    const payload = {
      site_key: SITE_KEY,
      client_name: client.name.trim(),
      client_phone: client.phone.trim(),
      client_email: client.email.trim(),
      client_hotel: client.hotel.trim(),
      notes: client.notes.trim(),
      total: toNumber(cartTotal),
      currency: "EUR",
      items: JSON.stringify(items),
      created_by_name: "Public Devis",
      created_at: createdAt,
      updated_at: createdAt,
    };

    setSubmitLoading(true);
    try {
      const { error: insertError } = await supabase.from("quotes").insert(payload);
      if (insertError) {
        setError(insertError.message || "Impossible d'envoyer ton devis.");
        return;
      }
      setSuccess("Demande envoyée avec succès. Nous te contactons rapidement.");
      setCart([]);
      setClient({ name: "", phone: "", email: "", hotel: "", notes: "" });
    } catch (err) {
      logger.error("PublicClientDevisPage submit quote:", err);
      setError("Erreur inattendue pendant l'envoi.");
    } finally {
      setSubmitLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="bg-slate-950 text-white">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-300">Hurghada Dream</p>
          <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">Catalogue des activités</h1>
          <p className="mt-3 max-w-3xl text-sm text-slate-200 sm:text-base">
            Choisis tes activités, ajoute-les au panier, puis valide ton devis. On reçoit ta demande en direct sur notre intranet.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link to="/tarifs" className="rounded-xl border border-white/20 px-4 py-2 text-sm font-semibold hover:bg-white/10">
              Voir les tarifs
            </Link>
            <Link to="/" className="rounded-xl border border-cyan-400/30 px-4 py-2 text-sm font-semibold text-cyan-200 hover:bg-cyan-400/10">
              Intranet
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-6 px-4 py-8 sm:grid-cols-3 sm:px-6">
        <section className="space-y-4 sm:col-span-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <label className="text-sm font-semibold text-slate-700" htmlFor="public-search">
              Rechercher une activité
            </label>
            <input
              id="public-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Nom ou mot-clé..."
              className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-indigo-500"
            />
          </div>

          {loading && (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm font-semibold text-slate-700">
              Chargement du catalogue...
            </div>
          )}

          {!loading && filteredActivities.length === 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm font-semibold text-slate-700">
              Aucune activité trouvée.
            </div>
          )}

          <div className="grid gap-4">
            {filteredActivities.map((activity) => (
              <article key={activity.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">{activity.name}</h2>
                    <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">{activity.category || "Activité"}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => addToCart(activity.id)}
                    className="rounded-xl bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
                  >
                    Ajouter au panier
                  </button>
                </div>
                <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
                  <p className="rounded-lg bg-slate-50 px-3 py-2">
                    <span className="font-semibold">Adulte:</span> {formatMoney(activity.price_adult, activity.currency)}
                  </p>
                  <p className="rounded-lg bg-slate-50 px-3 py-2">
                    <span className="font-semibold">Enfant:</span> {formatMoney(activity.price_child, activity.currency)}
                  </p>
                  <p className="rounded-lg bg-slate-50 px-3 py-2">
                    <span className="font-semibold">Bébé:</span> {formatMoney(activity.price_baby, activity.currency)}
                  </p>
                </div>
                {activity.notes && <p className="mt-3 text-sm text-slate-700">{activity.notes}</p>}
              </article>
            ))}
          </div>
        </section>

        <aside className="space-y-4">
          <form onSubmit={submitPublicQuote} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-lg font-bold text-slate-900">Panier & devis</h2>
            {(error || success) && (
              <div className={`rounded-xl border px-3 py-2 text-sm font-semibold ${error ? "border-rose-300 bg-rose-50 text-rose-900" : "border-emerald-300 bg-emerald-50 text-emerald-900"}`}>
                {error || success}
              </div>
            )}

            <div className="space-y-2">
              {cartLines.length === 0 && <p className="text-sm text-slate-600">Panier vide.</p>}
              {cartLines.map((line) => (
                <div key={line.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-sm font-bold text-slate-900">{line.activity.name}</p>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    <input
                      type="number"
                      min="0"
                      value={line.adults}
                      onChange={(e) => updateCartLine(line.id, "adults", e.target.value)}
                      className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                      title="Adultes"
                    />
                    <input
                      type="number"
                      min="0"
                      value={line.children}
                      onChange={(e) => updateCartLine(line.id, "children", e.target.value)}
                      className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                      title="Enfants"
                    />
                    <input
                      type="number"
                      min="0"
                      value={line.babies}
                      onChange={(e) => updateCartLine(line.id, "babies", e.target.value)}
                      className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                      title="Bébés"
                    />
                  </div>
                  <input
                    type="date"
                    value={line.date}
                    onChange={(e) => updateCartLine(line.id, "date", e.target.value)}
                    className="mt-2 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                  />
                  <div className="mt-2 flex items-center justify-between">
                    <p className="text-sm font-semibold text-slate-800">{formatMoney(line.lineTotal, line.activity.currency)}</p>
                    <button
                      type="button"
                      onClick={() => removeCartLine(line.id)}
                      className="text-xs font-bold text-rose-700 hover:text-rose-900"
                    >
                      Retirer
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-2 border-t border-slate-200 pt-3">
              <input
                value={client.name}
                onChange={(e) => updateClientField("name", e.target.value)}
                placeholder="Nom complet *"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <input
                value={client.phone}
                onChange={(e) => updateClientField("phone", e.target.value)}
                placeholder="Téléphone *"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <input
                type="email"
                value={client.email}
                onChange={(e) => updateClientField("email", e.target.value)}
                placeholder="Email"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <input
                value={client.hotel}
                onChange={(e) => updateClientField("hotel", e.target.value)}
                placeholder="Hôtel"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <textarea
                value={client.notes}
                onChange={(e) => updateClientField("notes", e.target.value)}
                placeholder="Notes"
                rows={3}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>

            <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2">
              <p className="text-sm font-semibold text-indigo-900">
                Total estimé: <span className="text-base font-black">{formatMoney(cartTotal, "EUR")}</span>
              </p>
            </div>

            <button
              type="submit"
              disabled={submitLoading}
              className="w-full rounded-xl bg-emerald-600 px-3 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {submitLoading ? "Envoi..." : "Valider mon devis"}
            </button>
          </form>
        </aside>
      </main>
    </div>
  );
}
