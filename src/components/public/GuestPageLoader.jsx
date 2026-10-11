import { useRef } from "react";
import "@fontsource-variable/figtree";
import "@fontsource-variable/fraunces/opsz.css";
import "@fontsource-variable/fraunces/opsz-italic.css";
import { gsap, useGSAP } from "./motion";

/** Loader de marque, sobre : monogramme serif + trait fin qui se trace en boucle. */
export function HdLoader({ label = "Un instant…", className = "" }) {
  const ref = useRef(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap
          .timeline({ repeat: -1 })
          .fromTo("[data-loader-line]", { scaleX: 0, transformOrigin: "0% 50%" }, { scaleX: 1, duration: 0.9, ease: "power3.inOut" })
          .to("[data-loader-line]", { scaleX: 0, transformOrigin: "100% 50%", duration: 0.7, ease: "power3.inOut" });
        gsap.fromTo("[data-loader-mark]", { autoAlpha: 0.5 }, { autoAlpha: 1, duration: 1.2, ease: "sine.inOut", repeat: -1, yoyo: true });
      });
    },
    { scope: ref }
  );

  return (
    <div ref={ref} className={`flex flex-col items-center justify-center ${className}`} role="status" aria-live="polite">
      <p data-loader-mark className="font-catalog-display text-[2rem] leading-none text-catalog-ink">
        Hurghada <span className="hdc-serif text-catalog-coral">Dream</span>
      </p>
      <div className="mt-4 h-px w-20 overflow-hidden bg-catalog-border">
        <div data-loader-line className="h-full bg-catalog-lagoon" />
      </div>
      <p className="mt-4 text-xs font-medium text-catalog-muted">{label}</p>
    </div>
  );
}

export default function GuestPageLoader() {
  return (
    <div className="hd-public-catalog flex min-h-screen flex-col items-center justify-center bg-catalog-bg px-6">
      <HdLoader />
    </div>
  );
}
