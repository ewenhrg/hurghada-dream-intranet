import { useLayoutEffect } from "react";
import { useLocation } from "react-router-dom";
import { ScrollTrigger } from "./motion";

/**
 * Remonte en haut à chaque navigation client, puis recalcule ScrollTrigger
 * une fois le layout stabilisé.
 */
export function PublicScrollRestore() {
  const { pathname, hash } = useLocation();

  useLayoutEffect(() => {
    if (hash) return undefined;

    // Forcer le scroll sur le document (html), pas un conteneur interne.
    document.body.style.removeProperty("overflow");
    const top = window.scrollY || document.documentElement.scrollTop || 0;
    if (top > 0) {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      try {
        ScrollTrigger.refresh();
      } catch {
        /* ScrollTrigger pas encore prêt */
      }
    }, 200);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [pathname, hash]);

  return null;
}
