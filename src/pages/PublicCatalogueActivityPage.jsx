import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase, __SUPABASE_DEBUG__ } from "../lib/supabase";
import { CATEGORIES, SITE_KEY } from "../constants";
import { logger } from "../utils/logger";
import { loadPublicCatalogueCart, savePublicCatalogueCart } from "../utils/publicCatalogueCartStorage";

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

function normalizeCategory(rawCategory) {
  const value = String(rawCategory || "").trim();
  const exists = CATEGORIES.some((category) => category.key === value);
  return exists ? value : "desert";
}

function getCategoryCover(categoryKey) {
  const covers = {
    desert: "linear-gradient(140deg, rgba(245,158,11,0.95), rgba(217,119,6,0.9))",
    aquatique: "linear-gradient(140deg, rgba(6,182,212,0.95), rgba(14,116,144,0.9))",
    exploration_bien_etre: "linear-gradient(140deg, rgba(16,185,129,0.95), rgba(5,150,105,0.9))",
    luxor_caire: "linear-gradient(140deg, rgba(99,102,241,0.95), rgba(79,70,229,0.9))",
    marsa_alam: "linear-gradient(140deg, rgba(244,63,94,0.95), rgba(225,29,72,0.9))",
    transfert: "linear-gradient(140deg, rgba(71,85,105,0.95), rgba(30,41,59,0.9))",
  };
  return covers[categoryKey] || covers.desert;
}

function getCategoryLabel(categoryKey) {
  const category = CATEGORIES.find((entry) => entry.key === categoryKey);
  return category?.label || "Activité";
}

/**
 * @param {{ activityId: string }} props
 */
export function PublicCatalogueActivityPage({ activityId }) {
  const navigate = useNavigate();
  const [activity, setActivity] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);

  const [adults, setAdults] = useState(2);
  const [date, setDate] = useState("");

  const categoryKey = useMemo(
    () => (activity ? normalizeCategory(activity.category) : "desert"),
    [activity]
  );

  const lineTotal = useMemo(() => {
    if (!activity) return 0;
    return toNumber(adults) * toNumber(activity.price_adult);
  }, [activity, adults]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!supabase || !__SUPABASE_DEBUG__.isConfigured || !activityId) {
        setLoadError("Activité introuvable.");
        setActivity(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      setLoadError("");

      try {
        const { data, error } = await supabase
          .from("activities")
          .select(ACTIVITY_COLUMNS)
          .eq("id", activityId)
          .maybeSingle();

        if (cancelled) return;

        if (error || !data) {
          setLoadError(error?.message || "Cette activité n'existe pas ou n'est plus disponible.");
          setActivity(null);
        } else {
          setActivity(data);
        }
      } catch (err) {
        logger.error("PublicCatalogueActivityPage load:", err);
        if (!cancelled) {
          setLoadError("Erreur lors du chargement.");
          setActivity(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [activityId]);

  function appendToCartAndReturn() {
    if (!activity) return;
    const prev = loadPublicCatalogueCart();
    const line = {
      id: `${activity.id}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      activityId: String(activity.id),
      date: date || "",
      adults: Math.max(0, toNumber(adults)),
      children: 0,
      babies: 0,
    };
    savePublicCatalogueCart([...prev, line]);
    navigate("/catalogue");
  }

  async function sharePage() {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({
          title: activity?.name || "Hurghada Dream",
          url,
        });
      } else {
        await navigator.clipboard.writeText(url);
      }
    } catch {
      /* user cancelled or clipboard denied */
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100">
        <div className="mx-auto max-w-[1200px] px-4 py-16 text-center text-slate-600">Chargement…</div>
      </div>
    );
  }

  if (loadError || !activity) {
    return (
      <div className="min-h-screen bg-slate-100">
        <div className="mx-auto max-w-[1200px] px-4 py-16 text-center">
          <p className="text-slate-700">{loadError || "Activité introuvable."}</p>
          <Link to="/catalogue" className="mt-4 inline-block font-semibold text-[#34b3f7] hover:underline">
            ← Retour au catalogue
          </Link>
        </div>
      </div>
    );
  }

  const cover = getCategoryCover(categoryKey);
  const label = getCategoryLabel(categoryKey);

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1200px] items-center gap-4 px-4 py-3 sm:px-6">
          <Link to="/catalogue" className="text-sm font-semibold text-[#34b3f7] hover:underline">
            ← Catalogue
          </Link>
          <div className="h-8 w-px bg-slate-200" aria-hidden />
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-lg bg-slate-950 p-1">
              <img src="/logo.png" alt="" className="h-full w-full object-contain" />
            </div>
            <span className="text-sm font-semibold text-slate-700">Hurghada Dream</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1200px] px-4 py-8 sm:px-6 lg:py-10">
        <div className="grid gap-8 lg:grid-cols-[1fr_360px] lg:items-start">
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-[#1a2b49] sm:text-3xl">{activity.name}</h1>
              <p className="mt-2 flex items-center gap-1.5 text-sm text-slate-600">
                <span className="text-base" aria-hidden>
                  📍
                </span>
                <span>{label}</span>
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                aria-label="Ajouter aux favoris"
              >
                <span aria-hidden>♡</span>
                Ajouter aux favoris
              </button>
              <button
                type="button"
                onClick={() => void sharePage()}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
              >
                Partager
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
              <div
                className="col-span-2 row-span-2 min-h-[220px] rounded-2xl sm:min-h-[320px]"
                style={{ background: cover }}
              />
              <div
                className="min-h-[104px] rounded-xl sm:min-h-[154px] sm:rounded-2xl"
                style={{
                  background: `linear-gradient(135deg, rgba(14,165,233,0.85), rgba(59,130,246,0.75))`,
                }}
              />
              <div className="relative min-h-[104px] overflow-hidden rounded-xl sm:min-h-[154px] sm:rounded-2xl">
                <div
                  className="absolute inset-0"
                  style={{
                    background: `linear-gradient(135deg, rgba(244,63,94,0.5), rgba(99,102,241,0.6))`,
                  }}
                />
                <button
                  type="button"
                  className="absolute inset-0 flex items-center justify-center bg-black/25 px-2 text-center text-xs font-semibold text-white backdrop-blur-[2px] sm:text-sm"
                >
                  Voir toutes les photos
                </button>
              </div>
            </div>

            {activity.notes ? (
              <p className="max-w-3xl text-[15px] leading-relaxed text-slate-600">{activity.notes}</p>
            ) : null}
          </div>

          <aside className="lg:sticky lg:top-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.08)]">
              <p className="text-xs font-medium text-slate-500">À partir de</p>
              <p className="mt-1 text-3xl font-bold text-slate-900">
                {formatMoney(activity.price_adult, activity.currency || "EUR")}
              </p>

              <label className="mt-6 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Participants
                <div className="mt-2 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                  <span aria-hidden>👤</span>
                  <select
                    value={adults}
                    onChange={(e) => setAdults(Number(e.target.value))}
                    className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-slate-900 outline-none"
                  >
                    {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n}>
                        {n} adulte{n > 1 ? "s" : ""}
                      </option>
                    ))}
                  </select>
                </div>
              </label>

              <p className="mt-3 text-sm font-medium text-emerald-600">Gratuit pour les moins de 6 ans</p>

              <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Date souhaitée
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#34b3f7]"
                />
              </label>

              <div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-4">
                <span className="text-sm font-semibold text-slate-700">Total</span>
                <span className="text-xl font-bold text-slate-900">
                  {formatMoney(lineTotal, activity.currency || "EUR")}
                </span>
              </div>

              <button
                type="button"
                onClick={appendToCartAndReturn}
                className="mt-4 w-full rounded-xl bg-[#34b3f7] py-3.5 text-sm font-bold text-white shadow-sm transition hover:bg-[#34b3f7]/90 active:scale-[0.99]"
              >
                Ajouter au panier
              </button>
            </div>
          </aside>
        </div>
      </main>

      <a
        href="https://wa.me/33619921449?text=Bonjour%20Hurghada%20Dream%2C%20"
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-6 right-6 flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-2xl text-white shadow-lg transition hover:scale-105"
        aria-label="WhatsApp"
      >
        <span aria-hidden>💬</span>
      </a>
    </div>
  );
}
