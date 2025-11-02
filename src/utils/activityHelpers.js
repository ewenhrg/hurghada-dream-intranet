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

