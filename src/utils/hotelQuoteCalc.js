import { normalizeHotelAgePolicy } from "./publicHotelsCatalog";
import {
  allocateHiltonChildCharges,
  isHiltonPlazaHotel,
  parseChildAgesInput,
} from "./hotelChildFreePolicy";

/** Nuits d’hôtel : [arrivée, départ) — départ non facturé. */
export function countHotelNights(arrivalDate, departureDate) {
  const from = String(arrivalDate || "").trim();
  const to = String(departureDate || "").trim();
  if (!from || !to || to <= from) return 0;
  const a = new Date(`${from}T12:00:00`);
  const b = new Date(`${to}T12:00:00`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0;
  return Math.max(0, Math.round((b - a) / 86400000));
}

/** Liste ISO des nuits [arrivée … veille du départ]. */
export function listHotelNightDates(arrivalDate, departureDate) {
  const nights = countHotelNights(arrivalDate, departureDate);
  const from = String(arrivalDate || "").trim();
  if (!nights || !from) return [];
  const start = new Date(`${from}T12:00:00`);
  if (Number.isNaN(start.getTime())) return [];
  const out = [];
  for (let i = 0; i < nights; i += 1) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    out.push(`${y}-${m}-${day}`);
  }
  return out;
}

function findRateForNight(rates, hotelSlug, roomCategory, nightIso) {
  const slug = String(hotelSlug || "").trim();
  const cat = String(roomCategory || "").trim();
  if (!slug || !cat || !nightIso) return null;
  return (
    (Array.isArray(rates) ? rates : []).find(
      (r) =>
        r.hotelSlug === slug &&
        r.roomCategory === cat &&
        r.dateFrom &&
        r.dateTo &&
        r.dateFrom <= nightIso &&
        r.dateTo >= nightIso
    ) || null
  );
}

function classifyAgeBand(age, policy) {
  const p = normalizeHotelAgePolicy(policy || {});
  if (!Number.isFinite(age) || age < 0) return "child";
  if (age >= p.babyAgeMin && age <= p.babyAgeMax) return "baby";
  if (age >= p.childAgeMin && age <= p.childAgeMax) return "child";
  if (age > p.childAgeMax) return "adult";
  return "child";
}

function roundMoney(n) {
  return Math.round(Number(n) * 100) / 100;
}

/**
 * Calcule le devis séjour pour 1 hôtel / 1 catégorie à partir des grilles Tarifs hôtel.
 */
export function calculateHotelStayQuote({
  hotel,
  hotelSlug,
  hotelName,
  roomCategory,
  arrivalDate,
  departureDate,
  adultsCount,
  childAgesRaw,
  childrenCount,
  rates,
}) {
  const slug = String(hotelSlug || hotel?.slug || hotel?.id || "").trim();
  const name = String(hotelName || hotel?.name || "").trim();
  const category = String(roomCategory || "").trim();
  const nightsList = listHotelNightDates(arrivalDate, departureDate);
  const nights = nightsList.length;
  const adults = Math.max(0, Number(adultsCount) || 0);
  const warnings = [];

  if (!category) {
    return {
      ok: false,
      hotelSlug: slug,
      hotelName: name,
      roomCategory: "",
      nights: 0,
      currency: "EUR",
      total: null,
      adultsTotal: 0,
      childrenTotal: 0,
      babiesTotal: 0,
      freeChildren: 0,
      chargedChildren: 0,
      extraAdultsFromAge: 0,
      warnings: ["Choisissez une catégorie de chambre."],
      lines: [],
    };
  }

  if (!nights) {
    return {
      ok: false,
      hotelSlug: slug,
      hotelName: name,
      roomCategory: category,
      nights: 0,
      currency: "EUR",
      total: null,
      adultsTotal: 0,
      childrenTotal: 0,
      babiesTotal: 0,
      freeChildren: 0,
      chargedChildren: 0,
      extraAdultsFromAge: 0,
      warnings: ["Dates d’arrivée / départ invalides."],
      lines: [],
    };
  }

  let ages = parseChildAgesInput(childAgesRaw);
  const expectedChildren = Math.max(0, Number(childrenCount) || 0);
  if (expectedChildren > ages.length) {
    const missing = expectedChildren - ages.length;
    warnings.push(
      `${missing} âge(s) enfant manquant(s) — tarif enfant appliqué par défaut.`
    );
    for (let i = 0; i < missing; i += 1) ages.push(NaN);
  }

  const agePolicy = normalizeHotelAgePolicy(hotel || {});
  const classified = ages.map((age) => {
    const n = Number(age);
    const finite = Number.isFinite(n);
    const band = finite ? classifyAgeBand(n, agePolicy) : "child";
    return { age: finite ? n : null, band };
  });

  let extraAdultsFromAge = 0;
  const minorRows = [];
  for (const row of classified) {
    if (row.band === "adult") {
      extraAdultsFromAge += 1;
      warnings.push(
        `Âge ${row.age} an(s) hors grille enfant → compté comme adulte.`
      );
    } else {
      minorRows.push(row);
    }
  }

  const hilton = isHiltonPlazaHotel(hotel || slug || name);
  const freeFlags = hilton
    ? allocateHiltonChildCharges(
        minorRows.map((r) =>
          r.age == null || !Number.isFinite(r.age) ? 99 : r.age
        )
      ).map((r) => r.free)
    : minorRows.map(() => false);

  // Ages null (missing) should not get Hilton free — allocateHilton with 99 means not free under 12. Good.

  const totalAdults = adults + extraAdultsFromAge;
  let adultsTotal = 0;
  let childrenTotal = 0;
  let babiesTotal = 0;
  let freeChildren = 0;
  let chargedChildren = 0;
  let currency = "EUR";
  const lines = [];
  let coveredNights = 0;

  for (const night of nightsList) {
    const rate = findRateForNight(rates, slug, category, night);
    if (!rate) {
      warnings.push(`Aucun tarif pour la nuit du ${night}.`);
      lines.push({
        date: night,
        ok: false,
        adultUnit: null,
        nightTotal: null,
        message: "Tarif manquant",
      });
      continue;
    }

    coveredNights += 1;
    currency = rate.currency || currency;
    const adultUnit = rate.sellAdult;
    if (adultUnit == null) {
      warnings.push(`Prix adulte manquant (${night}).`);
      continue;
    }

    let nightAdults = totalAdults * adultUnit;
    let nightChildren = 0;
    let nightBabies = 0;
    let nightFree = 0;

    minorRows.forEach((row, idx) => {
      if (freeFlags[idx]) {
        nightFree += 1;
        return;
      }
      if (row.band === "baby") {
        const unit = rate.sellBaby != null ? rate.sellBaby : rate.sellChild;
        if (unit == null) {
          warnings.push(`Prix bébé/enfant manquant (${night}).`);
          return;
        }
        nightBabies += unit;
      } else {
        const unit = rate.sellChild != null ? rate.sellChild : rate.sellAdult;
        if (unit == null) {
          warnings.push(`Prix enfant manquant (${night}).`);
          return;
        }
        nightChildren += unit;
      }
    });

    // Count free/charged once (same each night) — set from last night loop ok
    freeChildren = nightFree;
    chargedChildren = minorRows.length - nightFree;

    const nightTotal = roundMoney(nightAdults + nightChildren + nightBabies);
    adultsTotal += nightAdults;
    childrenTotal += nightChildren;
    babiesTotal += nightBabies;
    lines.push({
      date: night,
      ok: true,
      adultUnit,
      childUnit: rate.sellChild,
      babyUnit: rate.sellBaby,
      nightTotal,
      currency: rate.currency || "EUR",
    });
  }

  adultsTotal = roundMoney(adultsTotal);
  childrenTotal = roundMoney(childrenTotal);
  babiesTotal = roundMoney(babiesTotal);

  if (coveredNights === 0) {
    warnings.push("Aucun tarif trouvé pour ce séjour / cette catégorie.");
  } else if (coveredNights < nights) {
    warnings.push(
      `Couverture partielle : ${coveredNights}/${nights} nuit(s) tarifée(s).`
    );
  }

  const uniqueWarnings = [...new Set(warnings)];
  const fullyCovered = coveredNights === nights && nights > 0;
  const total = fullyCovered
    ? roundMoney(adultsTotal + childrenTotal + babiesTotal)
    : coveredNights > 0
      ? roundMoney(adultsTotal + childrenTotal + babiesTotal)
      : null;

  return {
    ok: fullyCovered && total != null,
    hotelSlug: slug,
    hotelName: name,
    roomCategory: category,
    nights,
    coveredNights,
    currency,
    total,
    adultsTotal,
    childrenTotal,
    babiesTotal,
    freeChildren,
    chargedChildren,
    extraAdultsFromAge,
    totalAdults,
    warnings: uniqueWarnings,
    lines,
    hiltonPolicyApplied: hilton,
  };
}

export function formatQuoteMoney(value, currency = "EUR") {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  try {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: currency || "EUR",
      maximumFractionDigits: 2,
    }).format(Number(value));
  } catch {
    return `${Number(value).toFixed(2)} ${currency || "€"}`;
  }
}
