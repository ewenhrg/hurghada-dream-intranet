// Fonctions utilitaires pour la génération de messages

import { findHotelInList } from "./hotelMatcher";
import { generateRequestToken, generateRequestLink } from "./tokenGenerator";

/**
 * Obtenir le template par défaut pour une activité
 * @returns {string} - Le template par défaut
 */
export function getDefaultTemplate() {
  return `Bonjour {name},

Votre pick-up pour {trip} est prévu le {date} à {time}.

📍 Hôtel: {hotel}
🛏️ Chambre: {roomNo}
👥 Participants: {adults} adulte(s), {children} enfant(s), {infants} bébé(s)

Merci de vous présenter à l'heure indiquée.

Cordialement,
Hurghada Dream`;
}

/**
 * Générer un lien de formulaire unique pour un client (évite la détection de spam WhatsApp)
 * @param {Object} data - Les données du client
 * @returns {string} - Le lien unique avec token
 */
function generateUniqueFormLink() {
  // Générer un token unique basé sur les données du client pour avoir un lien différent pour chacun
  // Cela évite que WhatsApp détecte des liens identiques comme du spam
  const token = generateRequestToken();
  return generateRequestLink(token);
}

/**
 * Générer un message pour un client
 * @param {Object} data - Les données du client
 * @param {Object} messageTemplates - Les templates de messages par activité
 * @param {Set} rowsWithMarina - Set des IDs de lignes avec marina cochée
 * @param {Array} exteriorHotels - Liste des hôtels avec RDV à l'extérieur
 * @returns {string} - Le message généré
 */
export function generateMessage(data, messageTemplates = {}, rowsWithMarina = new Set(), exteriorHotels = []) {
  // Vérifier si un template existe pour cette activité
  const activityName = data.trip || "";
  
  // Rechercher le template de manière insensible à la casse
  let template = messageTemplates[activityName];
  
  // Si pas trouvé exactement, chercher avec une correspondance insensible à la casse
  if (!template) {
    const lowerActivityName = activityName.toLowerCase().trim();
    const matchingKey = Object.keys(messageTemplates).find(
      key => key.toLowerCase().trim() === lowerActivityName
    );
    if (matchingKey) {
      template = messageTemplates[matchingKey];
    }
  }
  
  // Si un template personnalisé existe, l'utiliser
  if (template && template.trim() !== "") {
    // Déterminer le message RDV selon l'hôtel (à mettre en haut)
    let rdvMessageTop = "";
    if (data.hotel) {
      // Si la case marina est cochée pour cette ligne, utiliser le message marina
      if (rowsWithMarina.has(data.id)) {
        rdvMessageTop = "📍 Rendez-vous directement à la marina de votre hôtel.\n\n";
      } else {
        const hotelInfo = findHotelInList(data.hotel, exteriorHotels);
        
        if (hotelInfo) {
          if (hotelInfo.hasBeachBoats) {
            rdvMessageTop = `📍 Rendez-vous directement à la marina du ${data.hotel}.\n\n`;
          } else {
            rdvMessageTop = "📍 Rendez-vous à l'extérieur de l'hôtel.\n\n";
          }
        } else {
          rdvMessageTop = "📍 Rendez-vous devant la réception de l'hôtel.\n\n";
        }
      }
    }
    
    // Générer un lien unique pour ce client (évite la détection de spam WhatsApp)
    const uniqueFormLink = generateUniqueFormLink(data);
    
    // Remplacer les variables dans le template
    let message = template
      .replace(/\{name\}/g, data.name || "Client")
      .replace(/\{trip\}/g, data.trip || "l'activité")
      .replace(/\{date\}/g, data.date || "la date")
      .replace(/\{time\}/g, data.time || "l'heure")
      .replace(/\{hotel\}/g, data.hotel || "")
      .replace(/\{roomNo\}/g, data.roomNo || "")
      .replace(/\{adults\}/g, String(data.adults || 0))
      .replace(/\{children\}/g, String(data.children || 0))
      .replace(/\{infants\}/g, String(data.infants || 0))
      .replace(/\{formLink\}/g, uniqueFormLink);
    
    // Ajouter le message RDV en haut du message
    return rdvMessageTop + message;
  }
  
  // Sinon, utiliser le template par défaut
  const parts = [];

  // Déterminer le message RDV selon l'hôtel (à mettre en haut)
  if (data.hotel) {
    // Si la case marina est cochée pour cette ligne, utiliser le message marina
    if (rowsWithMarina.has(data.id)) {
      parts.push("📍 Rendez-vous directement à la marina de votre hôtel.");
    } else {
      const hotelInfo = findHotelInList(data.hotel, exteriorHotels);
      
      if (hotelInfo) {
        if (hotelInfo.hasBeachBoats) {
          parts.push(`📍 Rendez-vous directement à la marina du ${data.hotel}.`);
        } else {
          parts.push("📍 Rendez-vous à l'extérieur de l'hôtel.");
        }
      } else {
        parts.push("📍 Rendez-vous devant la réception de l'hôtel.");
      }
    }
    parts.push("");
  }

  parts.push(`Bonjour ${data.name || "Client"},`);
  parts.push("");
  parts.push(`Votre pick-up pour ${data.trip || "l'activité"} est prévu le ${data.date || "la date"} à ${data.time || "l'heure"}.`);

  if (data.hotel) {
    parts.push(`📍 Hôtel: ${data.hotel}`);
  }

  if (data.roomNo) {
    parts.push(`🛏️ Chambre: ${data.roomNo}`);
  }

  const participants = [];
  if (data.adults > 0) participants.push(`${data.adults} adulte(s)`);
  if (data.children > 0) participants.push(`${data.children} enfant(s)`);
  if (data.infants > 0) participants.push(`${data.infants} bébé(s)`);
  
  if (participants.length > 0) {
    parts.push(`👥 Participants: ${participants.join(", ")}`);
  }

  parts.push("");
  parts.push("Merci de vous présenter à l'heure indiquée.");
  
  parts.push("");
  parts.push("Cordialement,");
  parts.push("Hurghada Dream");

  return parts.join("\n");
}

