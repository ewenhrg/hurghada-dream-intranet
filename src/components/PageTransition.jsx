import { motion } from "framer-motion";

/**
 * Changement d’onglet immédiat. L’ancienne animation (fondu + flou) bloquait
 * les grandes pages le temps de quitter l’écran.
 */
export function PageTransition({ children, transitionKey }) {
  return <div key={transitionKey ?? "page"}>{children}</div>;
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
