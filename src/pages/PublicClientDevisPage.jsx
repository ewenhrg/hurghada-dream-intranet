import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase, __SUPABASE_DEBUG__ } from "../lib/supabase";
import { CATEGORIES, SITE_KEY } from "../constants";
import { logger } from "../utils/logger";
import { loadPublicCatalogueCart, savePublicCatalogueCart } from "../utils/publicCatalogueCartStorage";
import { computePublicCatalogLineTotal, getPublicCatalogListFromPrice } from "../utils/publicCatalogPricing";
import { normalizeCatalogImageUrlsFromDb } from "../utils/catalogContent";

/** `*` : toutes les colonnes présentes en base (évite erreur si `babies_forbidden` n’est pas encore migrée). */
const ACTIVITY_COLUMNS = "*";

const INSTAGRAM_CATALOG_URL = "https://www.instagram.com/hurghada_dream/";

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

/** Affichage lisible de la date d’excursion dans le panier (lecture seule). */
function formatCartLineDate(iso) {
  const s = String(iso ?? "").trim();
  if (!s) return "—";
  const d = new Date(`${s}T12:00:00`);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function normalizeCategory(rawCategory) {
  const value = String(rawCategory || "").trim();
  const exists = CATEGORIES.some((category) => category.key === value);
  return exists ? value : "desert";
}

function getCategoryCover(categoryKey) {
  const covers = {
    desert:
      "linear-gradient(145deg, rgba(251,191,36,0.98) 0%, rgba(217,119,6,0.92) 45%, rgba(180,83,9,0.88) 100%)",
    aquatique:
      "linear-gradient(145deg, rgba(34,211,238,0.95) 0%, rgba(6,182,212,0.92) 50%, rgba(8,145,178,0.9) 100%)",
    exploration_bien_etre:
      "linear-gradient(145deg, rgba(52,211,153,0.96) 0%, rgba(16,185,129,0.92) 50%, rgba(5,150,105,0.9) 100%)",
    luxor_caire:
      "linear-gradient(145deg, rgba(165,180,252,0.98) 0%, rgba(99,102,241,0.94) 45%, rgba(67,56,202,0.9) 100%)",
    marsa_alam:
      "linear-gradient(145deg, rgba(251,113,133,0.96) 0%, rgba(244,63,94,0.92) 50%, rgba(190,18,60,0.88) 100%)",
    transfert:
      "linear-gradient(145deg, rgba(100,116,139,0.96) 0%, rgba(51,65,85,0.94) 50%, rgba(15,23,42,0.92) 100%)",
  };
  return covers[categoryKey] || covers.desert;
}

function getCategoryEmoji(categoryKey) {
  const map = {
    desert: "🏜",
    aquatique: "🌊",
    exploration_bien_etre: "✨",
    luxor_caire: "🏛",
    marsa_alam: "🐠",
    transfert: "🚐",
  };
  return map[categoryKey] || "⭐";
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
    arrivalDate: "",
    departureDate: "",
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

  /** Délais d’entrée échelonnés pour les cartes (effet « vivant », plafonné pour perf). */
  const catalogCardEnterDelayMsById = useMemo(() => {
    const map = new Map();
    let idx = 0;
    groupedActivities.forEach((g) => {
      g.items.forEach((a) => {
        map.set(a.id, Math.min(idx++, 20) * 42);
      });
    });
    return map;
  }, [groupedActivities]);

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

    const name = client.name.trim();
    const phone = client.phone.trim();
    const email = client.email.trim();
    const hotel = client.hotel.trim();
    const arrival = client.arrivalDate?.trim() || "";
    const departure = client.departureDate?.trim() || "";
    const notes = client.notes.trim();

    if (!name) {
      setError("Le nom complet est obligatoire.");
      return;
    }
    if (!phone) {
      setError("Le téléphone est obligatoire.");
      return;
    }
    const phoneDigits = phone.replace(/\D/g, "");
    if (phoneDigits.length < 8) {
      setError("Indique un numéro de téléphone valide (au moins 8 chiffres).");
      return;
    }
    if (!email) {
      setError("L’e-mail est obligatoire.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("L’adresse e-mail n’est pas valide.");
      return;
    }
    if (!hotel) {
      setError("L’hôtel ou le lieu de prise en charge est obligatoire.");
      return;
    }
    if (!arrival) {
      setError("La date d’arrivée est obligatoire.");
      return;
    }
    if (!departure) {
      setError("La date de fin de séjour (départ) est obligatoire.");
      return;
    }
    if (arrival > departure) {
      setError("La date de départ doit être le même jour ou après la date d’arrivée.");
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
    const items = cartLines.map((line) => {
      const act = line.activity;
      const babiesVal = act.babies_forbidden ? 0 : toNumber(line.babies);
      return {
        activityId: String(act.id),
        activityName: act.name || "",
        date: line.date || "",
        adults: toNumber(line.adults),
        children: toNumber(line.children),
        babies: babiesVal,
        lineTotal: toNumber(line.lineTotal),
        // Options catalogue (fiche activité / panier) — nécessaire pour « Commencer le devis » côté intranet
        extraDolphin: Boolean(line.extraDolphin),
        speedBoatExtra: Array.isArray(line.speedBoatExtra)
          ? [...line.speedBoatExtra]
          : line.speedBoatExtra
            ? [line.speedBoatExtra]
            : [],
        buggySimple: toNumber(line.buggySimple),
        buggyFamily: toNumber(line.buggyFamily),
        yamaha250: toNumber(line.yamaha250),
        ktm640: toNumber(line.ktm640),
        ktm530: toNumber(line.ktm530),
        cairePrivatif4pax: Boolean(line.cairePrivatif4pax),
        cairePrivatif5pax: Boolean(line.cairePrivatif5pax),
        cairePrivatif6pax: Boolean(line.cairePrivatif6pax),
        louxorPrivatif4pax: Boolean(line.louxorPrivatif4pax),
        louxorPrivatif5pax: Boolean(line.louxorPrivatif5pax),
        louxorPrivatif6pax: Boolean(line.louxorPrivatif6pax),
        allerSimple: Boolean(line.allerSimple),
        allerRetour: Boolean(line.allerRetour),
        zeroTracasTransfertVisaSim: line.zeroTracasTransfertVisaSim ?? "",
        zeroTracasTransfertVisa: line.zeroTracasTransfertVisa ?? "",
        zeroTracasTransfert3Personnes: line.zeroTracasTransfert3Personnes ?? "",
        zeroTracasTransfertPlus3Personnes: line.zeroTracasTransfertPlus3Personnes ?? "",
        zeroTracasVisaSim: line.zeroTracasVisaSim ?? "",
        zeroTracasVisaSeul: line.zeroTracasVisaSeul ?? "",
      };
    });

    const payload = {
      site_key: SITE_KEY,
      client_name: name,
      client_phone: phone,
      client_email: email,
      client_hotel: hotel,
      client_arrival_date: arrival,
      client_departure_date: departure,
      notes: notes || "",
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
        setError(insertError.message || "Impossible d'envoyer votre devis.");
        return;
      }
      setSuccess("Demande envoyée avec succès. Nous vous contactons rapidement.");
      setCart([]);
      setClient({
        name: "",
        phone: "",
        email: "",
        hotel: "",
        arrivalDate: "",
        departureDate: "",
        notes: "",
      });
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
    <div className="hd-public-catalog relative isolate flex min-h-screen flex-col overflow-x-hidden bg-[#f3efe4] font-catalog-sans text-catalog-body antialiased selection:bg-amber-200/50 selection:text-catalog-ink">
      {/* Fond opaque : coupe le dégradé sombre global du body intranet */}
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0 bg-[#f3efe4]" />
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0 bg-catalog-mesh opacity-[0.28]" />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0 bg-catalog-grid opacity-[0.12] [background-size:44px_44px]"
      />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 z-0 h-[min(72vh,520px)] bg-[radial-gradient(ellipse_90%_70%_at_50%_-18%,rgba(251,191,36,0.16),transparent_58%)]"
      />

      <header className="sticky top-0 z-30 border-b border-amber-400/35 bg-slate-950 text-white shadow-[0_12px_40px_-12px_rgba(0,0,0,0.55)]">
        <div className="mx-auto flex max-w-[1440px] animate-catalog-in-fade items-center justify-between gap-4 px-4 py-3.5 opacity-0 motion-reduce:animate-none motion-reduce:opacity-100 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3.5">
            <div className="relative flex h-[3.25rem] w-[3.25rem] shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#022c22] via-teal-900 to-emerald-900 p-1.5 shadow-xl shadow-black/40 ring-2 ring-amber-300/50 ring-offset-2 ring-offset-slate-950">
              <div className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-tr from-white/25 to-transparent" />
              <img src="/logo.png" alt="Hurghada Dream" className="relative h-full w-full object-contain drop-shadow-md" />
            </div>
            <div className="min-w-0">
              <p className="truncate font-catalog-display text-lg font-semibold tracking-tight text-white sm:text-xl">
                Hurghada Dream
              </p>
              <p className="text-[10px] font-bold uppercase tracking-[0.26em] text-amber-200/95 sm:text-[11px]">
                Excursions · Mer Rouge
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2.5 sm:gap-3">
            <a
              href={INSTAGRAM_CATALOG_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="group relative inline-flex min-h-[44px] items-center gap-2 overflow-hidden rounded-full bg-gradient-to-r from-[#f09433] via-[#dc2743] to-[#bc1888] px-3.5 py-2.5 pl-3.5 text-sm font-extrabold tracking-tight text-white shadow-[0_4px_20px_-4px_rgba(225,48,108,0.45),0_2px_8px_-2px_rgba(15,23,42,0.2)] ring-2 ring-white/30 transition hover:brightness-105 hover:shadow-[0_8px_28px_-6px_rgba(225,48,108,0.5)] active:scale-[0.98] sm:gap-2 sm:px-4 sm:py-2.5"
              aria-label="Instagram Hurghada Dream — 127K abonnés (nouvelle fenêtre)"
            >
              <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
              <svg
                className="relative h-5 w-5 shrink-0 text-white drop-shadow-sm"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden
              >
                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.06-1.28.072-1.689.072-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z" />
              </svg>
              <span className="relative text-[15px] font-black tabular-nums tracking-tight drop-shadow-sm">127K</span>
            </a>
            <button
              type="button"
              onClick={() => {
                setError("");
                setSuccess("");
                setCartDrawerOpen(true);
              }}
              className="group relative inline-flex min-h-[44px] items-center gap-2 overflow-hidden rounded-full bg-amber-400 px-3.5 py-2.5 pl-3.5 text-sm font-extrabold tracking-tight text-slate-950 shadow-[0_4px_20px_-4px_rgba(251,191,36,0.65),0_2px_8px_-2px_rgba(0,0,0,0.35)] ring-2 ring-amber-200/80 transition hover:bg-amber-300 hover:shadow-[0_8px_28px_-6px_rgba(251,191,36,0.55)] active:scale-[0.98] sm:gap-2.5 sm:px-5 sm:py-2.5"
            >
              <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/10 to-transparent" />
              <span className="pointer-events-none absolute inset-0 opacity-0 transition group-hover:opacity-100">
                <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/35 to-transparent transition duration-700 group-hover:translate-x-full" />
              </span>
              <svg className="relative h-5 w-5 shrink-0 text-slate-900" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" aria-hidden>
                <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
                <path d="M3 6h18" />
                <path d="M16 10a4 4 0 0 1-8 0" />
              </svg>
              <span className="relative text-[15px]">Panier</span>
              {cartLines.length > 0 ? (
                <span className="relative flex h-7 min-w-[1.75rem] items-center justify-center rounded-full border border-slate-900/20 bg-slate-900 px-2 text-xs font-black text-amber-300 shadow-inner">
                  {cartLines.length}
                </span>
              ) : null}
            </button>
          </div>
        </div>
      </header>

      <section className="relative z-10 border-b border-slate-200/90 bg-white">
        <div className="relative mx-auto max-w-6xl px-4 pb-16 pt-12 text-center sm:px-6 sm:pb-20 sm:pt-16 lg:max-w-7xl">
          <span className="mb-6 inline-flex animate-catalog-in-up items-center gap-2 rounded-full border border-amber-200/80 bg-gradient-to-r from-white via-amber-50/90 to-white px-5 py-2 text-[10px] font-bold uppercase tracking-[0.26em] text-[#422006] opacity-0 shadow-md shadow-amber-900/10 backdrop-blur-sm motion-reduce:animate-none motion-reduce:opacity-100 sm:text-[11px]">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.8)]" aria-hidden />
            Catalogue en direct
          </span>
          <h1 className="mx-auto max-w-4xl animate-catalog-in-up font-catalog-display text-[2rem] font-semibold leading-[1.08] tracking-tight text-catalog-ink opacity-0 motion-reduce:animate-none motion-reduce:opacity-100 sm:text-[2.35rem] md:text-5xl md:leading-[1.06]" style={{ animationDelay: "70ms" }}>
            Votre prochaine{" "}
            <span className="relative inline-block">
              <span className="relative z-10 font-semibold text-teal-700 [text-shadow:0_1px_0_rgba(255,255,255,0.95),0_2px_12px_rgba(15,118,110,0.25)]">
                aventure
              </span>
              <span
                aria-hidden
                className="absolute -inset-x-1 -bottom-1 z-0 h-3 rounded-md bg-gradient-to-r from-amber-300/95 via-amber-200/80 to-amber-100/40"
              />
            </span>{" "}
            à Hurghada
          </h1>
          <p className="mx-auto mt-6 max-w-2xl animate-catalog-in-up text-[15px] font-semibold leading-relaxed text-catalog-body opacity-0 motion-reduce:animate-none motion-reduce:opacity-100 sm:text-lg sm:leading-relaxed" style={{ animationDelay: "130ms" }}>
            Désert, mer, Louxor &amp; Caires — parcourez le catalogue, composez votre panier et recevez une proposition claire, sans engagement.
          </p>

          <div className="mx-auto mt-12 max-w-xl animate-catalog-in-up opacity-0 motion-reduce:animate-none motion-reduce:opacity-100" style={{ animationDelay: "190ms" }}>
            <label className="relative block text-left" htmlFor="public-search">
              <span className="mb-2.5 block text-center text-[10px] font-extrabold uppercase tracking-[0.28em] text-catalog-label">
                Recherche instantanée
              </span>
              <span className="relative block rounded-[1.4rem] border-2 border-slate-200/95 bg-white p-1 shadow-catalog-premium ring-1 ring-slate-900/[0.04] backdrop-blur-md transition focus-within:border-teal-500 focus-within:shadow-catalog-premium-hover focus-within:ring-2 focus-within:ring-teal-400/40">
                <svg
                  className="pointer-events-none absolute left-6 top-1/2 z-10 h-5 w-5 -translate-y-1/2 text-teal-700"
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
                  className="w-full rounded-[1.15rem] border-0 bg-transparent py-4 pl-14 pr-5 text-[15px] font-semibold text-catalog-body shadow-none outline-none ring-0 placeholder:font-medium placeholder:text-catalog-subtle"
                />
              </span>
            </label>
          </div>

          <div className="mx-auto mt-12 max-w-5xl animate-catalog-in-up opacity-0 motion-reduce:animate-none motion-reduce:opacity-100 sm:max-w-none" style={{ animationDelay: "240ms" }}>
            <p className="mb-3 text-center text-xs font-bold uppercase tracking-[0.12em] text-slate-900 sm:text-sm sm:tracking-[0.14em]">
              Filtrer par univers
            </p>
            <div className="-mx-1 flex snap-x snap-mandatory flex-nowrap justify-start gap-2 overflow-x-auto px-1 pb-2 pt-1 scrollbar-hide sm:mx-0 sm:flex-wrap sm:justify-center sm:overflow-visible sm:pb-0">
              <button
                type="button"
                onClick={() => setSelectedCategory("all")}
                className={`snap-center shrink-0 rounded-2xl px-4 py-3 text-left text-sm font-semibold leading-snug transition-all sm:rounded-full sm:px-5 sm:text-center ${
                  selectedCategory === "all"
                    ? "scale-[1.02] bg-gradient-to-br from-[#022c22] via-teal-900 to-emerald-900 text-white shadow-lg shadow-teal-950/30 ring-2 ring-amber-200/55 ring-offset-2 ring-offset-white"
                    : "border-2 border-slate-500 bg-white text-slate-950 shadow-sm hover:-translate-y-0.5 hover:border-teal-700 hover:bg-teal-50/95 hover:shadow-md"
                }`}
              >
                <span className="mr-1.5" aria-hidden>
                  ✦
                </span>
                Toutes
                <span
                  className={`ml-1.5 tabular-nums ${selectedCategory === "all" ? "text-white/90" : "text-slate-600"}`}
                >
                  · {categoryCounts.all || 0}
                </span>
              </button>
              {CATEGORIES.map((category) => {
                const active = selectedCategory === category.key;
                return (
                <button
                  key={category.key}
                  type="button"
                  onClick={() => setSelectedCategory(category.key)}
                  className={`snap-center flex min-w-[9.5rem] shrink-0 items-center gap-2 rounded-2xl px-4 py-3 text-left text-sm font-semibold leading-snug transition-all sm:min-w-0 sm:rounded-full sm:px-5 sm:text-center ${
                    active
                      ? "scale-[1.02] bg-gradient-to-br from-[#022c22] via-teal-900 to-emerald-900 text-white shadow-lg shadow-teal-950/30 ring-2 ring-amber-200/55 ring-offset-2 ring-offset-white"
                      : "border-2 border-slate-500 bg-white text-slate-950 shadow-sm hover:-translate-y-0.5 hover:border-teal-700 hover:bg-teal-50/95 hover:shadow-md"
                  }`}
                >
                  <span className="text-lg leading-none sm:text-xl" aria-hidden>
                    {getCategoryEmoji(category.key)}
                  </span>
                  <span className="min-w-0 text-balance leading-snug">
                    {category.label}
                    <span className={`ml-1 tabular-nums ${active ? "text-white/90" : "text-slate-600"}`}>
                      · {categoryCounts[category.key] || 0}
                    </span>
                  </span>
                </button>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <main className="relative z-10 mx-auto max-w-[1440px] space-y-10 px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <section className="space-y-10">
          {error && !loading && (
            <div className="flex items-start gap-4 rounded-3xl border border-rose-200/90 bg-gradient-to-br from-rose-50 via-white to-rose-50/50 px-6 py-5 text-sm font-semibold text-rose-950 shadow-catalog-premium">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-rose-500/15 text-lg font-black text-rose-700" aria-hidden>
                !
              </span>
              <span className="pt-0.5 leading-relaxed">{error}</span>
            </div>
          )}

          {loading && (
            <div className="flex flex-col items-center justify-center gap-6 rounded-[2rem] border border-white/80 bg-white/90 py-24 shadow-catalog-premium backdrop-blur-md">
              <div className="relative h-16 w-16" aria-hidden>
                <div className="absolute inset-0 animate-ping rounded-full bg-emerald-400/30" />
                <div className="relative h-16 w-16 animate-spin rounded-full border-[3px] border-teal-100 border-t-teal-700" />
              </div>
              <p className="font-catalog-display text-lg font-semibold text-catalog-ink">Chargement du catalogue…</p>
              <p className="max-w-sm text-center text-sm font-semibold text-catalog-muted">Préparation des meilleures expériences pour vous.</p>
            </div>
          )}

          {!loading && !error && filteredActivities.length === 0 && (
            <div className="rounded-[2rem] border border-slate-200/80 bg-gradient-to-br from-white via-slate-50/80 to-teal-50/30 px-8 py-20 text-center shadow-catalog-premium">
              <p className="font-catalog-display text-2xl font-semibold text-catalog-ink">Aucun résultat</p>
              <p className="mx-auto mt-4 max-w-md text-base font-semibold leading-relaxed text-catalog-muted">
                Essayez un autre mot-clé ou changez de catégorie — notre catalogue évolue souvent.
              </p>
            </div>
          )}

          <div className="space-y-16 pb-16">
            {groupedActivities.map((group, groupIndex) => (
              <section
                key={group.key}
                className="animate-catalog-in-fade space-y-8 opacity-0 motion-reduce:animate-none motion-reduce:opacity-100"
                style={{ animationDelay: `${Math.min(groupIndex, 12) * 50}ms` }}
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
                  <div className="flex items-start gap-4">
                    <span className="mt-1 hidden h-14 w-1 shrink-0 rounded-full bg-gradient-to-b from-amber-400 via-teal-500 to-emerald-600 shadow-md sm:block" />
                    <div>
                      <p className="mb-1 text-[10px] font-extrabold uppercase tracking-[0.22em] text-catalog-label">Collection</p>
                      <h2 className="font-catalog-display text-[1.65rem] font-semibold tracking-tight text-catalog-ink sm:text-3xl md:text-[2rem]">
                        {group.label}
                      </h2>
                    </div>
                  </div>
                  <span className="inline-flex w-fit items-center gap-2 rounded-2xl border-2 border-slate-200 bg-white px-4 py-2.5 text-xs font-extrabold text-catalog-body shadow-sm">
                    <span className="text-base leading-none" aria-hidden>
                      {getCategoryEmoji(group.key)}
                    </span>
                    {group.items.length} expérience{group.items.length > 1 ? "s" : ""}
                  </span>
                </div>
                <div className="grid auto-rows-fr gap-8 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
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
                        aria-label={`${activity.name || "Activité"} — ouvrir la fiche pour configurer et ajouter au panier`}
                        onClick={() =>
                          navigate(`/catalogue/activity/${encodeURIComponent(String(activity.id))}`)
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            navigate(`/catalogue/activity/${encodeURIComponent(String(activity.id))}`);
                          }
                        }}
                        className="group relative flex h-full w-full cursor-pointer flex-col overflow-hidden rounded-[1.85rem] border-2 border-slate-200/95 bg-white opacity-0 shadow-catalog-premium ring-1 ring-slate-900/[0.04] transition-all duration-300 ease-out animate-catalog-in-fade motion-reduce:animate-none motion-reduce:opacity-100 hover:-translate-y-2 hover:border-teal-500/50 hover:shadow-catalog-premium-hover hover:ring-teal-500/20 active:scale-[0.99]"
                        style={{ animationDelay: `${catalogCardEnterDelayMsById.get(activity.id) ?? 0}ms` }}
                      >
                        <div className="relative aspect-[5/4] overflow-hidden bg-slate-100 sm:aspect-[5/4]">
                          {coverImageUrl ? (
                            <img
                              src={coverImageUrl}
                              alt=""
                              className="h-full w-full object-cover transition duration-700 ease-out group-hover:scale-[1.08]"
                              loading="lazy"
                            />
                          ) : (
                            <div className="h-full w-full transition duration-500 group-hover:brightness-105" style={{ background: getCategoryCover(categoryKey) }} />
                          )}
                          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#022c22]/88 via-slate-900/25 to-transparent" />
                          <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-black/75 via-black/35 to-transparent sm:h-44" />
                          <div className="absolute left-3 top-3 z-10 flex max-w-[min(100%,calc(100%-1.25rem))] flex-col items-start gap-2 sm:left-4 sm:top-4">
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/80 bg-slate-950/95 px-3 py-1.5 text-xs font-extrabold text-white shadow-[0_3px_16px_rgba(0,0,0,0.55)] ring-1 ring-black/25 backdrop-blur-md sm:text-sm">
                              <span aria-hidden>{getCategoryEmoji(categoryKey)}</span>
                              {CATEGORIES.find((c) => c.key === categoryKey)?.label || "Activité"}
                            </span>
                            <h3 className="line-clamp-2 text-left font-catalog-display text-[0.95rem] font-bold leading-snug tracking-tight text-white [text-shadow:0_2px_3px_rgba(0,0,0,0.98),0_6px_22px_rgba(0,0,0,0.9)] sm:text-[1.05rem]">
                              {activity.name}
                            </h3>
                          </div>
                        </div>
                        <div className="flex grow flex-col bg-white p-5 sm:p-6">
                          <div className="mt-auto flex items-end justify-between gap-3 border-t-2 border-slate-100 pt-4">
                            <p className="max-w-[58%] text-left text-[11px] font-semibold leading-snug text-catalog-muted sm:text-xs">
                              Dates &amp; participants sur la fiche — ajout panier en un clic.
                            </p>
                            <div className="flex shrink-0 flex-col items-end text-right">
                              <span className="text-[9px] font-extrabold uppercase tracking-[0.18em] text-catalog-subtle">
                                à partir de
                              </span>
                              <div className="mt-1">
                                {cardFrom != null && cardFrom > 0 ? (
                                  <span className="inline-block rounded-xl border-2 border-teal-200 bg-teal-50/90 px-3 py-1.5 font-catalog-display text-xl font-bold tabular-nums text-catalog-ink shadow-sm">
                                    {formatMoney(cardFrom, activity.currency || "EUR")}
                                  </span>
                                ) : (
                                  <span className="inline-block rounded-xl border-2 border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-extrabold text-amber-950">
                                    Sur devis
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
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

      <footer className="relative z-10 border-t-2 border-slate-200/90 bg-gradient-to-b from-white via-slate-50/90 to-[#f3efe4] py-16 text-center">
        <div className="mx-auto max-w-lg animate-catalog-in-fade px-4 opacity-0 motion-reduce:animate-none motion-reduce:opacity-100" style={{ animationDelay: "320ms" }}>
          <p className="font-catalog-display text-sm font-semibold tracking-wide text-catalog-ink">Hurghada Dream</p>
          <p className="mt-3 text-sm font-semibold leading-relaxed text-catalog-muted">
            Excursions sur-mesure · Mer Rouge, désert &amp; temples — une équipe locale à votre écoute.
          </p>
          <div className="mx-auto mt-6 h-px max-w-xs bg-gradient-to-r from-transparent via-amber-300/60 to-transparent" aria-hidden />
        </div>
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
              <h2 id="cart-drawer-title" className="relative font-catalog-display text-xl font-semibold tracking-tight text-white drop-shadow-md">
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
                <p className="rounded-2xl border-2 border-dashed border-teal-300/80 bg-teal-50/70 px-5 py-10 text-center text-sm font-semibold leading-relaxed text-catalog-body">
                  Votre panier est vide.
                  <br />
                  <span className="font-extrabold text-teal-800">Ajoutez des activités depuis le catalogue.</span>
                </p>
              )}
              {cartLines.map((line) => {
                const ageChild = String(line.activity.age_child || "").trim();
                const ageBaby = String(line.activity.age_baby || "").trim();
                return (
                  <div
                    key={line.id}
                    className="rounded-2xl border-2 border-slate-200 bg-white p-4 shadow-md shadow-slate-900/8 ring-1 ring-slate-900/[0.04]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="min-w-0 flex-1 line-clamp-2 text-sm font-bold leading-snug text-catalog-body">
                        {line.activity.name}
                      </p>
                      <button
                        type="button"
                        onClick={() => removeCartLine(line.id)}
                        className="shrink-0 rounded-xl border-2 border-rose-200 bg-rose-50 px-3 py-2 text-xs font-extrabold uppercase tracking-wide text-rose-900 shadow-sm transition hover:border-rose-300 hover:bg-rose-100"
                      >
                        Retirer
                      </button>
                    </div>
                    <p className="mt-2 text-[11px] font-semibold leading-snug text-catalog-muted">
                      Date et participants ne sont pas modifiables ici. Pour les changer, retirez la ligne puis rouvrez la fiche de l&apos;activité.
                    </p>
                    <div className="mt-3 rounded-xl border-2 border-slate-200 bg-slate-50 px-3 py-2.5">
                      <span className="block text-[10px] font-extrabold uppercase tracking-wide text-catalog-subtle">
                        Date d&apos;excursion
                      </span>
                      <p className="mt-0.5 text-sm font-bold text-catalog-body">{formatCartLineDate(line.date)}</p>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      <div className="space-y-1">
                        <span className="block text-[10px] font-extrabold uppercase tracking-wide text-catalog-body">Adultes</span>
                        <div className="rounded-lg border-2 border-slate-200 bg-slate-50 px-2 py-2 text-center text-sm font-bold tabular-nums text-catalog-body">
                          {line.adults ?? 0}
                        </div>
                      </div>
                      <div className="space-y-1">
                        <span className="block text-[10px] font-extrabold uppercase tracking-wide text-catalog-body">Enfants</span>
                        {ageChild ? (
                          <span className="mb-1 block text-[10px] font-semibold leading-tight text-catalog-muted">Âge : {ageChild}</span>
                        ) : (
                          <span className="mb-1 block text-[10px] font-semibold leading-tight text-catalog-subtle">Tarif enfant</span>
                        )}
                        <div className="rounded-lg border-2 border-slate-200 bg-slate-50 px-2 py-2 text-center text-sm font-bold tabular-nums text-catalog-body">
                          {line.children ?? 0}
                        </div>
                      </div>
                      <div className="space-y-1">
                        <span className="block text-[10px] font-extrabold uppercase tracking-wide text-catalog-body">Bébés</span>
                        {line.activity.babies_forbidden ? (
                          <>
                            <span className="mb-1 block text-[10px] font-semibold leading-tight text-amber-900">Non autorisés</span>
                            <div className="rounded-lg border border-amber-200/90 bg-amber-50 px-2 py-2 text-center text-sm font-bold tabular-nums text-amber-950">
                              0
                            </div>
                          </>
                        ) : (
                          <>
                            {ageBaby ? (
                              <span className="mb-1 block text-[10px] font-semibold leading-tight text-catalog-muted">Âge : {ageBaby}</span>
                            ) : (
                              <span className="mb-1 block text-[10px] font-semibold leading-tight text-catalog-subtle">Tarif bébé</span>
                            )}
                            <div className="rounded-lg border-2 border-slate-200 bg-slate-50 px-2 py-2 text-center text-sm font-bold tabular-nums text-catalog-body">
                              {line.babies ?? 0}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="mt-3 border-t border-slate-100 pt-3">
                      <p className="font-catalog-display text-sm font-bold tabular-nums text-teal-800">
                        {formatMoney(line.lineTotal, line.activity.currency)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="border-t border-slate-200/80 bg-gradient-to-t from-slate-50 to-white p-6 shadow-[0_-8px_30px_-12px_rgba(15,118,110,0.12)]">
              <div className="mb-4 flex items-end justify-between gap-3">
                <span className="text-xs font-extrabold uppercase tracking-[0.12em] text-catalog-body">Total estimé</span>
                <span className="font-catalog-display text-2xl font-bold tabular-nums text-teal-800">
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
            className="relative z-10 max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-[1.75rem] border-2 border-slate-200 bg-white p-6 shadow-[0_28px_90px_-18px_rgba(15,23,42,0.18)] sm:rounded-3xl sm:p-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-6 flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-catalog-label">Devis</p>
                <h2 id="checkout-title" className="font-catalog-display text-xl font-semibold text-catalog-ink sm:text-2xl">
                  Vos coordonnées
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setCheckoutOpen(false)}
                className="rounded-xl p-2 text-catalog-muted transition hover:bg-slate-100 hover:text-catalog-ink"
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
            <p className="mb-3 text-xs font-semibold leading-relaxed text-catalog-body">
              Tous les champs ci-dessous sont <strong className="text-catalog-ink">obligatoires</strong> pour envoyer votre demande.
            </p>
            <div className="space-y-3.5">
              <input
                value={client.name}
                onChange={(e) => updateClientField("name", e.target.value)}
                placeholder="Nom complet *"
                required
                className="w-full rounded-2xl border-2 border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-catalog-body outline-none transition placeholder:font-medium placeholder:text-catalog-subtle focus:border-teal-500 focus:ring-4 focus:ring-teal-500/20"
                autoComplete="name"
              />
              <input
                value={client.phone}
                onChange={(e) => updateClientField("phone", e.target.value)}
                placeholder="Téléphone *"
                required
                inputMode="tel"
                className="w-full rounded-2xl border-2 border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-catalog-body outline-none transition placeholder:font-medium placeholder:text-catalog-subtle focus:border-teal-500 focus:ring-4 focus:ring-teal-500/20"
                autoComplete="tel"
              />
              <input
                type="email"
                value={client.email}
                onChange={(e) => updateClientField("email", e.target.value)}
                placeholder="E-mail *"
                required
                className="w-full rounded-2xl border-2 border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-catalog-body outline-none transition placeholder:font-medium placeholder:text-catalog-subtle focus:border-teal-500 focus:ring-4 focus:ring-teal-500/20"
                autoComplete="email"
              />
              <input
                value={client.hotel}
                onChange={(e) => updateClientField("hotel", e.target.value)}
                placeholder="Hôtel ou lieu de prise en charge *"
                required
                className="w-full rounded-2xl border-2 border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-catalog-body outline-none transition placeholder:font-medium placeholder:text-catalog-subtle focus:border-teal-500 focus:ring-4 focus:ring-teal-500/20"
              />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block space-y-1">
                  <span className="text-[11px] font-extrabold uppercase tracking-wide text-catalog-body">Date d’arrivée *</span>
                  <input
                    type="date"
                    value={client.arrivalDate}
                    onChange={(e) => updateClientField("arrivalDate", e.target.value)}
                    required
                    className="w-full rounded-2xl border-2 border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-catalog-body outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-500/20"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-[11px] font-extrabold uppercase tracking-wide text-catalog-body">Date de fin (départ) *</span>
                  <input
                    type="date"
                    value={client.departureDate}
                    min={client.arrivalDate || undefined}
                    onChange={(e) => updateClientField("departureDate", e.target.value)}
                    required
                    className="w-full rounded-2xl border-2 border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-catalog-body outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-500/20"
                  />
                </label>
              </div>
              <textarea
                value={client.notes}
                onChange={(e) => updateClientField("notes", e.target.value)}
                placeholder="Précisions (horaires, langue du guide, enfants, etc.) — optionnel"
                rows={3}
                className="w-full resize-none rounded-2xl border-2 border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-catalog-body outline-none transition placeholder:font-medium placeholder:text-catalog-subtle focus:border-teal-500 focus:ring-4 focus:ring-teal-500/20"
              />
            </div>
            <p className="mt-6 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold text-catalog-body">
              Total : <span className="font-catalog-display font-bold text-catalog-ink tabular-nums">{formatMoney(cartTotal, "EUR")}</span> —{" "}
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
