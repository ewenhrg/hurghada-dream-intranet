import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase, __SUPABASE_DEBUG__ } from "../lib/supabase";
import { CATEGORIES, SITE_KEY } from "../constants";
import { logger } from "../utils/logger";
import { loadPublicCatalogueCart, savePublicCatalogueCart } from "../utils/publicCatalogueCartStorage";
import { computePublicCatalogLineTotal, getPublicCatalogListFromPrice } from "../utils/publicCatalogPricing";
import { normalizeCatalogImageUrlsFromDb } from "../utils/catalogContent";

/** `*` : toutes les colonnes présentes en base (évite erreur si `babies_forbidden` n’est pas encore migrée). */
const ACTIVITY_COLUMNS = "*";

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
      babies: line.activity.babies_forbidden ? 0 : toNumber(line.babies),
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
      items,
      created_at: createdAt,
      updated_at: createdAt,
    };

    setSubmitLoading(true);
    try {
      const { error: insertError } = await supabase.from("public_quotes").insert(payload);
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
    <div className="selection:bg-teal-200/50 selection:text-teal-950 relative min-h-screen overflow-x-hidden bg-gradient-to-b from-[#e8f7f3] via-[#fafdfb] to-[#eefbf8] font-sans text-catalog-ink antialiased">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 z-0 h-[min(70vh,520px)] bg-catalog-mesh opacity-[0.95]"
      />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 bottom-0 z-0 h-48 bg-gradient-to-t from-teal-950/5 via-transparent to-transparent"
      />

      <header className="sticky top-0 z-30 border-b border-teal-900/12 bg-white/85 shadow-[0_1px_0_0_rgba(255,255,255,0.95)_inset,0_10px_40px_-14px_rgba(15,118,110,0.18)] backdrop-blur-xl backdrop-saturate-150">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4 px-4 py-3.5 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3.5">
            <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-teal-900 p-1.5 shadow-xl shadow-teal-900/30 ring-2 ring-white">
              <div className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-tr from-white/20 to-transparent" />
              <img src="/logo.png" alt="Hurghada Dream" className="relative h-full w-full object-contain" />
            </div>
            <div className="min-w-0">
              <p className="truncate bg-gradient-to-r from-slate-950 via-slate-900 to-teal-900 bg-clip-text font-display text-lg font-extrabold tracking-tight text-transparent">
                Hurghada Dream
              </p>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-teal-950/95">
                Activités &amp; excursions
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2.5 sm:gap-3">
            <div className="hidden items-center gap-1.5 rounded-full border border-amber-300/60 bg-gradient-to-r from-amber-50 to-orange-50 px-3.5 py-1.5 text-xs font-bold text-amber-950 shadow-md shadow-amber-900/10 md:inline-flex">
              <span aria-hidden className="text-amber-600">
                ★
              </span>
              <span>5,0</span>
              <span className="font-bold text-amber-950">· 119 avis</span>
            </div>
            <button
              type="button"
              onClick={() => {
                setError("");
                setSuccess("");
                setCartDrawerOpen(true);
              }}
              className="group relative inline-flex min-h-[44px] items-center gap-2 overflow-hidden rounded-full bg-gradient-to-r from-teal-800 via-teal-700 to-emerald-700 px-3.5 py-2.5 pl-3.5 text-sm font-extrabold tracking-tight text-white shadow-[0_4px_20px_-4px_rgba(15,118,110,0.55),0_2px_8px_-2px_rgba(15,23,42,0.25)] ring-2 ring-white/25 transition hover:from-teal-900 hover:via-teal-800 hover:to-emerald-800 hover:shadow-[0_8px_28px_-6px_rgba(15,118,110,0.55)] active:scale-[0.98] sm:gap-2.5 sm:px-5 sm:py-2.5"
            >
              <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/15 to-transparent" />
              <span className="pointer-events-none absolute inset-0 opacity-0 transition group-hover:opacity-100">
                <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition duration-700 group-hover:translate-x-full" />
              </span>
              <svg className="relative h-5 w-5 shrink-0 text-white drop-shadow-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" aria-hidden>
                <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
                <path d="M3 6h18" />
                <path d="M16 10a4 4 0 0 1-8 0" />
              </svg>
              <span className="relative text-[15px] drop-shadow-sm">Panier</span>
              {cartLines.length > 0 ? (
                <span className="relative flex h-7 min-w-[1.75rem] items-center justify-center rounded-full border border-white/40 bg-white px-2 text-xs font-black text-teal-900 shadow-inner">
                  {cartLines.length}
                </span>
              ) : null}
            </button>
          </div>
        </div>
      </header>

      <section className="relative z-10 border-b border-teal-900/10 bg-gradient-to-b from-white/40 to-transparent">
        <div className="relative mx-auto max-w-5xl px-4 pb-14 pt-12 text-center sm:px-6 sm:pb-16 sm:pt-16">
          <span className="mb-5 inline-flex items-center gap-2 rounded-full border border-teal-200/90 bg-white/90 px-5 py-2 text-[11px] font-extrabold uppercase tracking-[0.22em] text-teal-950 shadow-md shadow-teal-900/10 backdrop-blur-sm">
            Catalogue en ligne
          </span>
          <h1 className="mx-auto max-w-3xl font-display text-3xl font-extrabold leading-[1.12] tracking-tight text-slate-950 sm:text-4xl md:text-[2.55rem]">
            Trouvez votre{" "}
            <span className="bg-gradient-to-r from-teal-800 via-teal-600 to-cyan-600 bg-clip-text text-transparent">
              prochaine excursion
            </span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base font-semibold leading-relaxed text-slate-800 sm:text-lg sm:leading-relaxed">
            Mer Rouge, désert, Louxor — parcourez nos activités et recevez un devis personnalisé en quelques clics.
          </p>

          <div className="mx-auto mt-10 max-w-xl">
            <label className="relative block text-left" htmlFor="public-search">
              <span className="mb-2.5 block text-center text-[10px] font-extrabold uppercase tracking-[0.28em] text-teal-950">
                Recherche
              </span>
              <span className="relative block rounded-[1.35rem] border-2 border-teal-100/90 bg-white/90 p-1 shadow-[0_16px_48px_-14px_rgba(15,118,110,0.28)] ring-1 ring-teal-900/[0.06] backdrop-blur-md transition focus-within:border-teal-400 focus-within:shadow-[0_20px_50px_-12px_rgba(15,118,110,0.35)] focus-within:ring-2 focus-within:ring-teal-400/40">
                <svg
                  className="pointer-events-none absolute left-6 top-1/2 z-10 h-5 w-5 -translate-y-1/2 text-teal-800"
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
                  className="w-full rounded-[1.15rem] border-0 bg-transparent py-4 pl-14 pr-5 text-[15px] font-semibold text-slate-900 shadow-none outline-none ring-0 placeholder:font-medium placeholder:text-slate-600"
                />
              </span>
            </label>
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/tarifs"
              className="inline-flex items-center gap-2 rounded-full border-2 border-slate-200 bg-white px-5 py-2.5 text-xs font-extrabold text-slate-950 shadow-md transition hover:-translate-y-0.5 hover:border-teal-400 hover:bg-teal-50 hover:text-teal-950 hover:shadow-lg"
            >
              <span className="text-teal-700" aria-hidden>
                €
              </span>
              Grille tarifaire
            </Link>
            <Link
              to="/"
              className="inline-flex items-center gap-2 rounded-full border-2 border-slate-200 bg-white px-5 py-2.5 text-xs font-extrabold text-slate-950 shadow-md transition hover:-translate-y-0.5 hover:border-teal-400 hover:bg-teal-50 hover:text-teal-950 hover:shadow-lg"
            >
              <svg className="h-3.5 w-3.5 text-teal-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3" />
              </svg>
              Espace pro
            </Link>
          </div>

          <div className="mx-auto mt-11 flex max-w-5xl flex-wrap justify-center gap-2.5 sm:gap-3">
            <button
              type="button"
              onClick={() => setSelectedCategory("all")}
              className={`rounded-full px-5 py-2.5 text-xs font-extrabold transition-all sm:text-sm ${
                selectedCategory === "all"
                  ? "scale-[1.02] bg-gradient-to-r from-teal-900 via-teal-800 to-emerald-800 text-white shadow-xl shadow-teal-900/30 ring-2 ring-white/95 ring-offset-2 ring-offset-[#e8f7f3]"
                  : "border-2 border-slate-200/90 bg-white text-slate-950 shadow-md hover:-translate-y-0.5 hover:border-teal-300 hover:bg-teal-50/80 hover:shadow-lg"
              }`}
            >
              Toutes · {categoryCounts.all || 0}
            </button>
            {CATEGORIES.map((category) => (
              <button
                key={category.key}
                type="button"
                onClick={() => setSelectedCategory(category.key)}
                className={`rounded-full px-5 py-2.5 text-xs font-extrabold transition-all sm:text-sm ${
                  selectedCategory === category.key
                    ? "scale-[1.02] bg-gradient-to-r from-teal-900 via-teal-800 to-emerald-800 text-white shadow-xl shadow-teal-900/30 ring-2 ring-white/95 ring-offset-2 ring-offset-[#e8f7f3]"
                    : "border-2 border-slate-200/90 bg-white text-slate-950 shadow-md hover:-translate-y-0.5 hover:border-teal-300 hover:bg-teal-50/80 hover:shadow-lg"
                }`}
              >
                {category.label} · {categoryCounts[category.key] || 0}
              </button>
            ))}
          </div>
        </div>
      </section>

      <main className="relative z-10 mx-auto max-w-[1440px] space-y-8 px-4 py-11 sm:px-6 lg:px-8 lg:py-14">
        <section className="space-y-9">
          {error && !loading && (
            <div className="flex items-start gap-3 rounded-2xl border-2 border-rose-300/80 bg-gradient-to-r from-rose-50 to-white px-5 py-4 text-sm font-bold text-rose-950 shadow-md">
              <span className="text-xl" aria-hidden>
                !
              </span>
              <span>{error}</span>
            </div>
          )}

          {loading && (
            <div className="flex flex-col items-center justify-center gap-5 rounded-[1.75rem] border-2 border-teal-100/90 bg-white/95 py-20 shadow-[0_20px_60px_-24px_rgba(15,118,110,0.25)] backdrop-blur-sm">
              <div className="relative h-14 w-14" aria-hidden>
                <div className="absolute inset-0 animate-ping rounded-full bg-teal-400/35" />
                <div className="relative h-14 w-14 animate-spin rounded-full border-[3px] border-teal-100 border-t-teal-700" />
              </div>
              <p className="font-display text-base font-bold text-slate-900">Chargement du catalogue…</p>
            </div>
          )}

          {!loading && !error && filteredActivities.length === 0 && (
            <div className="rounded-[1.75rem] border-2 border-slate-200/90 bg-gradient-to-b from-white to-slate-50 px-8 py-16 text-center shadow-[0_20px_50px_-28px_rgba(15,23,42,0.18)]">
              <p className="font-display text-2xl font-extrabold text-slate-950">Aucun résultat</p>
              <p className="mt-3 text-base font-semibold text-slate-800">Essayez un autre mot-clé ou changez de catégorie.</p>
            </div>
          )}

          <div className="space-y-14 pb-12">
            {groupedActivities.map((group) => (
              <section key={group.key} className="space-y-7">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                  <div className="flex items-center gap-4">
                    <span className="hidden h-12 w-1.5 shrink-0 rounded-full bg-gradient-to-b from-teal-500 via-teal-600 to-cyan-500 shadow-md sm:block" />
                    <h2 className="font-display text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">
                      {group.label}
                    </h2>
                  </div>
                  <span className="inline-flex w-fit items-center rounded-full border border-teal-300/50 bg-gradient-to-r from-teal-100/90 to-cyan-50 px-4 py-2 text-xs font-extrabold text-teal-950 shadow-sm">
                    {group.items.length} activité{group.items.length > 1 ? "s" : ""}
                  </span>
                </div>
                <div className="grid gap-7 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {group.items.map((activity) => {
                    const categoryKey = normalizeCategory(activity.category);
                    const catalogUrls = normalizeCatalogImageUrlsFromDb(activity.catalog_image_urls);
                    const coverImageUrl = catalogUrls[0] || null;
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
                        className="service-card group relative flex h-full w-full cursor-pointer flex-col overflow-hidden rounded-[1.5rem] border-2 border-slate-200/70 bg-white shadow-[0_12px_40px_-20px_rgba(15,23,42,0.15),0_4px_14px_-6px_rgba(15,118,110,0.12)] ring-1 ring-slate-900/[0.04] transition-all duration-300 ease-out hover:-translate-y-1.5 hover:border-teal-400/60 hover:shadow-[0_24px_50px_-20px_rgba(15,118,110,0.22),0_12px_32px_-12px_rgba(15,23,42,0.15)] hover:ring-teal-500/20 active:scale-[0.99]"
                      >
                        <div className="relative h-48 overflow-hidden bg-slate-100 sm:h-[12rem]">
                          {coverImageUrl ? (
                            <img
                              src={coverImageUrl}
                              alt=""
                              className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.06]"
                              loading="lazy"
                            />
                          ) : (
                            <div className="h-full w-full transition group-hover:brightness-105" style={{ background: getCategoryCover(categoryKey) }} />
                          )}
                          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/78 via-slate-900/20 to-transparent" />
                          <div className="absolute right-3 top-3">
                            <button
                              type="button"
                              onClick={(e) => e.stopPropagation()}
                              className="flex h-10 w-10 items-center justify-center rounded-full border border-white/40 bg-white/95 text-rose-500 shadow-lg backdrop-blur-md transition hover:scale-105 hover:bg-white hover:text-rose-600"
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
                        <div className="flex grow flex-col bg-gradient-to-b from-white to-slate-50/30 p-5">
                          <h3 className="mb-2 line-clamp-2 font-display text-[1.07rem] font-extrabold leading-snug text-slate-950 transition-colors group-hover:text-teal-900 sm:text-[17px]">
                            {activity.name}
                          </h3>
                          <div className="mt-auto flex justify-end border-t border-slate-200/90 pt-4">
                            <div className="flex flex-col items-end text-right">
                              <span className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-slate-800">
                                à partir de
                              </span>
                              <div className="mt-1 flex items-baseline gap-1">
                                {cardFrom != null && cardFrom > 0 ? (
                                  <span className="rounded-xl border border-slate-200/80 bg-white px-2.5 py-1 font-display text-xl font-black tabular-nums text-slate-950 shadow-sm">
                                    {formatMoney(cardFrom, activity.currency || "EUR")}
                                  </span>
                                ) : (
                                  <span className="rounded-xl border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-sm font-extrabold text-amber-950">
                                    Sur devis
                                  </span>
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
                            className="group/btn relative mt-4 flex w-full min-h-[48px] items-center justify-center gap-2 overflow-hidden rounded-xl border border-white/20 bg-gradient-to-r from-teal-900 via-teal-800 to-emerald-800 px-4 py-3.5 text-sm font-extrabold tracking-tight text-white shadow-[0_6px_22px_-6px_rgba(15,118,110,0.55)] transition hover:from-teal-950 hover:via-teal-900 hover:to-emerald-900 hover:shadow-[0_12px_32px_-8px_rgba(15,118,110,0.5)] active:scale-[0.98]"
                          >
                            <span className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
                            <svg className="relative h-5 w-5 shrink-0 text-white drop-shadow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" aria-hidden>
                              <circle cx="9" cy="21" r="1" />
                              <circle cx="20" cy="21" r="1" />
                              <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
                            </svg>
                            <span className="relative drop-shadow-sm">Ajouter au panier</span>
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

      <footer className="relative z-10 border-t border-teal-900/10 bg-gradient-to-b from-transparent via-teal-950/[0.02] to-teal-950/[0.04] py-14 text-center">
        <p className="text-[11px] font-extrabold uppercase tracking-[0.28em] text-slate-900">Hurghada Dream</p>
        <p className="mt-2.5 text-sm font-semibold text-slate-800">Excursions &amp; séjours — Mer Rouge &amp; désert</p>
      </footer>

      {cartDrawerOpen && (
        <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true" aria-labelledby="cart-drawer-title">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/55 backdrop-blur-sm transition-opacity"
            aria-label="Fermer le panier"
            onClick={() => setCartDrawerOpen(false)}
          />
          <div className="relative z-10 flex h-full w-full max-w-md flex-col border-l border-teal-200/60 bg-white shadow-2xl shadow-teal-950/25">
            <div className="relative flex items-center justify-between overflow-hidden border-b border-teal-950/20 bg-gradient-to-r from-teal-900 via-teal-800 to-emerald-900 px-5 py-5 text-white shadow-lg">
              <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-white/15 blur-2xl" />
              <h2 id="cart-drawer-title" className="relative font-display text-xl font-extrabold tracking-tight text-white drop-shadow-md">
                Votre panier
              </h2>
              <button
                type="button"
                onClick={() => setCartDrawerOpen(false)}
                className="relative rounded-xl p-2 text-white transition hover:bg-white/20"
                aria-label="Fermer"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-gradient-to-b from-slate-50/40 to-white px-4 py-5">
              {cartLines.length === 0 && (
                <p className="rounded-2xl border-2 border-dashed border-teal-200/60 bg-teal-50/40 px-5 py-10 text-center text-sm font-semibold leading-relaxed text-slate-800">
                  Votre panier est vide.
                  <br />
                  <span className="font-bold text-teal-900">Ajoutez des activités depuis le catalogue.</span>
                </p>
              )}
              {cartLines.map((line) => (
                <div
                  key={line.id}
                  className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-md shadow-slate-900/5 ring-1 ring-slate-900/[0.03]"
                >
                  <p className="line-clamp-2 text-sm font-semibold leading-snug text-slate-900">{line.activity.name}</p>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <label className="space-y-1">
                      <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-800">Adultes</span>
                      <input
                        type="number"
                        min="0"
                        value={line.adults}
                        onChange={(e) => updateCartLine(line.id, "adults", e.target.value)}
                        className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-teal-400 focus:ring-1 focus:ring-teal-400"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-800">Enfants</span>
                      <input
                        type="number"
                        min="0"
                        value={line.children}
                        onChange={(e) => updateCartLine(line.id, "children", e.target.value)}
                        className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-teal-400 focus:ring-1 focus:ring-teal-400"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-800">Bébés</span>
                      {line.activity.babies_forbidden ? (
                        <div className="rounded-lg border border-amber-200/90 bg-amber-50 px-2 py-2 text-center text-[11px] font-semibold leading-tight text-amber-950">
                          Interdit aux bébés
                        </div>
                      ) : (
                        <input
                          type="number"
                          min="0"
                          value={line.babies}
                          onChange={(e) => updateCartLine(line.id, "babies", e.target.value)}
                          className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-teal-400 focus:ring-1 focus:ring-teal-400"
                        />
                      )}
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
            <div className="border-t border-slate-200/80 bg-gradient-to-t from-slate-50 to-white p-6 shadow-[0_-8px_30px_-12px_rgba(15,118,110,0.12)]">
              <div className="mb-4 flex items-end justify-between gap-3">
                <span className="text-xs font-bold uppercase tracking-[0.12em] text-slate-800">Total estimé</span>
                <span className="font-display text-2xl font-black tabular-nums text-teal-900">
                  {formatMoney(cartTotal, "EUR")}
                </span>
              </div>
              <button
                type="button"
                disabled={cartLines.length === 0}
                onClick={() => {
                  setError("");
                  setSuccess("");
                  setCartDrawerOpen(false);
                  setCheckoutOpen(true);
                }}
                className="flex w-full min-h-[52px] items-center justify-center gap-2 rounded-2xl border border-white/10 bg-gradient-to-r from-teal-900 via-teal-800 to-emerald-800 px-4 py-4 text-sm font-extrabold tracking-tight text-white shadow-[0_6px_24px_-6px_rgba(15,118,110,0.55)] transition hover:from-teal-950 hover:via-teal-900 hover:to-emerald-900 disabled:cursor-not-allowed disabled:border-slate-300 disabled:from-slate-200 disabled:via-slate-200 disabled:to-slate-200 disabled:text-slate-700 disabled:shadow-none"
              >
                <span>Finaliser mon devis</span>
                <span aria-hidden>→</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {checkoutOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="checkout-title">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
            aria-label="Fermer"
            onClick={() => setCheckoutOpen(false)}
          />
          <form
            onSubmit={submitPublicQuote}
            className="relative z-10 max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-[1.75rem] border-2 border-teal-100/90 bg-white p-6 shadow-[0_28px_90px_-18px_rgba(15,118,110,0.38)] sm:rounded-3xl sm:p-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-6 flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-teal-800">Devis</p>
                <h2 id="checkout-title" className="font-display text-xl font-extrabold text-slate-950 sm:text-2xl">
                  Vos coordonnées
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setCheckoutOpen(false)}
                className="rounded-xl p-2 text-slate-700 transition hover:bg-slate-100 hover:text-slate-900"
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
            <div className="space-y-3.5">
              <input
                value={client.name}
                onChange={(e) => updateClientField("name", e.target.value)}
                placeholder="Nom complet *"
                className="w-full rounded-2xl border-2 border-slate-200/90 bg-gradient-to-b from-slate-50/80 to-white px-4 py-3 text-sm font-medium text-slate-900 outline-none transition placeholder:text-slate-600 focus:border-teal-400 focus:bg-white focus:ring-4 focus:ring-teal-500/15"
                autoComplete="name"
              />
              <input
                value={client.phone}
                onChange={(e) => updateClientField("phone", e.target.value)}
                placeholder="Téléphone *"
                className="w-full rounded-2xl border-2 border-slate-200/90 bg-gradient-to-b from-slate-50/80 to-white px-4 py-3 text-sm font-medium text-slate-900 outline-none transition placeholder:text-slate-600 focus:border-teal-400 focus:bg-white focus:ring-4 focus:ring-teal-500/15"
                autoComplete="tel"
              />
              <input
                type="email"
                value={client.email}
                onChange={(e) => updateClientField("email", e.target.value)}
                placeholder="Email"
                className="w-full rounded-2xl border-2 border-slate-200/90 bg-gradient-to-b from-slate-50/80 to-white px-4 py-3 text-sm font-medium text-slate-900 outline-none transition placeholder:text-slate-600 focus:border-teal-400 focus:bg-white focus:ring-4 focus:ring-teal-500/15"
                autoComplete="email"
              />
              <input
                value={client.hotel}
                onChange={(e) => updateClientField("hotel", e.target.value)}
                placeholder="Hôtel"
                className="w-full rounded-2xl border-2 border-slate-200/90 bg-gradient-to-b from-slate-50/80 to-white px-4 py-3 text-sm font-medium text-slate-900 outline-none transition placeholder:text-slate-600 focus:border-teal-400 focus:bg-white focus:ring-4 focus:ring-teal-500/15"
              />
              <textarea
                value={client.notes}
                onChange={(e) => updateClientField("notes", e.target.value)}
                placeholder="Précisions (horaires, enfants, etc.)"
                rows={3}
                className="w-full resize-none rounded-2xl border-2 border-slate-200/90 bg-gradient-to-b from-slate-50/80 to-white px-4 py-3 text-sm font-medium text-slate-900 outline-none transition placeholder:text-slate-600 focus:border-teal-400 focus:bg-white focus:ring-4 focus:ring-teal-500/15"
              />
            </div>
            <p className="mt-6 rounded-xl bg-slate-100 px-4 py-3 text-xs font-semibold text-slate-900">
              Total : <span className="font-display font-bold text-slate-900 tabular-nums">{formatMoney(cartTotal, "EUR")}</span> —{" "}
              {cartLines.length} ligne{cartLines.length > 1 ? "s" : ""}
            </p>
            <button
              type="submit"
              disabled={submitLoading}
              className="mt-6 w-full min-h-[52px] rounded-2xl border border-white/15 bg-gradient-to-r from-teal-900 via-teal-800 to-emerald-800 px-4 py-4 text-sm font-extrabold tracking-tight text-white shadow-[0_8px_28px_-8px_rgba(15,118,110,0.5)] transition hover:from-teal-950 hover:via-teal-900 hover:to-emerald-900 disabled:cursor-not-allowed disabled:from-slate-300 disabled:via-slate-300 disabled:to-slate-300 disabled:text-slate-700 disabled:shadow-none"
            >
              {submitLoading ? "Envoi en cours…" : "Envoyer ma demande"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
