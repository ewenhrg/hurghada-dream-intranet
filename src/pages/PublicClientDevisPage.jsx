import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase, __SUPABASE_DEBUG__ } from "../lib/supabase";
import { CATEGORIES, SITE_KEY } from "../constants";
import { logger } from "../utils/logger";
import { loadPublicCatalogueCart, savePublicCatalogueCart } from "../utils/publicCatalogueCartStorage";
import { getActivityPublicProse } from "../utils/activityHelpers";

const ACTIVITY_COLUMNS = "id, name, category, price_adult, price_child, price_baby, currency, notes, description";

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

export function PublicClientDevisPage() {
  const navigate = useNavigate();
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

  const [cart, setCart] = useState(() => loadPublicCatalogueCart());
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [cartDrawerOpen, setCartDrawerOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);

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
      const description = String(activity.description || "").toLowerCase();
      return name.includes(q) || notes.includes(q) || description.includes(q);
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
    savePublicCatalogueCart(cart);
  }, [cart]);

  useEffect(() => {
    if (cartDrawerOpen || checkoutOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [cartDrawerOpen, checkoutOpen]);

  useEffect(() => {
    if (!cartDrawerOpen && !checkoutOpen) return undefined;
    function onKey(e) {
      if (e.key === "Escape") {
        setCheckoutOpen(false);
        setCartDrawerOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cartDrawerOpen, checkoutOpen]);

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
    event?.preventDefault();
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
      setCheckoutOpen(false);
      setCartDrawerOpen(false);
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
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-slate-950 p-1.5">
              <img src="/logo.png" alt="Hurghada Dream" className="h-full w-full object-contain" />
            </div>
            <div>
              <p className="text-base font-bold text-slate-900">Hurghada Dream</p>
              <p className="text-xs text-slate-500">Catalogue client</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setError("");
                setSuccess("");
                setCartDrawerOpen(true);
              }}
              className="relative flex items-center gap-2 rounded-full border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50 sm:px-4"
            >
              Panier
              {cartLines.length > 0 ? (
                <span className="flex h-6 min-w-[1.5rem] items-center justify-center rounded-full bg-[#34b3f7] px-1.5 text-xs font-bold text-white">
                  {cartLines.length}
                </span>
              ) : null}
            </button>
            <div className="hidden items-center gap-2 md:flex">
              <button
                type="button"
                className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
              >
                ⭐ 5.0 (119)
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1440px] space-y-5 px-4 py-6 sm:px-6">
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
                  Connexion
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
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {group.items.map((activity) => {
                    const categoryKey = normalizeCategory(activity.category);
                    const cardProse = getActivityPublicProse(activity);
                    return (
                      <article
                        key={activity.id}
                        role="button"
                        tabIndex={0}
                        onClick={() =>
                          navigate(`/catalogue/activity/${encodeURIComponent(String(activity.id))}`)
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            navigate(`/catalogue/activity/${encodeURIComponent(String(activity.id))}`);
                          }
                        }}
                        className="service-card group relative flex h-full w-full cursor-pointer flex-col overflow-hidden rounded-[16px] bg-white shadow-[0_4px_20px_rgb(0,0,0,0.08)] transition-all duration-300 ease-out active:scale-[0.98] hover:shadow-[0_12px_40px_rgb(0,0,0,0.15)] sm:rounded-[18px] dark:bg-gray-900/80"
                      >
                        <div
                          className="relative h-48 overflow-hidden rounded-t-[16px] bg-gray-100 sm:h-44 sm:rounded-t-[18px] dark:bg-gray-800"
                          style={{ background: getCategoryCover(categoryKey) }}
                        >
                          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
                          <div className="absolute right-3 top-3">
                            <button
                              type="button"
                              onClick={(e) => e.stopPropagation()}
                              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/80 shadow-lg backdrop-blur-xl transition-all duration-200 hover:bg-white active:scale-95"
                              aria-label="Ajouter aux favoris"
                            >
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className="h-[18px] w-[18px] text-gray-600"
                              >
                                <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
                              </svg>
                            </button>
                          </div>
                        </div>
                        <div className="flex grow flex-col p-4">
                          <h3 className="mb-2 line-clamp-2 text-lg font-semibold leading-snug text-gray-900 transition-colors group-hover:text-[#34b3f7] sm:text-[17px] dark:text-white">
                            {activity.name}
                          </h3>
                          {cardProse ? (
                            <p className="mb-3 line-clamp-4 whitespace-pre-line text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                              {cardProse}
                            </p>
                          ) : null}
                          <div className="mt-auto flex justify-end border-t border-gray-100 pt-3 dark:border-gray-800">
                            <div className="flex flex-col items-end">
                              <span className="text-[11px] font-medium text-gray-400">à partir de</span>
                              <div className="flex items-baseline gap-1">
                                <span className="text-lg font-bold text-gray-900 dark:text-white">
                                  {formatMoney(activity.price_adult, activity.currency || "EUR")}
                                </span>
                              </div>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              addToCart(activity.id);
                            }}
                            className="mt-3 w-full rounded-xl bg-[#34b3f7] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#34b3f7]/90 active:scale-[0.98]"
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
      </main>

      {cartDrawerOpen && (
        <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true" aria-labelledby="cart-drawer-title">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/40"
            aria-label="Fermer le panier"
            onClick={() => setCartDrawerOpen(false)}
          />
          <div className="relative z-10 flex h-full w-full max-w-md flex-col bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-4">
              <h2 id="cart-drawer-title" className="text-lg font-bold text-slate-900">
                Panier
              </h2>
              <button
                type="button"
                onClick={() => setCartDrawerOpen(false)}
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                aria-label="Fermer"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
              {cartLines.length === 0 && <p className="text-sm text-slate-600">Ton panier est vide.</p>}
              {cartLines.map((line) => (
                <div key={line.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="line-clamp-2 text-sm font-bold text-slate-900">{line.activity.name}</p>
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
            <div className="border-t border-slate-200 bg-white p-4">
              <p className="text-sm font-semibold text-slate-700">
                Total estimé :{" "}
                <span className="text-lg font-black text-slate-900">{formatMoney(cartTotal, "EUR")}</span>
              </p>
              <button
                type="button"
                disabled={cartLines.length === 0}
                onClick={() => {
                  setError("");
                  setSuccess("");
                  setCartDrawerOpen(false);
                  setCheckoutOpen(true);
                }}
                className="mt-3 w-full rounded-xl bg-[#34b3f7] px-3 py-3 text-sm font-bold text-white hover:bg-[#34b3f7]/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Finaliser mon devis
              </button>
            </div>
          </div>
        </div>
      )}

      {checkoutOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="checkout-title">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/50"
            aria-label="Fermer"
            onClick={() => setCheckoutOpen(false)}
          />
          <form
            onSubmit={submitPublicQuote}
            className="relative z-10 max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-6 shadow-2xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 id="checkout-title" className="text-lg font-bold text-slate-900">
                Tes coordonnées
              </h2>
              <button
                type="button"
                onClick={() => setCheckoutOpen(false)}
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                aria-label="Fermer"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {(error || success) && (
              <div
                className={`mb-4 rounded-xl border px-3 py-2 text-sm font-semibold ${
                  error ? "border-rose-300 bg-rose-50 text-rose-900" : "border-emerald-300 bg-emerald-50 text-emerald-900"
                }`}
              >
                {error || success}
              </div>
            )}
            <div className="space-y-3">
              <input
                value={client.name}
                onChange={(e) => updateClientField("name", e.target.value)}
                placeholder="Nom complet *"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                autoComplete="name"
              />
              <input
                value={client.phone}
                onChange={(e) => updateClientField("phone", e.target.value)}
                placeholder="Téléphone *"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                autoComplete="tel"
              />
              <input
                type="email"
                value={client.email}
                onChange={(e) => updateClientField("email", e.target.value)}
                placeholder="Email"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                autoComplete="email"
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
            <p className="mt-4 text-xs text-slate-500">
              Total : <span className="font-bold text-slate-900">{formatMoney(cartTotal, "EUR")}</span> —{" "}
              {cartLines.length} ligne{cartLines.length > 1 ? "s" : ""}
            </p>
            <button
              type="submit"
              disabled={submitLoading}
              className="mt-4 w-full rounded-xl bg-emerald-600 px-3 py-3 text-sm font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {submitLoading ? "Envoi..." : "Envoyer ma demande"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
