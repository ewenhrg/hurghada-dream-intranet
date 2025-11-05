// Fonctions utilitaires pour l'extraction et la validation de numéros de téléphone

/**
 * Extraire le numéro de téléphone depuis le champ "Name"
 * @param {string} nameField - Le champ contenant le nom et potentiellement le téléphone
 * @returns {string|null} - Le numéro de téléphone extrait ou null
 */
export function extractPhoneFromName(nameField) {
  if (!nameField) return null;
  
  const str = String(nameField);
  if (!str || str.trim() === "") return null;
  
  // Chercher un numéro de téléphone (commence par + suivi de chiffres)
  const phoneMatch = str.match(/\+\d[\d\s-]{6,}/);
  if (phoneMatch) {
    return phoneMatch[0].replace(/\s|-/g, ""); // Nettoyer espaces et tirets
  }
  
  // Chercher aussi les numéros sans le + (commence par des chiffres, minimum 8 caractères)
  const phoneMatch2 = str.match(/\d[\d\s-]{7,}/);
  if (phoneMatch2) {
    return phoneMatch2[0].replace(/\s|-/g, "");
  }
  
  return null;
}

/**
 * Valider un numéro de téléphone
 * @param {string} phone - Le numéro de téléphone à valider
 * @returns {{valid: boolean, error: string|null}} - Résultat de la validation
 */
export function validatePhoneNumber(phone) {
  if (!phone || phone.trim() === "") {
    return { valid: false, error: "Numéro manquant" };
  }
  
  // Nettoyer le numéro (enlever espaces, tirets, etc.)
  const cleanPhone = phone.replace(/[\s\-\(\)]/g, "");
  
  // Vérifier la longueur minimale (au moins 8 chiffres pour un numéro valide)
  if (cleanPhone.length < 8) {
    return { valid: false, error: `Trop court (${cleanPhone.length} chiffres au lieu de 8 minimum)` };
  }
  
  // Vérifier si c'est un numéro international (commence par +)
  if (cleanPhone.startsWith("+")) {
    // Numéro international : doit avoir au moins 10 chiffres après le +
    const digitsOnly = cleanPhone.substring(1).replace(/\D/g, "");
    if (digitsOnly.length < 8) {
      return { valid: false, error: `Numéro international trop court (${digitsOnly.length} chiffres)` };
    }
    return { valid: true, error: null };
  }
  
  // Vérifier que ce sont bien des chiffres
  if (!/^\d+$/.test(cleanPhone)) {
    return { valid: false, error: "Contient des caractères invalides" };
  }
  
  // Vérifier la longueur (8-15 chiffres pour un numéro standard)
  if (cleanPhone.length < 8 || cleanPhone.length > 15) {
    return { valid: false, error: `Longueur invalide (${cleanPhone.length} chiffres)` };
  }
  
  return { valid: true, error: null };
}

/**
 * Extraire le nom du client (sans le téléphone)
 * @param {string} nameField - Le champ contenant le nom et potentiellement le téléphone
 * @returns {string} - Le nom du client ou "Client" par défaut
 */
export function extractNameFromField(nameField) {
  if (!nameField) return "Client";
  
  const str = String(nameField);
  if (!str || str.trim() === "") return "Client";
  
  // Enlever le numéro de téléphone
  let name = str.replace(/\+\d[\d\s-]{6,}/g, "").replace(/\d[\d\s-]{7,}/g, "").trim();
  return name || "Client";
}

