/**
 * Tarification du catalogue public quand les prix en base sont à 0
 * mais que le devis interne utilise une grille codée (aligné sur useActivityPriceCalculator).
 */

import { SPEED_BOAT_EXTRAS } from "../constants/activityExtras";
import {
  isSpeedBoatActivity,
  isBuggyActivity,
  getBuggyPrices,
  isMotoCrossActivity,
  getMotoCrossPrices,
  isCairePrivatifActivity,
  getCairePrivatifPrices,
  isLouxorPrivatifActivity,
  getLouxorPrivatifPrices,
  getActivityTarifListLines,
} from "./activityHelpers";

function num(n, fallback = 0) {
  const x = Number(n);
  return Number.isFinite(x) ? x : fallback;
}

function readDbPrices(activity) {
  return {
    adult: num(activity?.price_adult),
    child: num(activity?.price_child),
    baby: num(activity?.price_baby),
  };
}

/**
 * Total pour une ligne panier / fiche catalogue public.
 * @param {object} activity — ligne Supabase (snake_case) ou objet avec name, price_*
 * @param {object} line — { adults, children, babies, ... champs spéciaux optionnels }
 */
export function computePublicCatalogLineTotal(activity, line) {
  if (!activity) return 0;
  const name = activity.name || "";
  const ad = num(line?.adults, 0);
  const ch = num(line?.children, 0);
  let bab = num(line?.babies, 0);
  if (activity.babies_forbidden === true || activity.babiesForbidden === true) bab = 0;

  if (isSpeedBoatActivity(name)) {
    let t = 145;
    if (ad > 2) t += (ad - 2) * 20;
    t += ch * 10;
    if (line?.extraDolphin) t += 20;
    const extrasRaw = line?.speedBoatExtra;
    const extras = Array.isArray(extrasRaw) ? extrasRaw : extrasRaw ? [extrasRaw] : [];
    extras.forEach((extraId) => {
      if (!extraId) return;
      const e = SPEED_BOAT_EXTRAS.find((x) => x.id === extraId);
      if (e) {
        t += ad * num(e.priceAdult) + ch * num(e.priceChild);
      }
    });
    return t;
  }

  if (isBuggyActivity(name)) {
    const p = getBuggyPrices(name);
    return num(line?.buggySimple) * p.simple + num(line?.buggyFamily) * p.family;
  }

  if (isMotoCrossActivity(name)) {
    const p = getMotoCrossPrices();
    return (
      num(line?.yamaha250) * p.yamaha250 + num(line?.ktm640) * p.ktm640 + num(line?.ktm530) * p.ktm530
    );
  }

  if (isCairePrivatifActivity(name)) {
    const p = getCairePrivatifPrices();
    if (line?.cairePrivatif4pax) return p.pax4;
    if (line?.cairePrivatif5pax) return p.pax5;
    if (line?.cairePrivatif6pax) return p.pax6;
    return 0;
  }

  if (isLouxorPrivatifActivity(name)) {
    const p = getLouxorPrivatifPrices();
    if (line?.louxorPrivatif4pax) return p.pax4;
    if (line?.louxorPrivatif5pax) return p.pax5;
    if (line?.louxorPrivatif6pax) return p.pax6;
    return 0;
  }

  const db = readDbPrices(activity);
  if (db.adult > 0 || db.child > 0 || db.baby > 0) {
    return ad * db.adult + ch * db.child + bab * db.baby;
  }

  return 0;
}

/**
 * Affichage « à partir de X € » sur les cartes catalogue quand les prix DB sont à 0.
 * @returns {{ amount: number, currency: string } | null}
 */
export function getPublicCatalogListFromPrice(activity) {
  if (!activity) return null;
  const db = readDbPrices(activity);
  if (db.adult > 0) {
    return { amount: db.adult, currency: activity.currency || "EUR" };
  }

  const name = activity.name || "";
  if (isSpeedBoatActivity(name)) {
    return { amount: 145, currency: activity.currency || "EUR" };
  }
  if (isBuggyActivity(name)) {
    const p = getBuggyPrices(name);
    const cands = [p.simple, p.family].filter((x) => x > 0);
    if (cands.length) return { amount: Math.min(...cands), currency: activity.currency || "EUR" };
  }
  if (isMotoCrossActivity(name)) {
    const p = getMotoCrossPrices();
    return { amount: Math.min(p.yamaha250, p.ktm640, p.ktm530), currency: activity.currency || "EUR" };
  }
  if (isCairePrivatifActivity(name)) {
    const p = getCairePrivatifPrices();
    return { amount: p.pax4, currency: activity.currency || "EUR" };
  }
  if (isLouxorPrivatifActivity(name)) {
    const p = getLouxorPrivatifPrices();
    return { amount: p.pax4, currency: activity.currency || "EUR" };
  }

  const coded = getActivityTarifListLines(activity);
  if (coded?.length) {
    return null;
  }
  return null;
}

export function activityUsesCodedTariffWithoutDbPrices(activity) {
  if (!activity) return false;
  const db = readDbPrices(activity);
  if (db.adult > 0 || db.child > 0 || db.baby > 0) return false;
  return getActivityTarifListLines(activity) != null;
}
