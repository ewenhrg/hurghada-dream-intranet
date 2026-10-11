import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(useGSAP, ScrollTrigger, SplitText);
ScrollTrigger.config({ ignoreMobileResize: true });

/**
 * Motion « luxe éditorial » : présent mais calme. Sorties power3 / expo, aucun rebond,
 * déplacements courts (16–24 px), durées 0.5–0.9 s, stagger serré.
 */
export const MOTION = { out: "power3.out", expo: "expo.out", soft: "power2.out" };

const FULL_MOTION = "(prefers-reduced-motion: no-preference)";
const REDUCED = "(prefers-reduced-motion: reduce)";
const CLEAR = "transform,opacity,visibility,clipPath";

function prefersReduced() {
  return typeof window !== "undefined" && window.matchMedia(REDUCED).matches;
}

/** Lecture ponctuelle de la préférence système (ex. : ne pas lancer de vidéo décorative). */
export const prefersReducedMotion = prefersReduced;

/** Vol photo carte → fiche : clone posé par startPhotoFlight, posé à sa place par l’écran suivant. */
let flight = null;
const inset = (t, rgt, b, l, rad) => `inset(${t}px ${rgt}px ${b}px ${l}px round ${rad}px)`;

function dropFlight(clone) {
  gsap.to(clone, { autoAlpha: 0, duration: 0.35, ease: MOTION.soft, overwrite: "auto", onComplete: () => clone.remove() });
}

/** Cible d’atterrissage visible : `data-flight-target` en priorité, sinon la photo hero. */
function findFlightTarget(root) {
  const candidates = [...root.querySelectorAll("[data-flight-target]"), ...root.querySelectorAll("[data-hero-media]")];
  return candidates.find((el) => el.getBoundingClientRect().width > 0) || null;
}

/** Appelé par l’écran d’arrivée : la photo rejoint exactement le cadre cible puis s’efface. */
function landFlight(root) {
  if (!flight) return false;
  const target = findFlightTarget(root);
  if (!target) return false;
  const { clone, timer } = flight;
  flight = null;
  window.clearTimeout(timer);
  const r = target.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const radius = parseFloat(window.getComputedStyle(target).borderTopLeftRadius) || 20;
  gsap.to(clone, {
    clipPath: inset(r.top, vw - r.right, vh - r.bottom, r.left, radius),
    duration: 0.5,
    ease: "power3.inOut",
    overwrite: "auto",
    onComplete: () => dropFlight(clone),
  });
  return true;
}

/**
 * Élément partagé : la photo de la carte s’agrandit vers la fiche (clone fixe ouvert par
 * clip-path), puis la fiche la pose sur son propre cadre (`data-flight-target` /
 * `data-hero-media`) et la laisse fondre. À appeler juste avant navigate().
 */
export function startPhotoFlight(img) {
  if (!img || prefersReduced()) return;
  const src = img.currentSrc || img.src;
  if (!src) return;
  if (flight) {
    window.clearTimeout(flight.timer);
    flight.clone.remove();
  }
  const r = img.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  // Approche : sous le header de l’écran courant, à la hauteur du hero mobile.
  const header = document.querySelector(".hd-public-catalog > header");
  const heroTop = header ? Math.round(header.getBoundingClientRect().height) : 58;
  const heroH = Math.min(Math.max(vh * 0.52, 340), 520);
  const side = vw >= 768 ? Math.max(24, (vw - Math.min(vw, 1280)) / 2 + 32) : 16;
  const clone = document.createElement("img");
  clone.src = src;
  clone.alt = "";
  clone.setAttribute("aria-hidden", "true");
  Object.assign(clone.style, {
    position: "fixed",
    left: "0px",
    top: "0px",
    width: `${vw}px`,
    height: `${vh}px`,
    objectFit: "cover",
    zIndex: "9998",
    pointerEvents: "none",
  });
  document.body.appendChild(clone);
  gsap.fromTo(
    clone,
    { clipPath: inset(r.top, vw - r.right, vh - r.bottom, r.left, 20) },
    { clipPath: inset(heroTop, side, Math.max(0, vh - heroTop - heroH), side, 20), duration: 0.7, ease: "power3.inOut" }
  );
  // Filet de sécurité : fiche lente ou sans cadre → la photo s’efface seule.
  const timer = window.setTimeout(() => {
    if (flight?.clone !== clone) return;
    flight = null;
    dropFlight(clone);
  }, 2200);
  flight = { clone, timer };
}

function fresh(root, attr, value) {
  const sel = value ? `[${attr}="${value}"]` : `[${attr}]`;
  const mark = `data-done-${attr.replace("data-", "")}${value ? `-${value}` : ""}`;
  const els = Array.from(root.querySelectorAll(`${sel}:not([${mark}])`));
  els.forEach((el) => el.setAttribute(mark, ""));
  return els;
}

/**
 * Entrée d’écran, pilotée par attributs (scope = écran) :
 * - `data-hero-media` : photo hero révélée par un masque qui s’ouvre + léger dézoom (`data-hero-img`)
 * - `data-split`      : titre mot par mot, montée courte depuis un masque
 * - `data-reveal="item"` : blocs ; visibles à l’arrivée → cascade d’entrée, plus bas → révélés au scroll
 * - `data-reveal="card"` : cartes au scroll (y 24, stagger 30 ms, photo qui se dévoile)
 * - `data-heading`    : titre de section, mots qui montent depuis un masque quand il entre à l’écran
 * Animations fromTo explicites : un double passage ne peut pas figer l’état de départ.
 */
export function useScreenIntro(scopeRef, dependencies = []) {
  useGSAP(
    () => {
      const root = scopeRef.current;
      if (!root) return;
      const flight = landFlight(root);
      const base = flight ? 0.45 : 0.05;

      const media = fresh(root, "data-hero-media");
      const words = fresh(root, "data-split");
      const items = fresh(root, "data-reveal", "item");
      const cards = fresh(root, "data-reveal", "card");
      const headings = fresh(root, "data-heading");
      // Lecture groupée avant toute écriture : ce qui est déjà à l’écran entre tout de suite,
      // le reste attend le scroll (rythme de lecture au lieu d’une cascade invisible).
      const fold = window.innerHeight * 0.92;
      const tops = items.map((el) => el.getBoundingClientRect().top);
      const introItems = items.filter((_, i) => tops[i] < fold);
      const scrollItems = items.filter((_, i) => tops[i] >= fold);

      const mm = gsap.matchMedia();
      mm.add(FULL_MOTION, () => {
        media.forEach((el) => {
          const img = el.querySelector("[data-hero-img]");
          if (!flight) {
            gsap.fromTo(
              el,
              { clipPath: "inset(0% 0% 100% 0% round 20px)" },
              { clipPath: "inset(0% 0% 0% 0% round 20px)", duration: 0.9, ease: MOTION.expo, delay: base, clearProps: "clipPath" }
            );
          }
          if (img) gsap.fromTo(img, { scale: 1.08 }, { scale: 1, duration: 1.4, ease: MOTION.expo, delay: base });
        });

        words.forEach((el) => {
          const split = SplitText.create(el, { type: "words", wordsClass: "hdc-w", mask: "words" });
          gsap.fromTo(
            split.words,
            { yPercent: 100 },
            { yPercent: 0, duration: 0.8, ease: MOTION.expo, stagger: 0.04, delay: base + 0.1 + (Number(el.dataset.split) || 0) }
          );
        });

        if (introItems.length) {
          gsap.fromTo(
            introItems,
            { y: 20, autoAlpha: 0 },
            { y: 0, autoAlpha: 1, duration: 0.7, ease: MOTION.out, stagger: 0.06, delay: base + 0.15, clearProps: CLEAR }
          );
        }

        if (scrollItems.length) {
          gsap.set(scrollItems, { y: 28, autoAlpha: 0 });
          ScrollTrigger.batch(scrollItems, {
            start: "top bottom-=40",
            once: true,
            onEnter: (batch) =>
              gsap.to(batch, { y: 0, autoAlpha: 1, duration: 0.8, ease: MOTION.out, stagger: 0.07, overwrite: true, clearProps: CLEAR }),
          });
        }

        headings.forEach((el) => {
          const split = SplitText.create(el, { type: "words", wordsClass: "hdc-w", mask: "words" });
          gsap.fromTo(
            split.words,
            { yPercent: 110 },
            {
              yPercent: 0,
              duration: 0.9,
              ease: MOTION.expo,
              stagger: 0.045,
              scrollTrigger: { trigger: el, start: "top bottom-=40", once: true },
            }
          );
        });

        if (cards.length) {
          gsap.set(cards, { y: 64, autoAlpha: 0 });
          ScrollTrigger.batch(cards, {
            start: "top 92%",
            once: true,
            onEnter: (batch) => {
              gsap.to(batch, { y: 0, autoAlpha: 1, duration: 0.95, ease: MOTION.out, stagger: 0.08, overwrite: true, clearProps: CLEAR });
              batch.forEach((card, i) => {
                const mediaEl = card.querySelector("[data-card-media]");
                if (!mediaEl) return;
                gsap.fromTo(
                  mediaEl,
                  { clipPath: "inset(22% 14% 22% 14% round 24px)" },
                  { clipPath: "inset(0% 0% 0% 0% round 0px)", duration: 1.15, ease: MOTION.expo, delay: i * 0.08, clearProps: "clipPath" }
                );
                const img = mediaEl.querySelector("img");
                if (img) gsap.fromTo(img, { scale: 1.28 }, { scale: 1, duration: 1.4, ease: MOTION.expo, delay: i * 0.08, clearProps: "transform" });
              });
            },
          });
        }
        if (cards.length || scrollItems.length || headings.length) ScrollTrigger.refresh();
      });

      mm.add(REDUCED, () => {
        if (!items.length && !cards.length) return;
        gsap.fromTo([...items, ...cards], { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.25, clearProps: "opacity,visibility" });
      });
    },
    { scope: scopeRef, dependencies }
  );
}

/**
 * Arrivée de l’accueil : le premier écran est une fente de mer, pas l’image déjà ouverte.
 * Le CSS pose cette fente avant JS. Puis le fil d’horizon se trace, l’image s’ouvre en grand,
 * un éclat de lumière la traverse, et le titre monte mot à mot. Au scroll, la scène dérive.
 * Réduit : le CSS n’enferme pas l’image, tout est déjà en place.
 */
export function useHeroArrival(scopeRef, ready = true) {
  useGSAP(
    () => {
      const root = scopeRef.current;
      if (!root || !ready) return;
      const mm = gsap.matchMedia();
      mm.add(FULL_MOTION, () => {
        const split = SplitText.create("[data-hero-title]", { type: "words", mask: "words", wordsClass: "hdc-w" });
        gsap
          .timeline({ defaults: { ease: MOTION.expo } })
          .fromTo("[data-horizon]", { scaleX: 0 }, { scaleX: 1, duration: 0.7, ease: "power3.inOut" }, 0)
          .fromTo(
            "[data-hero-frame]",
            { clipPath: "inset(42% 10% 42% 10% round 36px)" },
            { clipPath: "inset(0% 0% 0% 0% round 0px)", duration: 1.45, ease: "expo.inOut" },
            0.42
          )
          .fromTo("[data-hero-stage]", { scale: 1.55 }, { scale: 1, duration: 2.4, ease: "power3.out" }, 0.42)
          .fromTo("[data-hero-flare]", { xPercent: -140 }, { xPercent: 240, duration: 1.15, ease: "power2.inOut" }, 0.65)
          .fromTo("[data-hero-flare]", { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.2 }, 0.65)
          .to("[data-hero-flare]", { autoAlpha: 0, duration: 0.35, ease: "power1.out" }, 1.45)
          .to("[data-horizon]", { autoAlpha: 0, duration: 0.4, ease: "power1.out" }, 1.05)
          .fromTo("[data-hero-eyebrow]", { y: 18, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.7 }, 1.15)
          .fromTo("[data-hero-rule]", { scaleX: 0 }, { scaleX: 1, duration: 0.7, ease: MOTION.out }, 1.15)
          .fromTo(split.words, { yPercent: 130 }, { yPercent: 0, duration: 0.95, stagger: 0.07 }, 1.22)
          .fromTo("[data-hero-sub]", { y: 20, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.75 }, 1.7)
          .fromTo("[data-hero-chip]", { y: 22, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.7, stagger: 0.08 }, 1.9)
          .fromTo("[data-hero-cue]", { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 0.6, ease: "power1.out" }, 2.15);

        gsap.to("[data-hero-stage]", {
          yPercent: 10,
          ease: "none",
          scrollTrigger: { trigger: root, start: "top top", end: "bottom top", scrub: 0.6 },
        });
        gsap.to("[data-hero-copy]", {
          y: -48,
          autoAlpha: 0,
          ease: "none",
          scrollTrigger: { trigger: root, start: "top top", end: "55% top", scrub: 0.6 },
        });
        gsap.to("[data-hero-cue]", {
          autoAlpha: 0,
          ease: "none",
          scrollTrigger: { trigger: root, start: "top top", end: "15% top", scrub: true },
        });
      });
    },
    { scope: scopeRef, dependencies: [ready], revertOnUpdate: true }
  );
}

/**
 * Motion lié au scroll, très léger : `data-parallax` (amplitude %, défaut 6) et
 * `data-kenburns` (zoom lent 1 → 1.06 en boucle) sur les photos.
 */
export function useScrollMotion(scopeRef, dependencies = []) {
  useGSAP(
    () => {
      const root = scopeRef.current;
      if (!root) return;
      const parallax = fresh(root, "data-parallax");
      const kenburns = fresh(root, "data-kenburns");
      const mm = gsap.matchMedia();
      mm.add(FULL_MOTION, () => {
        parallax.forEach((el) => {
          const amount = Number(el.dataset.parallax) || 6;
          gsap.set(el, { scale: 1 + amount / 50 });
          gsap.fromTo(
            el,
            { yPercent: -amount },
            { yPercent: amount, ease: "none", scrollTrigger: { trigger: el.parentElement, start: "top bottom", end: "bottom top", scrub: 0.6 } }
          );
        });
        kenburns.forEach((el, i) => {
          gsap.fromTo(el, { scale: 1 }, { scale: 1.06, duration: 16 + (i % 3) * 3, ease: "sine.inOut", repeat: -1, yoyo: true });
        });
      });
    },
    { scope: scopeRef, dependencies }
  );

  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) gsap.globalTimeline.pause();
      else gsap.globalTimeline.resume();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);
}

/** Header : fond ivoire flouté qui apparaît en douceur au scroll, titre qui entre. */
export function useHeaderMorph(headerRef) {
  useGSAP(() => {
    const header = headerRef.current;
    if (!header) return;
    const bg = header.querySelector(".hdc-header-bg");
    const title = header.querySelector("[data-header-title]");
    const mm = gsap.matchMedia();
    mm.add(FULL_MOTION, () => {
      if (bg && !header.hasAttribute("data-solid")) {
        gsap.fromTo(bg, { autoAlpha: 0 }, { autoAlpha: 1, ease: "none", scrollTrigger: { start: 0, end: 120, scrub: 0.3 } });
      }
      if (title) gsap.fromTo(title, { y: 6, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.6, ease: MOTION.out, clearProps: "transform" });
    });
    mm.add(REDUCED, () => {
      if (bg) gsap.set(bg, { autoAlpha: 1 });
    });
  });
}

/**
 * Pression discrète déléguée sur tout `data-press` : scale 0.98 puis retour doux.
 * `scale` CSS (indépendant de `transform`, que le CSS global intranet force à none au survol).
 */
export function usePressFeedback(scopeRef) {
  useGSAP(
    (_context, contextSafe) => {
      const root = scopeRef.current;
      if (!root) return undefined;
      let active = null;
      const onDown = contextSafe((event) => {
        if (prefersReduced()) return;
        const el = event.target.closest?.("[data-press]");
        if (!el || !root.contains(el) || el.disabled || el.getAttribute("aria-disabled") === "true") return;
        active = el;
        gsap.to(el, { "--hdc-press": 0.98, duration: 0.15, ease: MOTION.soft, overwrite: "auto" });
      });
      const onUp = contextSafe(() => {
        if (!active) return;
        gsap.to(active, { "--hdc-press": 1, duration: 0.35, ease: MOTION.out, overwrite: "auto" });
        active = null;
      });
      root.addEventListener("pointerdown", onDown, { passive: true });
      window.addEventListener("pointerup", onUp, { passive: true });
      window.addEventListener("pointercancel", onUp, { passive: true });
      return () => {
        root.removeEventListener("pointerdown", onDown);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
      };
    },
    { scope: scopeRef }
  );
}

/** Légère pulsation quand une valeur change (compteur panier). */
export function usePopOnChange(targetRef, value) {
  const first = useRef(true);
  useGSAP(
    () => {
      if (first.current) {
        first.current = false;
        return;
      }
      if (!targetRef.current || prefersReduced()) return;
      gsap.fromTo(targetRef.current, { scale: 1.18 }, { scale: 1, duration: 0.4, ease: MOTION.out, clearProps: "transform" });
    },
    { dependencies: [value] }
  );
}

/** Ouverture d’un panneau modal : voile en fondu, panneau qui glisse, contenu en cascade courte. */
export function useSheetEnter(scopeRef, { from = "bottom" } = {}) {
  useGSAP(
    () => {
      const root = scopeRef.current;
      if (!root) return;
      const panel = root.querySelector("[data-sheet]");
      const scrim = root.querySelector("[data-scrim]");
      const mm = gsap.matchMedia();
      mm.add(FULL_MOTION, () => {
        if (scrim) gsap.fromTo(scrim, { opacity: 0 }, { opacity: 1, duration: 0.3, ease: "power1.out", clearProps: "opacity" });
        if (panel) {
          gsap.fromTo(
            panel,
            from === "right" ? { xPercent: 100 } : { yPercent: 100 },
            { xPercent: 0, yPercent: 0, duration: 0.55, ease: MOTION.out, clearProps: CLEAR }
          );
          const inner = panel.querySelectorAll("[data-sheet-item]");
          if (inner.length) {
            gsap.fromTo(
              inner,
              { y: 14, autoAlpha: 0 },
              { y: 0, autoAlpha: 1, duration: 0.5, stagger: 0.04, delay: 0.15, ease: MOTION.out, clearProps: CLEAR }
            );
          }
        }
      });
    },
    { scope: scopeRef }
  );
}

export { gsap, useGSAP, SplitText, ScrollTrigger };
