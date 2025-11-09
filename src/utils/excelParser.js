// Fonctions utilitaires pour le parsing de fichiers Excel

/**
 * Convertir une valeur Excel (date/heure) en format lisible
 * @param {any} value - La valeur Excel à convertir
 * @param {string} columnName - Le nom de la colonne pour déterminer le type
 * @returns {string} - La valeur convertie en format lisible
 */
export function convertExcelValue(value, columnName = "") {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  // Si c'est déjà un objet Date JavaScript, le formater directement
  if (value instanceof Date) {
    const normalizedColName = String(columnName || "").toLowerCase();
    const isTimeColumn = normalizedColName.includes("time") || normalizedColName.includes("heure") || normalizedColName.includes("pickup");
    
    if (isTimeColumn) {
      // Formater uniquement l'heure
      return value.toLocaleTimeString("fr-FR", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
      });
    } else {
      // Formater la date
      return value.toLocaleDateString("fr-FR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
      });
    }
  }

  // Helper pour formater une fraction de jour Excel en HH:MM avec arrondi à la minute la plus proche
  const formatTimeFromFraction = (fraction) => {
    if (typeof fraction !== "number" || !isFinite(fraction)) {
      return null;
    }
    const minutesInDay = 24 * 60;
    const totalMinutes = Math.round(fraction * minutesInDay);
    const normalizedMinutes = ((totalMinutes % minutesInDay) + minutesInDay) % minutesInDay;
    const hours = Math.floor(normalizedMinutes / 60);
    const minutes = normalizedMinutes % 60;
    if (hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60) {
      return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
    }
    return null;
  };

  // Si c'est déjà une string, vérifier si c'est un nombre en string
  const numValue = typeof value === "number" ? value : parseFloat(value);
  
  // Si ce n'est pas un nombre valide, retourner la valeur telle quelle
  if (isNaN(numValue)) {
    return String(value);
  }

  // Normaliser le nom de colonne pour la détection
  const normalizedColName = String(columnName || "").toLowerCase();

  // Détecter si c'est une colonne de date ou d'heure
  const isDateColumn = normalizedColName.includes("date") || normalizedColName.includes("jour");
  const isTimeColumn = normalizedColName.includes("time") || normalizedColName.includes("heure") || normalizedColName.includes("pickup");
  
  // Détecter les colonnes qui ne doivent PAS être converties (numéros de chambre, etc.)
  const isRoomColumn = normalizedColName.includes("rm") || normalizedColName.includes("room") || 
                       normalizedColName.includes("chambre") || normalizedColName.includes("numéro") ||
                       normalizedColName.includes("numero") || normalizedColName.includes("number");
  const isInvoiceColumn = normalizedColName.includes("invoice") || normalizedColName.includes("facture");
  const isPaxColumn = normalizedColName.includes("pax") || normalizedColName.includes("adults") || 
                      normalizedColName.includes("adultes") || normalizedColName.includes("children") ||
                      normalizedColName.includes("enfants") || normalizedColName.includes("infants") ||
                      normalizedColName.includes("bébés") || normalizedColName.includes("babies");
  
  // Si c'est une colonne qui ne doit pas être convertie (numéro de chambre, invoice, etc.), retourner directement
  if (isRoomColumn || isInvoiceColumn || isPaxColumn) {
    // Pour les nombres, préserver le format (pas de conversion en date/heure)
    // Convertir en string en préservant les zéros initiaux si c'était une string
    if (typeof value === "string") {
      return value;
    }
    // Si c'est un nombre, le convertir en string sans décimales si c'est un entier
    if (typeof value === "number") {
      if (Number.isInteger(value)) {
        return String(value);
      }
      return String(value);
    }
    return String(value);
  }

  // Les dates Excel sont des nombres >= 1 (généralement > 1000 pour les dates récentes)
  // Les heures Excel sont des fractions de jour (entre 0 et 1, ou parfois combinées avec une date)
  
  // Traiter les colonnes de date
  if (isDateColumn && numValue >= 1 && numValue < 1000000) {
    // Convertir la date Excel en date JavaScript
    // Excel compte les jours depuis le 1er janvier 1900, mais il y a un bug: il compte le 29 février 1900 qui n'existe pas
    // Donc on doit soustraire 2 jours pour corriger le bug Excel du 29 février 1900
    const excelEpoch = new Date(1899, 11, 30); // 30 décembre 1899 (base Excel)
    const daysSince1900 = numValue;
    const date = new Date(excelEpoch.getTime() + daysSince1900 * 24 * 60 * 60 * 1000);
    
    // Formater la date en format français
    // IMPORTANT: Ajouter 1 jour car les messages sont pour le lendemain
    if (!isNaN(date.getTime())) {
      const dateForMessage = new Date(date);
      dateForMessage.setDate(dateForMessage.getDate() + 1); // Ajouter 1 jour
      return dateForMessage.toLocaleDateString("fr-FR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
      });
    }
  }

  // Traiter les colonnes d'heure
  if (isTimeColumn) {
    // Si c'est déjà une string formatée (ex: "08:30", "8h30", "8:30", "08h30", "08.30", etc.)
    if (typeof value === "string") {
      const strValue = value.trim();
      
      // Essayer de parser les différents formats d'heure en string
      // Format 1: "08:30" ou "8:30"
      const matchColon = strValue.match(/^(\d{1,2}):(\d{2})$/);
      if (matchColon) {
        const h = parseInt(matchColon[1], 10);
        const m = parseInt(matchColon[2], 10);
        if (h >= 0 && h < 24 && m >= 0 && m < 60) {
          return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
        }
      }
      
      // Format 2: "08h30" ou "8h30" ou "08h30m" ou "8h30m"
      const matchH = strValue.match(/^(\d{1,2})h(\d{1,2})(?:m)?$/i);
      if (matchH) {
        const h = parseInt(matchH[1], 10);
        const m = parseInt(matchH[2], 10);
        if (h >= 0 && h < 24 && m >= 0 && m < 60) {
          return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
        }
      }
      
      // Format 3: "08.30" ou "8.30"
      const matchDot = strValue.match(/^(\d{1,2})\.(\d{2})$/);
      if (matchDot) {
        const h = parseInt(matchDot[1], 10);
        const m = parseInt(matchDot[2], 10);
        if (h >= 0 && h < 24 && m >= 0 && m < 60) {
          return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
        }
      }
      
      // Format 4: Juste un nombre (ex: "830" pour 8h30)
      const matchNumber = strValue.match(/^(\d{1,4})$/);
      if (matchNumber) {
        const num = parseInt(matchNumber[1], 10);
        if (num >= 0 && num < 2400) {
          const h = Math.floor(num / 100);
          const m = num % 100;
          if (h >= 0 && h < 24 && m >= 0 && m < 60) {
            return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
          }
        }
      }
      
      // Si aucun format ne correspond, retourner la valeur telle quelle
      return strValue;
    }
    
    // Si c'est un nombre, traiter comme une heure Excel
    if (numValue < 1) {
      // C'est juste une heure (fraction de jour)
      const formatted = formatTimeFromFraction(numValue);
      if (formatted) {
        return formatted;
      }
    } else if (numValue >= 1 && numValue < 1000000) {
      // C'est une date+heure combinée, extraire seulement la partie heure
      const datePart = Math.floor(numValue);
      const timePart = numValue - datePart;
      const formatted = formatTimeFromFraction(timePart);
      if (formatted) {
        return formatted;
      }
    } else {
      // Peut-être un nombre représentant l'heure directement (ex: 830 pour 8h30)
      if (numValue >= 0 && numValue < 2400) {
        const hours = Math.floor(numValue / 100);
        const minutes = numValue % 100;
        if (hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60) {
          return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
        }
      }
    }

    // Si l'heure n'est pas valide, retourner la valeur originale
    return String(value);
  }

  // Si c'est un nombre qui pourrait être une date (pas de colonne spécifiée)
  // Mais exclure les colonnes de numéro de chambre, invoice, etc.
  if (!isDateColumn && !isTimeColumn && !isRoomColumn && !isInvoiceColumn && !isPaxColumn && 
      numValue >= 1 && numValue < 1000000) {
    // Vérifier si c'est probablement une date (nombre entre des valeurs raisonnables)
    const excelEpoch = new Date(1899, 11, 30);
    const daysSince1900 = numValue;
    const date = new Date(excelEpoch.getTime() + daysSince1900 * 24 * 60 * 60 * 1000);
    
    // Si la date est valide et raisonnable (entre 1900 et 2100), c'est probablement une date
    // Mais aussi vérifier que ce n'est pas un nombre trop petit (comme un numéro de chambre)
    // IMPORTANT: Ajouter 1 jour car les messages sont pour le lendemain
    if (!isNaN(date.getTime()) && date.getFullYear() >= 1900 && date.getFullYear() <= 2100 && numValue > 1000) {
      const dateForMessage = new Date(date);
      dateForMessage.setDate(dateForMessage.getDate() + 1); // Ajouter 1 jour
      return dateForMessage.toLocaleDateString("fr-FR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
      });
    }
  }

  // Si c'est un nombre qui pourrait être une heure (fraction de jour)
  if (!isDateColumn && !isTimeColumn && numValue > 0 && numValue < 1) {
    const formatted = formatTimeFromFraction(numValue);
    if (formatted) {
      return formatted;
    }
  }

  // Si ce n'est ni une date ni une heure reconnue, retourner la valeur telle quelle
  return String(value);
}

/**
 * Trouver une colonne avec flexibilité (ignore majuscules/minuscules, espaces, caractères spéciaux)
 * @param {Object} row - La ligne de données
 * @param {Array<string>} possibleNames - Les noms possibles de la colonne
 * @returns {string} - La valeur de la colonne trouvée ou une chaîne vide
 */
export function findColumn(row, possibleNames) {
  // Normaliser le nom de colonne: enlever espaces, caractères spéciaux, mettre en minuscules
  const normalize = (str) => str?.replace(/[^a-zA-Z0-9]/g, "").toLowerCase() || "";
  
  // D'abord, chercher exactement (avec variations de casse et trim)
  for (const name of possibleNames) {
    // Chercher exactement le nom (insensible à la casse, avec trim)
    const exactMatch = Object.keys(row).find(key => {
      const keyTrimmed = String(key || "").trim();
      const nameTrimmed = String(name || "").trim();
      return keyTrimmed.toLowerCase() === nameTrimmed.toLowerCase();
    });
    if (exactMatch) {
      const value = row[exactMatch];
      // Retourner la valeur même si elle est vide (string vide) car c'est la colonne correcte
      // Convertir null/undefined en chaîne vide pour éviter les erreurs
      if (value !== undefined && value !== null) {
        return String(value);
      } else {
        return ""; // Colonne trouvée mais valeur vide
      }
    }
  }
  
  // Ensuite, chercher avec normalisation (enlever espaces et caractères spéciaux)
  const normalizedPossibleNames = possibleNames.map(normalize);
  for (const key of Object.keys(row)) {
    const normalizedKey = normalize(key);
    if (normalizedPossibleNames.includes(normalizedKey)) {
      const value = row[key];
      // Retourner la valeur même si elle est vide
      if (value !== undefined && value !== null) {
        return String(value);
      } else {
        return ""; // Colonne trouvée mais valeur vide
      }
    }
  }
  
  return "";
}

