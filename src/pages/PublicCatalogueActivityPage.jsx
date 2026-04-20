import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase, __SUPABASE_DEBUG__ } from "../lib/supabase";
import { CATEGORIES } from "../constants";
import { logger } from "../utils/logger";
import { loadPublicCatalogueCart, savePublicCatalogueCart } from "../utils/publicCatalogueCartStorage";
import { formatActivityAvailableDaysSummary } from "../utils/activityDaysDisplay";
import { buildSelectableDateOptions, normalizeAvailableDays } from "../utils/activityAvailableDates";
import { ActivityDateCalendar } from "../components/ActivityDateCalendar";
import { normalizeCatalogImageUrlsFromDb } from "../utils/catalogContent";
import { getActivityPublicProse, proseFromActivityNotes } from "../utils/activityHelpers";

/** Repli sans `catalog_image_urls` : inclut `description` dès que la colonne existe (script SQL activités). */
const ACTIVITY_COLUMNS_BASE =
  "id, name, category, price_adult, price_child, price_baby, age_child, age_baby, currency, available_days, notes, description";
/** Inclut aussi la galerie photos catalogue (migration `catalog_image_urls`). */
const ACTIVITY_COLUMNS_FULL = `${ACTIVITY_COLUMNS_BASE}, catalog_image_urls`;


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

/** Lignes commençant par - • ou * → points forts */
function extractBulletLines(notes) {
  if (!notes) return [];
  return String(notes)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^[-•*]\s+/.test(line))
    .map((line) => line.replace(/^[-•*]\s+/, "").trim())
    .filter(Boolean);
}

function buildLineTotal(activity, pax) {
  if (!activity) return 0;
  return (
    toNumber(pax.adults) * toNumber(activity.price_adult) +
    toNumber(pax.children) * toNumber(activity.price_child) +
    toNumber(pax.babies) * toNumber(activity.price_baby)
  );
}

function IconHeart({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M2 9.5a5.5 5.5 0 0110.591-3.676.56.56 0 00.818 0A5.49 5.49 0 0122 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 01-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5z" />
    </svg>
  );
}

function IconShare({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="M8.59 13.51l6.83 3.98m-.01-10.98l-6.82 3.98" />
    </svg>
  );
}

function IconMapPin({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 01-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 1116 0" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function IconUsers({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
    </svg>
  );
}

function IconChevronDown({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function IconImages({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="m22 11-1.296-1.296a2.4 2.4 0 00-3.408 0L11 16" />
      <path d="M4 8a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2" />
      <circle cx="13" cy="7" r="1" fill="currentColor" />
      <rect x="8" y="2" width="14" height="14" rx="2" />
    </svg>
  );
}

function ParticipantSelect({ Icon, label, value, onChange, min, max }) {
  const options = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-4 top-1/2 z-[1] -translate-y-1/2">
        <Icon className="h-5 w-5 text-gray-600" />
      </span>
      <IconChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
        className="w-full appearance-none rounded-xl border border-gray-300 bg-white py-3 pl-12 pr-10 text-sm font-medium text-gray-900 transition-colors hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
      >
        {options.map((n) => (
          <option key={n} value={n}>
            {n} {label}
            {n > 1 ? "s" : ""}
          </option>
        ))}
      </select>
    </div>
  );
}

function BookingCardShell({
  activity,
  adults,
  setAdults,
  children: childrenCount,
  setChildren,
  babies,
  setBabies,
  date,
  setDate,
  normalizedDays,
  lineTotal,
  canAdd,
  onAdd,
  dateError,
  daysSummary,
  noDatesConfigured,
}) {
  const currency = activity.currency || "EUR";
  const ageChild = String(activity.age_child || "").trim();
  const ageBaby = String(activity.age_baby || "").trim();
  const babyPriceZero = toNumber(activity.price_baby) === 0;

  return (
    <div className="space-y-3 md:space-y-4">
      <div className="border-b border-gray-200 pb-3 md:pb-4">
        <p className="mb-1 text-xs text-gray-600">À partir de (adulte)</p>
        <div className="flex items-baseline gap-2">
          <span className="text-xl font-bold text-gray-900 md:text-2xl">
            {formatMoney(activity.price_adult, currency)}
          </span>
        </div>
        <div className="mt-2 space-y-0.5 text-xs text-gray-600">
          <p>
            Enfant{ageChild ? ` (${ageChild})` : ""} : {formatMoney(activity.price_child, currency)}
          </p>
          <p>
            Bébé{ageBaby ? ` (${ageBaby})` : ""} :{" "}
            {babyPriceZero ? "gratuit ou selon grille applicable" : formatMoney(activity.price_baby, currency)}
          </p>
        </div>
      </div>

      <ParticipantSelect
        Icon={IconUsers}
        label="adulte"
        value={adults}
        onChange={setAdults}
        min={1}
        max={10}
      />
      <div>
        <ParticipantSelect
          Icon={IconUsers}
          label="enfant"
          value={childrenCount}
          onChange={setChildren}
          min={0}
          max={10}
        />
        {ageChild ? <p className="mt-1.5 text-xs text-gray-500">Tranche d&apos;âge : {ageChild}</p> : null}
      </div>
      <div>
        <ParticipantSelect
          Icon={IconUsers}
          label="bébé"
          value={babies}
          onChange={setBabies}
          min={0}
          max={10}
        />
        {ageBaby ? <p className="mt-1.5 text-xs text-gray-500">Tranche d&apos;âge : {ageBaby}</p> : null}
      </div>

      {babyPriceZero ? (
        <p className="text-xs text-green-700">Tarif bébé à 0 € — les bébés ne sont pas facturés sur ce tarif.</p>
      ) : null}

      {daysSummary ? <p className="text-xs text-gray-500">Jours ouverts : {daysSummary}</p> : null}

      <ActivityDateCalendar
        value={date}
        onChange={setDate}
        normalizedDays={normalizedDays}
        disabled={noDatesConfigured}
        maxDaysAhead={120}
      />
      {noDatesConfigured ? (
        <p className="text-sm text-amber-800">Aucun jour n&apos;est ouvert pour cette activité en ligne. Écrivez-nous sur WhatsApp pour réserver.</p>
      ) : null}

      <div className="border-t border-gray-200 pt-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-base font-medium text-gray-700">Total</span>
          <span className="text-xl font-bold text-gray-900">{formatMoney(lineTotal, currency)}</span>
        </div>
        <button
          type="button"
          disabled={!canAdd}
          onClick={onAdd}
          className="inline-flex w-full items-center justify-center rounded-xl bg-emerald-600 px-3 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-600/90 disabled:cursor-not-allowed disabled:opacity-75 md:py-3 md:text-base"
        >
          Ajouter au panier
        </button>
        {dateError ? (
          <p className="mt-2 text-center text-sm text-red-500">Veuillez sélectionner une date</p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * @param {{ activityId: string }} props
 */
export function PublicCatalogueActivityPage({ activityId }) {
  const navigate = useNavigate();
  const [activity, setActivity] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);

  const [adults, setAdults] = useState(1);
  const [childCount, setChildCount] = useState(0);
  const [babyCount, setBabyCount] = useState(0);
  const [date, setDate] = useState("");
  const [galleryIndex, setGalleryIndex] = useState(0);
  const carouselRef = useRef(null);

  const categoryKey = useMemo(
    () => (activity ? normalizeCategory(activity.category) : "desert"),
    [activity]
  );

  const normalizedAvailableDays = useMemo(
    () => (activity ? normalizeAvailableDays(activity.available_days) : [true, true, true, true, true, true, true]),
    [activity]
  );

  const dateOptions = useMemo(
    () => (activity ? buildSelectableDateOptions(normalizedAvailableDays) : []),
    [activity, normalizedAvailableDays]
  );

  const daysSummary = useMemo(() => (activity ? formatActivityAvailableDaysSummary(activity) : ""), [activity]);

  const noDatesConfigured = Boolean(activity) && dateOptions.length === 0;

  const lineTotal = useMemo(
    () => buildLineTotal(activity, { adults, children: childCount, babies: babyCount }),
    [activity, adults, childCount, babyCount]
  );

  const cover = getCategoryCover(categoryKey);
  const label = getCategoryLabel(categoryKey);
  const galleryBackgrounds = useMemo(
    () => [
      cover,
      "linear-gradient(135deg, rgba(14,165,233,0.88), rgba(59,130,246,0.78))",
      "linear-gradient(135deg, rgba(244,63,94,0.45), rgba(99,102,241,0.6))",
      "linear-gradient(135deg, rgba(16,185,129,0.7), rgba(5,150,105,0.55))",
    ],
    [cover]
  );

  const catalogUrls = useMemo(
    () => (activity ? normalizeCatalogImageUrlsFromDb(activity.catalog_image_urls) : []),
    [activity]
  );

  const gallerySlides = useMemo(() => {
    if (catalogUrls.length > 0) {
      return catalogUrls.map((url) => ({ kind: "image", url }));
    }
    return galleryBackgrounds.map((bg) => ({ kind: "gradient", bg }));
  }, [catalogUrls, galleryBackgrounds]);

  /**
   * Texte public : champ `description` (modal intranet) ou, sinon, extrait des `notes` (formulaire Activités).
   */
  const publicProseFull = useMemo(
    () => (activity ? getActivityPublicProse(activity) : ""),
    [activity]
  );

  /**
   * Sous la galerie : si la modal « Description » remplit `description`, on n’affiche ici que le complément issu des notes
   * pour éviter le doublon avec « Informations » ; sinon ce bloc reste vide (tout est dans Informations).
   */
  const catalogProse = useMemo(() => {
    if (!activity) return "";
    const desc = String(activity.description || "").trim();
    if (desc) {
      return proseFromActivityNotes(activity.notes || "");
    }
    return "";
  }, [activity]);

  const bulletPoints = activity ? extractBulletLines(activity.notes) : [];

  const DEFAULT_INFOS =
    "Les détails pratiques (horaires, lieu de prise en charge, etc.) sont confirmés lors de votre demande de devis.";

  const informationsBody = publicProseFull || DEFAULT_INFOS;

  const canAddToCart = Boolean(date) && !noDatesConfigured;
  const showDateHint = !date && !noDatesConfigured;

  const prevActivityIdRef = useRef(null);
  useEffect(() => {
    if (prevActivityIdRef.current !== null && prevActivityIdRef.current !== activityId) {
      setDate("");
      setAdults(1);
      setChildCount(0);
      setBabyCount(0);
    }
    prevActivityIdRef.current = activityId;
  }, [activityId]);

  useEffect(() => {
    if (dateOptions.length === 0) {
      if (date) setDate("");
      return;
    }
    if (date && !dateOptions.some((o) => o.value === date)) setDate("");
  }, [date, dateOptions]);

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
        let { data, error } = await supabase
          .from("activities")
          .select(ACTIVITY_COLUMNS_FULL)
          .eq("id", activityId)
          .maybeSingle();

        if (cancelled) return;

        if (error?.code === "PGRST116") {
          setLoadError("Cette activité n'existe pas ou n'est plus disponible.");
          setActivity(null);
          return;
        }

        if (error || !data) {
          logger.warn(
            "PublicCatalogueActivityPage : select complet indisponible ou échoué, nouvel essai sans description/catalog_image_urls",
            error
          );
          const retry = await supabase.from("activities").select(ACTIVITY_COLUMNS_BASE).eq("id", activityId).maybeSingle();
          if (cancelled) return;
          data = retry.data;
          error = retry.error;
        }

        if (error?.code === "PGRST116") {
          setLoadError("Cette activité n'existe pas ou n'est plus disponible.");
          setActivity(null);
          return;
        }

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

  const scrollToBooking = useCallback(() => {
    document.getElementById("disponibilites")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const onCarouselScroll = useCallback(() => {
    const el = carouselRef.current;
    if (!el) return;
    const w = el.offsetWidth;
    if (w <= 0) return;
    const i = Math.round(el.scrollLeft / w);
    setGalleryIndex(Math.min(Math.max(i, 0), gallerySlides.length - 1));
  }, [gallerySlides.length]);

  function appendToCartAndReturn() {
    if (!activity || !date) return;
    const prev = loadPublicCatalogueCart();
    const line = {
      id: `${activity.id}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      activityId: String(activity.id),
      date,
      adults: Math.max(0, toNumber(adults)),
      children: Math.max(0, toNumber(childCount)),
      babies: Math.max(0, toNumber(babyCount)),
    };
    savePublicCatalogueCart([...prev, line]);
    navigate("/catalogue");
  }

  async function sharePage() {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: activity?.name || "Hurghada Dream", url });
      } else {
        await navigator.clipboard.writeText(url);
      }
    } catch {
      /* ignore */
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="mx-auto max-w-7xl px-4 py-16 text-center text-gray-600">Chargement…</div>
      </div>
    );
  }

  if (loadError || !activity) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="mx-auto max-w-7xl px-4 py-16 text-center">
          <p className="text-gray-800">{loadError || "Activité introuvable."}</p>
          <Link to="/catalogue" className="mt-4 inline-block font-semibold text-emerald-600 hover:underline">
            ← Retour au catalogue
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="relative isolate flex min-h-screen flex-col bg-gray-50 font-sans text-gray-900">
      <header className="sticky top-0 z-[100] border-b border-gray-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3 sm:px-6">
          <Link to="/catalogue" className="text-sm font-semibold text-emerald-700 hover:underline">
            ← Catalogue
          </Link>
          <div className="h-8 w-px bg-gray-200" aria-hidden />
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-slate-950 p-1">
              <img src="/logo.png" alt="" className="h-full w-full object-contain" />
            </div>
            <span className="text-sm font-semibold text-gray-800">Hurghada Dream</span>
          </div>
        </div>
      </header>

      <main className="relative flex-grow pt-6 md:pt-8">
        {/* ——— Galerie mobile ——— */}
        <div className="px-4 md:hidden">
          <div className="relative aspect-[4/3] w-full overflow-hidden rounded-[22px]">
            <div ref={carouselRef} onScroll={onCarouselScroll} className="scrollbar-hide flex h-full snap-x snap-mandatory gap-0 overflow-x-auto">
              {gallerySlides.map((slide, i) => (
                <div key={i} className="relative h-full min-w-full shrink-0 snap-start overflow-hidden">
                  {slide.kind === "image" ? (
                    <img src={slide.url} alt="" className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <div className="h-full w-full" style={{ background: slide.bg }} />
                  )}
                </div>
              ))}
            </div>
            <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-black/50 px-2.5 py-1.5 backdrop-blur-sm">
              {gallerySlides.map((_, i) => (
                <div
                  key={i}
                  className={`h-1.5 rounded-full transition-all ${i === galleryIndex ? "w-4 bg-white" : "w-1.5 bg-white/50"}`}
                />
              ))}
            </div>
            <div className="absolute right-3 top-1/2 flex -translate-y-1/2 flex-col gap-2">
              <button
                type="button"
                className="flex h-10 w-10 items-center justify-center rounded-full bg-white/90 shadow-lg backdrop-blur-sm transition active:scale-95"
                aria-label="Ajouter aux favoris"
              >
                <IconHeart className="h-5 w-5 text-gray-700" />
              </button>
              <button
                type="button"
                onClick={() => void sharePage()}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-white/90 shadow-lg backdrop-blur-sm transition active:scale-95"
                aria-label="Partager"
              >
                <IconShare className="h-5 w-5 text-gray-700" />
              </button>
            </div>
          </div>
        </div>

        <div className="px-4 pt-4 md:hidden">
          <h1 className="mb-2 text-2xl font-bold text-gray-900">{activity.name}</h1>
        </div>

        {/* ——— Fil + titre desktop ——— */}
        <div className="mx-auto hidden max-w-7xl px-4 pt-3 sm:px-6 md:block lg:px-8">
          <nav className="mb-3">
            <ol className="flex items-center gap-1.5 text-xs text-gray-500">
              <li>
                <Link to="/catalogue" className="transition-colors hover:text-emerald-600">
                  Catalogue
                </Link>
              </li>
              <li aria-hidden>/</li>
              <li>
                <span className="text-gray-700">{label}</span>
              </li>
            </ol>
          </nav>
          <h1 className="mb-3 text-2xl font-bold text-gray-900 md:text-4xl">{activity.name}</h1>
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <div className="flex items-center gap-1.5 text-gray-600">
              <IconMapPin className="h-4 w-4" />
              <span>{activity.name}</span>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="flex items-center gap-2 rounded-xl px-6 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 hover:text-emerald-600"
              >
                <IconHeart className="h-5 w-5" />
                Ajouter aux favoris
              </button>
              <button
                type="button"
                onClick={() => void sharePage()}
                className="flex items-center gap-2 rounded-xl px-6 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 hover:text-emerald-600"
              >
                <IconShare className="h-5 w-5" />
                Partager
              </button>
            </div>
          </div>
        </div>

        <div className="mx-auto max-w-7xl px-4 py-4 pb-24 sm:px-6 md:pb-12 lg:px-8 lg:pb-16">
          <div className="grid gap-6 lg:grid-cols-3 lg:items-start">
            {/* ——— Colonne contenu ——— */}
            <div className="space-y-6 lg:col-span-2">
              {/* Galerie desktop (grille WFY) */}
              <div className="hidden max-h-[400px] overflow-hidden rounded-none md:block lg:max-h-[450px]">
                <div className="grid h-full min-h-[280px] grid-cols-3 gap-2 lg:min-h-[360px]">
                  <div className="relative col-span-2 row-span-2 overflow-hidden rounded-l-3xl">
                    {catalogUrls[0] ? (
                      <img
                        src={catalogUrls[0]}
                        alt=""
                        className="h-full w-full object-cover transition-opacity hover:opacity-95"
                        loading="lazy"
                      />
                    ) : (
                      <div className="h-full w-full" style={{ background: galleryBackgrounds[0] }} />
                    )}
                  </div>
                  <div className="relative col-span-1 overflow-hidden rounded-tr-3xl">
                    {catalogUrls[1] ? (
                      <img
                        src={catalogUrls[1]}
                        alt=""
                        className="h-full min-h-[140px] w-full object-cover transition-opacity hover:opacity-95"
                        loading="lazy"
                      />
                    ) : (
                      <div className="h-full min-h-[140px] w-full" style={{ background: galleryBackgrounds[1] }} />
                    )}
                  </div>
                  <div className="relative col-span-1 overflow-hidden rounded-br-3xl">
                    {catalogUrls[2] ? (
                      <img
                        src={catalogUrls[2]}
                        alt=""
                        className="h-full min-h-[140px] w-full object-cover transition-opacity hover:opacity-95"
                        loading="lazy"
                      />
                    ) : (
                      <div className="h-full min-h-[140px] w-full" style={{ background: galleryBackgrounds[2] }} />
                    )}
                    {catalogUrls.length > 3 ? (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                        <span className="flex items-center gap-2 text-base font-semibold text-white">
                          <IconImages className="h-5 w-5" />
                          +{catalogUrls.length - 3} photo{catalogUrls.length - 3 > 1 ? "s" : ""}
                        </span>
                      </div>
                    ) : catalogUrls.length === 0 ? (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                        <span className="flex items-center gap-2 text-base font-semibold text-white">
                          <IconImages className="h-5 w-5" />
                          Voir toutes les photos
                        </span>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>

              {catalogProse ? (
                <section>
                  <p className="whitespace-pre-line text-sm font-medium leading-relaxed text-gray-800 sm:text-base">{catalogProse}</p>
                </section>
              ) : null}

              {bulletPoints.length > 0 ? (
                <section className="grid gap-3 xl:grid-cols-[200px_1fr] xl:gap-0">
                  <h2 className="text-base font-bold text-gray-900 md:text-lg">Points forts</h2>
                  <ul className="list-inside list-disc space-y-2">
                    {bulletPoints.map((item) => (
                      <li key={item} className="text-sm font-semibold text-gray-700 md:text-base">
                        {item}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              <div className="border-t border-gray-200" role="separator" />

              <section className="grid gap-3 xl:grid-cols-[200px_1fr] xl:gap-0">
                <h2 className="text-base font-bold text-gray-900 md:text-lg">Informations</h2>
                <p className="whitespace-pre-line text-sm leading-relaxed text-gray-600">
                  {informationsBody}
                </p>
              </section>
            </div>

            {/* ——— Sidebar réservation desktop ——— */}
            <div className="hidden lg:col-span-1 lg:block">
              <div className="lg:sticky lg:top-24 lg:rounded-[22px] lg:border lg:border-gray-200 lg:bg-white lg:p-6 lg:shadow-[0_4px_20px_rgb(0,0,0,0.08)] lg:transition-shadow lg:duration-300 lg:hover:shadow-[0_12px_40px_rgb(0,0,0,0.12)]">
                <BookingCardShell
                  activity={activity}
                  adults={adults}
                  setAdults={setAdults}
                  children={childCount}
                  setChildren={setChildCount}
                  babies={babyCount}
                  setBabies={setBabyCount}
                  date={date}
                  setDate={setDate}
                  normalizedDays={normalizedAvailableDays}
                  lineTotal={lineTotal}
                  canAdd={canAddToCart}
                  onAdd={appendToCartAndReturn}
                  dateError={showDateHint}
                  daysSummary={daysSummary}
                  noDatesConfigured={noDatesConfigured}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Encart mobile « disponibilités » */}
        <div id="disponibilites" className="mx-auto w-full max-w-7xl px-4 pb-28 sm:px-6 lg:hidden lg:px-8">
          <div className="rounded-[22px] border border-gray-200 bg-white p-4 shadow-[0_4px_20px_rgb(0,0,0,0.08)]">
            <h2 className="mb-3 text-lg font-bold text-gray-900">Vérifier les disponibilités</h2>
            <BookingCardShell
              activity={activity}
              adults={adults}
              setAdults={setAdults}
              children={childCount}
              setChildren={setChildCount}
              babies={babyCount}
              setBabies={setBabyCount}
              date={date}
              setDate={setDate}
              normalizedDays={normalizedAvailableDays}
              lineTotal={lineTotal}
              canAdd={canAddToCart}
              onAdd={appendToCartAndReturn}
              dateError={showDateHint}
              daysSummary={daysSummary}
              noDatesConfigured={noDatesConfigured}
            />
          </div>
        </div>

        {/* Barre bas mobile */}
        <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-gray-200 bg-white px-4 py-3 shadow-[0_-4px_20px_rgba(0,0,0,0.1)] lg:hidden">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
            <div>
              <p className="text-xs text-gray-500">À partir de</p>
              <p className="text-lg font-bold text-gray-900">{formatMoney(activity.price_adult, activity.currency || "EUR")}</p>
            </div>
            <button
              type="button"
              onClick={scrollToBooking}
              className="whitespace-nowrap rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-600/90"
            >
              Vérifier les disponibilités
            </button>
          </div>
        </div>
      </main>

      <a
        href="https://wa.me/33619921449?text=Bonjour%20Hurghada%20Dream%2C%20"
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-24 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-green-500 to-green-600 text-white shadow-lg transition hover:scale-105 active:scale-95 lg:bottom-6"
        aria-label="WhatsApp"
      >
        <svg className="h-7 w-7" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
        </svg>
      </a>
    </div>
  );
}
