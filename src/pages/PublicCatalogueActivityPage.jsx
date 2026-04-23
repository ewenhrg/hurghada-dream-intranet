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
import {
  getActivityPublicProse,
  isBuggyActivity,
  isCairePrivatifActivity,
  isLouxorPrivatifActivity,
  isMotoCrossActivity,
  isSpeedBoatActivity,
  proseFromActivityNotes,
} from "../utils/activityHelpers";
import { computePublicCatalogLineTotal, getPublicCatalogListFromPrice } from "../utils/publicCatalogPricing";
import { SPEED_BOAT_EXTRAS } from "../constants/activityExtras";

/** `*` : toutes les colonnes présentes en base (évite erreur si une migration manque encore). */
const ACTIVITY_COLUMNS_BASE = "*";
const ACTIVITY_COLUMNS_FULL = "*";


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
    desert: "linear-gradient(145deg, rgba(251,191,36,0.98) 0%, rgba(217,119,6,0.92) 45%, rgba(180,83,9,0.88) 100%)",
    aquatique: "linear-gradient(145deg, rgba(34,211,238,0.95) 0%, rgba(6,182,212,0.92) 50%, rgba(8,145,178,0.9) 100%)",
    exploration_bien_etre: "linear-gradient(145deg, rgba(52,211,153,0.96) 0%, rgba(16,185,129,0.92) 50%, rgba(5,150,105,0.9) 100%)",
    luxor_caire: "linear-gradient(145deg, rgba(165,180,252,0.98) 0%, rgba(99,102,241,0.94) 45%, rgba(67,56,202,0.9) 100%)",
    marsa_alam: "linear-gradient(145deg, rgba(251,113,133,0.96) 0%, rgba(244,63,94,0.92) 50%, rgba(190,18,60,0.88) 100%)",
    transfert: "linear-gradient(145deg, rgba(100,116,139,0.96) 0%, rgba(51,65,85,0.94) 50%, rgba(15,23,42,0.92) 100%)",
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
        <Icon className="h-5 w-5 text-teal-800" />
      </span>
      <IconChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-catalog-muted" />
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
        className="w-full appearance-none rounded-xl border-2 border-slate-300 bg-white py-3 pl-12 pr-10 text-sm font-semibold text-catalog-body transition-colors hover:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-500/30"
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
  headerPrice,
  priceCaption,
  replaceParticipantPricingLines,
  childrenBeforeParticipants,
  codedTotalPending = false,
  babiesForbidden = false,
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
      <div className="border-b border-slate-200/90 pb-3 md:pb-4">
        <p className="mb-1 text-xs font-bold text-catalog-muted">À partir de (adulte)</p>
        <div className="flex items-baseline gap-2">
          <span className="font-catalog-display text-xl font-semibold text-catalog-ink tabular-nums md:text-2xl">
            {showSurDevisHeader ? (
              <span className="text-base font-semibold text-amber-800">Tarif sur devis</span>
            ) : (
              formatMoney(resolvedHeader, currency)
            )}
          </span>
        </div>
        {priceCaption ? <p className="mt-1 text-xs font-semibold text-catalog-muted">{priceCaption}</p> : null}
        {replaceParticipantPricingLines ? (
          <p className="mt-2 whitespace-pre-line text-xs leading-relaxed text-slate-800">{replaceParticipantPricingLines}</p>
        ) : babiesForbidden ? (
          <div className="mt-2 space-y-0.5 text-xs font-medium text-slate-800">
            <p>
              Enfant{ageChild ? ` (${ageChild})` : ""} : {formatMoney(activity.price_child, currency)}
            </p>
            <p className="font-semibold text-amber-900">Bébé : interdit sur cette activité</p>
          </div>
        ) : (
        <div className="mt-2 space-y-0.5 text-xs font-medium text-slate-800">
          <p>
            Enfant{ageChild ? ` (${ageChild})` : ""} : {formatMoney(activity.price_child, currency)}
          </p>
          <p>
            Bébé{ageBaby ? ` (${ageBaby})` : ""} :{" "}
            {babyPriceZero ? "gratuit ou selon grille applicable" : formatMoney(activity.price_baby, currency)}
          </p>
        </div>
        )}
      </div>

      {childrenBeforeParticipants}

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
        {ageChild ? <p className="mt-1.5 text-xs font-medium text-slate-700">Tranche d&apos;âge : {ageChild}</p> : null}
      </div>
      {babiesForbidden ? (
        <div className="rounded-xl border border-amber-200/90 bg-amber-50/90 px-4 py-3 text-center">
          <p className="text-sm font-semibold text-amber-950">Interdit aux bébés</p>
          <p className="mt-1 text-xs font-medium text-amber-900/90">Cette excursion n&apos;accepte pas les tout-petits.</p>
        </div>
      ) : (
        <div>
          <ParticipantSelect
            Icon={IconUsers}
            label="bébé"
            value={babies}
            onChange={setBabies}
            min={0}
            max={10}
          />
          {ageBaby ? <p className="mt-1.5 text-xs font-medium text-slate-700">Tranche d&apos;âge : {ageBaby}</p> : null}
        </div>
      )}

      {!babiesForbidden && babyPriceZero ? (
        <p className="text-xs text-green-700">Tarif bébé à 0 € — les bébés ne sont pas facturés sur ce tarif.</p>
      ) : null}

      {daysSummary ? <p className="text-xs font-medium text-slate-700">Jours ouverts : {daysSummary}</p> : null}

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
          <span className="text-base font-semibold text-slate-900">Total</span>
          <span className="text-xl font-bold text-gray-900">
            {codedTotalPending && toNumber(lineTotal) <= 0 ? (
              <span className="text-base font-semibold text-amber-800">Sélectionnez les options</span>
            ) : (
              formatMoney(lineTotal, currency)
            )}
          </span>
        </div>
        <button
          type="button"
          disabled={!canAdd}
          onClick={onAdd}
          className="inline-flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-teal-700 to-teal-600 px-3 py-2.5 text-sm font-semibold text-white shadow-md shadow-teal-900/15 transition hover:from-teal-800 hover:to-teal-700 disabled:cursor-not-allowed disabled:opacity-75 md:py-3 md:text-base"
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
  /** Options tarif codé (même logique que le devis interne) — Speed Boat, Buggy, Moto, privatifs. */
  const [special, setSpecial] = useState({
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
  });

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

  const babiesForbidden = Boolean(activity?.babies_forbidden);

  useEffect(() => {
    if (babiesForbidden) setBabyCount(0);
  }, [babiesForbidden, activity?.id]);

  useEffect(() => {
    setSpecial({
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
    });
  }, [activityId]);

  const listFromPrice = useMemo(() => (activity ? getPublicCatalogListFromPrice(activity) : null), [activity]);

  const headerPriceHint = useMemo(() => {
    if (!activity) return null;
    return listFromPrice?.amount ?? (toNumber(activity.price_adult) > 0 ? toNumber(activity.price_adult) : null);
  }, [activity, listFromPrice]);

  const pricingLine = useMemo(
    () => ({
      adults,
      children: childCount,
      babies: babyCount,
      ...special,
    }),
    [adults, childCount, babyCount, special]
  );

  const lineTotal = useMemo(
    () => (activity ? computePublicCatalogLineTotal(activity, pricingLine) : 0),
    [activity, pricingLine]
  );

  const bookingReplaceChildBaby = useMemo(() => {
    if (!activity) return "";
    if (isSpeedBoatActivity(activity.name)) {
      return [
        "Grille Speed Boat : base 145 € pour 1–2 adultes, +20 € par adulte au-delà de 2, +10 € par enfant.",
        "Une seule option payante au choix : dauphin (+20 €) ou une île / formule (baie, lunch…).",
      ].join("\n");
    }
    if (isBuggyActivity(activity.name)) {
      return "Indiquez le nombre de buggys 2 personnes / 4 personnes ci-dessous (prix selon grille interne).";
    }
    if (isMotoCrossActivity(activity.name)) {
      return "Sélectionnez le nombre de motos par modèle (prix affiché au total).";
    }
    if (isCairePrivatifActivity(activity.name) || isLouxorPrivatifActivity(activity.name)) {
      return "Choisissez la taille du groupe (4, 5 ou 6 personnes) — prix forfaitaire.";
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

  const specialPricingBeforeParticipants = useMemo(() => {
    if (!activity) return null;
    const name = activity.name || "";

    const speedBoatOptionClass = (active) =>
      [
        "flex cursor-pointer items-start gap-3 rounded-xl border-2 p-3.5 transition",
        active
          ? "border-teal-600 bg-white shadow-md ring-2 ring-teal-400/50"
          : "border-slate-200/90 bg-white/95 hover:border-teal-400/80 hover:shadow-sm",
      ].join(" ");

    if (isSpeedBoatActivity(name)) {
      const radioName = `hd-speedboat-pack-${activity.id}`;
      return (
        <div className="space-y-3 rounded-xl border border-teal-200/80 bg-teal-50/80 p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-teal-900">Options Speed Boat</p>
          <p className="text-[11px] font-medium leading-snug text-teal-950/90">
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
                className="mt-0.5 h-[18px] w-[18px] shrink-0 cursor-pointer border-2 border-slate-400 accent-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-1"
              />
              <span className="text-sm font-semibold leading-snug text-slate-900">Aucune option (prix de base)</span>
            </label>
            <label className={speedBoatOptionClass(speedBoatPackValue === "dolphin")}>
              <input
                type="radio"
                name={radioName}
                value="dolphin"
                checked={speedBoatPackValue === "dolphin"}
                onChange={() => applySpeedBoatPack("dolphin")}
                className="mt-0.5 h-[18px] w-[18px] shrink-0 cursor-pointer border-2 border-slate-400 accent-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-1"
              />
              <span className="text-sm font-semibold leading-snug text-slate-900">
                Dauphin <span className="font-bold text-teal-800">(+20 € pour la ligne)</span>
              </span>
            </label>
            {SPEED_BOAT_EXTRAS.filter((e) => e.id).map((extra) => (
              <label key={extra.id} className={speedBoatOptionClass(speedBoatPackValue === extra.id)}>
                <input
                  type="radio"
                  name={radioName}
                  value={extra.id}
                  checked={speedBoatPackValue === extra.id}
                  onChange={() => applySpeedBoatPack(extra.id)}
                  className="mt-0.5 h-[18px] w-[18px] shrink-0 cursor-pointer border-2 border-slate-400 accent-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-1"
                />
                <span className="text-sm leading-snug text-slate-900">
                  <span className="font-semibold">{extra.label}</span>{" "}
                  <span className="text-xs font-medium text-slate-700">
                    (+{extra.priceAdult} € / adulte · +{extra.priceChild} € / enfant)
                  </span>
                </span>
              </label>
            ))}
          </div>
        </div>
      );
    }

    if (isBuggyActivity(name)) {
      return (
        <div className="grid grid-cols-2 gap-3 rounded-xl border border-amber-200 bg-amber-50/80 p-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-700">Buggy 2 personnes</label>
            <select
              className="w-full rounded-lg border border-gray-300 bg-white px-2 py-2 text-sm"
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
            <label className="mb-1 block text-xs font-semibold text-gray-700">Buggy 4 personnes</label>
            <select
              className="w-full rounded-lg border border-gray-300 bg-white px-2 py-2 text-sm"
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

    if (isMotoCrossActivity(name)) {
      return (
        <div className="grid grid-cols-3 gap-2 rounded-xl border border-violet-200 bg-violet-50/80 p-3">
          {[
            ["yamaha250", "Yamaha 250", special.yamaha250],
            ["ktm640", "KTM 640", special.ktm640],
            ["ktm530", "KTM 530", special.ktm530],
          ].map(([key, label, val]) => (
            <div key={key}>
              <label className="mb-1 block text-[10px] font-semibold text-gray-700">{label}</label>
              <select
                className="w-full rounded-lg border border-gray-300 bg-white px-1 py-2 text-xs"
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
        <div className="space-y-2 rounded-xl border border-sky-200 bg-sky-50/80 p-3">
          <p className="text-xs font-semibold text-gray-800">Nombre de personnes (forfait)</p>
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
                className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                  special[key] ? "bg-sky-600 text-white" : "bg-white text-gray-700 ring-1 ring-gray-200"
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
        <div className="space-y-2 rounded-xl border border-indigo-200 bg-indigo-50/80 p-3">
          <p className="text-xs font-semibold text-gray-800">Nombre de personnes (forfait)</p>
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
                className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                  special[key] ? "bg-indigo-600 text-white" : "bg-white text-gray-700 ring-1 ring-gray-200"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      );
    }

    return null;
  }, [activity, special, speedBoatPackValue, applySpeedBoatPack]);

  const codedTotalPending = useMemo(() => {
    if (!activity) return false;
    const name = activity.name || "";
    if (lineTotal > 0) return false;
    if (isCairePrivatifActivity(name)) {
      return !special.cairePrivatif4pax && !special.cairePrivatif5pax && !special.cairePrivatif6pax;
    }
    if (isLouxorPrivatifActivity(name)) {
      return !special.louxorPrivatif4pax && !special.louxorPrivatif5pax && !special.louxorPrivatif6pax;
    }
    if (isBuggyActivity(name)) {
      return special.buggySimple === 0 && special.buggyFamily === 0;
    }
    if (isMotoCrossActivity(name)) {
      return special.yamaha250 + special.ktm640 + special.ktm530 === 0;
    }
    return false;
  }, [activity, lineTotal, special]);

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

  const canAddToCart = Boolean(date) && !noDatesConfigured && !codedTotalPending;
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
      ...special,
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
      <div className="hd-public-catalog flex min-h-screen flex-col items-center justify-center bg-[#f3efe4] font-catalog-sans text-catalog-body animate-catalog-in-fade opacity-0 motion-reduce:animate-none motion-reduce:opacity-100">
        <div className="h-12 w-12 animate-spin rounded-full border-[3px] border-teal-200 border-t-teal-800" aria-hidden />
        <p className="mt-5 font-catalog-display text-base font-semibold text-catalog-ink">Chargement de l’activité…</p>
      </div>
    );
  }

  if (loadError || !activity) {
    return (
      <div className="hd-public-catalog min-h-screen bg-[#f3efe4] px-4 py-20 text-center font-catalog-sans text-catalog-body animate-catalog-in-fade opacity-0 motion-reduce:animate-none motion-reduce:opacity-100">
        <p className="font-catalog-display text-lg font-semibold text-catalog-ink">{loadError || "Activité introuvable."}</p>
        <Link
          to="/catalogue"
          className="mt-8 inline-flex items-center rounded-2xl bg-gradient-to-r from-[#022c22] via-teal-900 to-emerald-900 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-teal-950/25 transition hover:brightness-110"
        >
          ← Retour au catalogue
        </Link>
      </div>
    );
  }

  return (
    <div className="hd-public-catalog relative isolate flex min-h-screen flex-col bg-[#f3efe4] font-catalog-sans text-catalog-body antialiased selection:bg-amber-200/50 selection:text-catalog-ink">
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0 bg-[#f3efe4]" />
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0 bg-catalog-mesh opacity-[0.28]" />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0 bg-catalog-grid opacity-[0.12] [background-size:44px_44px]"
      />
      <header className="sticky top-0 z-[100] border-b border-amber-400/35 bg-slate-950 text-white shadow-[0_12px_40px_-12px_rgba(0,0,0,0.55)]">
        <div className="mx-auto flex max-w-7xl animate-catalog-in-fade items-center gap-4 px-4 py-3.5 opacity-0 motion-reduce:animate-none motion-reduce:opacity-100 sm:px-6 lg:px-8">
          <Link
            to="/catalogue"
            className="rounded-xl px-3 py-2 text-sm font-bold text-amber-200/95 transition hover:bg-white/10 hover:text-white"
          >
            ← Catalogue
          </Link>
          <div className="h-8 w-px bg-white/15" aria-hidden />
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-[#022c22] via-teal-900 to-emerald-900 p-1.5 shadow-lg ring-2 ring-amber-300/45 ring-offset-2 ring-offset-slate-950">
              <img src="/logo.png" alt="" className="h-full w-full object-contain drop-shadow" />
            </div>
            <span className="font-catalog-display text-sm font-semibold text-white">Hurghada Dream</span>
          </div>
        </div>
      </header>

      <main className="relative z-10 flex-grow pt-6 md:pt-8">
        {/* ——— Galerie mobile ——— */}
        <div className="px-4 md:hidden">
          <div className="relative aspect-[4/3] w-full animate-catalog-in-soft overflow-hidden rounded-[22px] opacity-0 motion-reduce:animate-none motion-reduce:opacity-100" style={{ animationDelay: "60ms" }}>
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
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 z-[5] h-44 bg-gradient-to-b from-black/78 via-black/4 to-transparent"
            />
            <div className="pointer-events-none absolute left-3 top-3 z-10 max-w-[calc(100%-4.5rem)] pr-1 sm:left-4 sm:top-4">
              <h1 className="font-catalog-display text-lg font-bold leading-snug tracking-tight text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.95),0_2px_20px_rgba(0,0,0,0.8)] line-clamp-3 sm:text-xl">
                {activity.name}
              </h1>
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
                onClick={() => void sharePage()}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-white/90 shadow-lg backdrop-blur-sm transition active:scale-95"
                aria-label="Partager"
              >
                <IconShare className="h-5 w-5 text-gray-700" />
              </button>
            </div>
          </div>
        </div>

        {/* ——— Fil + titre desktop ——— */}
        <div className="mx-auto hidden max-w-7xl animate-catalog-in-up px-4 pt-3 opacity-0 motion-reduce:animate-none motion-reduce:opacity-100 sm:px-6 md:block lg:px-8" style={{ animationDelay: "40ms" }}>
          <nav className="mb-3">
            <ol className="flex items-center gap-1.5 text-xs font-semibold text-catalog-muted">
              <li>
                <Link to="/catalogue" className="font-semibold text-catalog-label transition-colors hover:text-teal-800">
                  Catalogue
                </Link>
              </li>
              <li aria-hidden>/</li>
              <li>
                <span className="font-semibold text-catalog-body">{label}</span>
              </li>
            </ol>
          </nav>
          <h1 className="mb-3 font-catalog-display text-3xl font-semibold tracking-tight text-catalog-ink md:text-4xl">{activity.name}</h1>
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <div className="flex items-center gap-1.5 text-sm font-semibold text-catalog-body">
              <IconMapPin className="h-4 w-4 text-teal-600/80" />
              <span>{activity.name}</span>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => void sharePage()}
                className="flex items-center gap-2 rounded-xl px-5 py-2 text-sm font-semibold text-catalog-muted transition-colors hover:bg-teal-50 hover:text-teal-900"
              >
                <IconShare className="h-5 w-5" />
                Partager
              </button>
            </div>
          </div>
        </div>

        <div className="mx-auto max-w-7xl animate-catalog-in-fade px-4 py-4 pb-24 opacity-0 motion-reduce:animate-none motion-reduce:opacity-100 sm:px-6 md:pb-12 lg:px-8 lg:pb-16" style={{ animationDelay: "120ms" }}>
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
                  <p className="whitespace-pre-line text-sm font-semibold leading-relaxed text-catalog-body sm:text-base">{catalogProse}</p>
                </section>
              ) : null}

              {bulletPoints.length > 0 ? (
                <section className="grid gap-3 xl:grid-cols-[200px_1fr] xl:gap-0">
                  <h2 className="font-catalog-display text-base font-semibold text-catalog-ink md:text-lg">Points forts</h2>
                  <ul className="list-inside list-disc space-y-2">
                    {bulletPoints.map((item) => (
                      <li key={item} className="text-sm font-semibold text-catalog-body md:text-base">
                        {item}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              <div className="border-t border-gray-200" role="separator" />

              <section className="grid gap-3 xl:grid-cols-[200px_1fr] xl:gap-0">
                <h2 className="font-catalog-display text-base font-semibold text-catalog-ink md:text-lg">Informations</h2>
                <p className="whitespace-pre-line text-sm font-medium leading-relaxed text-catalog-body">
                  {informationsBody}
                </p>
              </section>
            </div>

            {/* ——— Sidebar réservation desktop ——— */}
            <div className="hidden lg:col-span-1 lg:block">
              <div className="lg:sticky lg:top-24 lg:rounded-3xl lg:border lg:border-teal-900/10 lg:bg-white lg:p-7 lg:shadow-soft lg:shadow-teal-950/10 lg:transition-shadow lg:duration-300 lg:hover:shadow-soft-lg">
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
                  headerPrice={headerPriceHint}
                  replaceParticipantPricingLines={bookingReplaceChildBaby}
                  childrenBeforeParticipants={specialPricingBeforeParticipants}
                  codedTotalPending={codedTotalPending}
                  babiesForbidden={babiesForbidden}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Encart mobile « disponibilités » */}
        <div id="disponibilites" className="mx-auto w-full max-w-7xl px-4 pb-28 sm:px-6 lg:hidden lg:px-8">
          <div className="rounded-3xl border border-teal-900/10 bg-white p-5 shadow-soft shadow-teal-950/10">
            <h2 className="mb-4 font-catalog-display text-lg font-semibold text-catalog-ink">Réserver</h2>
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
              headerPrice={headerPriceHint}
              replaceParticipantPricingLines={bookingReplaceChildBaby}
              childrenBeforeParticipants={specialPricingBeforeParticipants}
              codedTotalPending={codedTotalPending}
              babiesForbidden={babiesForbidden}
            />
          </div>
        </div>

        {/* Barre bas mobile */}
        <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-teal-900/10 bg-white/95 px-4 py-3 shadow-[0_-8px_30px_rgba(15,118,110,0.12)] backdrop-blur-md lg:hidden">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-800">À partir de</p>
              <p className="font-display text-lg font-bold text-slate-900 tabular-nums">
                {headerPriceHint != null && headerPriceHint > 0 ? (
                  formatMoney(headerPriceHint, activity.currency || "EUR")
                ) : (
                  <span className="text-base font-semibold text-amber-800">Sur devis</span>
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={scrollToBooking}
              className="whitespace-nowrap rounded-2xl bg-gradient-to-r from-teal-700 to-teal-600 px-5 py-3 text-sm font-semibold text-white shadow-md shadow-teal-900/20 transition hover:from-teal-800 hover:to-teal-700"
            >
              Réserver
            </button>
          </div>
        </div>
      </main>

      <a
        href="https://wa.me/201062002850?text=Bonjour%20Hurghada%20Dream%2C%20"
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
