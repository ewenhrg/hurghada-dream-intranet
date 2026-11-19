import { useEffect } from "react";

/**
 * SEO des pages publiques : titre, description, URL canonique, Open Graph / Twitter, robots.
 * L’URL canonique suit le domaine courant (vercel.app aujourd’hui, hurghadadream.com demain) :
 * rien à changer le jour où le domaine bascule.
 */
export const SITE_NAME = "Hurghada Dream";
const DEFAULT_IMAGE = "/client/home-hero-red-sea.jpg";
const DEFAULT_DESCRIPTION =
  "Hurghada Dream, agence française n°1 des activités à Hurghada : excursions en mer Rouge, snorkeling, désert, Louxor, Le Caire et hôtels sélectionnés. Devis gratuit, équipe française 7j/7.";

/** Descriptions par page (Google affiche ~155 caractères). */
const DESCRIPTIONS = {
  "/":
    "Hurghada Dream, agence française n°1 des activités à Hurghada : excursions mer Rouge, snorkeling, quad, Louxor, Le Caire et hôtels sélectionnés. Devis gratuit 7j/7.",
  "/catalogue":
    "Toutes nos excursions à Hurghada : îles et snorkeling, dauphins, désert en quad et buggy, Louxor, Le Caire, Marsa Alam. Prix clairs, devis gratuit sans engagement.",
  "/hotels":
    "Notre sélection d’hôtels à Hurghada et sur la mer Rouge, all inclusive et bord de mer, réservés avec une équipe française sur place. Demandez votre devis gratuit.",
  "/demande-hotel":
    "Demandez un devis d’hôtel à Hurghada : dates, budget, nombre de voyageurs. L’équipe française Hurghada Dream vous répond rapidement avec les meilleures offres.",
  "/sejour":
    "Mon séjour Hurghada Dream : retrouvez vos excursions réservées, horaires de prise en charge et contacts de l’équipe française pendant votre voyage à Hurghada.",
  "/evenements":
    "Mariages, demandes en mariage, anniversaires et séminaires à Hurghada : Hurghada Dream organise vos événements privés sur la mer Rouge, sur mesure.",
  "/contacts":
    "Contactez Hurghada Dream à Hurghada : téléphone et WhatsApp de l’équipe française 7j/7, agence à l’Esplanada mall. Réponse rapide pour vos excursions et hôtels.",
  "/qui-sommes-nous":
    "Qui sommes-nous ? Hurghada Dream, agence locale à Hurghada avec une équipe française : excursions, hôtels et accompagnement de votre séjour en mer Rouge.",
  "/politique":
    "Politique de remboursement et d’annulation Hurghada Dream : conditions pour vos excursions et réservations à Hurghada, expliquées simplement.",
  "/confidentialite":
    "Politique de confidentialité de Hurghada Dream : données collectées, utilisation et vos droits lors de vos demandes de devis et réservations.",
  "/modification":
    "Modifier ou annuler une réservation Hurghada Dream : changez la date ou le nombre de participants de votre excursion à Hurghada en quelques clics.",
  "/tarifs":
    "Tarifs des excursions Hurghada Dream à Hurghada : prix adultes et enfants pour la mer Rouge, le désert, Louxor et Le Caire. Devis gratuit.",
};

/** Titres Google (mots recherchés en premier) ; sinon « Titre de la page · Hurghada Dream ». */
const SEO_TITLES = {
  "/catalogue": "Excursions à Hurghada : mer Rouge, désert, Louxor, Le Caire",
  "/hotels": "Hôtels à Hurghada et sur la mer Rouge",
  "/demande-hotel": "Devis hôtel à Hurghada",
  "/evenements": "Mariages et événements privés à Hurghada",
  "/contacts": "Contact – agence française à Hurghada",
  "/qui-sommes-nous": "Qui sommes-nous – agence française à Hurghada",
  "/politique": "Politique de remboursement",
  "/confidentialite": "Politique de confidentialité",
  "/tarifs": "Tarifs des excursions à Hurghada",
};

/** Pages privées ou sans intérêt pour Google : jamais indexées. */
const NOINDEX_PREFIXES = ["/b2b", "/sejour", "/mon-sejour", "/modification", "/request"];

function normalizePath(pathname) {
  const p = (pathname || "/").replace(/\/+$/, "") || "/";
  return p === "/accueil" ? "/" : p;
}

function descriptionFor(path) {
  if (DESCRIPTIONS[path]) return DESCRIPTIONS[path];
  if (path.startsWith("/catalogue/")) return DESCRIPTIONS["/catalogue"];
  if (path.startsWith("/hotels/")) return DESCRIPTIONS["/hotels"];
  return DEFAULT_DESCRIPTION;
}

function setMeta(attr, key, content) {
  let tag = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!content) {
    tag?.remove();
    return;
  }
  if (!tag) {
    tag = document.createElement("meta");
    tag.setAttribute(attr, key);
    document.head.appendChild(tag);
  }
  tag.setAttribute("content", content);
}

function setCanonical(href) {
  let link = document.head.querySelector('link[rel="canonical"]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "canonical";
    document.head.appendChild(link);
  }
  link.href = href;
}

function toAbsolute(url) {
  if (!url) return "";
  try {
    return new URL(url, window.location.origin).href;
  } catch {
    return "";
  }
}

/** Texte court pour une meta description (retire balises et espaces, coupe proprement). */
export function seoExcerpt(text, max = 155) {
  const clean = String(text || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  return `${cut.slice(0, cut.lastIndexOf(" ") > 80 ? cut.lastIndexOf(" ") : cut.length)}…`;
}

/**
 * @param {object} opts
 * @param {string} [opts.title]        titre de la page (sans le nom du site)
 * @param {string} [opts.fullTitle]    titre complet, tel quel (accueil)
 * @param {string} [opts.description]  sinon description par défaut de la route
 * @param {string} [opts.image]        image de partage (relative ou absolue)
 * @param {boolean} [opts.noindex]
 * @param {string} [opts.pathname]
 */
export function usePageSeo({ title, fullTitle, description, image, noindex, pathname } = {}) {
  useEffect(() => {
    if (typeof document === "undefined") return;
    const path = normalizePath(pathname ?? window.location.pathname);
    const baseTitle = SEO_TITLES[path] || title;
    const pageTitle = fullTitle || (baseTitle ? `${baseTitle} · ${SITE_NAME}` : SITE_NAME);
    const desc = description || descriptionFor(path);
    const url = `${window.location.origin}${path === "/" ? "/" : path}`;
    const img = toAbsolute(image || DEFAULT_IMAGE);
    const hidden = noindex ?? NOINDEX_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));

    document.title = pageTitle;
    setMeta("name", "description", desc);
    setMeta("name", "robots", hidden ? "noindex, follow" : "index, follow, max-image-preview:large");
    setCanonical(url);
    setMeta("property", "og:type", path === "/" ? "website" : "article");
    setMeta("property", "og:site_name", SITE_NAME);
    setMeta("property", "og:locale", "fr_FR");
    setMeta("property", "og:title", pageTitle);
    setMeta("property", "og:description", desc);
    setMeta("property", "og:url", url);
    setMeta("property", "og:image", img);
    setMeta("name", "twitter:card", "summary_large_image");
    setMeta("name", "twitter:title", pageTitle);
    setMeta("name", "twitter:description", desc);
    setMeta("name", "twitter:image", img);
  }, [title, fullTitle, description, image, noindex, pathname]);
}
