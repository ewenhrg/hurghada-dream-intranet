import { Bus, Fish, Landmark, Mountain, Sparkles, Waves } from "lucide-react";
import { CATEGORIES } from "../../constants";

/**
 * Libellés clients des univers. `CATEGORIES` (intranet) contient des libellés en capitales
 * (« LOUXOR & LE CAIRE », « TRANSFERT ») : on les adoucit ici sans toucher aux constantes partagées.
 */
const PUBLIC_CATEGORY_LABELS = {
  desert: "Désert",
  aquatique: "Aquatique",
  exploration_bien_etre: "Exploration & bien-être",
  luxor_caire: "Louxor & Le Caire",
  marsa_alam: "Marsa Alam",
  transfert: "Transferts",
};

export const CATEGORY_ICONS = {
  desert: Mountain,
  aquatique: Waves,
  exploration_bien_etre: Sparkles,
  luxor_caire: Landmark,
  marsa_alam: Fish,
  transfert: Bus,
};

export function getPublicCategoryLabel(categoryKey) {
  if (PUBLIC_CATEGORY_LABELS[categoryKey]) return PUBLIC_CATEGORY_LABELS[categoryKey];
  return CATEGORIES.find((c) => c.key === categoryKey)?.label || "Activité";
}

const MINOR_WORDS = new Set(["de", "du", "des", "la", "le", "les", "et", "à", "a", "en", "au", "aux", "sur", "avec", "ou"]);

/**
 * Affichage seulement : certains noms sont saisis TOUT EN CAPITALES à l’intranet.
 * On les passe en casse de titre (« FANTASTIQUE SAHARA » → « Fantastique Sahara »),
 * en gardant les sigles sans voyelle ou avec chiffres (KTM, 4X4). Les autres noms restent intacts.
 */
export function displayActivityName(name) {
  const raw = String(name || "").trim();
  const letters = raw.replace(/[^\p{L}]/gu, "");
  if (!letters || letters !== letters.toUpperCase()) return raw;
  return raw
    .split(/(\s+)/)
    .map((word, i) => {
      if (/^\s+$/.test(word) || !/\p{L}/u.test(word)) return word;
      if (/\d/.test(word) || !/[AEIOUYÀÂÄÉÈÊËÎÏÔÖÙÛÜ]/u.test(word)) return word;
      const lower = word.toLocaleLowerCase("fr-FR");
      if (i > 0 && MINOR_WORDS.has(lower)) return lower;
      // Gère « D'ÉGYPTE » / « SHARM-EL » : majuscule après apostrophe ou tiret.
      return lower.replace(/(^|['’-])(\p{L})/gu, (_, sep, ch) => sep + ch.toLocaleUpperCase("fr-FR"));
    })
    .join("");
}

export function formatMoney(value, currency = "EUR") {
  const parsed = Number(value);
  const safeValue = Number.isFinite(parsed) ? parsed : 0;
  const digits = Number.isInteger(safeValue) ? 0 : 2;
  try {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: String(currency || "EUR").toUpperCase(),
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(safeValue);
  } catch {
    return `${safeValue} ${currency || "EUR"}`;
  }
}
