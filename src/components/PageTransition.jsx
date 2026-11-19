import { motion } from "framer-motion";

/**
 * Transition entre pages / onglets.
 * `transitionKey` : change de valeur => rejoue l'animation (fondu + léger glissement).
 *
 * Perf : pas de `filter: blur()` (re-rasterisait toute la page à chaque image)
 * et pas d'AnimatePresence mode="wait" (l'ancienne page devait finir de
 * disparaître avant que la nouvelle n'apparaisse : ~0,4 s de latence par onglet).
 * Uniquement opacity + transform => animé par le compositeur, 60 fps.
 */
export function PageTransition({ children, transitionKey }) {
  return (
    <motion.div
      key={transitionKey ?? "page"}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

/** Apparition en fondu (montée douce) — pour du contenu ponctuel. */
export function FadeIn({ children, delay = 0, className = "" }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: delay / 1000 }}
    >
      {children}
    </motion.div>
  );
}

/** Apparition avec glissement vers le haut. */
export function SlideUp({ children, delay = 0, className = "" }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1], delay: delay / 1000 }}
    >
      {children}
    </motion.div>
  );
}

/** Apparition avec léger zoom. */
export function ScaleIn({ children, delay = 0, className = "" }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: delay / 1000 }}
    >
      {children}
    </motion.div>
  );
}
