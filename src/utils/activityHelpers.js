import { SPEED_BOAT_EXTRAS } from "../constants/activityExtras";

// Helper pour vérifier si une activité utilise les champs buggy
export function isBuggyActivity(activityName) {
  if (!activityName) return false;
  const name = activityName.toLowerCase();
  return name.includes("buggy + show") || name.includes("buggy safari matin");
}

// Helper pour obtenir les prix buggy selon l'activité
export function getBuggyPrices(activityName) {
  if (!activityName) return { simple: 0, family: 0 };
  const name = activityName.toLowerCase();
  if (name.includes("buggy + show")) {
    return { simple: 120, family: 160 };
  } else if (name.includes("buggy safari matin")) {
    return { simple: 110, family: 150 };
  }
  return { simple: 0, family: 0 };
}

/** Calèche : forfait par calèche (comme buggy = à l’unité), pas par personne. */
export function isCalecheActivity(activityName) {
  const name = normalizeActivityName(activityName);
  if (!name) return false;
  return name.includes("caleche");
}

export function getCalecheUnitPrice(activityLike) {
  const fromDb = Number(activityLike?.priceAdult ?? activityLike?.price_adult ?? NaN);
  if (Number.isFinite(fromDb) && fromDb > 0) return fromDb;
  return 45;
}

export function computeCalecheLineTotal(calecheCount, activityLike) {
  return Math.max(0, Number(calecheCount) || 0) * getCalecheUnitPrice(activityLike);
}

// Helper pour vérifier si une activité est Speed Boat (ex: "SPEED BOAT", "SPEEDBOAT", "SPEEDBOAT SUNSET")
export function isSpeedBoatActivity(activityName) {
  if (!activityName) return false;
  const name = activityName.toLowerCase().trim();
  return name.includes("speed boat") || name.includes("speedboat");
}

/** Variante sunset : même grille de base, sans extras îles ni dauphin. */
export function isSpeedBoatSunsetActivity(activityName) {
  if (!activityName) return false;
  const name = activityName.toLowerCase().trim();
  return isSpeedBoatActivity(activityName) && name.includes("sunset");
}

/** Extras îles (Hula Hula, Orange Bay, etc.) — pas pour Speedboat Sunset. */
export function allowsSpeedBoatIslandExtras(activityName) {
  return isSpeedBoatActivity(activityName) && !isSpeedBoatSunsetActivity(activityName);
}

/** Option dauphin (+20 €) — pas pour Speedboat Sunset. */
export function allowsSpeedBoatDolphinExtra(activityName) {
  return isSpeedBoatActivity(activityName) && !isSpeedBoatSunsetActivity(activityName);
}

export function getSpeedBoatIslandExtras() {
  return SPEED_BOAT_EXTRAS.filter((e) => e.id);
}

/** Formules avec repas (indisponibles au créneau matin). */
export function isSpeedBoatMealExtra(extraId) {
  return String(extraId || "").endsWith("_lunch");
}

/** Extras îles proposés selon le créneau (matin = sans repas). */
export function getSpeedBoatIslandExtrasForSlot(slot) {
  return getSpeedBoatIslandExtras().filter((e) => isSpeedBoatExtraAllowedForSlot(e.id, slot));
}

export function isSpeedBoatExtraAllowedForSlot(extraId, slot) {
  if (!extraId) return true;
  if (slot === "morning" && isSpeedBoatMealExtra(extraId)) return false;
  return true;
}

/** Retire les extras repas si le créneau est le matin ; une seule île à la fois. */
export function normalizeSpeedBoatExtrasForSlot(extrasRaw, slot) {
  const extras = normalizeSpeedBoatExtrasList(extrasRaw);
  const filtered = extras.filter((id) => isSpeedBoatExtraAllowedForSlot(id, slot));
  return filtered.length > 0 ? [filtered[0]] : [];
}

export function normalizeSpeedBoatExtrasList(extrasRaw) {
  if (Array.isArray(extrasRaw)) return extrasRaw.filter(Boolean);
  if (extrasRaw && typeof extrasRaw === "string" && extrasRaw !== "") return [extrasRaw];
  return [];
}

/** Grille Speed Boat : base 145 €, +20 €/adt >2, +10 €/enfant, option dauphin +20 €. */
export function computeSpeedBoatBaseLineTotal(adults, children, extraDolphin) {
  const ad = Number(adults || 0);
  const ch = Number(children || 0);
  let lineTotal = 145;
  if (ad > 2) lineTotal += (ad - 2) * 20;
  lineTotal += ch * 10;
  if (extraDolphin) lineTotal += 20;
  return lineTotal;
}

/** Ajoute les extras îles au total (ignorés pour Speedboat Sunset et repas au matin). */
export function addSpeedBoatIslandExtrasToLineTotal(lineTotal, activityName, adults, children, extrasRaw, slot) {
  if (!allowsSpeedBoatIslandExtras(activityName)) return lineTotal;
  const ad = Number(adults || 0);
  const ch = Number(children || 0);
  const extras = normalizeSpeedBoatExtrasForSlot(extrasRaw, slot);
  const extraId = extras[0];
  let total = lineTotal;
  if (extraId) {
    const selectedExtra = SPEED_BOAT_EXTRAS.find((e) => e.id === extraId);
    if (selectedExtra) {
      total += ad * selectedExtra.priceAdult + ch * selectedExtra.priceChild;
    }
  }
  return total;
}

/** Total ligne Speed Boat (base + dauphin + îles selon l’activité). */
export function computeSpeedBoatLineTotal(activityName, adults, children, extraDolphin, speedBoatExtra, slot) {
  const dolphin = allowsSpeedBoatDolphinExtra(activityName) && extraDolphin;
  let total = computeSpeedBoatBaseLineTotal(adults, children, dolphin);
  if (!dolphin) {
    total = addSpeedBoatIslandExtrasToLineTotal(total, activityName, adults, children, speedBoatExtra, slot);
  }
  return total;
}

// Helper pour vérifier si une activité utilise les champs moto cross (ex: "MOTOCROSS", "Moto cross")
export function isMotoCrossActivity(activityName) {
  if (!activityName) return false;
  const name = activityName.toLowerCase();
  return name.includes("moto cross") || name.includes("motocross");
}

// Helper pour obtenir les prix moto cross
export function getMotoCrossPrices() {
  return { yamaha250: 100, ktm640: 120, ktm530: 160 };
}

/** BOAT PARTY : tarif homme / femme (garçon / fille). */
export function isBoatPartyActivity(activityName) {
  if (!activityName) return false;
  const name = activityName.toLowerCase().trim();
  return name.includes("boat party");
}

export function getBoatPartyPrices() {
  return { men: 60, women: 40 };
}

export function computeBoatPartyLineTotal(men, women) {
  const p = getBoatPartyPrices();
  return Number(men || 0) * p.men + Number(women || 0) * p.women;
}

function normalizeActivityName(activityName) {
  if (!activityName) return "";
  return String(activityName)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * El Gouna / El Goune — recommandation 2 personnes (alerte seulement, pas de blocage).
 */
export function isElGounaActivity(activityName) {
  const name = normalizeActivityName(activityName);
  if (!name) return false;
  return name.includes("el gouna") || name.includes("el goune");
}

/**
 * Activités réservables uniquement à partir de 2 personnes (adultes + enfants).
 * Couvre Karting, Combo aquatique, Jeux aquatique.
 * El Gouna : alerte seulement (voir warnsRecommendedTwoParticipants).
 * Le parachute est autorisé dès 1 personne.
 */
export function requiresMinimumTwoParticipants(activityName) {
  const name = normalizeActivityName(activityName);
  if (!name) return false;
  if (isElGounaActivity(activityName)) return false;
  if (name.includes("karting")) return true;
  if (name.includes("combo") && name.includes("aquatique")) return true;
  if (name.includes("jeux aquatique")) return true;
  return false;
}

/** Alerte non bloquante : idéal à partir de 2 personnes (El Gouna). */
export function warnsRecommendedTwoParticipants(activityName) {
  return isElGounaActivity(activityName);
}

export function isBelowRecommendedTwoParticipants(activityName, counts = {}) {
  return (
    warnsRecommendedTwoParticipants(activityName) &&
    countBookableParticipants(counts) < 2
  );
}

/** Adultes + enfants (les bébés ne comptent pas pour le minimum). */
export function countBookableParticipants(counts = {}) {
  return Number(counts.adults || 0) + Number(counts.children || 0);
}

export function getMinimumParticipantsRequired(activityName) {
  return requiresMinimumTwoParticipants(activityName) ? 2 : 1;
}

export function hasEnoughParticipantsForActivity(activityName, counts = {}) {
  const min = getMinimumParticipantsRequired(activityName);
  return countBookableParticipants(counts) >= min;
}

/** Speed Boat : plafond 7 personnes (adultes + enfants + bébés). */
export const SPEED_BOAT_MAX_PARTICIPANTS = 7;

export function countAllParticipants(counts = {}) {
  return (
    Number(counts.adults || 0) +
    Number(counts.children || 0) +
    Number(counts.babies || 0)
  );
}

export function exceedsSpeedBoatMaxParticipants(activityName, counts = {}) {
  if (!isSpeedBoatActivity(activityName)) return false;
  return countAllParticipants(counts) > SPEED_BOAT_MAX_PARTICIPANTS;
}

export function getSpeedBoatMaxParticipantsMessage() {
  return "Speed Boat : maximum 7 personnes (adultes, enfants et bébés confondus).";
}

/** Tortue Abu Dabbab (et variantes turtle / tortue) : pointures palmes. */
export function isTurtleActivity(activityName) {
  const name = normalizeActivityName(activityName);
  if (!name) return false;
  return name.includes("tortue") || name.includes("turtle");
}

export function getTurtleFinSizeSlots({
  adults = 0,
  children = 0,
  babies = 0,
  childLabel = "Enfant",
  babyLabel = "Bébé",
} = {}) {
  const a = Math.max(0, Math.round(Number(adults) || 0));
  const c = Math.max(0, Math.round(Number(children) || 0));
  const b = Math.max(0, Math.round(Number(babies) || 0));
  const slots = [];
  for (let i = 0; i < a; i += 1) {
    slots.push({ key: `adult-${i}`, label: a > 1 || c + b > 0 ? `Adulte ${i + 1}` : "Adulte" });
  }
  for (let i = 0; i < c; i += 1) {
    slots.push({ key: `child-${i}`, label: `${childLabel} ${i + 1}` });
  }
  for (let i = 0; i < b; i += 1) {
    slots.push({ key: `baby-${i}`, label: `${babyLabel} ${i + 1}` });
  }
  return slots;
}

export function getTurtleFinSizeCount(counts = {}) {
  return getTurtleFinSizeSlots(counts).length;
}

export function normalizeFinSizes(sizes, count) {
  const n = Math.max(0, Number(count) || 0);
  const arr = Array.isArray(sizes) ? sizes.map((s) => String(s ?? "").trim()) : [];
  return Array.from({ length: n }, (_, i) => arr[i] || "");
}

export function persistTurtleFinSizes(activityName, counts, sizes) {
  if (!isTurtleActivity(activityName)) return [];
  return normalizeFinSizes(sizes, getTurtleFinSizeCount(counts));
}

export function hasAllTurtleFinSizes(activityName, counts, sizes) {
  if (!isTurtleActivity(activityName)) return true;
  const n = getTurtleFinSizeCount(counts);
  if (n === 0) return true;
  return normalizeFinSizes(sizes, n).every((s) => s.trim().length > 0);
}

export function getTurtleFinSizesMissingMessage() {
  return "Tortue Abu Dabbab : indiquez la pointure de chaque participant (palmes).";
}

export function formatTurtleFinSizesLabel(item, activityName) {
  const name = activityName || item?.activityName || item?.activity_name || "";
  if (!isTurtleActivity(name)) return "";
  const sizes = Array.isArray(item?.finSizes)
    ? item.finSizes.map((s) => String(s ?? "").trim()).filter(Boolean)
    : [];
  if (!sizes.length) return "";
  return `Pointures palmes : ${sizes.join(" · ")}`;
}

/**
 * Plafonne un champ participants pour rester ≤ 7 au total sur Speed Boat.
 * @returns {number|""}
 */
export function capSpeedBoatParticipantField(activityName, current, field, nextRaw) {
  if (nextRaw === "" || nextRaw === null || nextRaw === undefined) return "";
  const n = Math.max(0, Math.round(Number(nextRaw) || 0));
  if (!isSpeedBoatActivity(activityName)) return n;
  const adults = Number(current?.adults || 0);
  const children = Number(current?.children || 0);
  const babies = Number(current?.babies || 0);
  const others =
    (field === "adults" ? 0 : adults) +
    (field === "children" ? 0 : children) +
    (field === "babies" ? 0 : babies);
  const maxForField = Math.max(0, SPEED_BOAT_MAX_PARTICIPANTS - others);
  return Math.min(n, maxForField);
}

/** Parachute ou Combo aquatique : pas de transfert, RDV au Mamma Mia. */
export function requiresMammaMiaSelfTransfer(activityName) {
  const name = normalizeActivityName(activityName);
  if (!name) return false;
  if (name.includes("parachute")) return true;
  if (name.includes("combo") && name.includes("aquatique")) return true;
  return false;
}

/** Ancien libellé générique (pour nettoyage des notes déjà enregistrées). */
export const MAMMA_MIA_SELF_TRANSFER_NOTE =
  "Rendez-vous par vos propres moyens au restaurant Mamma Mia (transfert non compris).";

const MAMMA_MIA_NOTE_CLEAN_RE =
  /(?:^|\n+)\s*(?:Pour .+? :\s*)?Rendez-vous par vos propres moyens au restaurant Mamma Mia \(transfert non compris\)\.?\s*/gi;

/**
 * Noms d’activités (uniques) concernées par le RDV Mamma Mia.
 * @param {Array<{ name?: string, activityName?: string }|string>} activitiesOrNames
 * @returns {string[]}
 */
export function getMammaMiaSelfTransferActivityNames(activitiesOrNames) {
  const names = [];
  const seen = new Set();
  for (const entry of activitiesOrNames || []) {
    const raw =
      typeof entry === "string" ? entry : entry?.name || entry?.activityName || "";
    if (!requiresMammaMiaSelfTransfer(raw)) continue;
    const label = String(raw).trim();
    const key = normalizeActivityName(label);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    names.push(label);
  }
  return names;
}

/**
 * Note avec le(s) nom(s) d’activité précis (seules celles sans transfert).
 * @param {string[]} activityNames
 */
export function buildMammaMiaSelfTransferNote(activityNames) {
  const names = [...new Set((activityNames || []).map((n) => String(n || "").trim()).filter(Boolean))];
  if (!names.length) return "";
  const list =
    names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(", ")} et ${names[names.length - 1]}`;
  return `Pour ${list} : rendez-vous par vos propres moyens au restaurant Mamma Mia (transfert non compris).`;
}

/**
 * Ajoute ou retire la note Mamma Mia selon les activités concernées.
 * @param {string} notes
 * @param {string[]|boolean} activityNamesOrNeeds — liste de noms, ou boolean (legacy)
 */
export function withMammaMiaSelfTransferNote(notes, activityNamesOrNeeds) {
  const base = String(notes || "").trim();
  const cleaned = base.replace(MAMMA_MIA_NOTE_CLEAN_RE, "").replace(/\n{3,}/g, "\n\n").trim();

  const names = Array.isArray(activityNamesOrNeeds)
    ? activityNamesOrNeeds
    : activityNamesOrNeeds
      ? []
      : [];

  const marker = Array.isArray(activityNamesOrNeeds)
    ? buildMammaMiaSelfTransferNote(names)
    : activityNamesOrNeeds
      ? MAMMA_MIA_SELF_TRANSFER_NOTE
      : "";

  if (!marker) return cleaned;
  return cleaned ? `${cleaned}\n\n${marker}` : marker;
}

/**
 * @param {Array<{ name?: string, activityName?: string }|string>} activitiesOrNames
 */
export function activitiesNeedMammaMiaSelfTransferNote(activitiesOrNames) {
  return getMammaMiaSelfTransferActivityNames(activitiesOrNames).length > 0;
}

function hasAllTokens(name, tokens) {
  if (!name) return false;
  return tokens.every((token) => name.includes(token));
}

// Helper pour vérifier si une activité est ZERO TRACAS
// Important : doit retourner false pour "ZERO TRACAS HORS ZONE"
export function isZeroTracasActivity(activityName) {
  const name = normalizeActivityName(activityName);
  if (!name) return false;
  // Vérifier d'abord si c'est HORS ZONE (plus spécifique), peu importe l'ordre des mots
  if (hasAllTokens(name, ["zero", "tracas", "hors", "zone"])) return false;
  return name.includes("zero tracas");
}

// Helper pour obtenir les prix ZERO TRACAS (+5€ sur chaque option visa)
export function getZeroTracasPrices() {
  return {
    transfertVisaSim: 50,        // transfert + visa + sim (45+5)
    transfertVisa: 45,            // transfert + visa (40+5)
    transfertSim: 25,             // transfert + SIM (sans visa)
    transfert3Personnes: 20,      // transfert 3 personnes
    transfertPlus3Personnes: 25,  // transfert plus de 3 personnes
    visaSim: 45,                  // visa + sim (40+5)
    visaSeul: 35,                 // visa seul (30+5)
  };
}

// Helper pour vérifier si une activité est ZERO TRACAS HORS ZONE
export function isZeroTracasHorsZoneActivity(activityName) {
  const name = normalizeActivityName(activityName);
  if (!name) return false;
  // Accepte les variantes de nom: "ZERO TRACAS HORS ZONE", "HORS ZONE ZERO TRACAS", etc.
  return hasAllTokens(name, ["zero", "tracas", "hors", "zone"]);
}

// Helper pour obtenir les prix ZERO TRACAS HORS ZONE (+5€ sur chaque option visa)
export function getZeroTracasHorsZonePrices() {
  return {
    transfertVisaSim: 55,        // transfert + visa + sim (50+5)
    transfertVisa: 50,            // transfert + visa (45+5)
    transfertSim: 30,             // transfert + SIM (sans visa)
    transfert3Personnes: 25,      // transfert 3 personnes
    transfertPlus3Personnes: 30,  // transfert plus de 3 personnes
    visaSim: 45,                  // visa + sim (40+5)
    visaSeul: 35,                 // visa seul (30+5)
  };
}

// Helper pour vérifier si une activité est CAIRE PRIVATIF
export function isCairePrivatifActivity(activityName) {
  if (!activityName) return false;
  const name = activityName.toLowerCase();
  return name.includes("caire privatif");
}

// Helper pour obtenir les prix CAIRE PRIVATIF
export function getCairePrivatifPrices() {
  return {
    pax4: 460,  // 4 personnes
    pax5: 525,  // 5 personnes
    pax6: 560,  // 6 personnes
  };
}

// Helper pour vérifier si une activité est LOUXOR PRIVATIF
export function isLouxorPrivatifActivity(activityName) {
  if (!activityName) return false;
  const name = activityName.toLowerCase();
  return name.includes("louxor privatif");
}

// Helper pour obtenir les prix LOUXOR PRIVATIF
export function getLouxorPrivatifPrices() {
  return {
    pax4: 460,  // 4 personnes
    pax5: 525,  // 5 personnes
    pax6: 560,  // 6 personnes
  };
}

function readStoredListPrices(activityLike) {
  const adult = Number(activityLike?.priceAdult ?? activityLike?.price_adult ?? NaN);
  const child = Number(activityLike?.priceChild ?? activityLike?.price_child ?? NaN);
  const baby = Number(activityLike?.priceBaby ?? activityLike?.price_baby ?? NaN);
  return {
    adult: Number.isFinite(adult) ? adult : 0,
    child: Number.isFinite(child) ? child : 0,
    baby: Number.isFinite(baby) ? baby : 0,
  };
}

/**
 * Lignes d’aide tarifaire pour listes (Maj prix, /tarifs) quand les prix adulte/enfant/bébé en base sont à 0
 * mais que le devis utilise une grille codée (buggy, speed boat, etc.) — aligné sur useActivityPriceCalculator.
 * @returns {string[]|null} null = afficher les colonnes prix classiques
 */
export function getActivityTarifListLines(activityLike) {
  const name = activityLike?.name || "";
  if (isCalecheActivity(name)) {
    return [`Calèche : ${getCalecheUnitPrice(activityLike)} € / calèche (pas par personne)`];
  }
  const { adult, child, baby } = readStoredListPrices(activityLike);
  if (adult > 0 || child > 0 || baby > 0) return null;

  if (isSpeedBoatActivity(name)) {
    const lines = [
      "Base 1–2 adultes : 145 €",
      "Au-delà de 2 adultes : +20 € / adulte supplémentaire",
      "Enfant : +10 € / enfant",
    ];
    if (allowsSpeedBoatDolphinExtra(name)) {
      lines.push("Option dauphin : +20 €");
    }
    if (allowsSpeedBoatIslandExtras(name)) {
      const extraLines = getSpeedBoatIslandExtras().map(
        (e) => `${e.label} : +${e.priceAdult} € / adulte · +${e.priceChild} € / enfant`
      );
      lines.push("Extras îles (au devis) :", ...extraLines);
    }
    return lines;
  }

  if (isBuggyActivity(name)) {
    const p = getBuggyPrices(name);
    if (p.simple <= 0 && p.family <= 0) return null;
    return [`Buggy 2 personnes : ${p.simple} €`, `Buggy 4 personnes : ${p.family} €`];
  }

  if (isMotoCrossActivity(name)) {
    const p = getMotoCrossPrices();
    return [
      `Yamaha 250 : ${p.yamaha250} € / moto`,
      `KTM 640 : ${p.ktm640} € / moto`,
      `KTM 530 : ${p.ktm530} € / moto`,
    ];
  }

  if (isBoatPartyActivity(name)) {
    const p = getBoatPartyPrices();
    return [`Garçon : ${p.men} €`, `Fille : ${p.women} €`];
  }

  if (isCairePrivatifActivity(name)) {
    const p = getCairePrivatifPrices();
    return [`4 personnes : ${p.pax4} €`, `5 personnes : ${p.pax5} €`, `6 personnes : ${p.pax6} €`];
  }

  if (isLouxorPrivatifActivity(name)) {
    const p = getLouxorPrivatifPrices();
    return [`4 personnes : ${p.pax4} €`, `5 personnes : ${p.pax5} €`, `6 personnes : ${p.pax6} €`];
  }

  if (isZeroTracasHorsZoneActivity(name)) {
    const p = getZeroTracasHorsZonePrices();
    return [
      "Grille Zero Tracas Hors zone (prix unitaire) :",
      `Transfert + visa + SIM : ${p.transfertVisaSim} €`,
      `Transfert + visa : ${p.transfertVisa} €`,
      `Transfert + SIM : ${p.transfertSim} €`,
      `Transfert 3 pers. : ${p.transfert3Personnes} €`,
      `Transfert +3 pers. : ${p.transfertPlus3Personnes} €`,
      `Visa + SIM : ${p.visaSim} €`,
      `Visa seul : ${p.visaSeul} €`,
    ];
  }

  if (isZeroTracasActivity(name)) {
    const p = getZeroTracasPrices();
    return [
      "Grille Zero Tracas (prix unitaire) :",
      `Transfert + visa + SIM : ${p.transfertVisaSim} €`,
      `Transfert + visa : ${p.transfertVisa} €`,
      `Transfert + SIM : ${p.transfertSim} €`,
      `Transfert 3 pers. : ${p.transfert3Personnes} €`,
      `Transfert +3 pers. : ${p.transfertPlus3Personnes} €`,
      `Visa + SIM : ${p.visaSim} €`,
      `Visa seul : ${p.visaSeul} €`,
    ];
  }

  const n = name.toLowerCase();
  if (n.includes("hurghada") && (n.includes("le caire") || n.includes("louxor"))) {
    return ["Aller simple : 150 € / groupe", "Aller retour : 300 € / groupe"];
  }

  if (n.includes("soma bay") && (n.includes("aeroport") || n.includes("aerport")) && n.includes("7")) {
    return ["Aller simple : 40 € / groupe", "Aller retour : 80 € / groupe"];
  }
  if (n.includes("soma bay") && (n.includes("aeroport") || n.includes("aerport")) && n.includes("4")) {
    return ["Aller simple : 35 € / groupe", "Aller retour : 70 € / groupe"];
  }
  if (n.includes("hors zone") && (n.includes("aeroport") || n.includes("aerport")) && n.includes("7")) {
    return ["Aller simple : 30 € / groupe", "Aller retour : 60 € / groupe"];
  }
  if (n.includes("hors zone") && (n.includes("aeroport") || n.includes("aerport")) && n.includes("4")) {
    return ["Aller simple : 25 € / groupe", "Aller retour : 50 € / groupe"];
  }
  if (n.includes("aeroport") && n.includes("7")) {
    return ["Aller simple : 25 € / groupe", "Aller retour : 50 € / groupe"];
  }
  if (n.includes("aeroport") && n.includes("4")) {
    return ["Aller simple : 20 € / groupe", "Aller retour : 40 € / groupe"];
  }

  return null;
}

/**
 * Texte descriptif dérivé des notes : exclut les lignes type « - point fort » (même logique que la fiche activité).
 */
export function proseFromActivityNotes(notes) {
  if (!notes) return "";
  const lines = String(notes).split(/\r?\n/);
  const kept = lines.filter((line) => !/^\s*[-•*]\s+/.test(line.trim()));
  return kept.join("\n").trim();
}

/**
 * Texte public pour catalogue / fiche : colonne `description` si remplie, sinon extrait des `notes`.
 */
export function getActivityPublicProse(activity) {
  if (!activity) return "";
  const desc = String(activity.description || "").trim();
  if (desc) return desc;
  return proseFromActivityNotes(activity.notes || "");
}
