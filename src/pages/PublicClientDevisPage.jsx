import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Headset,
  Info,
  RotateCcw,
  Search,
  ShieldCheck,
  ShoppingBag,
  Trash2,
  X,
} from "lucide-react";
import { GuestHeaderButton, PublicAppShell } from "../components/public/PublicAppShell";
import { HdLoader } from "../components/public/GuestPageLoader";
import { Sheet, SheetFooter, SheetHeader, StateCard, WhatsAppGlyph } from "../components/public/PublicUI";
import {
  CatalogueActivityCard,
  CatalogueActivityCardSkeleton,
  CategoryIcon,
} from "../components/public/CatalogueActivityCard";
import { displayActivityName, getPublicCategoryLabel, formatMoney as formatPublicMoney } from "../components/public/catalogueDisplay";
import { PUBLIC_HOME_PATH } from "../config/clientApp";
import { supabase, __SUPABASE_DEBUG__ } from "../lib/supabase";
import { CATEGORIES, SITE_KEY } from "../constants";
import { logger } from "../utils/logger";
import { formatPhoneWithPlus } from "../utils";
import { loadPublicCatalogueCart, savePublicCatalogueCart } from "../utils/publicCatalogueCartStorage";
import {
  CATALOGUE_STAY_SAME_DAY_MESSAGE,
  formatCatalogueStaySummary,
  getMinDepartureDate,
  isSameDayCatalogueStay,
  isValidCatalogueStay,
  loadPublicCatalogueStay,
  PUBLIC_CATALOGUE_STAY_EVENT,
  savePublicCatalogueStay,
} from "../utils/publicCatalogueStayStorage";
import { CatalogueStayGateModal } from "../components/public/CatalogueStayGateModal";
import {
  deriveCatalogueLineMinors,
  formatActivityMinorCategoryLabel,
  formatCatalogueMinorsAgesNote,
} from "../utils/activityAgePolicy";
import { computePublicCatalogLineTotal, getPublicCatalogListFromPrice } from "../utils/publicCatalogPricing";
import { formatDivingVisitorLabel } from "../utils/divingSafety.js";
import { normalizeCatalogImageUrlsFromDb } from "../utils/catalogContent";
import {
  requiresMinimumTwoParticipants,
  hasEnoughParticipantsForActivity,
  exceedsSpeedBoatMaxParticipants,
  getSpeedBoatMaxParticipantsMessage,
  getMammaMiaSelfTransferActivityNames,
  withMammaMiaSelfTransferNote,
  getActivityPublicProse,
  isCalecheActivity,
  requiredCalecheCount,
  calecheCapacityNotice,
  isTurtleActivity,
  persistTurtleFinSizes,
  hasAllTurtleFinSizes,
  getTurtleFinSizesMissingMessage,
  formatTurtleFinSizesLabel,
} from "../utils/activityHelpers";
import { TurtleFinSizesFields } from "../components/quotes/TurtleFinSizesFields";
import {
  createEmptyAirbnb,
  pickAirbnbFields,
  buildAirbnbDbFields,
  isMissingAirbnbColumnError,
  stripAirbnbColumns,
} from "../utils/clientAirbnb.js";
import { isLikelyGoogleMapsUrl } from "../utils/googleMapsUrl.js";

/** `*` : toutes les colonnes présentes en base (évite erreur si `babies_forbidden` n’est pas encore migrée). */
const ACTIVITY_COLUMNS = "*";

const LAST_PUBLIC_CATEGORY_KEY = "marsa_alam";

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoney(value, currency = "EUR") {
  return formatPublicMoney(toNumber(value), currency);
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

const HERO_IMAGE = "/client/home-tile-excursions.jpg";
const AGENCY_WHATSAPP_URL = "https://wa.me/201062002850?text=Bonjour%20Hurghada%20Dream%2C%20";

function getCategoryPublicNotice(categoryKey) {
  if (categoryKey === "marsa_alam") {
    return "Si vous ne logez pas à Marsa Alam, des frais de transfert d’environ 100 € peuvent s’ajouter.";
  }
  return "";
}

const REASSURANCES = [
  { Icon: ShieldCheck, title: "Devis gratuit", text: "Sans engagement ni paiement en ligne." },
  { Icon: CalendarDays, title: "Selon vos dates", text: "Le calendrier ne propose que les jours disponibles pendant votre séjour." },
  { Icon: Headset, title: "Équipe française 7j/7", text: "Nous confirmons chaque détail avec vous sur WhatsApp." },
];

/** Pied de page du catalogue : réassurance, contact direct, liens de l’appli client. */
function CatalogueFooter() {
  return (
    <footer className="mx-auto w-full max-w-7xl px-4 pb-32 pt-6 sm:px-6 lg:px-8">
      <ul data-reveal="item" className="grid gap-3 sm:grid-cols-3">
        {REASSURANCES.map(({ Icon, title, text }) => (
          <li key={title} className="flex items-start gap-3.5 rounded-[1.25rem] bg-white p-5 ring-1 ring-catalog-line">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-catalog-lagoonSoft text-catalog-lagoon">
              <Icon className="h-5 w-5" strokeWidth={1.5} aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-catalog-ink">{title}</span>
              <span className="mt-0.5 block text-sm leading-relaxed text-catalog-muted">{text}</span>
            </span>
          </li>
        ))}
      </ul>

      <section
        data-reveal="item"
        className="relative mt-4 overflow-hidden rounded-[1.5rem] bg-catalog-abyss px-6 py-8 text-white sm:px-10 sm:py-10"
        aria-labelledby="catalogue-help-title"
      >
        <div aria-hidden className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-[radial-gradient(circle,rgba(227,174,85,0.4)_0%,rgba(227,174,85,0)_70%)]" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-xl">
            <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.22em] text-catalog-sand">Conciergerie</p>
            <h2 id="catalogue-help-title" className="mt-2 font-catalog-display text-[1.75rem] leading-snug !text-white sm:text-[2rem]">
              Une question avant de choisir&nbsp;? <span className="hdc-serif text-catalog-sand">Parlons-en.</span>
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-white/75 sm:text-[0.9375rem]">
              Niveau de difficulté, âge des enfants, prise en charge à l’hôtel : notre équipe vous conseille.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row lg:shrink-0">
            <a href={AGENCY_WHATSAPP_URL} target="_blank" rel="noopener noreferrer" data-press className="hdc-btn hdc-btn-ghost">
              <WhatsAppGlyph className="h-5 w-5 text-[#1F8F55]" />
              Écrire sur WhatsApp
            </a>
            <Link to="/contacts" data-press className="hdc-btn border border-white/30 text-white hover:bg-white/10">
              Nos contacts
            </Link>
          </div>
        </div>
      </section>

      <div className="mt-10 flex flex-col items-center gap-4 border-t border-catalog-line pt-8 sm:flex-row sm:justify-between">
        <img src="/client/logo-wordmark.png" alt="Hurghada Dream" className="h-5 w-auto object-contain" loading="lazy" />
        <nav aria-label="Liens du catalogue" className="flex flex-wrap justify-center gap-1 text-sm font-medium text-catalog-muted">
          <Link to={PUBLIC_HOME_PATH} className="inline-flex min-h-11 items-center rounded-full px-3 hover:text-catalog-ink">
            Accueil
          </Link>
          <Link to="/hotels" className="inline-flex min-h-11 items-center rounded-full px-3 hover:text-catalog-ink">
            Hôtels
          </Link>
          <Link to="/sejour" className="inline-flex min-h-11 items-center rounded-full px-3 hover:text-catalog-ink">
            Mon séjour
          </Link>
          <Link to="/contacts" className="inline-flex min-h-11 items-center rounded-full px-3 hover:text-catalog-ink">
            Contacts
          </Link>
        </nav>
      </div>
    </footer>
  );
}

export function PublicClientDevisPage() {
  const [activities, setActivities] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [client, setClient] = useState(() => {
    const s = loadPublicCatalogueStay();
    return {
      name: "",
      phone: "",
      email: "",
      hotel: "",
      ...createEmptyAirbnb(),
      arrivalDate: s.arrivalDate || "",
      departureDate: s.departureDate || "",
      notes: "",
    };
  });

  const [cart, setCart] = useState(() => loadPublicCatalogueCart());
  const [stay, setStay] = useState(() => loadPublicCatalogueStay());
  const [stayModalOpen, setStayModalOpen] = useState(() => !isValidCatalogueStay(loadPublicCatalogueStay()));
  const [stayModalAllowDismiss, setStayModalAllowDismiss] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [cartDrawerOpen, setCartDrawerOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [successModalOpen, setSuccessModalOpen] = useState(false);
  const resultsRef = useRef(null);

  const publicDisplayCategories = useMemo(() => {
    const categories = [...CATEGORIES];
    categories.sort((a, b) => {
      if (a.key === LAST_PUBLIC_CATEGORY_KEY) return 1;
      if (b.key === LAST_PUBLIC_CATEGORY_KEY) return -1;
      return 0;
    });
    return categories;
  }, []);

  const publicActivities = useMemo(
    () => (activities || []).filter((activity) => activity?.catalog_paused !== true),
    [activities]
  );

  const activityMap = useMemo(() => {
    const map = new Map();
    activities.forEach((activity) => {
      map.set(String(activity.id), activity);
    });
    return map;
  }, [activities]);

  const filteredActivities = useMemo(() => {
    const q = search.trim().toLowerCase();
    const byCategory =
      selectedCategory === "all"
        ? publicActivities
        : publicActivities.filter((activity) => normalizeCategory(activity.category) === selectedCategory);

    if (!q) return byCategory;
    return byCategory.filter((activity) => {
      const name = String(activity.name || "").toLowerCase();
      const notes = String(activity.notes || "").toLowerCase();
      const description = String(activity.description || "").toLowerCase();
      return name.includes(q) || notes.includes(q) || description.includes(q);
    });
  }, [publicActivities, search, selectedCategory]);

  const groupedActivities = useMemo(() => {
    const grouped = {};
    publicDisplayCategories.forEach((category) => {
      grouped[category.key] = [];
    });

    filteredActivities.forEach((activity) => {
      const key = normalizeCategory(activity.category);
      grouped[key].push(activity);
    });

    return publicDisplayCategories
      .map((category) => ({
        ...category,
        items: grouped[category.key],
      }))
      .filter((category) => category.items.length > 0);
  }, [filteredActivities, publicDisplayCategories]);

  const categoryCounts = useMemo(() => {
    const counts = { all: publicActivities.length };
    publicDisplayCategories.forEach((category) => {
      counts[category.key] = publicActivities.filter(
        (activity) => normalizeCategory(activity.category) === category.key
      ).length;
    });
    return counts;
  }, [publicActivities, publicDisplayCategories]);

  const cartLines = useMemo(() => {
    return cart
      .map((line) => {
        const activity = activityMap.get(String(line.activityId));
        if (!activity) return null;
        const refDate = String(line.date || stay.arrivalDate || "").trim();
        const derived = deriveCatalogueLineMinors(line, activity, refDate);
        const adultsBase = Math.max(0, toNumber(line.adults));
        const forPrice =
          derived.complete || derived.minorsCount === 0
            ? {
                ...line,
                children: derived.childrenCount,
                babies: derived.babiesCount,
                adults: adultsBase + derived.upgradedAdultsCount,
              }
            : {
                ...line,
                children: derived.minorsCount,
                babies: 0,
                adults: adultsBase,
              };
        const storedCaleches = toNumber(line.calecheCount);
        const neededCaleches = isCalecheActivity(activity.name)
          ? requiredCalecheCount(forPrice.adults, toNumber(forPrice.children) + toNumber(forPrice.babies))
          : storedCaleches;
        const calecheCount = Math.max(storedCaleches, neededCaleches);
        const pricedLine = calecheCount === storedCaleches ? forPrice : { ...forPrice, calecheCount };
        const lineTotal = computePublicCatalogLineTotal(activity, pricedLine);
        return {
          ...line,
          calecheCount,
          calecheRaised: neededCaleches > storedCaleches,
          minorsCount: derived.minorsCount,
          birthDates: derived.birthDates,
          children: derived.childrenCount,
          babies: derived.babiesCount,
          activity,
          lineTotal,
          derived,
          adultsBase,
        };
      })
      .filter(Boolean);
  }, [cart, activityMap, stay.arrivalDate]);

  const cartNeedsMinorBirthDates = useMemo(
    () => cartLines.some((line) => (line.derived?.minorsCount || 0) > 0),
    [cartLines]
  );

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

      // Filet de sécurité : lecture sans filtre (surensemble de toutes les
      // valeurs de site_key). L'ancienne requête `site_key = <URL Supabase>` a
      // été retirée : `SITE_KEY` ne peut plus valoir une URL (normalizeSiteKey),
      // et cette lecture sans filtre couvre déjà ces lignes historiques.
      // Une requête réseau de moins à chaque ouverture du catalogue.
      const checks = [
        supabase.from("activities").select(ACTIVITY_COLUMNS).order("name", { ascending: true }),
      ];

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
    function onStayEvent(e) {
      const next = e?.detail || loadPublicCatalogueStay();
      setStay(next);
      setClient((c) => ({
        ...c,
        arrivalDate: next.arrivalDate || c.arrivalDate,
        departureDate: next.departureDate || c.departureDate,
      }));
    }
    window.addEventListener(PUBLIC_CATALOGUE_STAY_EVENT, onStayEvent);
    return () => window.removeEventListener(PUBLIC_CATALOGUE_STAY_EVENT, onStayEvent);
  }, []);

  useEffect(() => {
    if (cartDrawerOpen || checkoutOpen || successModalOpen || stayModalOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [cartDrawerOpen, checkoutOpen, successModalOpen, stayModalOpen]);

  useEffect(() => {
    if (!cartDrawerOpen && !checkoutOpen && !successModalOpen) return undefined;
    function onKey(e) {
      if (e.key === "Escape") {
        if (stayModalOpen && !stayModalAllowDismiss) return;
        setCheckoutOpen(false);
        setCartDrawerOpen(false);
        setSuccessModalOpen(false);
        if (stayModalAllowDismiss) setStayModalOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cartDrawerOpen, checkoutOpen, successModalOpen, stayModalOpen, stayModalAllowDismiss]);

  function handleStaySaved(next) {
    setStay(next);
    setClient((c) => ({
      ...c,
      arrivalDate: next.arrivalDate,
      departureDate: next.departureDate,
    }));
    setStayModalOpen(false);
    setStayModalAllowDismiss(false);
  }

  function openStayEditor() {
    setStayModalAllowDismiss(isValidCatalogueStay(stay));
    setStayModalOpen(true);
  }

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

  function updateLineBirthDate(lineId, index, value) {
    setCart((prev) =>
      prev.map((line) => {
        if (line.id !== lineId) return line;
        const minors =
          Number.isFinite(Number(line.minorsCount)) && Number(line.minorsCount) >= 0
            ? Number(line.minorsCount)
            : Math.max(0, toNumber(line.children)) + Math.max(0, toNumber(line.babies));
        const birthDates = Array.isArray(line.birthDates) ? [...line.birthDates] : [];
        while (birthDates.length < minors) birthDates.push("");
        birthDates[index] = value;
        birthDates.length = minors;
        return {
          ...line,
          minorsCount: minors,
          birthDates,
        };
      })
    );
  }

  function updateLineFinSizes(lineId, next) {
    setCart((prev) =>
      prev.map((line) =>
        line.id === lineId ? { ...line, finSizes: Array.isArray(next) ? next : [] } : line
      )
    );
  }

  function updateClientField(field, value) {
    setClient((prev) => ({ ...prev, [field]: value }));
  }

  async function submitPublicQuote(event) {
    event?.preventDefault();
    setError("");
    setSuccess("");

    const name = client.name.trim();
    const phone = formatPhoneWithPlus(client.phone);
    const email = client.email.trim();
    const hotel = client.hotel.trim();
    const arrival = client.arrivalDate?.trim() || "";
    const departure = client.departureDate?.trim() || "";
    const notes = withMammaMiaSelfTransferNote(
      client.notes.trim(),
      getMammaMiaSelfTransferActivityNames(
        cartLines.map((line) => line.activity?.name || line.activityName || "")
      )
    );

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
    if (!client.isAirbnb && !hotel) {
      setError("L’hôtel ou le lieu de prise en charge est obligatoire.");
      return;
    }
    if (client.isAirbnb) {
      const mapsUrl = String(client.airbnbMapsUrl || "").trim();
      if (!mapsUrl) {
        setError("Airbnb : collez le lien Google Maps du logement.");
        return;
      }
      if (!isLikelyGoogleMapsUrl(mapsUrl)) {
        setError("Airbnb : le lien doit être une URL Google Maps.");
        return;
      }
    }
    if (!arrival) {
      setError("La date d’arrivée est obligatoire.");
      return;
    }
    if (!departure) {
      setError("La date de fin de séjour (départ) est obligatoire.");
      return;
    }
    if (arrival === departure) {
      setError(CATALOGUE_STAY_SAME_DAY_MESSAGE);
      return;
    }
    if (arrival > departure) {
      setError("La date de départ doit être après la date d’arrivée.");
      return;
    }

    if (cartLines.length === 0) {
      setError("Ajoute au moins une activité au panier.");
      return;
    }

    const belowMinTwo = cartLines.filter((line) => {
      const name = line.activity?.name || line.activityName || "";
      if (!requiresMinimumTwoParticipants(name)) return false;
      const childrenForMin = line.derived?.complete
        ? line.derived.childrenCount
        : line.derived?.minorsCount || 0;
      return !hasEnoughParticipantsForActivity(name, {
        adults: line.adultsBase ?? line.adults,
        children: childrenForMin,
      });
    });
    if (belowMinTwo.length > 0) {
      const names = belowMinTwo
        .map((line) => line.activity?.name || line.activityName || "activité")
        .join(", ");
      setError(
        `${names} : minimum 2 personnes (adultes + enfants) pour réserver. Retire la ligne et recommence depuis la fiche activité.`,
      );
      return;
    }

    const speedBoatOverMax = cartLines.filter((line) => {
      const name = line.activity?.name || line.activityName || "";
      const childrenCount = line.derived?.complete
        ? line.derived.childrenCount
        : line.derived?.minorsCount || 0;
      const babiesCount = line.derived?.complete ? line.derived.babiesCount : 0;
      return exceedsSpeedBoatMaxParticipants(name, {
        adults: line.adultsBase ?? line.adults,
        children: childrenCount,
        babies: babiesCount,
      });
    });
    if (speedBoatOverMax.length > 0) {
      setError(getSpeedBoatMaxParticipantsMessage());
      return;
    }

    const turtleMissingSizes = cartLines.filter((line) => {
      const name = line.activity?.name || line.activityName || "";
      const childrenCount = line.derived?.complete
        ? line.derived.childrenCount
        : line.derived?.minorsCount || 0;
      const babiesCount = line.derived?.complete ? line.derived.babiesCount : 0;
      return !hasAllTurtleFinSizes(name, {
        adults: (line.adultsBase ?? line.adults) + toNumber(line.derived?.upgradedAdultsCount),
        children: childrenCount,
        babies: babiesCount,
      }, line.finSizes);
    });
    if (turtleMissingSizes.length > 0) {
      setError(getTurtleFinSizesMissingMessage());
      return;
    }

    const incompleteAges = cartLines.filter(
      (line) => (line.derived?.minorsCount || 0) > 0 && (line.derived?.missingCount || 0) > 0
    );
    if (incompleteAges.length > 0) {
      setError("Indiquez la date de naissance de chaque enfant / bébé pour finaliser le devis.");
      return;
    }

    const forbiddenBabies = cartLines.filter((line) => (line.derived?.forbiddenCount || 0) > 0);
    if (forbiddenBabies.length > 0) {
      const names = forbiddenBabies
        .map((line) => line.activity?.name || "activité")
        .join(", ");
      setError(
        `${names} : au moins un voyageur est trop jeune (bébé non autorisé ou hors grille). Modifiez les dates de naissance ou retirez la ligne.`
      );
      return;
    }

    if (!supabase || !__SUPABASE_DEBUG__.isConfigured) {
      setError("Base indisponible. Réessaie dans quelques minutes.");
      return;
    }

    const agesNote = formatCatalogueMinorsAgesNote(
      cartLines.map((line) => ({ line, activity: line.activity, derived: line.derived }))
    );
    const notesWithAges = [notes, agesNote ? `Âges auto : ${agesNote}` : ""]
      .filter(Boolean)
      .join("\n");

    const createdAt = new Date().toISOString();
    const items = cartLines.map((line) => {
      const act = line.activity;
      const babiesForbidden = Boolean(act?.babies_forbidden ?? act?.babiesForbidden);
      const adultsBase = Math.max(0, toNumber(line.adultsBase ?? line.adults));
      const babiesVal = babiesForbidden ? 0 : toNumber(line.derived?.babiesCount ?? line.babies);
      return {
        activityId: String(act.id),
        activityName: act.name || "",
        date: line.date || "",
        adults: adultsBase + toNumber(line.derived?.upgradedAdultsCount),
        children: toNumber(line.derived?.childrenCount ?? line.children),
        babies: babiesVal,
        birthDates: Array.isArray(line.birthDates) ? [...line.birthDates] : [],
        minorsCount: toNumber(line.derived?.minorsCount ?? line.minorsCount),
        lineTotal: toNumber(line.lineTotal),
        // Options catalogue (fiche activité / panier) — nécessaire pour « Commencer le devis » côté intranet
        extraDolphin: Boolean(line.extraDolphin),
        divingVisitor: toNumber(line.divingVisitorCount) > 0 || Boolean(line.divingVisitor),
        divingVisitorCount: toNumber(line.divingVisitorCount),
        finSizes: persistTurtleFinSizes(
          act.name || "",
          {
            adults: adultsBase + toNumber(line.derived?.upgradedAdultsCount),
            children: toNumber(line.derived?.childrenCount ?? line.children),
            babies: babiesVal,
          },
          line.finSizes
        ),
        speedBoatExtra: Array.isArray(line.speedBoatExtra)
          ? [...line.speedBoatExtra]
          : line.speedBoatExtra
            ? [line.speedBoatExtra]
            : [],
        buggySimple: toNumber(line.buggySimple),
        buggyFamily: toNumber(line.buggyFamily),
        calecheCount: toNumber(line.calecheCount),
        yamaha250: toNumber(line.yamaha250),
        boatPartyMen: toNumber(line.boatPartyMen),
        boatPartyWomen: toNumber(line.boatPartyWomen),
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
        zeroTracasTransfertVisaSim: 0,
        zeroTracasTransfertVisa: line.zeroTracasTransfertVisa ?? "",
        zeroTracasTransfertSim: 0,
        zeroTracasTransfert3Personnes: line.zeroTracasTransfert3Personnes ?? "",
        zeroTracasTransfertPlus3Personnes: line.zeroTracasTransfertPlus3Personnes ?? "",
        zeroTracasVisaSim: 0,
        zeroTracasVisaSeul: line.zeroTracasVisaSeul ?? "",
      };
    });

    const airbnb = pickAirbnbFields(client);
    const hotelLabel = airbnb.isAirbnb
      ? hotel || "Airbnb"
      : hotel;

    const payload = {
      site_key: SITE_KEY,
      client_name: name,
      client_phone: phone,
      client_email: email,
      client_hotel: hotelLabel,
      client_arrival_date: arrival,
      client_departure_date: departure,
      ...buildAirbnbDbFields({ ...client, hotel: hotelLabel }),
      notes: notesWithAges || "",
      total: toNumber(cartTotal),
      currency: "EUR",
      items,
      created_at: createdAt,
      updated_at: createdAt,
    };

    setSubmitLoading(true);
    try {
      let { error: insertError } = await supabase.from("public_quotes").insert(payload);
      if (isMissingAirbnbColumnError(insertError)) {
        logger.warn(
          "Colonnes Airbnb absentes sur public_quotes — insert sans ces champs. Exécutez supabase_public_quotes_add_airbnb_maps.sql"
        );
        ({ error: insertError } = await supabase
          .from("public_quotes")
          .insert(stripAirbnbColumns(payload)));
      }
      if (insertError) {
        setError(insertError.message || "Impossible d'envoyer votre devis.");
        return;
      }
      setSuccess(
        "Votre demande a bien été envoyée. Nous allons vous recontacter sur votre WhatsApp au plus vite. Si vous avez besoin de nous contacter, vous pouvez nous écrire directement sur notre WhatsApp au +201062002850."
      );
      setSuccessModalOpen(true);
      setCart([]);
      setClient({
        name: "",
        phone: "",
        email: "",
        hotel: "",
        ...createEmptyAirbnb(),
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

  const hasActiveFilters = selectedCategory !== "all" || search.trim() !== "";
  const universeCount = publicDisplayCategories.filter((c) => (categoryCounts[c.key] || 0) > 0).length;
  const showCartBar = cartLines.length > 0 && !cartDrawerOpen && !checkoutOpen && !successModalOpen && !stayModalOpen;

  /** Changement d’univers depuis la barre collante : on ramène le début des résultats sous la barre. */
  function selectCategory(key) {
    setSelectedCategory(key);
    window.requestAnimationFrame(() => {
      const el = resultsRef.current;
      if (!el || el.getBoundingClientRect().top >= 0) return;
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    });
  }

  function resetFilters() {
    setSearch("");
    selectCategory("all");
  }

  function retryFetch() {
    setError("");
    setLoading(true);
    void fetchActivities();
  }

  function openCart() {
    setError("");
    setSuccess("");
    setCartDrawerOpen(true);
  }

  const revealKey = `${loading ? "l" : "r"}-${selectedCategory}-${filteredActivities.length}-${error ? "e" : ""}`;
  let cardIndex = 0;

  return (
    <PublicAppShell
      title="Excursions"
      wide="xl"
      revealKey={revealKey}
      right={
        <GuestHeaderButton onClick={openCart} count={cartLines.length} ariaLabel="Panier">
          <ShoppingBag className="h-4 w-4" aria-hidden />
        </GuestHeaderButton>
      }
    >
      {/* ——— Hero ——— */}
      <section className="mx-auto max-w-7xl px-4 pt-2 sm:px-6 lg:px-8" aria-labelledby="catalogue-title">
        <div
          data-hero-media
          className="relative isolate flex min-h-[19rem] items-end overflow-hidden rounded-[1.5rem] bg-catalog-raised sm:min-h-[22rem] lg:min-h-[26rem]"
        >
          <img
            data-hero-img
            src={HERO_IMAGE}
            alt=""
            fetchPriority="high"
            decoding="async"
            className="absolute inset-0 -z-10 h-full w-full object-cover"
          />
          <div
            aria-hidden
            className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgba(10,42,51,0.1)_0%,rgba(10,42,51,0.25)_40%,rgba(8,36,46,0.88)_100%)] lg:bg-[linear-gradient(90deg,rgba(8,36,46,0.86)_0%,rgba(10,42,51,0.55)_45%,rgba(10,42,51,0)_80%)]"
          />
          <div className="w-full max-w-2xl p-5 sm:p-8 lg:p-12">
            <p data-reveal="item" className="hdc-eyebrow hdc-eyebrow-light">Excursions · Mer Rouge</p>
            <h1
              id="catalogue-title"
              data-split
              className="mt-3 font-catalog-display text-[2.25rem] leading-[1.04] !text-white sm:text-[2.75rem] lg:text-[3.5rem]"
            >
              Votre prochaine <span className="hdc-serif text-catalog-sand">escapade</span> commence ici.
            </h1>
            <p data-reveal="item" className="mt-3 max-w-lg text-[0.9375rem] leading-relaxed text-white/85 sm:text-base">
              Désert, récifs, îles, Louxor &amp; Le Caire : composez votre sélection et recevez une proposition claire,
              sans engagement.
            </p>
            {!loading && publicActivities.length > 0 ? (
              <ul data-reveal="item" className="mt-5 flex flex-wrap gap-2 text-xs font-semibold text-white">
                <li className="inline-flex min-h-8 items-center rounded-full bg-white/15 px-3 ring-1 ring-white/25 backdrop-blur-md">
                  {publicActivities.length} expériences
                </li>
                <li className="inline-flex min-h-8 items-center rounded-full bg-white/15 px-3 ring-1 ring-white/25 backdrop-blur-md">
                  {universeCount} univers
                </li>
                <li className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-white/15 px-3 ring-1 ring-white/25 backdrop-blur-md">
                  <ShieldCheck className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                  Devis gratuit
                </li>
              </ul>
            ) : null}
          </div>
        </div>

        {/* ——— Recherche + séjour ——— */}
        <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <label data-reveal="item" className="relative block" htmlFor="public-search">
            <span className="sr-only">Rechercher une excursion</span>
            <Search className="pointer-events-none absolute left-4 top-1/2 z-10 h-5 w-5 -translate-y-1/2 text-catalog-subtle" aria-hidden />
            <input
              id="public-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher une excursion, un lieu…"
              autoComplete="off"
              enterKeyHint="search"
              className="hdc-input hdc-search !min-h-[3.25rem] !rounded-full !pl-12 !pr-14"
            />
            {search ? (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-1.5 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full text-catalog-muted hover:bg-catalog-bg hover:text-catalog-ink"
                aria-label="Effacer la recherche"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            ) : null}
          </label>
          {isValidCatalogueStay(stay) ? (
            <div data-reveal="item" className="flex min-h-[3.25rem] items-center gap-3 rounded-full bg-white py-1 pl-4 pr-1 ring-1 ring-catalog-border">
              <CalendarDays className="h-5 w-5 shrink-0 text-catalog-lagoon" strokeWidth={1.5} aria-hidden />
              <p className="min-w-0 flex-1 truncate text-sm font-medium text-catalog-ink">
                <span className="sr-only">Votre séjour : </span>
                {formatCatalogueStaySummary(stay)}
              </p>
              <button
                type="button"
                data-press
                onClick={openStayEditor}
                className="inline-flex min-h-11 shrink-0 items-center rounded-full px-4 text-sm font-semibold text-catalog-lagoon hover:bg-catalog-lagoonSoft"
              >
                Modifier
              </button>
            </div>
          ) : null}
        </div>
      </section>

      {/* ——— Univers (barre collante) ——— */}
      <div className="hdc-filterbar sticky top-[calc(max(0.35rem,env(safe-area-inset-top))+3.25rem)] z-30 mt-4">
        <div
          className="hdc-chip-rail mx-auto flex max-w-7xl gap-2 overflow-x-auto px-4 py-3 scrollbar-hide sm:px-6 lg:flex-wrap lg:gap-1.5 lg:px-8 xl:justify-between"
          role="group"
          aria-label="Filtrer par univers"
        >
          <button
            type="button"
            data-press
            aria-pressed={selectedCategory === "all"}
            onClick={() => selectCategory("all")}
            className="hdc-chip shrink-0"
          >
            Toutes
            <span className="hdc-chip-count">{categoryCounts.all || 0}</span>
          </button>
          {publicDisplayCategories.map((category) => (
            <button
              key={category.key}
              type="button"
              data-press
              aria-pressed={selectedCategory === category.key}
              onClick={() => selectCategory(category.key)}
              className="hdc-chip shrink-0"
            >
              <CategoryIcon categoryKey={category.key} className="h-4 w-4 lg:hidden" />
              {getPublicCategoryLabel(category.key)}
              <span className="hdc-chip-count">{categoryCounts[category.key] || 0}</span>
            </button>
          ))}
        </div>
      </div>

      <main
        ref={resultsRef}
        className="relative z-10 mx-auto w-full max-w-7xl scroll-mt-[calc(max(0.35rem,env(safe-area-inset-top))+7.5rem)] px-4 pb-10 pt-6 sm:px-6 lg:px-8"
      >
        {getCategoryPublicNotice(selectedCategory) ? (
          <p className="mb-6 flex items-start gap-2.5 rounded-[1rem] bg-catalog-brassSoft px-4 py-3 text-sm leading-relaxed text-catalog-body" role="note">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-catalog-brass" aria-hidden />
            {getCategoryPublicNotice(selectedCategory)}
          </p>
        ) : null}

        {!loading && !error ? (
          <div className="mb-6 flex min-h-11 flex-wrap items-center justify-between gap-x-4 gap-y-1">
            <p className="text-sm text-catalog-muted" aria-live="polite">
              <span className="font-semibold text-catalog-ink">{filteredActivities.length}</span>{" "}
              expérience{filteredActivities.length > 1 ? "s" : ""}
              {selectedCategory !== "all" ? ` · ${getPublicCategoryLabel(selectedCategory)}` : ""}
              {search.trim() ? ` · « ${search.trim()} »` : ""}
            </p>
            {hasActiveFilters ? (
              <button
                type="button"
                data-press
                onClick={resetFilters}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-catalog-lagoon hover:bg-catalog-lagoonSoft"
              >
                <RotateCcw className="h-4 w-4" aria-hidden />
                Effacer les filtres
              </button>
            ) : null}
          </div>
        ) : null}

        {error && !loading ? (
          <StateCard
            tone="error"
            title="Catalogue momentanément indisponible"
            action={
              <button type="button" data-press onClick={retryFetch} className="hdc-btn hdc-btn-ink">
                <RotateCcw className="h-4 w-4" aria-hidden />
                Réessayer
              </button>
            }
          >
            {error}
          </StateCard>
        ) : null}

        {loading ? (
          <div role="status" aria-live="polite">
            <span className="sr-only">Chargement du catalogue…</span>
            <div className="hdc-skeleton mb-6 h-5 w-40 rounded-md" aria-hidden />
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6 2xl:grid-cols-4">
              {Array.from({ length: 6 }, (_, i) => (
                <CatalogueActivityCardSkeleton key={i} />
              ))}
            </div>
          </div>
        ) : null}

        {!loading && !error && filteredActivities.length === 0 ? (
          <StateCard
            title="Aucune excursion ne correspond"
            action={
              hasActiveFilters ? (
                <button type="button" data-press onClick={resetFilters} className="hdc-btn hdc-btn-ink">
                  <RotateCcw className="h-4 w-4" aria-hidden />
                  Voir toutes les excursions
                </button>
              ) : null
            }
          >
            Essayez un autre mot-clé ou un autre univers. Une envie précise ? Écrivez-nous, nous trouverons la sortie qui
            vous ressemble.
          </StateCard>
        ) : null}

        <div className="space-y-14 lg:space-y-20">
          {groupedActivities.map((group) => (
            <section key={group.key} aria-labelledby={`univers-${group.key}`}>
              <div data-reveal="item" className="mb-5 flex items-end justify-between gap-4 border-b border-catalog-line pb-4 lg:mb-7">
                <div className="flex min-w-0 items-center gap-3.5">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-catalog-lagoonSoft text-catalog-lagoon">
                    <CategoryIcon categoryKey={group.key} className="h-5 w-5" strokeWidth={1.5} />
                  </span>
                  <div className="min-w-0">
                    <p className="hdc-eyebrow">Univers</p>
                    <h2 id={`univers-${group.key}`} data-heading className="mt-1 font-catalog-display text-[1.75rem] leading-tight text-catalog-ink lg:text-[2rem]">
                      {getPublicCategoryLabel(group.key)}
                    </h2>
                  </div>
                </div>
                <span className="shrink-0 pb-1 text-sm text-catalog-muted">
                  {group.items.length} expérience{group.items.length > 1 ? "s" : ""}
                </span>
              </div>
              {group.key === "marsa_alam" && selectedCategory !== "marsa_alam" ? (
                <p className="mb-5 flex items-start gap-2.5 rounded-[1rem] bg-catalog-brassSoft px-4 py-3 text-sm leading-relaxed text-catalog-body" role="note">
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-catalog-brass" aria-hidden />
                  {getCategoryPublicNotice("marsa_alam")}
                </p>
              ) : null}
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6 2xl:grid-cols-4">
                {group.items.map((activity) => {
                  const listFrom = getPublicCatalogListFromPrice(activity);
                  const fromPrice =
                    toNumber(activity.price_adult) > 0 ? toNumber(activity.price_adult) : listFrom?.amount ?? null;
                  const index = cardIndex++;
                  return (
                    <CatalogueActivityCard
                      key={activity.id}
                      activity={activity}
                      categoryKey={normalizeCategory(activity.category)}
                      coverUrl={normalizeCatalogImageUrlsFromDb(activity.catalog_image_urls)[0] || null}
                      fromPrice={fromPrice}
                      prose={getActivityPublicProse(activity)}
                      priority={index < 2}
                    />
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </main>

      <CatalogueFooter />

      {showCartBar ? (
        <div className="hdc-cart-bar pointer-events-none fixed inset-x-0 bottom-0 z-40 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            data-press
            onClick={openCart}
            className="pointer-events-auto mx-auto flex w-full max-w-md items-center gap-3 rounded-full bg-catalog-ink py-2 pl-2 pr-5 text-left text-white shadow-catalog-float"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/10">
              <ShoppingBag className="h-5 w-5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs text-white/70">
                {cartLines.length} excursion{cartLines.length > 1 ? "s" : ""} sélectionnée{cartLines.length > 1 ? "s" : ""}
              </span>
              <span className="block text-base font-semibold tabular-nums">
                {cartTotal > 0 ? formatMoney(cartTotal, "EUR") : "Total sur devis"}
              </span>
            </span>
            <span className="inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold">
              Mon panier
              <ArrowRight className="h-4 w-4" aria-hidden />
            </span>
          </button>
        </div>
      ) : null}

      {cartDrawerOpen ? (
        <Sheet
          variant="right"
          zClass="z-[110]"
          onClose={() => setCartDrawerOpen(false)}
          closeLabel="Fermer le panier"
          labelledBy="cart-drawer-title"
        >
          <SheetHeader
            dark
            eyebrow="Excursions"
            title={`Votre panier · ${cartLines.length}`}
            titleId="cart-drawer-title"
            onClose={() => setCartDrawerOpen(false)}
          />
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-4">
            {cartLines.length === 0 ? (
              <div data-sheet-item className="rounded-[1.4rem] bg-white px-5 py-12 text-center ring-1 ring-catalog-line">
                <ShoppingBag className="mx-auto h-8 w-8 text-catalog-subtle" aria-hidden />
                <p className="mt-3 font-catalog-display text-lg font-medium text-catalog-ink">Votre panier est vide</p>
                <p className="mt-1 text-sm text-catalog-muted">Ajoutez des activités depuis le catalogue.</p>
            </div>
            ) : null}
              {cartLines.map((line) => {
                const ageChild = String(line.activity.age_child || "").trim();
                const ageBaby = String(line.activity.age_baby || "").trim();
                const minors = line.derived?.minorsCount || 0;
                const classified = Boolean(line.derived?.complete);
              const babiesForbiddenLine = Boolean(line.activity?.babies_forbidden ?? line.activity?.babiesForbidden);
                return (
                <div key={line.id} data-sheet-item className="hdc-card p-4">
                    <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 font-catalog-display text-[1.0625rem] font-medium leading-snug text-catalog-ink">
                        {displayActivityName(line.activity.name)}
                      </p>
                      <p className="mt-1 flex items-center gap-1.5 text-xs font-semibold capitalize text-catalog-muted">
                        <CalendarDays className="h-3.5 w-3.5" aria-hidden />
                        {formatCartLineDate(line.date)}
                      </p>
                    </div>
                      <button
                        type="button"
                      data-press="0.9"
                        onClick={() => removeCartLine(line.id)}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-catalog-coralSoft text-catalog-coralDeep"
                      aria-label={`Retirer ${line.activity.name}`}
                      >
                      <Trash2 className="h-4 w-4" aria-hidden />
                      </button>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2">
                    <div className="rounded-xl bg-catalog-bg px-2 py-2 text-center">
                      <span className="block text-[0.625rem] font-bold uppercase tracking-[0.12em] text-catalog-muted">Adultes</span>
                      <span className="mt-0.5 block text-base font-extrabold tabular-nums text-catalog-ink">
                          {line.adultsBase ?? line.adults ?? 0}
                          {classified && (line.derived?.upgradedAdultsCount || 0) > 0
                            ? `+${line.derived.upgradedAdultsCount}`
                            : ""}
                      </span>
                        </div>
                    <div className="rounded-xl bg-catalog-bg px-2 py-2 text-center">
                      <span className="block text-[0.625rem] font-bold uppercase tracking-[0.12em] text-catalog-muted">
                        {classified ? "Enfants" : "Enf. / bébés"}
                        </span>
                      <span className="mt-0.5 block text-base font-extrabold tabular-nums text-catalog-ink">
                          {classified ? line.derived.childrenCount : minors}
                      </span>
                      {ageChild ? <span className="block text-[0.625rem] font-semibold text-catalog-muted">{ageChild}</span> : null}
                        </div>
                    <div className={`rounded-xl px-2 py-2 text-center ${babiesForbiddenLine ? "bg-catalog-brassSoft" : "bg-catalog-bg"}`}>
                      <span className="block text-[0.625rem] font-bold uppercase tracking-[0.12em] text-catalog-muted">Bébés</span>
                      <span className="mt-0.5 block text-base font-extrabold tabular-nums text-catalog-ink">
                        {babiesForbiddenLine ? 0 : classified ? line.derived.babiesCount : "—"}
                      </span>
                      {babiesForbiddenLine ? (
                        <span className="block text-[0.625rem] font-semibold text-catalog-ink">Non autorisés</span>
                      ) : ageBaby ? (
                        <span className="block text-[0.625rem] font-semibold text-catalog-muted">{ageBaby}</span>
                            ) : null}
                      </div>
                    </div>
                    {line.calecheRaised ? (
                    <p className="mt-2 text-[11px] font-semibold leading-snug text-catalog-ink" role="status">
                        {calecheCapacityNotice(line.calecheCount)}
                      </p>
                    ) : null}
                    {minors > 0 && !classified ? (
                    <p className="mt-2 text-[11px] font-semibold text-catalog-lagoon">
                        Dates de naissance demandées à l’étape suivante pour classer bébé / enfant.
                      </p>
                    ) : null}
                    {formatDivingVisitorLabel(line, line.activity?.name) ? (
                    <p className="mt-2 text-[11px] font-semibold text-catalog-lagoon">
                        {formatDivingVisitorLabel(line, line.activity?.name)}
                      </p>
                    ) : null}
                    {formatTurtleFinSizesLabel(line, line.activity?.name) ? (
                    <p className="mt-2 text-[11px] font-semibold text-catalog-lagoon">
                        {formatTurtleFinSizesLabel(line, line.activity?.name)}
                      </p>
                    ) : null}
                  <div className="mt-3 flex items-center justify-between border-t border-catalog-line pt-3">
                    <p className="text-[11px] leading-snug text-catalog-muted">
                      Pour modifier, retirez la ligne puis rouvrez la fiche.
                    </p>
                    <p className="shrink-0 font-catalog-display text-lg tabular-nums text-catalog-ink">
                        {formatMoney(line.lineTotal, line.activity.currency)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          <SheetFooter>
            <div className="mb-3 flex items-end justify-between gap-3">
              <span className="text-[0.6875rem] font-bold uppercase tracking-[0.16em] text-catalog-muted">Total estimé</span>
              <span className="font-catalog-display text-[1.75rem] leading-none tabular-nums text-catalog-ink">
                  {formatMoney(cartTotal, "EUR")}
                </span>
              </div>
              <button
                type="button"
              data-press
                disabled={cartLines.length === 0}
                onClick={() => {
                  setError("");
                  setSuccess("");
                  setCartDrawerOpen(false);
                  setCheckoutOpen(true);
                }}
              className="hdc-btn hdc-btn-primary w-full min-h-[3.25rem] text-base"
              >
              Finaliser mon devis
              <ArrowRight className="h-4 w-4" aria-hidden />
              </button>
          </SheetFooter>
        </Sheet>
      ) : null}

      {checkoutOpen ? (
        <Sheet
          onClose={() => setCheckoutOpen(false)}
          as="form"
          panelProps={{ onSubmit: submitPublicQuote, onClick: (e) => e.stopPropagation() }}
          labelledBy="checkout-title"
        >
          <SheetHeader eyebrow="Devis" title="Vos coordonnées" titleId="checkout-title" onClose={() => setCheckoutOpen(false)} />
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4 sm:px-6">
            {error ? (
              <div className="mb-4 rounded-2xl bg-catalog-coralSoft px-4 py-3 text-sm font-semibold text-catalog-coralDeep" role="alert">
                {error}
              </div>
            ) : null}
            <p className="mb-3 text-xs font-semibold leading-relaxed text-catalog-muted">
              Tous les champs ci-dessous sont <strong className="text-catalog-ink">obligatoires</strong> pour envoyer votre demande.
            </p>
            <div className="space-y-3.5">
              <input
                data-sheet-item
                value={client.name}
                onChange={(e) => updateClientField("name", e.target.value)}
                placeholder="Nom complet *"
                required
                className="hdc-input"
                autoComplete="name"
              />
              <input
                data-sheet-item
                value={formatPhoneWithPlus(client.phone)}
                onChange={(e) => updateClientField("phone", formatPhoneWithPlus(e.target.value))}
                placeholder="Téléphone WhatsApp *"
                required
                inputMode="tel"
                className="hdc-input"
                autoComplete="tel"
              />
              <input
                data-sheet-item
                type="email"
                value={client.email}
                onChange={(e) => updateClientField("email", e.target.value)}
                placeholder="E-mail *"
                required
                className="hdc-input"
                autoComplete="email"
              />
              <div data-sheet-item className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-catalog-muted">Hôtel / lieu *</span>
                  <label className="inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-full bg-catalog-coralSoft px-3 text-xs font-bold text-catalog-coralDeep">
                    <input
                      type="checkbox"
                      className="size-4 rounded accent-[#C9452C]"
                      checked={Boolean(client.isAirbnb)}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setClient((c) => ({
                          ...c,
                          isAirbnb: checked,
                          airbnbMapsUrl: checked ? c.airbnbMapsUrl || "" : "",
                        }));
                      }}
                    />
                    Airbnb
                  </label>
                </div>
                <input
                  value={client.hotel}
                  onChange={(e) => updateClientField("hotel", e.target.value)}
                  placeholder={client.isAirbnb ? "Nom / libellé Airbnb (optionnel)" : "Hôtel ou lieu de prise en charge *"}
                  required={!client.isAirbnb}
                  className="hdc-input"
                />
                {client.isAirbnb ? (
                  <div className="space-y-2 rounded-2xl bg-catalog-coralSoft p-3">
                    <label className="block space-y-1">
                      <span className="text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-catalog-coralDeep">
                        Lien Google Maps *
                      </span>
                      <input
                        type="url"
                        value={client.airbnbMapsUrl || ""}
                        onChange={(e) => updateClientField("airbnbMapsUrl", e.target.value)}
                        placeholder="https://maps.google.com/... ou maps.app.goo.gl/..."
                        required
                        className="hdc-input !bg-white"
                      />
                    </label>
                    <p className="text-[11px] font-medium text-catalog-coralDeep">
                      Collez le lien Maps du logement pour organiser le transfert.
                    </p>
                  </div>
                ) : null}
              </div>
              <div data-sheet-item className="grid grid-cols-2 gap-3">
                <label className="block space-y-1">
                  <span className="text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-catalog-muted">Arrivée *</span>
                  <input
                    type="date"
                    value={client.arrivalDate}
                    onChange={(e) => {
                      const nextArrival = e.target.value;
                      const minDep = getMinDepartureDate(nextArrival);
                      const nextDeparture =
                        minDep && client.departureDate && client.departureDate < minDep
                          ? ""
                          : client.departureDate;
                      setClient((prev) => ({
                        ...prev,
                        arrivalDate: nextArrival,
                        departureDate: nextDeparture,
                      }));
                      if (isValidCatalogueStay({ arrivalDate: nextArrival, departureDate: nextDeparture })) {
                        savePublicCatalogueStay({
                          arrivalDate: nextArrival,
                          departureDate: nextDeparture,
                        });
                      }
                    }}
                    required
                    className="hdc-input"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-catalog-muted">Départ *</span>
                  <input
                    type="date"
                    value={client.departureDate}
                    min={getMinDepartureDate(client.arrivalDate) || undefined}
                    onChange={(e) => {
                      updateClientField("departureDate", e.target.value);
                      if (isValidCatalogueStay({ arrivalDate: client.arrivalDate, departureDate: e.target.value })) {
                        savePublicCatalogueStay({
                          arrivalDate: client.arrivalDate,
                          departureDate: e.target.value,
                        });
                      }
                    }}
                    required
                    className="hdc-input"
                  />
                </label>
              </div>
              {isSameDayCatalogueStay(client) ? (
                <p className="rounded-2xl bg-catalog-brassSoft px-4 py-3 text-xs font-semibold leading-relaxed text-catalog-ink">
                  {CATALOGUE_STAY_SAME_DAY_MESSAGE}
                </p>
              ) : null}

              {cartNeedsMinorBirthDates ? (
                <div className="space-y-3 rounded-[1.25rem] bg-catalog-bg p-4 ring-1 ring-catalog-line">
                  <div>
                    <p className="hdc-eyebrow">Dates de naissance</p>
                    <p className="mt-1 text-xs leading-relaxed text-catalog-muted">
                      Indiquez la date de naissance de chaque enfant / bébé : le tarif enfant ou bébé est calculé
                      automatiquement selon la grille de l’activité (âge au jour de l’excursion).
                    </p>
                  </div>
                  {cartLines
                    .filter((line) => (line.derived?.minorsCount || 0) > 0)
                    .map((line) => {
                      const ageChild = String(line.activity?.age_child || "").trim();
                      const ageBaby = String(line.activity?.age_baby || "").trim();
                      const babiesForbidden = Boolean(line.activity?.babies_forbidden ?? line.activity?.babiesForbidden);
                      return (
                        <div key={`dob-${line.id}`} className="rounded-2xl bg-white p-3.5 ring-1 ring-catalog-line">
                          <p className="text-sm font-bold text-catalog-ink">{displayActivityName(line.activity?.name)}</p>
                          <p className="mt-0.5 text-[11px] font-semibold text-catalog-muted">
                            {formatCartLineDate(line.date)}
                            {ageChild || ageBaby
                              ? ` · enfant ${ageChild || "—"} · bébé ${babiesForbidden ? "interdit" : ageBaby || "—"}`
                              : ""}
                          </p>
                          <div className="mt-3 space-y-2.5">
                            {Array.from({ length: line.derived.minorsCount }, (_, i) => {
                              const detail = line.derived.details[i];
                              return (
                                <label key={`${line.id}-dob-${i}`} className="block text-xs font-bold text-catalog-body">
                                  Voyageur {i + 1}
                                  <input
                                    type="date"
                                    value={line.birthDates?.[i] || ""}
                                    max={line.date || client.arrivalDate || undefined}
                                    required
                                    onChange={(e) => updateLineBirthDate(line.id, i, e.target.value)}
                                    className="hdc-input mt-1"
                                  />
                                  <span
                                    className={`mt-1 block text-[11px] font-bold ${
                                      detail?.category === "forbidden"
                                        ? "text-catalog-coralDeep"
                                        : detail?.category === "baby"
                                          ? "text-catalog-coral"
                                          : detail?.category === "child"
                                            ? "text-catalog-lagoon"
                                            : detail?.category === "adult"
                                              ? "text-catalog-brass"
                                              : "text-catalog-muted"
                                    }`}
                                  >
                                    {formatActivityMinorCategoryLabel(detail?.category, detail?.age)}
                                  </span>
                                </label>
                              );
                            })}
                          </div>
                          {line.derived.complete ? (
                            <p className="mt-2 text-[11px] font-semibold text-catalog-lagoon">
                              Classé : {line.derived.childrenCount} enfant
                              {line.derived.childrenCount !== 1 ? "s" : ""}
                              {line.derived.babiesCount
                                ? ` · ${line.derived.babiesCount} bébé${line.derived.babiesCount !== 1 ? "s" : ""}`
                                : ""}
                              {line.derived.upgradedAdultsCount
                                ? ` · ${line.derived.upgradedAdultsCount} reclassé${line.derived.upgradedAdultsCount !== 1 ? "s" : ""} adulte`
                                : ""}
                            </p>
                          ) : null}
                        </div>
                      );
                    })}
                </div>
              ) : null}

              {cartLines.some((line) => isTurtleActivity(line.activity?.name)) ? (
                <div className="space-y-3 rounded-[1.25rem] bg-catalog-lagoonSoft p-4">
                  {cartLines
                    .filter((line) => isTurtleActivity(line.activity?.name))
                    .map((line) => (
                      <div key={`fins-${line.id}`} className="space-y-2">
                        <p className="text-sm font-bold text-catalog-ink">{displayActivityName(line.activity?.name)}</p>
                        <TurtleFinSizesFields
                          variant="catalog"
                          adults={toNumber(line.adultsBase ?? line.adults)}
                          children={toNumber(line.minorsCount ?? line.derived?.minorsCount)}
                          babies={0}
                          childLabel="Enfant / bébé"
                          sizes={Array.isArray(line.finSizes) ? line.finSizes : []}
                          onChange={(next) => updateLineFinSizes(line.id, next)}
                          idPrefix={`checkout-fin-size-${line.id}`}
                        />
                      </div>
                    ))}
                </div>
              ) : null}

              <textarea
                value={client.notes}
                onChange={(e) => updateClientField("notes", e.target.value)}
                placeholder="Précisions (horaires, langue du guide, etc.) — optionnel"
                rows={3}
                className="hdc-input resize-none"
              />
            </div>
          </div>
          <SheetFooter>
            <div className="mb-3 flex items-center justify-between text-xs font-semibold text-catalog-muted">
              <span>
              {cartLines.length} ligne{cartLines.length > 1 ? "s" : ""}
              </span>
              <span className="font-catalog-display text-xl tabular-nums text-catalog-ink">{formatMoney(cartTotal, "EUR")}</span>
            </div>
            <button
              type="submit"
              data-press
              disabled={submitLoading}
              className="hdc-btn hdc-btn-primary w-full min-h-[3.25rem] text-base"
            >
              {submitLoading ? "Envoi en cours…" : "Envoyer ma demande"}
            </button>
          </SheetFooter>
        </Sheet>
      ) : null}

      {successModalOpen && success ? (
        <Sheet
          variant="center"
          zClass="z-[130]"
          onClose={() => setSuccessModalOpen(false)}
          closeLabel="Fermer la confirmation"
          labelledBy="public-quote-success-title"
        >
          <div className="p-7 text-center">
            <span data-sheet-item className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-catalog-lagoonSoft text-catalog-lagoon">
              <CheckCircle2 className="h-8 w-8" aria-hidden />
            </span>
            <h3 data-sheet-item id="public-quote-success-title" className="mt-4 font-catalog-display text-[1.75rem] font-normal text-catalog-ink">
              Demande envoyée
            </h3>
            <p data-sheet-item className="mt-2 text-sm leading-relaxed text-catalog-muted">
              {success}
            </p>
            <button
              type="button"
              data-sheet-item
              data-press
              onClick={() => setSuccessModalOpen(false)}
              className="hdc-btn hdc-btn-ink mt-6 w-full"
            >
              Parfait
            </button>
          </div>
        </Sheet>
      ) : null}

      <CatalogueStayGateModal
        open={stayModalOpen}
        initialStay={stay}
        allowDismiss={stayModalAllowDismiss}
        onClose={() => {
          if (!stayModalAllowDismiss) return;
          setStayModalOpen(false);
        }}
        onSaved={handleStaySaved}
      />
    </PublicAppShell>
  );
}
