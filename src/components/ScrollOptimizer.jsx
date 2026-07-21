import { useEffect, useRef } from "react";

/** Met en pause les effets coûteux pendant le scroll (classe `scrolling` sur body). */
export function ScrollOptimizer({ children }) {
  const scrollTimeoutRef = useRef(null);
  const rafIdRef = useRef(null);

  useEffect(() => {
    let isScrolling = false;

    const handleScroll = () => {
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
