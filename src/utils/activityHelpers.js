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

// Helper pour vérifier si une activité est Speed Boat (ex: "SPEED BOAT", "SPEEDBOAT", "Speed Boat")
export function isSpeedBoatActivity(activityName) {
  if (!activityName) return false;
  const name = activityName.toLowerCase().trim();
  return name.includes("speed boat") || name === "speedboat";
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

function normalizeActivityName(activityName) {
  if (!activityName) return "";
  return String(activityName)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Helper pour vérifier si une activité est ZERO TRACAS
// Important : doit retourner false pour "ZERO TRACAS HORS ZONE"
export function isZeroTracasActivity(activityName) {
  const name = normalizeActivityName(activityName);
  if (!name) return false;
  // Vérifier d'abord si c'est HORS ZONE (plus spécifique)
  if (name.includes("zero tracas hors zone") || name.includes("zero tracas horszone")) return false;
  return name.includes("zero tracas");
}

// Helper pour obtenir les prix ZERO TRACAS (+5€ sur chaque option visa)
export function getZeroTracasPrices() {
  return {
    transfertVisaSim: 50,        // transfert + visa + sim (45+5)
    transfertVisa: 45,            // transfert + visa (40+5)
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
  return name.includes("zero tracas hors zone") || name.includes("zero tracas horszone");
}

// Helper pour obtenir les prix ZERO TRACAS HORS ZONE (+5€ sur chaque option visa)
export function getZeroTracasHorsZonePrices() {
  return {
    transfertVisaSim: 55,        // transfert + visa + sim (50+5)
    transfertVisa: 50,            // transfert + visa (45+5)
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
  const { adult, child, baby } = readStoredListPrices(activityLike);
  if (adult > 0 || child > 0 || baby > 0) return null;

  if (isSpeedBoatActivity(name)) {
    const extraLines = SPEED_BOAT_EXTRAS.filter((e) => e.id).map(
      (e) => `${e.label} : +${e.priceAdult} € / adulte · +${e.priceChild} € / enfant`
    );
    return [
      "Base 1–2 adultes : 145 €",
      "Au-delà de 2 adultes : +20 € / adulte supplémentaire",
      "Enfant : +10 € / enfant",
      "Option dauphin : +20 €",
      "Extras (au devis) :",
      ...extraLines,
    ];
  }

  if (isBuggyActivity(name)) {
    const p = getBuggyPrices(name);
    if (p.simple <= 0 && p.family <= 0) return null;
    return [`Buggy simple : ${p.simple} €`, `Buggy family : ${p.family} €`];
  }

  if (isMotoCrossActivity(name)) {
    const p = getMotoCrossPrices();
    return [
      `Yamaha 250 : ${p.yamaha250} € / moto`,
      `KTM 640 : ${p.ktm640} € / moto`,
      `KTM 530 : ${p.ktm530} € / moto`,
    ];
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
