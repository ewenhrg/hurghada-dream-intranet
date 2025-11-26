import { useCallback } from "react";
import { toast } from "../utils/toast";

/**
 * Hook personnalisé pour gérer le remplissage automatique des dates
 * @param {Object} client - Informations du client (arrivalDate, departureDate)
 * @param {Array} items - Les items du formulaire
 * {Function} setItems - Fonction pour mettre à jour les items
 * @param {Map} activitiesMap - Map des activités pour recherche O(1)
 * @param {Map} stopSalesMap - Map des stop sales
 * @param {Map} pushSalesMap - Map des push sales
 * @returns {Function} - Fonction handleAutoFillDates
 */
export function useAutoFillDates(client, items, setItems, activitiesMap, stopSalesMap, pushSalesMap) {
  const handleAutoFillDates = useCallback(() => {
    if (!client.arrivalDate || !client.departureDate) {
      toast.warning("Veuillez renseigner les dates d'arrivée et de départ du client.");
      return;
    }

    const arrival = new Date(client.arrivalDate);
    const departure = new Date(client.departureDate);
    
    if (arrival > departure) {
      toast.warning("La date d'arrivée doit être antérieure à la date de départ.");
      return;
    }

    // Obtenir la date d'aujourd'hui (sans l'heure)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Calculer la date de début : maximum entre (arrivée + 1) et (aujourd'hui + 1)
    // Cela garantit qu'on ne propose jamais d'activités avant demain
    const arrivalPlusOne = new Date(arrival);
    arrivalPlusOne.setDate(arrivalPlusOne.getDate() + 1);
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    // Utiliser la date la plus récente entre (arrivée + 1) et (aujourd'hui + 1)
    const startDate = arrivalPlusOne > tomorrow ? arrivalPlusOne : tomorrow;

    // Générer toutes les dates entre la date de début et le départ avec leur jour de la semaine
    // Exclure le jour d'arrivée et le jour de départ
    const allDates = [];
    const currentDate = new Date(startDate);
    const departureMinusOne = new Date(departure);
    departureMinusOne.setDate(departureMinusOne.getDate() - 1); // Terminer le jour avant le départ
    
    while (currentDate <= departureMinusOne) {
      const dateStr = new Date(currentDate).toISOString().slice(0, 10);
      const dayOfWeek = currentDate.getDay(); // 0 = dimanche, 1 = lundi, etc.
      allDates.push({ date: dateStr, dayOfWeek });
      currentDate.setDate(currentDate.getDate() + 1);
    }

    if (allDates.length === 0) {
      toast.warning("Aucune date disponible entre demain et le départ (les activités ne peuvent pas être programmées avant demain ni le jour du départ).");
      return;
    }

    // Fonction helper pour vérifier si une activité est une plongée
    const isDivingActivity = (activityName) => {
      if (!activityName) return false;
      const nameLower = activityName.toLowerCase();
      return nameLower.includes('plongée') || nameLower.includes('plongee') || nameLower.includes('diving');
    };

    // Fonction helper pour vérifier si une date respecte la règle des 2 jours minimum avant le départ (pour la plongée)
    const isDateSafeForDiving = (dateStr) => {
      const activityDate = new Date(dateStr + "T12:00:00");
      const diffTime = departure.getTime() - activityDate.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return diffDays >= 2; // Au moins 2 jours entre l'activité et le départ
    };

    // Fonction helper pour vérifier si une date/activité est en stop sale (optimisé avec Map O(1))
    const isStopSale = (activityId, dateStr) => {
      const key = `${activityId}_${dateStr}`;
      return stopSalesMap.has(key);
    };

    // Fonction helper pour vérifier si une date/activité est en push sale (optimisé avec Map O(1))
    const isPushSale = (activityId, dateStr) => {
      const key = `${activityId}_${dateStr}`;
      return pushSalesMap.has(key);
    };

    // Fonction helper pour vérifier si une date est disponible pour une activité
    // (disponible si push sale OU (disponible normalement ET pas de stop sale))
    const isDateAvailableForActivity = (activityId, dateStr, dayOfWeek, availableDays) => {
      // Vérifier si c'est un push sale (toujours disponible)
      if (isPushSale(activityId, dateStr)) {
        return true;
      }
      
      // Vérifier si c'est un stop sale (jamais disponible sauf si push sale)
      if (isStopSale(activityId, dateStr)) {
        return false;
      }
      
      // Sinon, vérifier la disponibilité normale selon les jours disponibles
      if (availableDays && dayOfWeek != null) {
        return availableDays[dayOfWeek] === true;
      }
      
      // Si pas de jours définis, considérer comme disponible
      return true;
    };

    // Remplir les dates pour toutes les activités en tenant compte des jours disponibles
    let datesAssigned = 0;
    const usedDates = new Set(); // Pour éviter d'assigner la même date plusieurs fois si possible
    const divingActivitiesWithoutDate = []; // Pour les activités de plongée qui n'ont pas pu être assignées
    
    const updatedItems = items.map((item, idx) => {
      // Si pas d'activité sélectionnée, ne pas assigner de date
      if (!item.activityId) {
        return item;
      }

      // Trouver l'activité correspondante (optimisé avec Map O(1))
      const activity = activitiesMap.get(item.activityId);
      
      if (!activity) {
        // Si l'activité n'existe pas, utiliser la première date disponible non utilisée qui n'est pas en stop sale
        for (const dateInfo of allDates) {
          // Ne pas utiliser les dates en stop sale (sauf si push sale)
          if (!isStopSale(item.activityId, dateInfo.date) || isPushSale(item.activityId, dateInfo.date)) {
            if (!usedDates.has(dateInfo.date)) {
              usedDates.add(dateInfo.date);
              datesAssigned++;
              return { ...item, date: dateInfo.date };
            }
          }
        }
        // Si toutes les dates sont utilisées ou en stop sale, chercher n'importe quelle date disponible
        for (const dateInfo of allDates) {
          if (!isStopSale(item.activityId, dateInfo.date) || isPushSale(item.activityId, dateInfo.date)) {
            datesAssigned++;
            return { ...item, date: dateInfo.date };
          }
        }
        return item;
      }

      // Vérifier si c'est une activité de plongée
      const isDiving = isDivingActivity(activity.name);

      // Vérifier les jours disponibles de l'activité
      const availableDays = activity.availableDays || [false, false, false, false, false, false, false];
      const hasNoDaysDefined = availableDays.every(day => day === false);
      
      // Trouver une date disponible pour cette activité (priorité aux dates non encore utilisées)
      let assignedDate = null;
      
      // D'abord, chercher une date disponible et non utilisée
      for (const dateInfo of allDates) {
        // Pour la plongée, vérifier aussi la règle des 2 jours minimum
        if (isDiving && !isDateSafeForDiving(dateInfo.date)) {
          continue; // Skip cette date pour la plongée
        }
        
        // Vérifier si la date est disponible (push sale OU (disponible normalement ET pas de stop sale))
        if (isDateAvailableForActivity(activity.id, dateInfo.date, dateInfo.dayOfWeek, availableDays)) {
          if (!usedDates.has(dateInfo.date)) {
            assignedDate = dateInfo.date;
            usedDates.add(dateInfo.date);
            datesAssigned++;
            break;
          }
        }
      }
      
      // Si aucune date disponible non utilisée, prendre la première date disponible même si déjà utilisée
      if (!assignedDate) {
        for (const dateInfo of allDates) {
          // Pour la plongée, vérifier aussi la règle des 2 jours minimum
          if (isDiving && !isDateSafeForDiving(dateInfo.date)) {
            continue; // Skip cette date pour la plongée
          }
          
          // Vérifier si la date est disponible (push sale OU (disponible normalement ET pas de stop sale))
          if (isDateAvailableForActivity(activity.id, dateInfo.date, dateInfo.dayOfWeek, availableDays)) {
            assignedDate = dateInfo.date;
            datesAssigned++;
            break;
          }
        }
      }

      // Si aucune date disponible trouvée (activité sans jours définis), utiliser la première date non utilisée qui n'est pas en stop sale
      if (!assignedDate) {
        for (const dateInfo of allDates) {
          // Pour la plongée, vérifier aussi la règle des 2 jours minimum
          if (isDiving && !isDateSafeForDiving(dateInfo.date)) {
            continue; // Skip cette date pour la plongée
          }
          
          // Ne pas utiliser les dates en stop sale (sauf si push sale)
          if (!isStopSale(activity.id, dateInfo.date) || isPushSale(activity.id, dateInfo.date)) {
            if (!usedDates.has(dateInfo.date)) {
              assignedDate = dateInfo.date;
              usedDates.add(dateInfo.date);
              datesAssigned++;
              break;
            }
          }
        }
        // Si toutes les dates sont utilisées ou en stop sale, chercher n'importe quelle date disponible
        if (!assignedDate) {
          for (const dateInfo of allDates) {
            // Pour la plongée, vérifier aussi la règle des 2 jours minimum
            if (isDiving && !isDateSafeForDiving(dateInfo.date)) {
              continue; // Skip cette date pour la plongée
            }
            
            // Vérifier si la date est disponible (push sale OU (disponible normalement ET pas de stop sale))
            if (isDateAvailableForActivity(activity.id, dateInfo.date, dateInfo.dayOfWeek, availableDays)) {
              assignedDate = dateInfo.date;
              datesAssigned++;
              break;
            }
          }
        }
      }

      // Si c'est une activité de plongée et qu'aucune date n'a pu être assignée, noter cela
      if (isDiving && !assignedDate) {
        divingActivitiesWithoutDate.push(activity.name);
      }

      return { ...item, date: assignedDate || item.date };
    });

    // Détecter les conflits (activités avec la même date)
    const conflictsByDate = {};
    updatedItems.forEach((item, idx) => {
      if (item.date && item.activityId) {
        const activity = activitiesMap.get(item.activityId);
        const activityName = activity?.name || `Activité ${idx + 1}`;
        
        if (!conflictsByDate[item.date]) {
          conflictsByDate[item.date] = [];
        }
        conflictsByDate[item.date].push({ idx, name: activityName });
      }
    });

    // Filtrer pour ne garder que les dates avec conflits (plus d'une activité)
    const actualConflicts = Object.entries(conflictsByDate).filter(([date, activities]) => activities.length > 1);

    // Mettre à jour les items
    setItems(updatedItems);

    // Afficher les messages
    if (datesAssigned > 0) {
      let message = "";
      let hasWarnings = false;
      
      if (actualConflicts.length > 0) {
        hasWarnings = true;
        // Construire le message d'avertissement avec les conflits
        const conflictMessages = actualConflicts.map(([date, activities]) => {
          const dateFormatted = new Date(date + "T12:00:00").toLocaleDateString('fr-FR', { 
            weekday: 'long', 
            day: 'numeric', 
            month: 'long' 
          });
          const activityNames = activities.map(a => a.name).join(', ');
          return `le ${dateFormatted} : ${activityNames}`;
        });
        message = `⚠️ Attention : ${datesAssigned} date(s) assignée(s), mais des conflits détectés. Faire un choix entre ${conflictMessages.join(' | ')}`;
      } else {
        message = `${datesAssigned} date(s) assignée(s) automatiquement en tenant compte des jours disponibles !`;
      }
      
      // Ajouter un avertissement pour les activités de plongée non assignées
      if (divingActivitiesWithoutDate.length > 0) {
        hasWarnings = true;
        const divingNames = divingActivitiesWithoutDate.join(', ');
        message += ` ⚠️ ATTENTION SÉCURITÉ : Les activités de plongée (${divingNames}) n'ont pas pu être assignées car il faut un minimum de 2 jours entre la plongée et le départ (risque de décompression).`;
      }
      
      if (hasWarnings) {
        toast.warning(message, { duration: 10000 });
      } else {
        toast.success(message);
      }
    } else {
      let message = "Aucune date n'a pu être assignée. Vérifiez les jours disponibles des activités.";
      if (divingActivitiesWithoutDate.length > 0) {
        const divingNames = divingActivitiesWithoutDate.join(', ');
        message += ` ⚠️ ATTENTION SÉCURITÉ : Les activités de plongée (${divingNames}) nécessitent un minimum de 2 jours entre la plongée et le départ.`;
      }
      toast.warning(message, { duration: 10000 });
    }
  }, [client.arrivalDate, client.departureDate, items, activitiesMap, stopSalesMap, pushSalesMap, setItems]);

  return handleAutoFillDates;
}

