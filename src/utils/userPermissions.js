/**
 * Helper pour gérer les permissions utilisateur
 * Évite la duplication de code dans App.jsx
 */

import { logger } from "./logger";

/**
 * Configure les permissions par défaut pour un utilisateur
 * @param {Object} userData - Données utilisateur
 * @returns {Object} - Données utilisateur avec permissions configurées
 */
export function configureUserPermissions(userData) {
  if (!userData) return null;

  // S'assurer que les valeurs par défaut sont correctes pour l'accès aux pages
  if (userData.canAccessActivities === undefined) userData.canAccessActivities = true;
  if (userData.canAccessHistory === undefined) userData.canAccessHistory = true;
  if (userData.canAccessTickets === undefined) userData.canAccessTickets = true;

  // Donner tous les accès à Léa sauf canResetData
  if (userData.name === "Léa") {
    userData.canDeleteQuote = true;
    userData.canAddActivity = true;
    userData.canEditActivity = true;
    userData.canDeleteActivity = true;
    userData.canAccessActivities = true;
    userData.canAccessHistory = true;
    userData.canAccessTickets = true;
    userData.canAccessModifications = true;
    userData.canAccessSituation = true;
    userData.canAccessUsers = true;
    userData.canResetData = false; // Ne pas donner l'accès au reset
  }

  // Donner tous les accès à Ewen
  if (userData.name === "Ewen") {
    userData.canAccessModifications = true;
    userData.canAccessSituation = true;
    userData.canAccessUsers = true;
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

