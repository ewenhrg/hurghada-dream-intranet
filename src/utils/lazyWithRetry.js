import { lazy } from "react";
import { logger } from "./logger";

const CHUNK_RELOAD_KEY = "hd_chunk_reload";

function isStaleChunkError(error) {
  const message = String(error?.message || error || "");
  return (
    message.includes("Failed to fetch dynamically imported module") ||
    message.includes("error loading dynamically imported module") ||
    message.includes("Importing a module script failed") ||
    message.includes("Expected a JavaScript-or-Wasm module script")
  );
}

/** Un seul rechargement par session : un chunk périmé après déploiement. */
function reloadOnceForStaleChunk() {
  try {
    if (sessionStorage.getItem(CHUNK_RELOAD_KEY) === "1") return false;
    sessionStorage.setItem(CHUNK_RELOAD_KEY, "1");
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}

export function clearChunkReloadGuard() {
  try {
    sessionStorage.removeItem(CHUNK_RELOAD_KEY);
  } catch {
    /* sessionStorage indisponible */
  }
}

/**
 * lazy() avec un second essai, puis un rechargement unique si le chunk est périmé (déploiement).
 * Pas de délai maximal : sur connexion lente un chunk peut mettre 10 s ou plus. L’ancien délai
 * de 4 s faisait recharger toute la page en boucle puis afficher une erreur (3G, campagne…).
 */
export function lazyWithRetry(importFn, retries = 1) {
  return lazy(() => {
    const loadModule = (attempt = 0) =>
      importFn().catch((error) => {
        logger.warn(`Erreur de chargement du module (tentative ${attempt + 1}/${retries + 1})...`, error);
        if (attempt < retries) {
          return new Promise((resolve) => {
            setTimeout(() => resolve(loadModule(attempt + 1)), 400);
          });
        }
        if (isStaleChunkError(error) && reloadOnceForStaleChunk()) {
          return new Promise(() => {});
        }
        throw error;
      });
    return loadModule();
  });
}
