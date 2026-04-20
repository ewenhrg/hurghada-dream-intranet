import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase, __SUPABASE_DEBUG__ } from "../lib/supabase";
import { CATEGORIES, SITE_KEY } from "../constants";
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

function normalizeCategory(rawCategory) {
  const value = String(rawCategory || "").trim();
  const exists = CATEGORIES.some((category) => category.key === value);
  return exists ? value : "desert";
}

function getCategoryCover(categoryKey) {
  const covers = {
    desert:
      "linear-gradient(140deg, rgba(245,158,11,0.95), rgba(217,119,6,0.9))",
    aquatique:
      "linear-gradient(140deg, rgba(6,182,212,0.95), rgba(14,116,144,0.9))",
    exploration_bien_etre:
      "linear-gradient(140deg, rgba(16,185,129,0.95), rgba(5,150,105,0.9))",
    luxor_caire:
      "linear-gradient(140deg, rgba(99,102,241,0.95), rgba(79,70,229,0.9))",
    marsa_alam:
      "linear-gradient(140deg, rgba(244,63,94,0.95), rgba(225,29,72,0.9))",
    transfert:
      "linear-gradient(140deg, rgba(71,85,105,0.95), rgba(30,41,59,0.9))",
  };
  return covers[categoryKey] || covers.desert;
}

function getCategoryLabel(categoryKey) {
  const category = CATEGORIES.find((entry) => entry.key === categoryKey);
  return category?.label || "Activité";
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
  const [selectedCategory, setSelectedCategory] = useState("all");

  const activityMap = useMemo(() => {
    const map = new Map();
    activities.forEach((activity) => {
      map.set(String(activity.id), activity);
    });
    return map;
  }, [activities]);

  const filteredActivities = useMemo(() => {
    const q = search.trim().toLowerCase();
    const byCategory = selectedCategory === "all"
      ? activities
      : activities.filter((activity) => normalizeCategory(activity.category) === selectedCategory);

    if (!q) return byCategory;
    return byCategory.filter((activity) => {
      const name = String(activity.name || "").toLowerCase();
      const notes = String(activity.notes || "").toLowerCase();
      return name.includes(q) || notes.includes(q);
    });
  }, [activities, search, selectedCategory]);

  const groupedActivities = useMemo(() => {
    const grouped = {};
    CATEGORIES.forEach((category) => {
      grouped[category.key] = [];
    });

    filteredActivities.forEach((activity) => {
      const key = normalizeCategory(activity.category);
      grouped[key].push(activity);
    });

    return CATEGORIES
      .map((category) => ({
        ...category,
        items: grouped[category.key],
      }))
      .filter((category) => category.items.length > 0);
  }, [filteredActivities]);

  const categoryCounts = useMemo(() => {
    const counts = { all: activities.length };
    CATEGORIES.forEach((category) => {
      counts[category.key] = activities.filter((activity) => normalizeCategory(activity.category) === category.key).length;
    });
    return counts;
  }, [activities]);

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

      let finalRows = Array.isArray(data) ? data : [];
      let finalError = fetchError || null;

      const checks = [];
      const fallbackSiteKey = __SUPABASE_DEBUG__?.supabaseUrl;
      if (fallbackSiteKey && fallbackSiteKey !== SITE_KEY) {
        checks.push(
          supabase
            .from("activities")
            .select(ACTIVITY_COLUMNS)
            .eq("site_key", fallbackSiteKey)
            .order("name", { ascending: true })
        );
      }
      checks.push(supabase.from("activities").select(ACTIVITY_COLUMNS).order("name", { ascending: true }));

      const checkedResults = await Promise.all(checks);
      checkedResults.forEach((result) => {
        if (!result?.error && Array.isArray(result?.data) && result.data.length > finalRows.length) {
          finalRows = result.data;
        }
        if (result?.error && !finalError) {
          finalError = result.error;
        }
      });

      if (finalRows.length > 0) {
        setError("");
        setActivities(finalRows);
      } else {
        setError(finalError?.message || "Impossible de charger le catalogue.");
        setActivities([]);
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
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-slate-950 p-1.5">
              <img src="/logo.png" alt="Hurghada Dream" className="h-full w-full object-contain" />
            </div>
            <div>
              <p className="text-base font-bold text-slate-900">Hurghada Dream</p>
              <p className="text-xs text-slate-500">Catalogue client</p>
            </div>
          </div>
          <div className="hidden items-center gap-2 md:flex">
            <button
              type="button"
              className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
            >
              ⭐ 5.0 (119)
            </button>
            <button
              type="button"
              className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
            >
              📸 8.1K
            </button>
            <button
              type="button"
              className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
            >
              🎵 10.1K
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[1fr_360px] sm:px-6">
        <section className="space-y-5">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
              <label className="block" htmlFor="public-search">
                <span className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Rechercher</span>
                <input
                  id="public-search"
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Nom, catégorie, mot-clé"
                  className="mt-2 w-full rounded-full border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-indigo-500"
                />
              </label>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Link to="/tarifs" className="rounded-full border border-slate-300 px-3 py-2 font-semibold text-slate-700 hover:bg-slate-50">
                  Tarifs
                </Link>
                <Link to="/" className="rounded-full border border-slate-300 px-3 py-2 font-semibold text-slate-700 hover:bg-slate-50">
                  Intranet
                </Link>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setSelectedCategory("all")}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                  selectedCategory === "all" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                Toutes ({categoryCounts.all || 0})
              </button>
              {CATEGORIES.map((category) => (
                <button
                  key={category.key}
                  type="button"
                  onClick={() => setSelectedCategory(category.key)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                    selectedCategory === category.key
                      ? "bg-slate-900 text-white"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  {category.label} ({categoryCounts[category.key] || 0})
                </button>
              ))}
            </div>
          </div>

          {loading && (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm font-semibold text-slate-600">
              Chargement du catalogue...
            </div>
          )}

          {!loading && filteredActivities.length === 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm font-semibold text-slate-600">
              Aucune activité trouvée.
            </div>
          )}

          <div className="space-y-8">
            {groupedActivities.map((group) => (
              <section key={group.key} className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-black text-slate-900">{group.label}</h2>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                    {group.items.length} activité{group.items.length > 1 ? "s" : ""}
                  </span>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {group.items.map((activity) => {
                    const categoryKey = normalizeCategory(activity.category);
                    const rating = (4.5 + (String(activity.id).length % 5) * 0.1).toFixed(1);
                    return (
                      <article
                        key={activity.id}
                        className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_12px_30px_-20px_rgba(15,23,42,0.45)]"
                      >
                        <div className="relative h-36" style={{ background: getCategoryCover(categoryKey) }}>
                          <span className="absolute left-3 top-3 rounded-full bg-white/85 px-2.5 py-1 text-[11px] font-bold text-slate-800">
                            Populaire
                          </span>
                          <button
                            type="button"
                            className="absolute right-3 top-3 h-9 w-9 rounded-full bg-white/85 text-base text-slate-700"
                            aria-label="Favori"
                          >
                            ♡
                          </button>
                          <span className="absolute bottom-3 left-3 rounded-full bg-black/35 px-2.5 py-1 text-[11px] font-semibold text-white">
                            ⏱ Journée complète (8h)
                          </span>
                          <span className="absolute bottom-3 right-3 rounded-full bg-white/85 px-2 py-1 text-[10px] font-bold text-slate-800">
                            {getCategoryLabel(categoryKey)}
                          </span>
                        </div>
                        <div className="space-y-3 p-4">
                          <h3 className="line-clamp-1 text-lg font-bold text-slate-900">{activity.name}</h3>
                          <p className="line-clamp-2 text-sm text-slate-600">
                            {activity.notes || "Excursion premium avec accompagnement et organisation complète."}
                          </p>
                          <div className="flex items-end justify-between">
                            <p className="text-sm font-semibold text-slate-600">
                              ⭐ {rating} <span className="text-xs text-slate-400">({String(activity.id).length + 3})</span>
                            </p>
                            <div className="text-right">
                              <p className="text-[11px] text-slate-500">à partir de</p>
                              <p className="text-2xl font-black text-slate-900">
                                {formatMoney(activity.price_adult, activity.currency || "EUR")}
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => addToCart(activity.id)}
                            className="w-full rounded-xl bg-slate-900 px-3 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
                          >
                            Ajouter au panier
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </section>

        <aside className="space-y-4">
          <form
            onSubmit={submitPublicQuote}
            className="sticky top-24 space-y-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_16px_40px_-24px_rgba(15,23,42,0.55)]"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-black text-slate-900">Panier & devis</h2>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                {cartLines.length} item{cartLines.length > 1 ? "s" : ""}
              </span>
            </div>

            {(error || success) && (
              <div
                className={`rounded-xl border px-3 py-2 text-sm font-semibold ${
                  error ? "border-rose-300 bg-rose-50 text-rose-900" : "border-emerald-300 bg-emerald-50 text-emerald-900"
                }`}
              >
                {error || success}
              </div>
            )}

            <div className="max-h-60 space-y-2 overflow-y-auto pr-1">
              {cartLines.length === 0 && <p className="text-sm text-slate-600">Panier vide.</p>}
              {cartLines.map((line) => (
                <div key={line.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="line-clamp-1 text-sm font-bold text-slate-900">{line.activity.name}</p>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    <label className="space-y-1">
                      <span className="block text-[10px] font-bold uppercase text-slate-600">Ad</span>
                      <input
                        type="number"
                        min="0"
                        value={line.adults}
                        onChange={(e) => updateCartLine(line.id, "adults", e.target.value)}
                        className="w-full rounded-lg border border-slate-300 px-2 py-1 text-sm"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="block text-[10px] font-bold uppercase text-slate-600">Enf</span>
                      <input
                        type="number"
                        min="0"
                        value={line.children}
                        onChange={(e) => updateCartLine(line.id, "children", e.target.value)}
                        className="w-full rounded-lg border border-slate-300 px-2 py-1 text-sm"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="block text-[10px] font-bold uppercase text-slate-600">Béb</span>
                      <input
                        type="number"
                        min="0"
                        value={line.babies}
                        onChange={(e) => updateCartLine(line.id, "babies", e.target.value)}
                        className="w-full rounded-lg border border-slate-300 px-2 py-1 text-sm"
                      />
                    </label>
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

            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-sm font-semibold text-slate-700">
                Total estimé: <span className="text-lg font-black text-slate-900">{formatMoney(cartTotal, "EUR")}</span>
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
