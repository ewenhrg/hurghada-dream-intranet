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
 * Remplacer les variables et lignes à trous (Hôtel : ___) dans un template
 * @param {string} template
 * @param {Object} data
 * @param {string} formLink
 * @returns {string}
 */
function applyMessagePlaceholders(template, data, formLink) {
  const name = data.name || "Client";
  const trip = data.trip || "l'activité";
  const date = data.date || "la date";
  const time = String(data.time || "").trim();
  const hotel = String(data.hotel || "").trim();
  const roomNo = String(data.roomNo || "").trim();
  const timeDisplay = time || "à confirmer";
  const hotelDisplay = hotel || "à confirmer";

  const variableMap = {
    name,
    nom: name,
    trip,
    activite: trip,
    activité: trip,
    date,
    time: timeDisplay,
    heure: timeDisplay,
    heure_depart: timeDisplay,
    "heure départ": timeDisplay,
    pickup: timeDisplay,
    pickup_time: timeDisplay,
    hotel: hotelDisplay,
    hôtel: hotelDisplay,
    roomNo,
    chambre: roomNo,
    adults: String(data.adults || 0),
    children: String(data.children || 0),
    infants: String(data.infants || 0),
    formLink,
  };

  let message = template;

  for (const [key, value] of Object.entries(variableMap)) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    message = message.replace(new RegExp(`\\{${escaped}\\}`, "gi"), value);
  }

  // Modèles avec lignes à trous : "Hôtel : ___", "Heure de départ : _____"
  message = message.replace(/H[ôo]tel\s*:\s*_{1,}/gi, `Hôtel : ${hotelDisplay}`);
  message = message.replace(
    /Heure de d[ée]part\s*:\s*_{1,}/gi,
    `Heure de départ : ${timeDisplay}`
  );
  message = message.replace(
    /Heure de prise en charge\s*:\s*_{1,}/gi,
    `Heure de prise en charge : ${timeDisplay}`
  );
  message = message.replace(
    /(?:Pick-up|Pickup|Prise en charge)\s*:\s*_{1,}/gi,
    (match) => match.replace(/_{1,}/, timeDisplay)
  );
  message = message.replace(/Heure\s*:\s*_{1,}/gi, `Heure : ${timeDisplay}`);
  message = message.replace(/Activit[ée]\s*:\s*_{1,}/gi, `Activité : ${trip}`);

  // Lignes vides après les deux-points (sans underscore)
  if (hotel) {
    message = message.replace(/H[ôo]tel\s*:\s*(?=\n|$)/gim, `Hôtel : ${hotel}`);
  }
  if (time) {
    message = message.replace(/Heure de d[ée]part\s*:\s*(?=\n|$)/gim, `Heure de départ : ${time}`);
  }

  return message;
}

function formatTimeDisplay(time) {
  const trimmed = String(time || "").trim();
  return trimmed || "à confirmer";
}

/** En-tête WhatsApp quand la case « Bateau à la marina » est cochée */
function buildMarinaMessageTop(data) {
  const timeDisplay = formatTimeDisplay(data.time);
  const lines = ["🚤 Votre bateau vous attend à la marina de votre hôtel."];
  lines.push(`Heure au bateau : ${timeDisplay}`);
  return `${lines.join("\n")}\n\n`;
}

/** Adapte le corps du message pour un RDV bateau (marina) */
function applyMarinaTimeLabels(message) {
  return message
    .replace(/Heure de d[ée]part/gi, "Heure au bateau")
    .replace(/Heure de prise en charge/gi, "Heure au bateau")
    .replace(/(?:Pick-up|Pickup|Prise en charge)(?=\s*[:：])/gi, "Heure au bateau");
}

/**
 * Déterminer le message RDV en haut (hors case marina manuelle)
 */
function buildRdvMessageTop(data, exteriorHotels) {
  const hotelInfo = findHotelInList(data.hotel, exteriorHotels);

  if (hotelInfo) {
    if (hotelInfo.hasBeachBoats) {
      return `📍 Rendez-vous directement à la marina du ${data.hotel}.\n\n`;
    }
    return "📍 Rendez-vous à l'extérieur de l'hôtel.\n\n";
  }

  return "📍 Rendez-vous devant la réception de l'hôtel.\n\n";
}

/**
 * Générer un lien de formulaire unique pour un client (évite la détection de spam WhatsApp)
 * @returns {string} - Le lien unique avec token
 */
function generateUniqueFormLink() {
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
  const isMarina = rowsWithMarina.has(data.id);
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
    let rdvMessageTop = "";
    if (isMarina) {
      rdvMessageTop = buildMarinaMessageTop(data);
    } else if (data.hotel) {
      rdvMessageTop = buildRdvMessageTop(data, exteriorHotels);
    }

    // Générer un lien unique pour ce client (évite la détection de spam WhatsApp)
    const uniqueFormLink = generateUniqueFormLink();
    let message = applyMessagePlaceholders(template, data, uniqueFormLink);
    if (isMarina) {
      message = applyMarinaTimeLabels(message);
    }

    return rdvMessageTop + message;
  }
  
  // Sinon, utiliser le template par défaut
  const parts = [];
  const timeDisplay = formatTimeDisplay(data.time);

  if (isMarina) {
    parts.push("🚤 Votre bateau vous attend à la marina de votre hôtel.");
    parts.push(`Heure au bateau : ${timeDisplay}`);
    parts.push("");
  } else if (data.hotel) {
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
    parts.push("");
  }

  parts.push(`Bonjour ${data.name || "Client"},`);
  parts.push("");

  if (isMarina) {
    parts.push(
      `Votre excursion ${data.trip || "l'activité"} est prévue le ${data.date || "la date"}.`
    );
  } else {
    parts.push(
      `Votre pick-up pour ${data.trip || "l'activité"} est prévu le ${data.date || "la date"} à ${timeDisplay}.`
    );
  }

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
  parts.push(
    isMarina
      ? "Merci de vous présenter à l'heure indiquée à la marina de votre hôtel."
      : "Merci de vous présenter à l'heure indiquée."
  );
  
  parts.push("");
  parts.push("Cordialement,");
  parts.push("Hurghada Dream");

  return parts.join("\n");
}

