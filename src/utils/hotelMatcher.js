// Fonctions utilitaires pour la recherche d'hôtels avec tolérance aux fautes d'orthographe

/**
 * Calculer la distance de Levenshtein entre deux chaînes
 * @param {string} str1 - Première chaîne
 * @param {string} str2 - Deuxième chaîne
 * @returns {number} - Distance de Levenshtein
 */
export function levenshteinDistance(str1, str2) {
  const matrix = [];
  
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j] + 1 // deletion
        );
      }
    }
  }
  
  return matrix[str2.length][str1.length];
}

/**
 * Calculer la similarité entre deux chaînes (distance de Levenshtein simplifiée)
 * @param {string} str1 - Première chaîne
 * @param {string} str2 - Deuxième chaîne
 * @returns {number} - Score de similarité entre 0 et 1
 */
export function calculateSimilarity(str1, str2) {
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();
  
  // Si identique, retourner 1
  if (s1 === s2) return 1;
  
  // Si une chaîne contient l'autre, retourner un score élevé
  if (s1.includes(s2) || s2.includes(s1)) return 0.8;
  
  // Calculer la distance de Levenshtein simplifiée
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;
  
  if (longer.length === 0) return 1;
  
  // Calculer la distance
  const distance = levenshteinDistance(longer, shorter);
  const similarity = (longer.length - distance) / longer.length;
  
  return similarity;
}

/**
 * Trouver un hôtel dans la liste (tolérant aux fautes d'orthographe) et retourner l'objet complet
 * @param {string} hotelName - Nom de l'hôtel à rechercher
 * @param {Array} exteriorHotels - Liste des hôtels avec RDV à l'extérieur
 * @returns {Object|null} - L'objet hôtel trouvé ou null
 */
export function findHotelInList(hotelName, exteriorHotels) {
  if (!hotelName || !exteriorHotels || exteriorHotels.length === 0) return null;
  
  const hotelClean = hotelName.trim();
  const hotelLower = hotelClean.toLowerCase();
  
  // Fonction helper pour obtenir le nom de l'hôtel (gérer migration string -> objet)
  const getHotelName = (h) => typeof h === 'string' ? h.trim() : h.name.trim();
  
  // 1. Recherche exacte (insensible à la casse)
  const exactMatch = exteriorHotels.find(h => {
    const hName = getHotelName(h);
    return hName.toLowerCase() === hotelLower;
  });
  if (exactMatch) {
    // Convertir en objet si c'est un string
    if (typeof exactMatch === 'string') {
      return { name: exactMatch, hasBeachBoats: false };
    }
    return exactMatch;
  }
  
  // 2. Recherche avec correspondance partielle (si un nom contient l'autre)
  const partialMatch = exteriorHotels.find(h => {
    const hName = getHotelName(h);
    const hLower = hName.toLowerCase();
    // Vérifier si les mots clés principaux sont présents
    const hotelWords = hotelLower.split(/\s+/).filter(w => w.length > 3);
    const hWords = hLower.split(/\s+/).filter(w => w.length > 3);
    
    // Si au moins 2 mots de 4+ caractères correspondent
    const matchingWords = hotelWords.filter(w => hWords.some(hw => hw.includes(w) || w.includes(hw)));
    if (matchingWords.length >= 2) return true;
    
    // Vérifier si une chaîne contient l'autre (pour les noms courts)
    if (hotelLower.length < 20 && hLower.length < 20) {
      return hotelLower.includes(hLower) || hLower.includes(hotelLower);
    }
    
    return false;
  });
  if (partialMatch) {
    // Convertir en objet si c'est un string
    if (typeof partialMatch === 'string') {
      return { name: partialMatch, hasBeachBoats: false };
    }
    return partialMatch;
  }
  
  // 3. Recherche avec similarité (distance de Levenshtein)
  // Seuil de similarité : 0.75 (75% de similarité minimum)
  const similarityMatch = exteriorHotels.find(h => {
    const hName = getHotelName(h);
    const similarity = calculateSimilarity(hotelClean, hName);
    return similarity >= 0.75;
  });
  
  if (similarityMatch) {
    // Convertir en objet si c'est un string
    if (typeof similarityMatch === 'string') {
      return { name: similarityMatch, hasBeachBoats: false };
    }
    return similarityMatch;
  }
  
  return null;
}

/**
 * Vérifier si un hôtel est dans la liste (pour compatibilité)
 * @param {string} hotelName - Nom de l'hôtel à rechercher
 * @param {Array} exteriorHotels - Liste des hôtels avec RDV à l'extérieur
 * @returns {boolean} - True si l'hôtel est trouvé
 */
export function isExteriorHotel(hotelName, exteriorHotels) {
  return findHotelInList(hotelName, exteriorHotels) !== null;
}

