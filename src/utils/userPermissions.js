/**
 * Helper pour gérer les permissions utilisateur
 * Utilise la config centralisée (constants/permissions.js) pour la cohérence
 */

import { logger } from "./logger";
import { getDefaultPermissionForm, hasFullIntranetAccess } from "../constants/permissions";

/**
 * Accorde tous les droits d’accès (comme Ewen).
 * @param {Object} userData
 */
function applyFullIntranetPermissions(userData) {
  userData.canDeleteQuote = true;
  userData.canAddActivity = true;
  userData.canEditActivity = true;
  userData.canDeleteActivity = true;
  userData.canResetData = true;
  userData.canAccessActivities = true;
  userData.canAccessHistory = true;
  userData.canAccessTickets = true;
  userData.canAccessModifications = true;
  userData.canAccessSituation = true;
  userData.canAccessUsers = true;
  userData.canAccessActivityPrices = true;
}

/**
 * Applique les valeurs par défaut manquantes puis les overrides accès complet (Ewen / Léa / Sophia / Karim)
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

  if (hasFullIntranetAccess(userData)) {
    applyFullIntranetPermissions(userData);
  }

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
