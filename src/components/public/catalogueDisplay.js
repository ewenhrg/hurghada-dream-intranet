import { Bus, Fish, Landmark, Mountain, Sparkles, Waves } from "lucide-react";
import { CATEGORIES } from "../../constants";
import { publicLocale, t } from "../../i18n/translations";

/**
 * Libellés clients des univers. `CATEGORIES` (intranet) contient des libellés en capitales
 * (« LOUXOR & LE CAIRE », « TRANSFERT ») : on les adoucit ici sans toucher aux constantes partagées.
 */
const PUBLIC_CATEGORY_KEYS = {
  desert: "public.category.desert",
  aquatique: "public.category.aquatique",
  exploration_bien_etre: "public.category.exploration_bien_etre",
  luxor_caire: "public.category.luxor_caire",
  marsa_alam: "public.category.marsa_alam",
  transfert: "public.category.transfert",
};

export const CATEGORY_ICONS = {
  desert: Mountain,
  aquatique: Waves,
  exploration_bien_etre: Sparkles,
  luxor_caire: Landmark,
  marsa_alam: Fish,
  transfert: Bus,
};

export function getPublicCategoryLabel(categoryKey, language = "fr") {
  const key = PUBLIC_CATEGORY_KEYS[categoryKey];
  if (key) return t(key, language);
  return CATEGORIES.find((c) => c.key === categoryKey)?.label || t("public.category.fallback", language);
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

export function formatMoney(value, currency = "EUR", language = "fr") {
  const parsed = Number(value);
  const safeValue = Number.isFinite(parsed) ? parsed : 0;
  const digits = Number.isInteger(safeValue) ? 0 : 2;
  try {
    return new Intl.NumberFormat(publicLocale(language), {
      style: "currency",
      currency: String(currency || "EUR").toUpperCase(),
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(safeValue);
  } catch {
    return `${safeValue} ${currency || "EUR"}`;
  }
}
