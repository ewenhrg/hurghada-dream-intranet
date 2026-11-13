import { useLayoutEffect } from "react";
import { useLocation } from "react-router-dom";
import { ScrollTrigger } from "./motion";

/**
 * Remonte en haut à chaque navigation client, puis recalcule ScrollTrigger
 * une fois le layout / les images stabilisés (évite les sauts de scroll).
 */
export function PublicScrollRestore() {
  const { pathname, search, hash } = useLocation();

  useLayoutEffect(() => {
    if (hash) return undefined;

    const top = window.scrollY || document.documentElement.scrollTop || 0;
    if (top > 0) {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    }

    let cancelled = false;
    const refresh = () => {
      if (cancelled) return;
      try {
        ScrollTrigger.refresh();
      } catch {
        /* ScrollTrigger pas encore prêt */
      }
    };

    const raf = window.requestAnimationFrame(() => {
      refresh();
      window.setTimeout(refresh, 120);
      window.setTimeout(refresh, 420);
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(raf);
    };
  }, [pathname, search, hash]);

  return null;
}
