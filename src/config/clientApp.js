/** Build appli store (Capacitor) : pas d’intranet. */
export const IS_CLIENT_APP = import.meta.env.VITE_CLIENT_APP === "true";

/** Accueil client. Sur le site, `/` reste l’intranet. */
export const PUBLIC_HOME_PATH = IS_CLIENT_APP ? "/" : "/accueil";

export function isPublicHomePath(path) {
  const p = path || "";
  if (p === "/accueil" || p.startsWith("/accueil/")) return true;
  return IS_CLIENT_APP && (p === "/" || p === "");
}

/** Page parente, ou `null` si on est déjà à l’accueil. */
export function publicBackPath(path) {
  const p = path || "";
  if (isPublicHomePath(p)) return null;
  if (/^\/hotels\/[^/]+\/?$/.test(p)) return "/hotels";
  if (/^\/catalogue\/activity\/[^/]+\/?$/.test(p)) return "/catalogue";
  if (/^\/b2b\/activity\/[^/]+\/?$/.test(p)) return "/b2b";
  if (p === "/demande-hotel" || p.startsWith("/demande-hotel/")) return "/hotels";
  return PUBLIC_HOME_PATH;
}

export function isPublicClientPath(path) {
  const p = path || "";
  return (
    isPublicHomePath(p) ||
    p === "/tarifs" ||
    p === "/tarifs/" ||
    p === "/catalogue" ||
    p.startsWith("/catalogue/") ||
    p === "/hotels" ||
    p.startsWith("/hotels/") ||
    p === "/demande-hotel" ||
    p.startsWith("/demande-hotel/") ||
    p === "/contacts" ||
    p.startsWith("/contacts/") ||
    p === "/politique" ||
    p.startsWith("/politique/") ||
    p === "/confidentialite" ||
    p.startsWith("/confidentialite/") ||
    p === "/qui-sommes-nous" ||
    p.startsWith("/qui-sommes-nous/") ||
    p === "/sejour" ||
    p.startsWith("/sejour/") ||
    p === "/mon-sejour" ||
    p.startsWith("/mon-sejour/") ||
    p === "/b2b" ||
    p.startsWith("/b2b/") ||
    p === "/evenements" ||
    p.startsWith("/evenements/") ||
    p === "/modification" ||
    p.startsWith("/modification/") ||
    p.startsWith("/request")
  );
}
