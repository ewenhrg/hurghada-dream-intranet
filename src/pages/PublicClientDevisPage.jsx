import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase, __SUPABASE_DEBUG__ } from "../lib/supabase";
import { CATEGORIES, SITE_KEY } from "../constants";
import { logger } from "../utils/logger";
import { loadPublicCatalogueCart, savePublicCatalogueCart } from "../utils/publicCatalogueCartStorage";
import { computePublicCatalogLineTotal, getPublicCatalogListFromPrice } from "../utils/publicCatalogPricing";

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
        const lineTotal = computePublicCatalogLineTotal(activity, line);
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
        extraDolphin: false,
        speedBoatExtra: [],
        buggySimple: 0,
        buggyFamily: 0,
        yamaha250: 0,
        ktm640: 0,
        ktm530: 0,
        cairePrivatif4pax: false,
        cairePrivatif5pax: false,
        cairePrivatif6pax: false,
        louxorPrivatif4pax: false,
        louxorPrivatif5pax: false,
        louxorPrivatif6pax: false,
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
    <div className="selection:bg-teal-100 selection:text-teal-950 min-h-screen bg-gradient-to-b from-catalog-bg via-white to-teal-50/50 font-sans text-catalog-ink antialiased">
      <header className="sticky top-0 z-30 border-b border-catalog-border bg-white/90 shadow-sm shadow-teal-950/5 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4 px-4 py-3.5 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 p-1.5 shadow-md shadow-slate-900/20 ring-1 ring-white/10">
              <img src="/logo.png" alt="Hurghada Dream" className="h-full w-full object-contain" />
            </div>
            <div className="min-w-0">
              <p className="truncate font-display text-lg font-semibold tracking-tight text-slate-900">Hurghada Dream</p>
              <p className="text-xs font-medium text-catalog-muted">Activités &amp; excursions</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <div className="hidden items-center rounded-full border border-teal-200/80 bg-teal-50/80 px-3 py-1 text-xs font-semibold text-teal-900 md:flex">
              <span aria-hidden className="mr-1.5 text-amber-500">
                ★
              </span>
              5.0 · 119 avis
            </div>
            <button
              type="button"
              onClick={() => {
                setError("");
                setSuccess("");
                setCartDrawerOpen(true);
              }}
              className="relative flex items-center gap-2 rounded-full border border-teal-200/90 bg-white px-3.5 py-2 text-sm font-semibold text-teal-900 shadow-sm transition hover:border-teal-300 hover:bg-teal-50/90 sm:px-5"
            >
              Panier
              {cartLines.length > 0 ? (
                <span className="flex h-6 min-w-[1.5rem] items-center justify-center rounded-full bg-gradient-to-r from-teal-600 to-teal-500 px-1.5 text-xs font-bold text-white shadow-sm">
                  {cartLines.length}
                </span>
              ) : null}
            </button>
          </div>
        </div>
      </header>

      <section className="relative border-b border-teal-900/[0.06] bg-white/70">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_90%_80%_at_50%_-30%,rgba(45,212,191,0.22),transparent_65%)]"
        />
        <div className="relative mx-auto max-w-4xl px-4 pb-10 pt-10 text-center sm:px-6 sm:pb-12 sm:pt-12">
          <h1 className="font-display text-[1.65rem] font-bold leading-tight tracking-tight text-slate-900 sm:text-4xl md:text-[2.35rem]">
            Trouvez votre prochaine excursion
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-catalog-muted sm:text-base">
            Mer Rouge, désert, Louxor… Parcourez nos activités et demandez un devis en quelques clics.
          </p>

          <div className="mx-auto mt-8 max-w-xl">
            <label className="relative block text-left" htmlFor="public-search">
              <span className="mb-2 block text-center text-[11px] font-semibold uppercase tracking-[0.2em] text-teal-800/70">
                Recherche
              </span>
              <span className="relative block shadow-lg shadow-teal-950/10">
                <svg
                  className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-teal-600/50"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                  aria-hidden
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.2-5.2m2.2-5.3a7.5 7.5 0 11-15 0 7.5 7.5 0 0115 0z" />
                </svg>
                <input
                  id="public-search"
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Nom d’activité, mot-clé, lieu…"
                  autoComplete="off"
                  className="w-full rounded-2xl border border-slate-200/90 bg-white py-3.5 pl-12 pr-4 text-[15px] text-slate-900 shadow-inner shadow-slate-900/5 outline-none ring-2 ring-transparent transition placeholder:text-slate-400 focus:border-teal-300 focus:ring-teal-500/25"
                />
              </span>
            </label>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-center gap-2 sm:gap-3">
            <Link
              to="/tarifs"
              className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-teal-200 hover:bg-teal-50/80 hover:text-teal-900"
            >
              Grille tarifaire
            </Link>
            <Link
              to="/"
              className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-teal-200 hover:bg-teal-50/80 hover:text-teal-900"
            >
              Espace pro (connexion)
            </Link>
          </div>

          <div className="mx-auto mt-8 flex max-w-4xl flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedCategory("all")}
              className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
                selectedCategory === "all"
                  ? "bg-gradient-to-r from-teal-700 to-teal-600 text-white shadow-md shadow-teal-900/20"
                  : "border border-slate-200/90 bg-white/90 text-slate-700 shadow-sm hover:border-teal-200 hover:text-teal-900"
              }`}
            >
              Toutes · {categoryCounts.all || 0}
            </button>
            {CATEGORIES.map((category) => (
              <button
                key={category.key}
                type="button"
                onClick={() => setSelectedCategory(category.key)}
                className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
                  selectedCategory === category.key
                    ? "bg-gradient-to-r from-teal-700 to-teal-600 text-white shadow-md shadow-teal-900/20"
                    : "border border-slate-200/90 bg-white/90 text-slate-700 shadow-sm hover:border-teal-200 hover:text-teal-900"
                }`}
              >
                {category.label} · {categoryCounts[category.key] || 0}
              </button>
            ))}
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-[1440px] space-y-8 px-4 py-8 sm:px-6 lg:px-8">
        <section className="space-y-8">
          {error && !loading && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50/90 px-4 py-3 text-sm font-medium text-rose-900">{error}</div>
          )}

          {loading && (
            <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-teal-100 bg-white/90 py-14 shadow-sm">
              <div className="h-10 w-10 animate-spin rounded-full border-2 border-teal-200 border-t-teal-600" aria-hidden />
              <p className="text-sm font-medium text-catalog-muted">Chargement du catalogue…</p>
            </div>
          )}

          {!loading && !error && filteredActivities.length === 0 && (
            <div className="rounded-2xl border border-slate-200/90 bg-white/95 px-6 py-12 text-center shadow-sm">
              <p className="font-display text-lg font-semibold text-slate-900">Aucun résultat</p>
              <p className="mt-2 text-sm text-catalog-muted">Essayez un autre mot-clé ou une autre catégorie.</p>
            </div>
          )}

          <div className="space-y-12 pb-8">
            {groupedActivities.map((group) => (
              <section key={group.key} className="space-y-5">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
                  <h2 className="font-display text-2xl font-bold tracking-tight text-slate-900">{group.label}</h2>
                  <span className="inline-flex w-fit items-center rounded-full border border-teal-100 bg-teal-50/90 px-3 py-1 text-xs font-semibold text-teal-900">
                    {group.items.length} activité{group.items.length > 1 ? "s" : ""}
                  </span>
                </div>
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {group.items.map((activity) => {
                    const categoryKey = normalizeCategory(activity.category);
                    const listFrom = getPublicCatalogListFromPrice(activity);
                    const cardFrom =
                      toNumber(activity.price_adult) > 0 ? toNumber(activity.price_adult) : listFrom?.amount ?? null;
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
                        className="service-card group relative flex h-full w-full cursor-pointer flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-soft transition-all duration-300 ease-out hover:-translate-y-0.5 hover:border-teal-200/90 hover:shadow-soft-lg active:scale-[0.99]"
                      >
                        <div
                          className="relative h-48 overflow-hidden bg-slate-100 sm:h-44"
                          style={{ background: getCategoryCover(categoryKey) }}
                        >
                          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-900/55 via-slate-900/10 to-transparent" />
                          <div className="absolute right-3 top-3">
                            <button
                              type="button"
                              onClick={(e) => e.stopPropagation()}
                              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-slate-600 shadow-md backdrop-blur transition hover:bg-white"
                              aria-label="Favori"
                            >
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className="h-[18px] w-[18px]"
                              >
                                <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
                              </svg>
                            </button>
                          </div>
                        </div>
                        <div className="flex grow flex-col p-4">
                          <h3 className="mb-2 line-clamp-2 font-display text-[1.05rem] font-semibold leading-snug text-slate-900 transition-colors group-hover:text-teal-800 sm:text-[17px]">
                            {activity.name}
                          </h3>
                          <div className="mt-auto flex justify-end border-t border-slate-100 pt-3">
                            <div className="flex flex-col items-end text-right">
                              <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">à partir de</span>
                              <div className="mt-0.5 flex items-baseline gap-1">
                                {cardFrom != null && cardFrom > 0 ? (
                                  <span className="font-display text-lg font-bold text-slate-900 tabular-nums">
                                    {formatMoney(cardFrom, activity.currency || "EUR")}
                                  </span>
                                ) : (
                                  <span className="text-sm font-semibold text-amber-800">Tarif sur devis</span>
                                )}
                              </div>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              addToCart(activity.id);
                            }}
                            className="mt-3 w-full rounded-xl bg-gradient-to-r from-teal-700 to-teal-600 px-4 py-3 text-sm font-semibold text-white shadow-md shadow-teal-900/15 transition hover:from-teal-800 hover:to-teal-700 active:scale-[0.98]"
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
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px]"
            aria-label="Fermer le panier"
            onClick={() => setCartDrawerOpen(false)}
          />
          <div className="relative z-10 flex h-full w-full max-w-md flex-col border-l border-teal-100/80 bg-white shadow-2xl shadow-teal-950/10">
            <div className="flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-teal-50/80 to-white px-5 py-4">
              <h2 id="cart-drawer-title" className="font-display text-xl font-bold text-slate-900">
                Panier
              </h2>
              <button
                type="button"
                onClick={() => setCartDrawerOpen(false)}
                className="rounded-xl p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
                aria-label="Fermer"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
              {cartLines.length === 0 && (
                <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-8 text-center text-sm text-catalog-muted">
                  Votre panier est vide. Ajoutez des activités depuis le catalogue.
                </p>
              )}
              {cartLines.map((line) => (
                <div key={line.id} className="rounded-2xl border border-slate-200/90 bg-gradient-to-b from-white to-slate-50/80 p-4 shadow-sm">
                  <p className="line-clamp-2 text-sm font-semibold leading-snug text-slate-900">{line.activity.name}</p>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <label className="space-y-1">
                      <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-500">Adultes</span>
                      <input
                        type="number"
                        min="0"
                        value={line.adults}
                        onChange={(e) => updateCartLine(line.id, "adults", e.target.value)}
                        className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-teal-400 focus:ring-1 focus:ring-teal-400"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-500">Enfants</span>
                      <input
                        type="number"
                        min="0"
                        value={line.children}
                        onChange={(e) => updateCartLine(line.id, "children", e.target.value)}
                        className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-teal-400 focus:ring-1 focus:ring-teal-400"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-500">Bébés</span>
                      <input
                        type="number"
                        min="0"
                        value={line.babies}
                        onChange={(e) => updateCartLine(line.id, "babies", e.target.value)}
                        className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-teal-400 focus:ring-1 focus:ring-teal-400"
                      />
                    </label>
                  </div>
                  <input
                    type="date"
                    value={line.date}
                    onChange={(e) => updateCartLine(line.id, "date", e.target.value)}
                    className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm text-slate-900 outline-none focus:border-teal-400 focus:ring-1 focus:ring-teal-400"
                  />
                  <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
                    <p className="font-display text-sm font-bold tabular-nums text-teal-900">
                      {formatMoney(line.lineTotal, line.activity.currency)}
                    </p>
                    <button
                      type="button"
                      onClick={() => removeCartLine(line.id)}
                      className="text-xs font-semibold text-rose-600 underline-offset-2 hover:text-rose-800 hover:underline"
                    >
                      Retirer
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="border-t border-slate-100 bg-white p-5">
              <p className="text-sm font-medium text-catalog-muted">
                Total estimé{" "}
                <span className="font-display text-xl font-bold text-slate-900 tabular-nums">{formatMoney(cartTotal, "EUR")}</span>
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
                className="mt-4 w-full rounded-xl bg-gradient-to-r from-teal-700 to-teal-600 px-3 py-3.5 text-sm font-bold text-white shadow-md shadow-teal-900/20 transition hover:from-teal-800 hover:to-teal-700 disabled:cursor-not-allowed disabled:opacity-45"
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
            className="absolute inset-0 bg-slate-900/55 backdrop-blur-[2px]"
            aria-label="Fermer"
            onClick={() => setCheckoutOpen(false)}
          />
          <form
            onSubmit={submitPublicQuote}
            className="relative z-10 max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-slate-200/80 bg-white p-6 shadow-2xl sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-5 flex items-center justify-between">
              <h2 id="checkout-title" className="font-display text-xl font-bold text-slate-900">
                Vos coordonnées
              </h2>
              <button
                type="button"
                onClick={() => setCheckoutOpen(false)}
                className="rounded-xl p-2 text-slate-500 hover:bg-slate-100"
                aria-label="Fermer"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {(error || success) && (
              <div
                className={`mb-4 rounded-2xl border px-4 py-3 text-sm font-medium ${
                  error ? "border-rose-200 bg-rose-50 text-rose-900" : "border-teal-200 bg-teal-50 text-teal-900"
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
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-teal-400 focus:bg-white focus:ring-2 focus:ring-teal-500/20"
                autoComplete="name"
              />
              <input
                value={client.phone}
                onChange={(e) => updateClientField("phone", e.target.value)}
                placeholder="Téléphone *"
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-teal-400 focus:bg-white focus:ring-2 focus:ring-teal-500/20"
                autoComplete="tel"
              />
              <input
                type="email"
                value={client.email}
                onChange={(e) => updateClientField("email", e.target.value)}
                placeholder="Email"
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-teal-400 focus:bg-white focus:ring-2 focus:ring-teal-500/20"
                autoComplete="email"
              />
              <input
                value={client.hotel}
                onChange={(e) => updateClientField("hotel", e.target.value)}
                placeholder="Hôtel"
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-teal-400 focus:bg-white focus:ring-2 focus:ring-teal-500/20"
              />
              <textarea
                value={client.notes}
                onChange={(e) => updateClientField("notes", e.target.value)}
                placeholder="Précisions (horaires, enfants, etc.)"
                rows={3}
                className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-teal-400 focus:bg-white focus:ring-2 focus:ring-teal-500/20"
              />
            </div>
            <p className="mt-5 text-xs text-catalog-muted">
              Total : <span className="font-display font-bold text-slate-900 tabular-nums">{formatMoney(cartTotal, "EUR")}</span> —{" "}
              {cartLines.length} ligne{cartLines.length > 1 ? "s" : ""}
            </p>
            <button
              type="submit"
              disabled={submitLoading}
              className="mt-5 w-full rounded-xl bg-gradient-to-r from-teal-700 to-teal-600 px-3 py-3.5 text-sm font-bold text-white shadow-lg shadow-teal-900/20 transition hover:from-teal-800 hover:to-teal-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitLoading ? "Envoi en cours…" : "Envoyer ma demande"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
