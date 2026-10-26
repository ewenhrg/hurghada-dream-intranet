/**
 * Helper pour gérer les permissions utilisateur
 * Utilise la config centralisée (constants/permissions.js) pour la cohérence
 */

import { logger } from "./logger";
import { getDefaultPermissionForm } from "../constants/permissions";

/**
 * Applique les valeurs par défaut manquantes.
 * Ne force plus tous les accès pour Ewen/Léa/Sophia/Karim : les cases en base font foi.
 * @param {Object} userData - Données utilisateur (session)
 * @returns {Object|null} - Données utilisateur avec permissions configurées
 */
export function configureUserPermissions(userData) {
  if (!userData) return null;

  const defaults = getDefaultPermissionForm();
  Object.entries(defaults).forEach(([key, value]) => {
    if (userData[key] === undefined) {
      userData[key] = value;
    }
  });

  return userData;
}

/**
 * Charge l'utilisateur depuis sessionStorage avec permissions configurées
 * @returns {Object|null} - Données utilisateur ou null
 */
export function loadUserFromSession() {
  try {
    const userStr = sessionStorage.getItem("hd_user");
    if (!userStr) return null;

    const userData = JSON.parse(userStr);
    return configureUserPermissions(userData);
  } catch (e) {
    logger.error("Erreur lors de la lecture des données utilisateur:", e);
    return null;
  }
}
