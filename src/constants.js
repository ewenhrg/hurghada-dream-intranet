import { uuid, emptyTransfers } from "./utils";

// Dupliquer la logique de SITE_KEY pour éviter les problèmes d'initialisation circulaire
// Lire les variables env (vite ou CRA)
function getEnv(key) {
  // Vite
  if (
    typeof import.meta !== "undefined" &&
    import.meta.env &&
    Object.prototype.hasOwnProperty.call(import.meta.env, key)
  ) {
    return import.meta.env[key];
  }
  // CRA
  const globalProcess =
    typeof globalThis !== "undefined" && globalThis.process ? globalThis.process : undefined;
  if (globalProcess && globalProcess.env && Object.prototype.hasOwnProperty.call(globalProcess.env, key)) {
    return globalProcess.env[key];
  }
  // fallback window
  if (typeof window !== "undefined" && window.__ENV__ && window.__ENV__[key]) {
    return window.__ENV__[key];
  }
  return undefined;
}

export const SITE_KEY =
  getEnv("VITE_SITE_KEY") || getEnv("REACT_APP_SITE_KEY") || "hurghada_dream_0606";
export const PIN_CODE = "0606";

export const LS_KEYS = {
  activities: "hd_activities",
  quotes: "hd_quotes",
  quoteForm: "hd_quote_form", // Formulaire de devis en cours
  activityForm: "hd_activity_form", // Formulaire d'activité en cours
  messageTemplates: "hd_message_templates", // Templates de messages par activité
  exteriorHotels: "hd_exterior_hotels", // Liste des hôtels avec RDV à l'extérieur
};

export const WEEKDAYS = [
  { key: 0, label: "Dim" },
  { key: 1, label: "Lun" },
  { key: 2, label: "Mar" },
  { key: 3, label: "Mer" },
  { key: 4, label: "Jeu" },
  { key: 5, label: "Ven" },
  { key: 6, label: "Sam" },
];

export const CATEGORIES = [
  { key: "desert", label: "Désert" },
  { key: "aquatique", label: "Aquatique" },
  { key: "exploration_bien_etre", label: "Exploration / Bien-être" },
  { key: "luxor_caire", label: "LOUXOR & LE CAIRE" },
  { key: "marsa_alam", label: "Marsa Alam" },
  { key: "transfert", label: "TRANSFERT" },
];

export const NEIGHBORHOODS = [
  { key: "soma_bay", label: "Soma Bay" },
  { key: "makadi", label: "Makadi" },
  { key: "salh_hasheesh", label: "Sahl Hasheesh" },
  { key: "el_gouna", label: "El Gouna" },
  { key: "hurghada_cora", label: "Hurghada Cora" },
  { key: "hurghada_kawther", label: "Hurghada Kawther" },
  { key: "hurghada_sheraton", label: "Hurghada Sheraton" },
  { key: "hurghada_arabia", label: "Hurghada Arabia" },
  { key: "hurghada_ahyaa", label: "Hurghada Ahyaa" },
];

export function getDefaultActivities() {
  return [
    {
      id: uuid(),
      category: "aquatique",
      name: "Speed Boat",
      // prix de base pour 2 personnes
      priceAdult: 145,
      priceChild: 145,
      priceBaby: 0,
      currency: "EUR",
      availableDays: [true, true, true, true, true, true, true],
      notes: "Base 145€ pour 2 pers. +20€/adulte sup. +10€/enfant sup.",
      transfers: emptyTransfers(),
    },
    {
      id: uuid(),
      category: "desert",
      name: "Safari Désert",
      priceAdult: 30,
      priceChild: 22,
      priceBaby: 0,
      currency: "EUR",
      availableDays: [false, true, true, true, true, true, false],
      notes: "Quad désert",
      transfers: emptyTransfers(),
    },
  ];
}

