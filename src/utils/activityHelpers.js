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

// Helper pour vérifier si une activité utilise les champs moto cross
export function isMotoCrossActivity(activityName) {
  if (!activityName) return false;
  const name = activityName.toLowerCase();
  return name.includes("moto cross");
}

// Helper pour obtenir les prix moto cross
export function getMotoCrossPrices() {
  return { yamaha250: 100, ktm640: 120, ktm530: 160 };
}

// Helper pour vérifier si une activité est ZERO TRACAS
// Important : doit retourner false pour "ZERO TRACAS HORS ZONE"
export function isZeroTracasActivity(activityName) {
  if (!activityName) return false;
  const name = activityName.toLowerCase();
  // Vérifier d'abord si c'est HORS ZONE (plus spécifique)
  if (name.includes("zero tracas hors zone")) return false;
  return name.includes("zero tracas");
}

// Helper pour obtenir les prix ZERO TRACAS
export function getZeroTracasPrices() {
  return {
    transfertVisaSim: 45,        // transfert + visa + sim
    transfertVisa: 40,            // transfert + visa
    transfert3Personnes: 20,      // transfert 3 personnes
    transfertPlus3Personnes: 25,  // transfert plus de 3 personnes
    visaSim: 40,                  // visa + sim
    visaSeul: 30,                 // visa seul
  };
}

// Helper pour vérifier si une activité est ZERO TRACAS HORS ZONE
export function isZeroTracasHorsZoneActivity(activityName) {
  if (!activityName) return false;
  const name = activityName.toLowerCase();
  return name.includes("zero tracas hors zone");
}

// Helper pour obtenir les prix ZERO TRACAS HORS ZONE
export function getZeroTracasHorsZonePrices() {
  return {
    transfertVisaSim: 50,        // transfert + visa + sim
    transfertVisa: 45,            // transfert + visa
    transfert3Personnes: 25,      // transfert 3 personnes
    transfertPlus3Personnes: 30,  // transfert plus de 3 personnes
    visaSim: 40,                  // visa + sim
    visaSeul: 30,                 // visa seul
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
