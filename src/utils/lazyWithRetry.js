import { lazy } from "react";
import { logger } from "./logger";

const CHUNK_RELOAD_KEY = "hd_chunk_reload";
const ATTEMPT_TIMEOUT_MS = 4000;

function isStaleChunkError(error) {
  const message = String(error?.message || error || "");
  return (
    message.includes("Failed to fetch dynamically imported module") ||
    message.includes("error loading dynamically imported module") ||
    message.includes("Importing a module script failed") ||
    message.includes("Expected a JavaScript-or-Wasm module script") ||
    message.includes("chunk-timeout")
  );
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("chunk-timeout")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
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
 * lazy() avec un délai court, un second essai, puis un rechargement unique si le chunk est périmé.
 */
export function lazyWithRetry(importFn, retries = 1) {
  return lazy(() => {
    const loadModule = (attempt = 0) =>
      withTimeout(importFn(), ATTEMPT_TIMEOUT_MS).catch((error) => {
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
