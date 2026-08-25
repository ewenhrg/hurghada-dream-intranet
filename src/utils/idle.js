/**
 * Exécute un travail non urgent (sérialisation, écriture localStorage, calcul de
 * cache) quand le navigateur est inactif, pour ne pas voler d'images au rendu.
 *
 * Repli sur setTimeout là où requestIdleCallback n'existe pas (Safari ancien).
 *
 * @param {() => void} task
 * @param {{ timeout?: number }} [options] délai max avant exécution forcée
 * @returns {() => void} annulation
 */
export function runWhenIdle(task, { timeout = 2000 } = {}) {
  if (typeof task !== "function") return () => {};

  if (typeof window !== "undefined" && typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(task, { timeout });
    return () => window.cancelIdleCallback?.(id);
  }

  const id = setTimeout(task, 1);
  return () => clearTimeout(id);
}

/**
 * `setInterval` qui saute les tours pendant que l'onglet est en arrière-plan,
 * puis rattrape au retour au premier plan (au plus une fois par `minCatchUpMs`).
 *
 * Sur mobile et petit portable, un sondage réseau qui continue onglet caché
 * réveille la radio et le CPU pour rien. Les données restent fraîches : le
 * rattrapage a lieu dès que l'écran redevient visible.
 *
 * @param {() => void} tick
 * @param {number} intervalMs
 * @param {{ minCatchUpMs?: number }} [options]
 * @returns {() => void} fonction d'arrêt (à retourner depuis un useEffect)
 */
export function setVisibilityAwareInterval(tick, intervalMs, { minCatchUpMs = intervalMs } = {}) {
  let lastRun = Date.now();

  const run = () => {
    lastRun = Date.now();
    tick();
  };

  const id = setInterval(() => {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    run();
  }, intervalMs);

  const onVisible = () => {
    if (document.visibilityState !== "visible") return;
    if (Date.now() - lastRun < minCatchUpMs) return;
    run();
  };

  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", onVisible);
  }

  return () => {
    clearInterval(id);
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", onVisible);
    }
  };
}
