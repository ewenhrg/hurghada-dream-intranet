import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase, __SUPABASE_DEBUG__ } from "../lib/supabase";
import { CATEGORIES, SITE_KEY } from "../constants";
import { logger } from "../utils/logger";
import { loadPublicCatalogueCart, savePublicCatalogueCart } from "../utils/publicCatalogueCartStorage";
import {
  isValidCatalogueStay,
  loadPublicCatalogueStay,
  PUBLIC_CATALOGUE_STAY_EVENT,
} from "../utils/publicCatalogueStayStorage";
import { formatActivityAvailableDaysSummary } from "../utils/activityDaysDisplay";
import {
  buildSelectableDateOptions,
  getCatalogueStayActivityBounds,
  getEarliestBookableActivityDateYmd,
  normalizeAvailableDays,
} from "../utils/activityAvailableDates";
import { getLocalDateKey, isPushSaleExpired } from "../utils/pushSaleExpiry.js";
import { isProgrammaticStopSale } from "../utils/activitySalesBlackouts.js";
import { ActivityDateCalendar } from "../components/ActivityDateCalendar";
import { CatalogueStayGateModal } from "../components/public/CatalogueStayGateModal";
import { PublicAppShell } from "../components/public/PublicAppShell";
import { StateCard, WhatsAppFab, WhatsAppGlyph } from "../components/public/PublicUI";
import { displayActivityName, getPublicCategoryLabel, formatMoney as formatPublicMoney } from "../components/public/catalogueDisplay";
import { CatalogPhotoLightbox } from "../components/public/CatalogPhotoLightbox";
import { CatalogPhotoFrame } from "../components/public/CatalogPhotoFrame";
import { normalizeCatalogImageUrlsFromDb } from "../utils/catalogContent";
import {
  getActivityPublicProse,
  isBuggyActivity,
  isCalecheActivity,
  getCalecheUnitPrice,
  requiredCalecheCount,
  calecheCapacityNotice,
  isCairePrivatifActivity,
  isLouxorPrivatifActivity,
  isMotoCrossActivity,
  isBoatPartyActivity,
  getBoatPartyPrices,
  isSpeedBoatActivity,
  isSpeedBoatSunsetActivity,
  allowsSpeedBoatIslandExtras,
  getSpeedBoatIslandExtras,
  isZeroTracasActivity,
  isZeroTracasHorsZoneActivity,
  isArrivalDayServiceActivity,
  getZeroTracasPrices,
  getZeroTracasHorsZonePrices,
  proseFromActivityNotes,
  requiresMinimumTwoParticipants,
  hasEnoughParticipantsForActivity,
  warnsRecommendedTwoParticipants,
  isBelowRecommendedTwoParticipants,
  requiresMammaMiaSelfTransfer,
  buildMammaMiaSelfTransferNote,
  SPEED_BOAT_MAX_PARTICIPANTS,
  exceedsSpeedBoatMaxParticipants,
  getSpeedBoatMaxParticipantsMessage,
  isTurtleActivity,
  hasAllTurtleFinSizes,
  getTurtleFinSizesMissingMessage,
  isZeroTracasSimOptionKey,
  clearZeroTracasSimQuantities,
  ZERO_TRACAS_SIM_UNAVAILABLE_MESSAGE,
} from "../utils/activityHelpers";
import {
  computePublicCatalogLineTotal,
  getPublicCatalogListFromPrice,
  isPublicCatalogAirportStyleLine,
} from "../utils/publicCatalogPricing";
import {
  isDivingActivityName,
  DIVING_VISITOR_UNIT_PRICE,
  formatDivingVisitorLabel,
} from "../utils/divingSafety.js";
import { TurtleFinSizesFields } from "../components/quotes/TurtleFinSizesFields";

/** `*` : toutes les colonnes présentes en base (évite erreur si une migration manque encore). */
const ACTIVITY_COLUMNS_BASE = "*";
const ACTIVITY_COLUMNS_FULL = "*";

const INITIAL_CATALOG_SPECIAL = {
  extraDolphin: false,
  speedBoatExtra: [],
  divingVisitor: false,
  divingVisitorCount: 0,
  finSizes: [],
  buggySimple: 0,
  buggyFamily: 0,
  calecheCount: 0,
  yamaha250: 0,
  ktm640: 0,
  ktm530: 0,
  boatPartyMen: 0,
  boatPartyWomen: 0,
  cairePrivatif4pax: false,
  cairePrivatif5pax: false,
  cairePrivatif6pax: false,
  louxorPrivatif4pax: false,
  louxorPrivatif5pax: false,
  louxorPrivatif6pax: false,
  allerSimple: false,
  allerRetour: false,
  zeroTracasTransfertVisaSim: 0,
  zeroTracasTransfertVisa: 0,
  zeroTracasTransfertSim: 0,
  zeroTracasTransfert3Personnes: 0,
  zeroTracasTransfertPlus3Personnes: 0,
  zeroTracasVisaSim: 0,
  zeroTracasVisaSeul: 0,
};


function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoney(value, currency = "EUR") {
  return formatPublicMoney(toNumber(value), currency);
}

function normalizeCategory(rawCategory) {
  const value = String(rawCategory || "").trim();
  const exists = CATEGORIES.some((category) => category.key === value);
  return exists ? value : "desert";
}

function getCategoryCover(categoryKey) {
  const covers = {
    desert: "linear-gradient(160deg, #F0CE98 0%, #D69A62 45%, #8E3420 100%)",
    aquatique: "linear-gradient(160deg, #8FCFD1 0%, #0A6C74 50%, #0B1D26 100%)",
    exploration_bien_etre: "linear-gradient(160deg, #CFE6DE 0%, #3FA7AE 50%, #0A6C74 100%)",
    luxor_caire: "linear-gradient(160deg, #F4EBDC 0%, #D9B47A 45%, #7A5527 100%)",
    marsa_alam: "linear-gradient(160deg, #F2A28C 0%, #0A6C74 55%, #0B1D26 100%)",
    transfert: "linear-gradient(160deg, #A9B6BC 0%, #566770 50%, #0B1D26 100%)",
  };
  return covers[categoryKey] || covers.desert;
}

function getCategoryLabel(categoryKey) {
  return getPublicCategoryLabel(categoryKey);
}

const AGENCY_WHATSAPP_URL = "https://wa.me/201062002850?text=Bonjour%20Hurghada%20Dream%2C%20";

/** Squelette de la fiche (photo + titre + blocs) : la mise en page ne saute pas à l’arrivée des données. */
function ActivityPageSkeleton() {
  return (
    <div className="mx-auto max-w-7xl px-4 pt-2 sm:px-6 lg:px-8" role="status" aria-live="polite">
      <span className="sr-only">Chargement de l’activité…</span>
      <div aria-hidden>
        <div className="hdc-skeleton h-[clamp(340px,52vh,520px)] rounded-[1.25rem] md:hidden" />
        <div className="hdc-skeleton mt-5 h-3 w-24 rounded md:mt-4" />
        <div className="hdc-skeleton mt-3 h-9 w-4/5 max-w-xl rounded-md" />
        <div className="hdc-skeleton mt-3 h-4 w-40 rounded" />
        <div className="mt-8 grid gap-8 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <div className="hdc-skeleton hidden aspect-[16/9] rounded-[1.25rem] md:block" />
            <div className="hdc-skeleton h-4 w-full rounded" />
            <div className="hdc-skeleton h-4 w-11/12 rounded" />
            <div className="hdc-skeleton h-4 w-3/4 rounded" />
          </div>
          <div className="hdc-skeleton hidden h-96 rounded-[1.25rem] lg:block" />
        </div>
      </div>
    </div>
  );
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

function ParticipantSelect({ Icon, label, value, onChange, min, max, pluralize = true }) {
  const options = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-4 top-1/2 z-[1] -translate-y-1/2">
        <Icon className="h-5 w-5 text-catalog-lagoon" />
      </span>
      <IconChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-catalog-muted" />
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
        className="hdc-input appearance-none !pl-12 !pr-10"
      >
        {options.map((n) => (
          <option key={n} value={n}>
            {n} {label}
            {pluralize && n > 1 ? "s" : ""}
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
  minorsCount,
  setMinorsCount,
  visitorCount = 0,
  setVisitorCount,
  showVisitors = false,
  showFinSizes = false,
  finSizes = [],
  setFinSizes,
  date,
  setDate,
  normalizedDays,
  stopDateSet,
  pushDateSet,
  stayArrivalDate = "",
  stayDepartureDate = "",
  lineTotal,
  canAdd,
  onAdd,
  dateError,
  daysSummary,
  noDatesConfigured,
  headerPrice,
  priceCaption,
  replaceParticipantPricingLines,
  childrenBeforeParticipants,
  codedTotalPending = false,
  babiesForbidden = false,
  requiresMinTwo = false,
  participantsOk = true,
  warnsRecommendedTwo = false,
  belowRecommendedTwo = false,
  adultMax = 10,
  minorMax = 10,
  speedBoatMaxMessage = "",
}) {
  const currency = activity.currency || "EUR";
  const ageChild = String(activity.age_child || "").trim();
  const ageBaby = String(activity.age_baby || "").trim();
  const babyPriceZero = toNumber(activity.price_baby) === 0;
  const dbAdult = toNumber(activity.price_adult);
  const resolvedHeader =
    headerPrice != null ? headerPrice : dbAdult > 0 ? dbAdult : null;
  const showSurDevisHeader = resolvedHeader == null || resolvedHeader <= 0;

  return (
    <div className="space-y-3 md:space-y-4">
      <div className="hd-booking-pricing-summary rounded-[1.25rem] bg-catalog-bg px-4 py-4 ring-1 ring-catalog-line">
        <p className="mb-1 text-xs font-medium text-catalog-muted">À partir de (adulte)</p>
        <div className="flex items-baseline gap-2">
          <span className="font-catalog-display text-[1.75rem] leading-none text-catalog-ink tabular-nums">
            {showSurDevisHeader ? (
              <span className="text-base font-semibold text-catalog-ink">Tarif sur devis</span>
            ) : (
              formatMoney(resolvedHeader, currency)
            )}
          </span>
        </div>
        {priceCaption ? (
          <p className="mt-1 text-xs font-semibold text-catalog-body">{priceCaption}</p>
        ) : null}
        {replaceParticipantPricingLines ? (
          <p className="mt-3 whitespace-pre-line text-sm font-semibold leading-relaxed text-catalog-ink">
            {replaceParticipantPricingLines}
          </p>
        ) : babiesForbidden ? (
          <div className="mt-3 space-y-1 border-t border-catalog-line pt-3 text-sm font-semibold">
            <p className="text-catalog-ink">
              Enfant{ageChild ? ` (${ageChild})` : ""} : {formatMoney(activity.price_child, currency)}
            </p>
            <p className="text-catalog-ink">Bébé : interdit sur cette activité</p>
          </div>
        ) : (
          <div className="mt-3 space-y-1 border-t border-catalog-line pt-3 text-sm font-semibold">
            <p className="text-catalog-ink">
              Enfant{ageChild ? ` (${ageChild})` : ""} : {formatMoney(activity.price_child, currency)}
            </p>
            <p className="text-catalog-ink">
              Bébé{ageBaby ? ` (${ageBaby})` : ""} :{" "}
              {babyPriceZero ? "gratuit ou selon grille applicable" : formatMoney(activity.price_baby, currency)}
            </p>
          </div>
        )}
      </div>

      {childrenBeforeParticipants}

      {requiresMinTwo ? (
        <p className="rounded-xl border border-transparent bg-catalog-brassSoft px-4 py-3 text-sm font-semibold text-catalog-ink">
          Minimum 2 personnes (adultes + enfants) pour réserver.
        </p>
      ) : null}
      {warnsRecommendedTwo ? (
        <p className="rounded-xl border border-transparent bg-catalog-brassSoft px-4 py-3 text-sm font-semibold text-catalog-ink">
          Attention : El Gouna est recommandé à partir de 2 personnes (adultes + enfants).
        </p>
      ) : null}

      {speedBoatMaxMessage ? (
        <p className="rounded-xl border border-transparent bg-catalog-lagoonSoft px-4 py-3 text-sm font-semibold text-catalog-ink">
          {speedBoatMaxMessage}
        </p>
      ) : null}

      <ParticipantSelect
        Icon={IconUsers}
        label="adulte"
        value={adults}
        onChange={setAdults}
        min={1}
        max={adultMax}
      />
      <div>
        <ParticipantSelect
          Icon={IconUsers}
          label="enfants / bébés"
          value={Math.min(minorsCount, minorMax)}
          onChange={setMinorsCount}
          min={0}
          max={minorMax}
          pluralize={false}
        />
        <p className="mt-1.5 text-xs font-medium text-catalog-muted">
          La classification bébé ou enfant se fait à la validation du panier via la date de naissance
          {ageChild || ageBaby
            ? ` (grilles : enfant ${ageChild || "—"} · bébé ${babiesForbidden ? "interdit" : ageBaby || "—"})`
            : ""}
          .
        </p>
      </div>
      {showVisitors ? (
        <div>
          <ParticipantSelect
            Icon={IconUsers}
            label="visiteur"
            value={visitorCount}
            onChange={setVisitorCount}
            min={0}
            max={10}
          />
          <p className="mt-1.5 text-xs font-medium text-catalog-muted">
            Accompagnant qui ne plonge pas · +{DIVING_VISITOR_UNIT_PRICE} € par visiteur.
          </p>
          {formatDivingVisitorLabel(
            { divingVisitorCount: visitorCount },
            activity?.name
          ) ? (
            <p className="mt-1 text-xs font-semibold text-catalog-lagoon">
              {formatDivingVisitorLabel({ divingVisitorCount: visitorCount }, activity?.name)}
            </p>
          ) : null}
        </div>
      ) : null}
      {showFinSizes ? (
        <>
          <TurtleFinSizesFields
            variant="catalog"
            adults={adults}
            children={minorsCount}
            babies={0}
            childLabel="Enfant / bébé"
            sizes={finSizes}
            onChange={setFinSizes}
            idPrefix="catalog-fin-size"
          />
          {!hasAllTurtleFinSizes(activity?.name, { adults, children: minorsCount, babies: 0 }, finSizes) ? (
            <p className="text-xs font-semibold text-catalog-ink">{getTurtleFinSizesMissingMessage()}</p>
          ) : null}
        </>
      ) : null}
      {babiesForbidden ? (
        <div className="rounded-xl border border-transparent bg-catalog-brassSoft px-4 py-3 text-center">
          <p className="text-sm font-semibold text-catalog-ink">Interdit aux bébés</p>
          <p className="mt-1 text-xs font-medium text-catalog-body">
            Si un voyageur tombe dans la tranche bébé, la réservation sera refusée pour cette activité.
          </p>
        </div>
      ) : !babyPriceZero ? null : (
        <p className="text-xs text-catalog-lagoon">Tarif bébé à 0 € — les bébés ne sont pas facturés sur ce tarif.</p>
      )}

      {daysSummary ? <p className="text-xs font-medium text-catalog-muted">Jours ouverts : {daysSummary}</p> : null}

      <ActivityDateCalendar
        value={date}
        onChange={setDate}
        normalizedDays={normalizedDays}
        stopDateSet={stopDateSet}
        pushDateSet={pushDateSet}
        activity={activity}
        stayArrivalDate={stayArrivalDate}
        stayDepartureDate={stayDepartureDate}
        disabled={noDatesConfigured || !stayArrivalDate || !stayDepartureDate}
        maxDaysAhead={120}
      />
      {!stayArrivalDate || !stayDepartureDate ? (
        <p className="text-sm text-catalog-brass">Indiquez vos dates de séjour pour choisir une date d’activité.</p>
      ) : null}
      {noDatesConfigured ? (
        <p className="text-sm text-catalog-brass">Aucun jour n&apos;est ouvert pour cette activité en ligne. Écrivez-nous sur WhatsApp pour réserver.</p>
      ) : null}

      <div className="border-t border-catalog-line pt-4">
        <div className="mb-3 flex items-end justify-between">
          <span className="text-sm font-medium text-catalog-muted">Total</span>
          <span className="font-catalog-display text-[1.625rem] leading-none tabular-nums text-catalog-ink">
            {codedTotalPending && toNumber(lineTotal) <= 0 ? (
              <span className="text-base font-semibold text-catalog-brass">Sélectionnez les options</span>
            ) : (
              formatMoney(lineTotal, currency)
            )}
          </span>
        </div>
        <button
          type="button"
          disabled={!canAdd}
          onClick={onAdd}
          data-press
          className="hdc-btn hdc-btn-primary w-full"
        >
          Ajouter au panier
        </button>
        {dateError ? (
          <p className="mt-2 text-center text-sm text-catalog-coralDeep">Veuillez sélectionner une date</p>
        ) : null}
        {requiresMinTwo && !participantsOk ? (
          <p className="mt-2 text-center text-sm font-semibold text-catalog-coralDeep">
            Ajoutez au moins 2 personnes (adultes + enfants).
          </p>
        ) : null}
        {warnsRecommendedTwo && belowRecommendedTwo ? (
          <p className="mt-2 text-center text-sm font-semibold text-catalog-brass">
            Recommandé à partir de 2 personnes — vous pouvez quand même continuer.
          </p>
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
  const [minorsCount, setMinorsCount] = useState(0);
  const [calecheNotice, setCalecheNotice] = useState("");
  const calecheManualRef = useRef(0);
  const calechePartyRef = useRef(null);
  const [date, setDate] = useState("");
  const [stay, setStay] = useState(() => loadPublicCatalogueStay());
  const [stayModalOpen, setStayModalOpen] = useState(() => !isValidCatalogueStay(loadPublicCatalogueStay()));
  const [stopDateSet, setStopDateSet] = useState(() => new Set());
  const [pushDateSet, setPushDateSet] = useState(() => new Set());
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const carouselRef = useRef(null);
  /** Options tarif codé (même logique que le devis interne) — Speed Boat, Buggy, Moto, privatifs. */
  const [special, setSpecial] = useState(() => ({ ...INITIAL_CATALOG_SPECIAL }));
  const prevActivityIdRef = useRef(null);
  const airportDefaultAppliedRef = useRef(false);

  const categoryKey = useMemo(
    () => (activity ? normalizeCategory(activity.category) : "desert"),
    [activity]
  );

  const normalizedAvailableDays = useMemo(
    () => (activity ? normalizeAvailableDays(activity.available_days) : [true, true, true, true, true, true, true]),
    [activity]
  );

  const stayBounds = useMemo(
    () =>
      getCatalogueStayActivityBounds(stay.arrivalDate, stay.departureDate, new Date(), {
        includeArrivalDay: Boolean(activity && isArrivalDayServiceActivity(activity.name)),
      }),
    [stay.arrivalDate, stay.departureDate, activity]
  );

  const dateOptions = useMemo(() => {
    if (!activity) return [];
    const pinArrival = isArrivalDayServiceActivity(activity.name);
    return buildSelectableDateOptions(normalizedAvailableDays, 120, {
      stopDateSet,
      pushDateSet,
      activity,
      stayBounds,
      earliestYmd: pinArrival && stay.arrivalDate ? stay.arrivalDate : getEarliestBookableActivityDateYmd(),
      departureDate: stay.departureDate,
      requireStay: true,
      skipEarliestCheck: pinArrival,
    });
  }, [activity, normalizedAvailableDays, stopDateSet, pushDateSet, stayBounds, stay.arrivalDate, stay.departureDate]);

  const daysSummary = useMemo(() => (activity ? formatActivityAvailableDaysSummary(activity) : ""), [activity]);

  const noDatesConfigured =
    Boolean(activity) &&
    (dateOptions.length === 0 || (stayBounds != null && stayBounds.empty));

  // Tolérant : certaines sources peuvent exposer camelCase au lieu de snake_case.
  const babiesForbidden = Boolean(activity?.babies_forbidden ?? activity?.babiesForbidden);

  useEffect(() => {
    setSpecial({ ...INITIAL_CATALOG_SPECIAL });
    airportDefaultAppliedRef.current = false;
    calecheManualRef.current = 0;
    calechePartyRef.current = null;
    setCalecheNotice("");

    if (prevActivityIdRef.current !== null && prevActivityIdRef.current !== activityId) {
      setDate("");
      setAdults(1);
      setMinorsCount(0);
    }
    prevActivityIdRef.current = activityId;
  }, [activityId]);

  /** Calèche : 1 adulte + 2 enfants max. Au-delà, on ajoute des calèches et on prévient. */
  useEffect(() => {
    if (!activity || !isCalecheActivity(activity.name)) return undefined;
    const needed = requiredCalecheCount(adults, minorsCount);
    const target = Math.max(calecheManualRef.current, needed);
    const previous = calechePartyRef.current;
    calechePartyRef.current = { activityId, needed };
    setSpecial((current) => {
      const count = Number(current.calecheCount) || 0;
      if (count === target) return current;
      return { ...current, calecheCount: target };
    });
    const sameActivity = previous && previous.activityId === activityId;
    if (sameActivity && needed > previous.needed) {
      setCalecheNotice(calecheCapacityNotice(needed));
    } else if (sameActivity && needed < previous.needed) {
      setCalecheNotice("");
    }
    return undefined;
  }, [activity, activityId, adults, minorsCount]);

  /** Transferts aéroport : une fois par fiche, défaut aller simple (montant immédiat, aligné intranet). */
  useEffect(() => {
    if (!activity || String(activity.id) !== String(activityId)) return;
    if (!isPublicCatalogAirportStyleLine(activity)) return;
    if (airportDefaultAppliedRef.current) return;
    airportDefaultAppliedRef.current = true;
    setSpecial((s) => ({ ...s, allerSimple: true, allerRetour: false }));
  }, [activityId, activity]);

  const isDivingActivity = Boolean(activity && isDivingActivityName(activity.name));
  const isTurtle = Boolean(activity && isTurtleActivity(activity.name));

  const visitorCount = Math.max(0, toNumber(special.divingVisitorCount));
  const setVisitorCount = useCallback((n) => {
    const count = Math.max(0, Math.min(10, toNumber(n)));
    setSpecial((s) => ({
      ...s,
      divingVisitorCount: count,
      divingVisitor: count > 0,
    }));
  }, []);

  const setFinSizes = useCallback((next) => {
    setSpecial((s) => ({ ...s, finSizes: Array.isArray(next) ? next : [] }));
  }, []);

  const listFromPrice = useMemo(() => (activity ? getPublicCatalogListFromPrice(activity) : null), [activity]);

  const headerPriceHint = useMemo(() => {
    if (!activity) return null;
    return listFromPrice?.amount ?? (toNumber(activity.price_adult) > 0 ? toNumber(activity.price_adult) : null);
  }, [activity, listFromPrice]);

  const pricingLine = useMemo(() => {
    const line = {
      adults,
      // Estimation provisoire : tous les mineurs au tarif enfant jusqu’à classification checkout
      children: minorsCount,
      babies: 0,
      ...special,
    };
    if (activity && isCalecheActivity(activity.name)) {
      line.calecheCount = Math.max(
        Number(special.calecheCount) || 0,
        calecheManualRef.current,
        requiredCalecheCount(adults, minorsCount)
      );
    }
    return line;
  }, [activity, adults, minorsCount, special]);

  const lineTotal = useMemo(
    () => (activity ? computePublicCatalogLineTotal(activity, pricingLine) : 0),
    [activity, pricingLine]
  );

  const bookingReplaceChildBaby = useMemo(() => {
    if (!activity) return "";
    if (isSpeedBoatActivity(activity.name)) {
      if (isSpeedBoatSunsetActivity(activity.name)) {
        return `Grille Speed Boat Sunset : base 125 € pour 1–2 adultes, +20 € par adulte au-delà de 2, +10 € par enfant (sans extra dauphin ni îles).\n${getSpeedBoatMaxParticipantsMessage()}`;
      }
      return [
        "Grille Speed Boat : base 145 € pour 1–2 adultes, +20 € par adulte au-delà de 2, +10 € par enfant.",
        "Une seule option payante au choix : dauphin (+20 €) ou une île / formule (baie, lunch…).",
        getSpeedBoatMaxParticipantsMessage(),
      ].join("\n");
    }
    if (isBoatPartyActivity(activity.name)) {
      const p = getBoatPartyPrices();
      return `Indiquez le nombre de garçons (${p.men} €) et de filles (${p.women} €) ci-dessous.`;
    }
    if (isBuggyActivity(activity.name)) {
      return "Indiquez le nombre de buggys 2 personnes / 4 personnes ci-dessous (prix selon grille interne).";
    }
    if (isCalecheActivity(activity.name)) {
      return `Maximum 1 adulte et 2 enfants par calèche — ${getCalecheUnitPrice(activity)} € / calèche (pas par personne). Le nombre de calèches augmente tout seul si le groupe est plus grand.`;
    }
    if (isMotoCrossActivity(activity.name)) {
      return "Sélectionnez le nombre de motos par modèle (prix affiché au total).";
    }
    if (isCairePrivatifActivity(activity.name) || isLouxorPrivatifActivity(activity.name)) {
      return "Choisissez la taille du groupe (4, 5 ou 6 personnes) — prix forfaitaire.";
    }
    if (isZeroTracasHorsZoneActivity(activity.name) || isZeroTracasActivity(activity.name)) {
      return `Indiquez le nombre de chaque prestation (même grille que sur le devis intranet). Les tarifs adulte/enfant ci-dessus ne s’appliquent pas à cette fiche.\nLa date est automatiquement fixée au jour d’arrivée.\n${ZERO_TRACAS_SIM_UNAVAILABLE_MESSAGE}`;
    }
    if (isPublicCatalogAirportStyleLine(activity)) {
      return "Forfait par trajet : choisissez aller simple ou aller-retour (comme sur le devis intranet). Les tarifs adulte/enfant en base ne s’appliquent pas.";
    }
    if (isDivingActivityName(activity.name)) {
      return `Un visiteur (accompagnant qui ne plonge pas) peut être ajouté : +${DIVING_VISITOR_UNIT_PRICE} € par personne.`;
    }
    if (isTurtleActivity(activity.name)) {
      return "Indiquez la pointure de chaque participant (pointure EU, ex. 42) — nécessaire pour les palmes.";
    }
    return "";
  }, [activity]);

  const bookingPriceCaption = useMemo(() => {
    if (!activity) return "";
    if (
      isPublicCatalogAirportStyleLine(activity) ||
      isZeroTracasHorsZoneActivity(activity.name) ||
      isZeroTracasActivity(activity.name)
    ) {
      return "Montant « à partir de » = plus petite option de la grille ; le total se met à jour selon vos choix.";
    }
    return "";
  }, [activity]);

  /** Dauphin OU une île — jamais les deux (aligné sur la grille tarifaire). */
  const speedBoatPackValue = useMemo(() => {
    if (special.extraDolphin) return "dolphin";
    const first = special.speedBoatExtra?.[0];
    if (first) return first;
    return "none";
  }, [special.extraDolphin, special.speedBoatExtra]);

  const applySpeedBoatPack = useCallback((value) => {
    setSpecial((s) => {
      if (value === "none") {
        return { ...s, extraDolphin: false, speedBoatExtra: [] };
      }
      if (value === "dolphin") {
        return { ...s, extraDolphin: true, speedBoatExtra: [] };
      }
      return { ...s, extraDolphin: false, speedBoatExtra: value ? [value] : [] };
    });
  }, []);

  useEffect(() => {
    if (!activity || !isSpeedBoatActivity(activity.name)) return;
    if (special.extraDolphin && (special.speedBoatExtra?.length ?? 0) > 0) {
      setSpecial((s) => ({ ...s, speedBoatExtra: [] }));
    }
  }, [activity, special.extraDolphin, special.speedBoatExtra]);

  useEffect(() => {
    if (!activity || !isSpeedBoatSunsetActivity(activity.name)) return;
    if ((special.speedBoatExtra?.length ?? 0) > 0 || special.extraDolphin) {
      setSpecial((s) => ({ ...s, speedBoatExtra: [], extraDolphin: false }));
    }
  }, [activity, special.speedBoatExtra, special.extraDolphin]);

  const specialPricingBeforeParticipants = useMemo(() => {
    if (!activity) return null;
    const name = activity.name || "";

    const speedBoatOptionClass = (active) =>
      [
        "flex cursor-pointer items-start gap-3 rounded-xl border-2 p-3.5 transition",
        active
          ? "border-catalog-lagoon bg-white shadow-catalog-card ring-2 ring-catalog-lagoon/15"
          : "border-catalog-line bg-white hover:border-catalog-lagoon/50",
      ].join(" ");

    if (isSpeedBoatActivity(name) && !isSpeedBoatSunsetActivity(name)) {
      const radioName = `hd-speedboat-pack-${activity.id}`;
      return (
        <div className="space-y-3 rounded-xl border border-transparent bg-catalog-lagoonSoft p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-catalog-ink">Options Speed Boat</p>
          <p className="text-[11px] font-medium leading-snug text-catalog-body">
            <strong>Un seul choix possible :</strong> soit l&apos;option dauphin, soit une île / formule — pas les deux.
          </p>
          <div className="max-h-[min(70vh,22rem)] space-y-2 overflow-y-auto pr-0.5" role="radiogroup" aria-label="Options Speed Boat">
            <label className={speedBoatOptionClass(speedBoatPackValue === "none")}>
              <input
                type="radio"
                name={radioName}
                value="none"
                checked={speedBoatPackValue === "none"}
                onChange={() => applySpeedBoatPack("none")}
                className="mt-0.5 h-[18px] w-[18px] shrink-0 cursor-pointer border-2 border-catalog-border accent-catalog-ocean focus:outline-none focus:ring-2 focus:ring-catalog-ocean focus:ring-offset-1"
              />
              <span className="text-sm font-semibold leading-snug text-catalog-ink">Aucune option (prix de base)</span>
            </label>
            <label className={speedBoatOptionClass(speedBoatPackValue === "dolphin")}>
              <input
                type="radio"
                name={radioName}
                value="dolphin"
                checked={speedBoatPackValue === "dolphin"}
                onChange={() => applySpeedBoatPack("dolphin")}
                className="mt-0.5 h-[18px] w-[18px] shrink-0 cursor-pointer border-2 border-catalog-border accent-catalog-ocean focus:outline-none focus:ring-2 focus:ring-catalog-ocean focus:ring-offset-1"
              />
              <span className="text-sm font-semibold leading-snug text-catalog-ink">
                Dauphin <span className="font-bold text-catalog-ocean">(+20 € pour la ligne)</span>
              </span>
            </label>
            {allowsSpeedBoatIslandExtras(name) &&
              getSpeedBoatIslandExtras().map((extra) => (
                <label key={extra.id} className={speedBoatOptionClass(speedBoatPackValue === extra.id)}>
                  <input
                    type="radio"
                    name={radioName}
                    value={extra.id}
                    checked={speedBoatPackValue === extra.id}
                    onChange={() => applySpeedBoatPack(extra.id)}
                    className="mt-0.5 h-[18px] w-[18px] shrink-0 cursor-pointer border-2 border-catalog-border accent-catalog-ocean focus:outline-none focus:ring-2 focus:ring-catalog-ocean focus:ring-offset-1"
                  />
                  <span className="text-sm leading-snug text-catalog-ink">
                    <span className="font-semibold">{extra.label}</span>{" "}
                    <span className="text-xs font-medium text-catalog-muted">
                      (+{extra.priceAdult} € / adulte · +{extra.priceChild} € / enfant)
                    </span>
                  </span>
                </label>
              ))}
          </div>
        </div>
      );
    }

    if (isBoatPartyActivity(name)) {
      const p = getBoatPartyPrices();
      return (
        <div className="grid grid-cols-2 gap-3 rounded-xl border border-cyan-200 bg-cyan-50/80 p-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-catalog-body">Garçons ({p.men} €)</label>
            <select
              className="w-full hdc-input !min-h-11 !rounded-xl !px-3 !py-2 text-sm"
              value={special.boatPartyMen}
              onChange={(e) => setSpecial((s) => ({ ...s, boatPartyMen: Number(e.target.value) }))}
            >
              {Array.from({ length: 21 }, (_, n) => n).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-catalog-body">Filles ({p.women} €)</label>
            <select
              className="w-full hdc-input !min-h-11 !rounded-xl !px-3 !py-2 text-sm"
              value={special.boatPartyWomen}
              onChange={(e) => setSpecial((s) => ({ ...s, boatPartyWomen: Number(e.target.value) }))}
            >
              {Array.from({ length: 21 }, (_, n) => n).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        </div>
      );
    }

    if (isBuggyActivity(name)) {
      return (
        <div className="grid grid-cols-2 gap-3 rounded-xl border border-transparent bg-catalog-brassSoft p-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-catalog-body">Buggy 2 personnes</label>
            <select
              className="w-full hdc-input !min-h-11 !rounded-xl !px-3 !py-2 text-sm"
              value={special.buggySimple}
              onChange={(e) => setSpecial((s) => ({ ...s, buggySimple: Number(e.target.value) }))}
            >
              {[0, 1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-catalog-body">Buggy 4 personnes</label>
            <select
              className="w-full hdc-input !min-h-11 !rounded-xl !px-3 !py-2 text-sm"
              value={special.buggyFamily}
              onChange={(e) => setSpecial((s) => ({ ...s, buggyFamily: Number(e.target.value) }))}
            >
              {[0, 1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        </div>
      );
    }

    if (isCalecheActivity(name)) {
      const needed = requiredCalecheCount(adults, minorsCount);
      const selected = Math.max(Number(special.calecheCount) || 0, needed);
      const choices = Array.from({ length: Math.max(10, needed) - needed + 1 }, (_, index) => needed + index);
      return (
        <div className="rounded-xl border border-transparent bg-catalog-brassSoft p-3">
          <label className="mb-1 block text-xs font-semibold text-catalog-body">
            Nombre de calèches ({getCalecheUnitPrice(activity)} € / u.)
          </label>
          <select
            className="w-full hdc-input !min-h-11 !rounded-xl !px-3 !py-2 text-sm"
            value={selected}
            onChange={(e) => {
              const picked = Number(e.target.value);
              if (picked < needed) {
                calecheManualRef.current = needed;
                setSpecial((s) => ({ ...s, calecheCount: needed }));
                setCalecheNotice(calecheCapacityNotice(needed));
                return;
              }
              calecheManualRef.current = picked;
              setCalecheNotice("");
              setSpecial((s) => ({ ...s, calecheCount: picked }));
            }}
          >
            {choices.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <p className="mt-2 text-xs font-medium leading-snug text-catalog-body">
            Maximum 1 adulte et 2 enfants par calèche.
          </p>
          {calecheNotice ? (
            <p className="mt-2 rounded-lg bg-white px-3 py-2 text-sm font-semibold leading-snug text-catalog-ink" role="status">
              {calecheNotice}
            </p>
          ) : null}
        </div>
      );
    }

    if (isMotoCrossActivity(name)) {
      return (
        <div className="grid grid-cols-3 gap-2 rounded-xl border border-transparent bg-catalog-lagoonSoft p-3">
          {[
            ["yamaha250", "Yamaha 250", special.yamaha250],
            ["ktm640", "KTM 640", special.ktm640],
            ["ktm530", "KTM 530", special.ktm530],
          ].map(([key, label, val]) => (
            <div key={key}>
              <label className="mb-1 block text-[10px] font-semibold text-catalog-body">{label}</label>
              <select
                className="w-full hdc-input !min-h-11 !rounded-xl !px-1.5 !py-2 text-xs"
                value={val}
                onChange={(e) =>
                  setSpecial((s) => ({ ...s, [key]: Number(e.target.value) }))
                }
              >
                {[0, 1, 2, 3].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      );
    }

    if (isCairePrivatifActivity(name)) {
      return (
        <div className="space-y-2 rounded-xl border border-transparent bg-catalog-lagoonSoft p-3">
          <p className="text-xs font-semibold text-catalog-body">Nombre de personnes (forfait)</p>
          <div className="flex flex-wrap gap-2">
            {[
              ["cairePrivatif4pax", "4 pers."],
              ["cairePrivatif5pax", "5 pers."],
              ["cairePrivatif6pax", "6 pers."],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() =>
                  setSpecial((s) => ({
                    ...s,
                    cairePrivatif4pax: key === "cairePrivatif4pax",
                    cairePrivatif5pax: key === "cairePrivatif5pax",
                    cairePrivatif6pax: key === "cairePrivatif6pax",
                  }))
                }
                className={`inline-flex min-h-11 items-center rounded-full px-4 text-sm font-bold transition-colors ${
                  special[key] ? "bg-catalog-raised text-white" : "bg-white text-catalog-body ring-1 ring-catalog-border"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      );
    }

    if (isLouxorPrivatifActivity(name)) {
      return (
        <div className="space-y-2 rounded-xl border border-catalog-line bg-catalog-lagoonSoft p-3">
          <p className="text-xs font-semibold text-catalog-body">Nombre de personnes (forfait)</p>
          <div className="flex flex-wrap gap-2">
            {[
              ["louxorPrivatif4pax", "4 pers."],
              ["louxorPrivatif5pax", "5 pers."],
              ["louxorPrivatif6pax", "6 pers."],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() =>
                  setSpecial((s) => ({
                    ...s,
                    louxorPrivatif4pax: key === "louxorPrivatif4pax",
                    louxorPrivatif5pax: key === "louxorPrivatif5pax",
                    louxorPrivatif6pax: key === "louxorPrivatif6pax",
                  }))
                }
                className={`inline-flex min-h-11 items-center rounded-full px-4 text-sm font-bold transition-colors ${
                  special[key] ? "bg-catalog-raised text-white" : "bg-white text-catalog-ink ring-1 ring-catalog-border"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      );
    }

    if (isZeroTracasHorsZoneActivity(name) || isZeroTracasActivity(name)) {
      const prices = isZeroTracasHorsZoneActivity(name) ? getZeroTracasHorsZonePrices() : getZeroTracasPrices();
      const rows = [
        { key: "zeroTracasTransfertVisaSim", label: "Transfert + visa + SIM", unit: prices.transfertVisaSim },
        { key: "zeroTracasTransfertVisa", label: "Transfert + visa", unit: prices.transfertVisa },
        { key: "zeroTracasTransfertSim", label: "Transfert + SIM", unit: prices.transfertSim },
        { key: "zeroTracasTransfert3Personnes", label: "Transfert 3 pers.", unit: prices.transfert3Personnes },
        { key: "zeroTracasTransfertPlus3Personnes", label: "Transfert +3 pers.", unit: prices.transfertPlus3Personnes },
        { key: "zeroTracasVisaSim", label: "Visa + SIM", unit: prices.visaSim },
        { key: "zeroTracasVisaSeul", label: "Visa seul", unit: prices.visaSeul },
      ];
      return (
        <div className="space-y-2 rounded-xl border border-catalog-line bg-catalog-bg p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-catalog-body">
            {isZeroTracasHorsZoneActivity(name) ? "Zero Tracas Hors zone" : "Zero Tracas"} — quantités
          </p>
          <p className="rounded-lg border border-transparent bg-catalog-brassSoft px-3 py-2 text-xs font-semibold text-catalog-ink">
            {ZERO_TRACAS_SIM_UNAVAILABLE_MESSAGE}
          </p>
          <div className="space-y-2">
            {rows.map(({ key, label, unit }) => {
              const simBlocked = isZeroTracasSimOptionKey(key);
              return (
                <div
                  key={key}
                  className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border border-catalog-line bg-white px-2 py-2 sm:flex-nowrap ${
                    simBlocked ? "opacity-55" : ""
                  }`}
                >
                  <span className="min-w-0 flex-1 text-xs font-semibold leading-snug text-catalog-body">
                    {label}
                    {simBlocked ? " — indisponible" : ""}
                  </span>
                  <span className="shrink-0 text-[10px] font-medium text-catalog-muted">{unit} € / u.</span>
                  <select
                    className={`w-16 shrink-0 rounded border border-catalog-border py-1.5 text-center text-sm font-semibold ${
                      simBlocked ? "cursor-not-allowed bg-catalog-bg opacity-60" : "bg-white"
                    }`}
                    value={simBlocked ? 0 : special[key]}
                    disabled={simBlocked}
                    onChange={(e) => {
                      if (simBlocked) return;
                      setSpecial((s) => ({ ...s, [key]: Math.max(0, Math.min(20, toNumber(e.target.value))) }));
                    }}
                    aria-label={`Quantité ${label}`}
                  >
                    {Array.from({ length: 21 }, (_, n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>
        </div>
      );
    }

    if (isPublicCatalogAirportStyleLine(activity)) {
      const probe = { adults: 1, children: 0, babies: 0 };
      const simpleP = computePublicCatalogLineTotal(activity, {
        ...probe,
        ...special,
        allerSimple: true,
        allerRetour: false,
      });
      const retourP = computePublicCatalogLineTotal(activity, {
        ...probe,
        ...special,
        allerSimple: false,
        allerRetour: true,
      });
      const radioName = `hd-airport-transfer-${activity.id}`;
      return (
        <div className="space-y-2 rounded-xl border border-transparent bg-catalog-lagoonSoft p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-catalog-ink">Type de trajet</p>
          <div className="space-y-2" role="radiogroup" aria-label="Transfert aller simple ou aller-retour">
            <label
              className={`flex cursor-pointer items-center gap-3 rounded-xl border-2 p-3 transition ${
                special.allerSimple
                  ? "border-catalog-lagoon bg-white shadow-catalog-card ring-2 ring-catalog-lagoon/15"
                  : "border-catalog-line bg-white/95 hover:border-catalog-ocean/80"
              }`}
            >
              <input
                type="radio"
                name={radioName}
                checked={special.allerSimple}
                onChange={() => setSpecial((s) => ({ ...s, allerSimple: true, allerRetour: false }))}
                className="h-[18px] w-[18px] shrink-0 accent-catalog-lagoon"
              />
              <span className="text-sm font-semibold text-catalog-ink">
                Aller simple <span className="text-catalog-ocean">({formatMoney(simpleP, activity.currency || "EUR")})</span>
              </span>
            </label>
            <label
              className={`flex cursor-pointer items-center gap-3 rounded-xl border-2 p-3 transition ${
                special.allerRetour
                  ? "border-catalog-lagoon bg-white shadow-catalog-card ring-2 ring-catalog-lagoon/15"
                  : "border-catalog-line bg-white/95 hover:border-catalog-ocean/80"
              }`}
            >
              <input
                type="radio"
                name={radioName}
                checked={special.allerRetour}
                onChange={() => setSpecial((s) => ({ ...s, allerSimple: false, allerRetour: true }))}
                className="h-[18px] w-[18px] shrink-0 accent-catalog-lagoon"
              />
              <span className="text-sm font-semibold text-catalog-ink">
                Aller-retour <span className="text-catalog-ocean">({formatMoney(retourP, activity.currency || "EUR")})</span>
              </span>
            </label>
          </div>
        </div>
      );
    }

    return null;
  }, [activity, adults, minorsCount, calecheNotice, special, speedBoatPackValue, applySpeedBoatPack]);

  const codedTotalPending = useMemo(() => {
    if (!activity) return false;
    const name = activity.name || "";
    if (lineTotal > 0) return false;
    if (isPublicCatalogAirportStyleLine(activity)) {
      return !special.allerSimple && !special.allerRetour;
    }
    if (isZeroTracasHorsZoneActivity(name) || isZeroTracasActivity(name)) {
      const zt =
        toNumber(special.zeroTracasTransfertVisa) +
        toNumber(special.zeroTracasTransfert3Personnes) +
        toNumber(special.zeroTracasTransfertPlus3Personnes) +
        toNumber(special.zeroTracasVisaSeul);
      return zt === 0;
    }
    if (isCairePrivatifActivity(name)) {
      return !special.cairePrivatif4pax && !special.cairePrivatif5pax && !special.cairePrivatif6pax;
    }
    if (isLouxorPrivatifActivity(name)) {
      return !special.louxorPrivatif4pax && !special.louxorPrivatif5pax && !special.louxorPrivatif6pax;
    }
    if (isBuggyActivity(name)) {
      return special.buggySimple === 0 && special.buggyFamily === 0;
    }
    if (isCalecheActivity(name)) {
      return special.calecheCount === 0;
    }
    if (isMotoCrossActivity(name)) {
      return special.yamaha250 + special.ktm640 + special.ktm530 === 0;
    }
    if (isBoatPartyActivity(name)) {
      return special.boatPartyMen + special.boatPartyWomen === 0;
    }
    return false;
  }, [activity, lineTotal, special]);

  const cover = getCategoryCover(categoryKey);
  const label = getCategoryLabel(categoryKey);
  const galleryBackgrounds = useMemo(
    () => [
      cover,
      "linear-gradient(160deg, #8FCFD1 0%, #0A6C74 60%, #0B1D26 100%)",
      "linear-gradient(160deg, #F4EBDC 0%, #D9B47A 55%, #7A5527 100%)",
      "linear-gradient(160deg, #F2A28C 0%, #C9452C 55%, #0B1D26 100%)",
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

  const canAddToCart =
    Boolean(date) &&
    !noDatesConfigured &&
    !codedTotalPending &&
    !stopDateSet.has(date) &&
    !(activity && isProgrammaticStopSale(activity, date)) &&
    hasEnoughParticipantsForActivity(activity?.name, { adults, children: minorsCount }) &&
    !exceedsSpeedBoatMaxParticipants(activity?.name, {
      adults,
      children: minorsCount,
      babies: 0,
    }) &&
    hasAllTurtleFinSizes(activity?.name, { adults, children: minorsCount, babies: 0 }, special.finSizes);

  const requiresMinTwo = requiresMinimumTwoParticipants(activity?.name);
  const needsMammaMiaNote = requiresMammaMiaSelfTransfer(activity?.name);
  const warnsRecommendedTwo = warnsRecommendedTwoParticipants(activity?.name);
  const participantsOk = hasEnoughParticipantsForActivity(activity?.name, {
    adults,
    children: minorsCount,
  });
  const belowRecommendedTwo = isBelowRecommendedTwoParticipants(activity?.name, {
    adults,
    children: minorsCount,
  });
  const isSpeedBoat = Boolean(activity && isSpeedBoatActivity(activity.name));
  const adultMax = isSpeedBoat ? SPEED_BOAT_MAX_PARTICIPANTS : 10;
  const minorMax = isSpeedBoat ? Math.max(0, SPEED_BOAT_MAX_PARTICIPANTS - adults) : 10;
  const speedBoatMaxMessage = isSpeedBoat ? getSpeedBoatMaxParticipantsMessage() : "";

  const handleSetAdults = useCallback(
    (n) => {
      const next = Math.max(1, Math.min(adultMax, Number(n) || 1));
      setAdults(next);
      if (isSpeedBoat && next + minorsCount > SPEED_BOAT_MAX_PARTICIPANTS) {
        setMinorsCount(Math.max(0, SPEED_BOAT_MAX_PARTICIPANTS - next));
      }
    },
    [adultMax, isSpeedBoat, minorsCount]
  );
  const showDateHint = !date && !noDatesConfigured;

  useEffect(() => {
    if (dateOptions.length === 0) {
      if (date) setDate("");
      return;
    }
    if (date && !dateOptions.some((o) => o.value === date)) setDate("");
  }, [date, dateOptions]);

  /** Zero Tracas : date = jour d’arrivée automatiquement. */
  useEffect(() => {
    if (!activity || !isArrivalDayServiceActivity(activity.name)) return;
    const arrival = String(stay.arrivalDate || "").trim();
    if (!arrival) return;
    if (!dateOptions.some((o) => o.value === arrival)) return;
    if (date !== arrival) setDate(arrival);
  }, [activity, stay.arrivalDate, date, dateOptions]);

  useEffect(() => {
    function onStayEvent(e) {
      const next = e?.detail || loadPublicCatalogueStay();
      setStay(next);
      if (isValidCatalogueStay(next)) setStayModalOpen(false);
    }
    window.addEventListener(PUBLIC_CATALOGUE_STAY_EVENT, onStayEvent);
    return () => window.removeEventListener(PUBLIC_CATALOGUE_STAY_EVENT, onStayEvent);
  }, []);

  /** Stop sales / push sales pour colorer et bloquer le calendrier public. */
  useEffect(() => {
    let cancelled = false;

    async function loadSales() {
      if (!supabase || !__SUPABASE_DEBUG__.isConfigured || !activity?.id) {
        setStopDateSet(new Set());
        setPushDateSet(new Set());
        return;
      }

      const activityIds = new Set(
        [activity.id, activity.supabase_id].filter(Boolean).map((id) => String(id))
      );
      const today = getLocalDateKey();

      try {
        const [stopRes, pushRes] = await Promise.all([
          supabase
            .from("stop_sales")
            .select("activity_id, date")
            .eq("site_key", SITE_KEY)
            .gte("date", today),
          supabase
            .from("push_sales")
            .select("activity_id, date")
            .eq("site_key", SITE_KEY)
            .gte("date", today),
        ]);

        if (cancelled) return;

        if (stopRes.error) {
          logger.warn("PublicCatalogueActivityPage : stop_sales", stopRes.error);
        }
        if (pushRes.error) {
          logger.warn("PublicCatalogueActivityPage : push_sales", pushRes.error);
        }

        const stops = new Set();
        for (const row of stopRes.data || []) {
          if (!activityIds.has(String(row.activity_id || ""))) continue;
          if (row.date && String(row.date) >= today) stops.add(String(row.date));
        }

        const pushes = new Set();
        for (const row of pushRes.data || []) {
          if (!activityIds.has(String(row.activity_id || ""))) continue;
          const d = String(row.date || "");
          if (!d || isPushSaleExpired(d)) continue;
          pushes.add(d);
        }

        setStopDateSet(stops);
        setPushDateSet(pushes);
      } catch (err) {
        logger.error("PublicCatalogueActivityPage loadSales:", err);
        if (!cancelled) {
          setStopDateSet(new Set());
          setPushDateSet(new Set());
        }
      }
    }

    void loadSales();
    return () => {
      cancelled = true;
    };
  }, [activity?.id, activity?.supabase_id]);

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
        } else if (data.catalog_paused === true) {
          setLoadError("Cette activité n'est temporairement plus disponible dans le catalogue.");
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

  const onCarouselScroll = useCallback(() => {
    const el = carouselRef.current;
    if (!el) return;
    const w = el.offsetWidth;
    if (w <= 0) return;
    const i = Math.round(el.scrollLeft / w);
    setGalleryIndex(Math.min(Math.max(i, 0), gallerySlides.length - 1));
  }, [gallerySlides.length]);

  const openLightboxAt = useCallback(
    (index) => {
      if (!catalogUrls.length) return;
      const safe = Math.max(0, Math.min(index, catalogUrls.length - 1));
      setLightboxIndex(safe);
      setLightboxOpen(true);
    },
    [catalogUrls]
  );

  const closeLightbox = useCallback(() => {
    setLightboxOpen(false);
  }, []);

  function appendToCartAndReturn() {
    if (!activity || !date) return;
    if (stopDateSet.has(date) || isProgrammaticStopSale(activity, date)) {
      return;
    }
    if (
      !hasEnoughParticipantsForActivity(activity.name, {
        adults,
        children: minorsCount,
      })
    ) {
      return;
    }
    if (
      exceedsSpeedBoatMaxParticipants(activity.name, {
        adults,
        children: minorsCount,
        babies: 0,
      })
    ) {
      return;
    }
    if (
      !hasAllTurtleFinSizes(activity.name, { adults, children: minorsCount, babies: 0 }, special.finSizes)
    ) {
      return;
    }
    const minors = Math.max(0, toNumber(minorsCount));
    const adultCount = Math.max(0, toNumber(adults));
    const prev = loadPublicCatalogueCart();
    const lineSpecial = clearZeroTracasSimQuantities(special);
    if (isCalecheActivity(activity.name)) {
      lineSpecial.calecheCount = Math.max(
        Number(lineSpecial.calecheCount) || 0,
        requiredCalecheCount(adultCount, minors)
      );
    }
    const line = {
      id: `${activity.id}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      activityId: String(activity.id),
      date,
      adults: adultCount,
      minorsCount: minors,
      birthDates: Array.from({ length: minors }, () => ""),
      // Provisoire jusqu’à classification au checkout
      children: minors,
      babies: 0,
      ...lineSpecial,
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

  const bookingRef = useRef(null);
  const [bookingInView, setBookingInView] = useState(false);
  useEffect(() => {
    const el = bookingRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return undefined;
    const observer = new IntersectionObserver(([entry]) => setBookingInView(entry.isIntersecting), {
      rootMargin: "0px 0px -15% 0px",
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [activity?.id, loading]);

  function scrollToBooking() {
    const el = bookingRef.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  }

  if (loading) {
    return (
      <PublicAppShell title="Activité" wide="xl" revealKey="loading">
        <ActivityPageSkeleton />
      </PublicAppShell>
    );
  }

  if (loadError || !activity) {
    return (
      <PublicAppShell title="Activité" wide="xl" revealKey="missing">
        <div className="mx-auto max-w-lg px-4 py-10">
          <StateCard
            tone="error"
            title={loadError || "Activité introuvable"}
            action={
              <Link to="/catalogue" data-press className="hdc-btn hdc-btn-ink">
                Voir le catalogue
              </Link>
            }
          >
            Elle a peut-être été retirée. Découvrez nos autres expériences.
          </StateCard>
        </div>
      </PublicAppShell>
    );
  }

  const fromLabel =
    headerPriceHint != null && headerPriceHint > 0 ? formatMoney(headerPriceHint, activity.currency || "EUR") : null;

  return (
    <PublicAppShell title={displayActivityName(activity.name)} wide="xl" revealKey={activity.id}>
      <main className="relative z-10 pb-32 lg:pb-28">
        {/* ——— Galerie mobile (cible du vol photo depuis le catalogue) ——— */}
        <div className="px-4 md:hidden">
          <div data-hero-media className="relative h-[clamp(340px,52vh,520px)] overflow-hidden rounded-[1.25rem] bg-catalog-mist">
            <div
              ref={carouselRef}
              onScroll={onCarouselScroll}
              className="scrollbar-hide flex h-full snap-x snap-mandatory gap-0 overflow-x-auto"
            >
              {gallerySlides.map((slide, i) => (
                <div key={i} data-hero-img={i === 0 ? "" : undefined} className="relative h-full min-w-full shrink-0 snap-center overflow-hidden bg-catalog-mist">
                  {slide.kind === "image" ? (
                    <button type="button" onClick={() => openLightboxAt(i)} className="block h-full w-full" aria-label="Agrandir la photo">
                      <div data-kenburns className="h-full w-full">
                        <CatalogPhotoFrame src={slide.url} />
                      </div>
                    </button>
                  ) : (
                    <div className="h-full w-full bg-catalog-lagoonSoft" />
                  )}
                </div>
              ))}
            </div>
            {gallerySlides.length > 1 ? (
              <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-white/80 px-2.5 py-1.5">
                {gallerySlides.map((_, i) => (
                  <span key={i} className={`h-1.5 rounded-full transition-all duration-300 ${i === galleryIndex ? "w-4 bg-catalog-ink" : "w-1.5 bg-catalog-ink/30"}`} />
                ))}
              </div>
            ) : null}
            <button
              type="button"
              data-press
              onClick={() => void sharePage()}
              className="absolute right-3 top-3 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white/90 text-catalog-ink"
              aria-label="Partager"
            >
              <IconShare className="h-5 w-5" />
            </button>
          </div>
          <p data-reveal="item" className="hdc-eyebrow mt-5">{label}</p>
          <h1 data-split className="mt-1.5 font-catalog-display text-[2rem] leading-[1.1] text-catalog-ink">
            {displayActivityName(activity.name)}
          </h1>
          {fromLabel ? (
            <p data-reveal="item" className="mt-2 text-sm text-catalog-muted">
              À partir de <span className="font-semibold text-catalog-ink">{fromLabel}</span>
            </p>
          ) : null}
        </div>

        {/* ——— Titre desktop ——— */}
        <div className="mx-auto hidden max-w-7xl px-4 pt-4 sm:px-6 md:block lg:px-8">
          <p className="hdc-eyebrow">{label}</p>
          <h1 data-split className="mt-1.5 font-catalog-display text-[2.25rem] leading-[1.1] text-catalog-ink">{displayActivityName(activity.name)}</h1>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm">
            <div className="flex items-center gap-1.5 text-sm text-catalog-muted">
              <IconMapPin className="h-4 w-4 text-catalog-lagoon" />
              <span>Hurghada · Mer Rouge</span>
            </div>
            <button type="button" data-press onClick={() => void sharePage()} className="hdc-btn hdc-btn-ghost !min-h-11 text-sm">
              <IconShare className="h-4 w-4" />
              Partager
            </button>
          </div>
        </div>

        <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 md:pt-8 lg:px-8">
          <div className="grid gap-8 lg:grid-cols-3 lg:items-start">
            <div className="space-y-8 lg:col-span-2">
              {/* Galerie desktop */}
              <div data-reveal="item" className="hidden overflow-hidden rounded-[1.25rem] md:block">
                <div className="grid gap-2 sm:grid-cols-[2fr_1fr]">
                  <button
                    type="button"
                    onClick={() => openLightboxAt(0)}
                    className="relative aspect-[16/11] w-full overflow-hidden bg-catalog-raised"
                    aria-label="Agrandir la photo 1"
                  >
                    {catalogUrls[0] ? (
                      <CatalogPhotoFrame src={catalogUrls[0]} imgClassName="transition duration-500 hover:scale-[1.02]" />
                    ) : (
                      <div className="h-full w-full" style={{ background: galleryBackgrounds[0] }} />
                    )}
                  </button>
                  <div className="grid grid-rows-2 gap-2">
                    <button
                      type="button"
                      onClick={() => openLightboxAt(1)}
                      className="relative min-h-0 overflow-hidden bg-catalog-raised"
                      aria-label="Agrandir la photo 2"
                    >
                      {catalogUrls[1] ? (
                        <CatalogPhotoFrame src={catalogUrls[1]} imgClassName="transition duration-500 hover:scale-[1.02]" />
                      ) : (
                        <div className="h-full w-full" style={{ background: galleryBackgrounds[1] }} />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => openLightboxAt(Math.min(2, Math.max(0, catalogUrls.length - 1)))}
                      className="relative min-h-0 overflow-hidden bg-catalog-raised"
                      aria-label="Agrandir la photo 3"
                    >
                      {catalogUrls[2] ? (
                        <CatalogPhotoFrame src={catalogUrls[2]} imgClassName="transition duration-500 hover:scale-[1.02]" />
                      ) : (
                        <div className="h-full w-full" style={{ background: galleryBackgrounds[2] }} />
                      )}
                      {catalogUrls.length > 3 ? (
                        <div className="absolute inset-0 flex items-center justify-center bg-catalog-ink/55">
                          <span className="flex items-center gap-2 text-base font-semibold text-white">
                            <IconImages className="h-5 w-5" />+{catalogUrls.length - 3} photo{catalogUrls.length - 3 > 1 ? "s" : ""}
                          </span>
                        </div>
                      ) : catalogUrls.length === 0 ? (
                        <div className="absolute inset-0 flex items-center justify-center bg-catalog-ink/55">
                          <span className="flex items-center gap-2 text-base font-semibold text-white">
                            <IconImages className="h-5 w-5" />
                            Voir toutes les photos
                          </span>
                        </div>
                      ) : null}
                    </button>
                  </div>
                </div>
              </div>

              {catalogProse ? (
                <section data-reveal="item">
                  <p className="hdc-eyebrow">L’expérience</p>
                  <p className="mt-3 whitespace-pre-line text-[0.9375rem] leading-[1.75] text-catalog-body sm:text-base">{catalogProse}</p>
                </section>
              ) : null}

              {needsMammaMiaNote ? (
                <section
                  data-reveal="item"
                  className="rounded-2xl bg-catalog-brassSoft px-4 py-3.5 text-sm font-semibold leading-relaxed text-catalog-ink"
                  role="note"
                >
                  {buildMammaMiaSelfTransferNote([activity.name])}
                </section>
              ) : null}

              {bulletPoints.length > 0 ? (
                <section data-reveal="item">
                  <p className="hdc-eyebrow">On aime</p>
                  <h2 className="mt-1.5 font-catalog-display text-[1.5rem] leading-tight">Points forts</h2>
                  <ul className="mt-4 divide-y divide-catalog-line overflow-hidden rounded-[1.4rem] bg-white ring-1 ring-catalog-line">
                    {bulletPoints.map((item) => (
                      <li key={item} className="flex items-start gap-3 px-4 py-3.5 text-sm font-semibold text-catalog-body md:text-base">
                        <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-catalog-sand" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              <section data-reveal="item" className="rounded-[1.4rem] bg-catalog-lagoonSoft p-5">
                <p className="hdc-eyebrow">Bon à savoir</p>
                <h2 className="mt-1.5 font-catalog-display text-[1.375rem] leading-tight">Informations</h2>
                <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-catalog-body">{informationsBody}</p>
              </section>
            </div>

            {/* Réservation desktop */}
            <div className="hidden lg:col-span-1 lg:block">
              <div className="hdc-card lg:p-6">
                <BookingCardShell
                  activity={activity}
                  adults={adults}
                  setAdults={handleSetAdults}
                  minorsCount={minorsCount}
                  setMinorsCount={setMinorsCount}
                  visitorCount={visitorCount}
                  setVisitorCount={setVisitorCount}
                  showVisitors={isDivingActivity}
                  showFinSizes={isTurtle}
                  finSizes={special.finSizes || []}
                  setFinSizes={setFinSizes}
                  date={date}
                  setDate={setDate}
                  normalizedDays={normalizedAvailableDays}
                  stopDateSet={stopDateSet}
                  pushDateSet={pushDateSet}
                  stayArrivalDate={stay.arrivalDate}
                  stayDepartureDate={stay.departureDate}
                  lineTotal={lineTotal}
                  canAdd={canAddToCart}
                  onAdd={appendToCartAndReturn}
                  dateError={showDateHint}
                  daysSummary={daysSummary}
                  noDatesConfigured={noDatesConfigured}
                  headerPrice={headerPriceHint}
                  replaceParticipantPricingLines={bookingReplaceChildBaby}
                  childrenBeforeParticipants={specialPricingBeforeParticipants}
                  codedTotalPending={codedTotalPending}
                  babiesForbidden={babiesForbidden}
                  priceCaption={bookingPriceCaption}
                  requiresMinTwo={requiresMinTwo}
                  participantsOk={participantsOk}
                  warnsRecommendedTwo={warnsRecommendedTwo}
                  belowRecommendedTwo={belowRecommendedTwo}
                  adultMax={adultMax}
                  minorMax={minorMax}
                  speedBoatMaxMessage={speedBoatMaxMessage}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Réservation mobile */}
        <div
          id="disponibilites"
          ref={bookingRef}
          className="mx-auto w-full max-w-7xl scroll-mt-[calc(max(0.35rem,env(safe-area-inset-top))+4rem)] px-4 pt-8 sm:px-6 lg:hidden lg:px-8"
        >
          <div data-reveal="item" className="hdc-card overflow-hidden">
            <div className="relative border-b border-catalog-line px-5 pb-4 pt-5">
              <p className="hdc-eyebrow relative">Réservation</p>
              <h2 className="relative mt-1.5 font-catalog-display text-[1.5rem] leading-tight text-catalog-ink">
                Date, voyageurs <span className="hdc-serif">& options</span>
              </h2>
            </div>
            <div className="p-4">
              <BookingCardShell
                activity={activity}
                adults={adults}
                setAdults={handleSetAdults}
                minorsCount={minorsCount}
                setMinorsCount={setMinorsCount}
                visitorCount={visitorCount}
                setVisitorCount={setVisitorCount}
                showVisitors={isDivingActivity}
                showFinSizes={isTurtle}
                finSizes={special.finSizes || []}
                setFinSizes={setFinSizes}
                date={date}
                setDate={setDate}
                normalizedDays={normalizedAvailableDays}
                stopDateSet={stopDateSet}
                pushDateSet={pushDateSet}
                stayArrivalDate={stay.arrivalDate}
                stayDepartureDate={stay.departureDate}
                lineTotal={lineTotal}
                canAdd={canAddToCart}
                onAdd={appendToCartAndReturn}
                dateError={showDateHint}
                daysSummary={daysSummary}
                noDatesConfigured={noDatesConfigured}
                headerPrice={headerPriceHint}
                replaceParticipantPricingLines={bookingReplaceChildBaby}
                childrenBeforeParticipants={specialPricingBeforeParticipants}
                codedTotalPending={codedTotalPending}
                babiesForbidden={babiesForbidden}
                priceCaption={bookingPriceCaption}
                requiresMinTwo={requiresMinTwo}
                participantsOk={participantsOk}
                warnsRecommendedTwo={warnsRecommendedTwo}
                belowRecommendedTwo={belowRecommendedTwo}
                adultMax={adultMax}
                minorMax={minorMax}
                speedBoatMaxMessage={speedBoatMaxMessage}
              />
            </div>
          </div>
        </div>
      </main>

      <WhatsAppFab href={AGENCY_WHATSAPP_URL} label="WhatsApp" className="hidden lg:flex" />

      {!bookingInView && !stayModalOpen && !lightboxOpen ? (
        <div className="hdc-cart-bar fixed inset-x-0 bottom-0 z-40 border-t border-catalog-line bg-white/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-md lg:hidden">
          <div className="mx-auto flex max-w-lg items-center gap-3">
            <div className="min-w-0 flex-1">
              <span className="block text-[0.6875rem] font-medium uppercase tracking-[0.12em] text-catalog-muted">
                {fromLabel ? "À partir de" : "Tarif"}
              </span>
              <span className={`block truncate font-semibold leading-tight tabular-nums ${fromLabel ? "text-lg text-catalog-ink" : "text-base text-catalog-brass"}`}>
                {fromLabel || "Sur devis"}
              </span>
            </div>
            <a
              href={AGENCY_WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              data-press
              aria-label="Écrire sur WhatsApp"
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white ring-1 ring-catalog-border"
            >
              <WhatsAppGlyph className="h-5 w-5 text-[#1F8F55]" />
            </a>
            <button type="button" data-press onClick={scrollToBooking} className="hdc-btn hdc-btn-primary shrink-0">
              Choisir ma date
            </button>
          </div>
        </div>
      ) : null}

      <CatalogPhotoLightbox
        open={lightboxOpen}
        images={catalogUrls}
        index={lightboxIndex}
        onIndexChange={setLightboxIndex}
        onClose={closeLightbox}
        altPrefix={activity?.name || "Activité"}
      />

      <CatalogueStayGateModal
        open={stayModalOpen}
        initialStay={stay}
        allowDismiss={false}
        onSaved={(next) => {
          setStay(next);
          setStayModalOpen(false);
        }}
      />
    </PublicAppShell>
  );
}
