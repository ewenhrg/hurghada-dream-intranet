import { useEffect, useRef } from "react";

/**
 * Met en pause les effets coûteux pendant le scroll (classe `scrolling` sur body).
 * Désactivé sur le site public : les règles `.scrolling` cassent les transforms GSAP
 * et rendent le scroll saccadé avec parallax / révélations.
 */
export function ScrollOptimizer({ children }) {
  const scrollTimeoutRef = useRef(null);
  const rafIdRef = useRef(null);

  useEffect(() => {
    let isScrolling = false;

    const isPublicSurface = () =>
      Boolean(document.querySelector(".hd-public-catalog")) ||
      document.documentElement.classList.contains("hd-public-boot");

    const handleScroll = () => {
      if (isPublicSurface()) {
        if (document.body.classList.contains("scrolling")) {
          document.body.classList.remove("scrolling");
        }
        return;
      }

      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);

      rafIdRef.current = requestAnimationFrame(() => {
        if (!isScrolling) {
          isScrolling = true;
          document.body.classList.add("scrolling");
        }
        if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
        scrollTimeoutRef.current = setTimeout(() => {
          isScrolling = false;
          document.body.classList.remove("scrolling");
        }, 150);
      });
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
      document.body.classList.remove("scrolling");
    };
  }, []);

  return <>{children}</>;
}
