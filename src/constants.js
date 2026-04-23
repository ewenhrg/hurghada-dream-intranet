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

/** Clé métier des lignes `activities.site_key` — jamais l’URL Supabase. */
const DEFAULT_SITE_KEY = "hurghada_dream_0606";

/** Une seule alerte console par chargement de page (évite le spam si plusieurs imports). */
let warnedInvalidSiteKeyEnv = false;

/**
 * URL complète ou hôte `*.supabase.co` — valeur typique d’une confusion avec VITE_SUPABASE_URL.
 */
function siteKeyLooksLikeSupabaseInfrastructure(raw) {
  const s = String(raw).trim().toLowerCase();
  if (!s) return false;
  if (/^https?:\/\//i.test(s)) return true;
  if (s.includes(".supabase.co")) return true;
  return false;
}

/**
 * Évite l’erreur fréquente : coller l’URL ou l’hôte Supabase dans `VITE_SITE_KEY`.
 * @param {unknown} raw
 */
function normalizeSiteKey(raw) {
  if (raw == null) return DEFAULT_SITE_KEY;
  const s = String(raw).trim();
  if (!s) return DEFAULT_SITE_KEY;
  if (siteKeyLooksLikeSupabaseInfrastructure(s)) {
    if (!warnedInvalidSiteKeyEnv && typeof console !== "undefined" && console.warn) {
      warnedInvalidSiteKeyEnv = true;
      console.warn(
        "[Hurghada Dream] VITE_SITE_KEY (ou REACT_APP_SITE_KEY) pointe vers Supabase au lieu de la clé métier. " +
          "Mettez la même valeur que la colonne site_key en base (ex. hurghada_dream_0606), jamais l’URL du projet. " +
          "Repli sur la clé par défaut pour cette session. Vérifiez .env local et les variables d’environnement du déploiement (ex. Vercel)."
      );
    }
    return DEFAULT_SITE_KEY;
  }
  return s;
}

const rawSiteKey = getEnv("VITE_SITE_KEY") || getEnv("REACT_APP_SITE_KEY");
export const SITE_KEY = normalizeSiteKey(rawSiteKey != null && rawSiteKey !== "" ? rawSiteKey : DEFAULT_SITE_KEY);
export const PIN_CODE = "0606";

/**
 * Valeur historique par défaut (colonne `site_key` en base). Exportée pour la synchro des devis
 * lorsque des lignes anciennes n’ont pas la même clé que `VITE_SITE_KEY` actuel.
 */
export { DEFAULT_SITE_KEY };

/**
 * Toutes les valeurs `quotes.site_key` à charger : clé courante, défaut historique,
 * et liste optionnelle `VITE_LEGACY_SITE_KEYS` / `REACT_APP_LEGACY_SITE_KEYS` (séparateur virgule).
 * Permet de ne pas « perdre » l’historique si l’environnement ou la base diffère.
 */
export function getQuoteSiteKeysForSync() {
  const keys = new Set();
  keys.add(SITE_KEY);
  keys.add(DEFAULT_SITE_KEY);
  const legacy = getEnv("VITE_LEGACY_SITE_KEYS") || getEnv("REACT_APP_LEGACY_SITE_KEYS");
  if (legacy != null && String(legacy).trim()) {
    String(legacy)
      .split(",")
      .map((s) => String(s).trim())
      .filter(Boolean)
      .forEach((k) => keys.add(normalizeSiteKey(k)));
  }
  return Array.from(keys);
}

/** Filtre `postgres_changes` Realtime pour `quotes.site_key` (une clé ou opérateur `in.`). */
export function getQuotesRealtimeSiteKeyFilter() {
  const keys = getQuoteSiteKeysForSync();
  if (keys.length === 1) return `site_key=eq.${keys[0]}`;
  return `site_key=in.(${keys.join(",")})`;
}

export const LS_KEYS = {
  activities: "hd_activities",
  quotes: "hd_quotes",
  quoteForm: "hd_quote_form", // Formulaire de devis en cours
  activityForm: "hd_activity_form", // Formulaire d'activité en cours
  messageTemplates: "hd_message_templates", // Templates de messages par activité
  exteriorHotels: "hd_exterior_hotels", // Liste des hôtels avec RDV à l'extérieur
  users: "hd_users", // Cache utilisateurs pour sécurité anti-suppression auto
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
  { key: "autre", label: "Autre" },
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

