import { lazy } from "react";
import { logger } from "./logger";

/**
 * lazy() avec retries sur échec de chunk (déploiement / réseau), puis reload en dernier recours.
 */
export function lazyWithRetry(importFn, retries = 3) {
  return lazy(() => {
    const loadModule = (attempt = 0) =>
      importFn().catch((error) => {
        logger.warn(`Erreur de chargement du module (tentative ${attempt + 1}/${retries + 1})...`, error);
        if (attempt < retries) {
          const delay = Math.min(1000 * 2 ** attempt, 5000);
          return new Promise((resolve) => {
            setTimeout(() => resolve(loadModule(attempt + 1)), delay);
          });
        }
        logger.error("Impossible de charger le module après plusieurs tentatives, rechargement de la page...");
        setTimeout(() => window.location.reload(), 2000);
        throw error;
      });
    return loadModule();
  });
}
