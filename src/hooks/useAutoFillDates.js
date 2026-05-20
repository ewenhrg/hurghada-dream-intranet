import { useCallback } from "react";
import { toast } from "../utils/toast";
import {
  parseYmdLocal,
  buildStayActivityCandidateDates,
  isDateAvailableForActivity,
  isDateSafeForDiving,
  isDivingActivityName,
} from "../utils/quoteActivityDates.js";

/**
 * Hook personnalisé pour gérer le remplissage automatique des dates
 * @param {Object} client - Informations du client (arrivalDate, departureDate)
 * @param {Array} items - Les items du formulaire
 * @param {Function} setItems - Fonction pour mettre à jour les items
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

    const arrival = parseYmdLocal(client.arrivalDate);
    const departure = parseYmdLocal(client.departureDate);

    if (!arrival || !departure || arrival > departure) {
      toast.warning("La date d'arrivée doit être antérieure à la date de départ.");
      return;
    }

    const allDates = buildStayActivityCandidateDates(client.arrivalDate, client.departureDate);

    if (allDates.length === 0) {
      toast.warning(
        "Aucune date disponible dans le séjour (les activités ne peuvent pas être programmées avant demain ni en dehors des dates d'arrivée et de départ)."
      );
      return;
    }

    let datesAssigned = 0;
    const usedDates = new Set();
    const divingActivitiesWithoutDate = [];
    const activitiesWithoutDate = [];

    const findDateForActivity = (activity, preferUnused) => {
      const isDiving = isDivingActivityName(activity.name);

      const tryPass = (onlyUnused) => {
        for (const dateInfo of allDates) {
          if (isDiving && !isDateSafeForDiving(dateInfo.date, client.departureDate)) {
            continue;
          }
          if (onlyUnused && usedDates.has(dateInfo.date)) {
            continue;
          }
          if (
            isDateAvailableForActivity(
              activity,
              dateInfo.date,
              dateInfo.dayOfWeek,
              stopSalesMap,
              pushSalesMap
            )
          ) {
            return dateInfo.date;
          }
        }
        return null;
      };

      return tryPass(preferUnused) || tryPass(false);
    };

    const updatedItems = items.map((item) => {
      if (!item.activityId) {
        return item;
      }

      const activity = activitiesMap.get(item.activityId);
      if (!activity) {
        return item;
      }

      let assignedDate = findDateForActivity(activity, true);
      if (assignedDate) {
        usedDates.add(assignedDate);
        datesAssigned++;
      } else {
        assignedDate = findDateForActivity(activity, false);
        if (assignedDate) {
          datesAssigned++;
        }
      }

      if (!assignedDate) {
        if (isDivingActivityName(activity.name)) {
          divingActivitiesWithoutDate.push(activity.name);
        } else {
          const rawDays = activity.availableDays;
          const hasExplicitMask =
            Array.isArray(rawDays) &&
            rawDays.length === 7 &&
            rawDays.some((d) => d === true || d === false) &&
            rawDays.some((d) => d === true);
          if (hasExplicitMask) {
            activitiesWithoutDate.push(activity.name);
          }
        }
      }

      return { ...item, date: assignedDate || item.date };
    });

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

    const actualConflicts = Object.entries(conflictsByDate).filter(([, acts]) => acts.length > 1);

    setItems(updatedItems);

    if (datesAssigned > 0) {
      let message = "";
      let hasWarnings = false;

      if (actualConflicts.length > 0) {
        hasWarnings = true;
        const conflictMessages = actualConflicts.map(([date, acts]) => {
          const dateFormatted = parseYmdLocal(date).toLocaleDateString("fr-FR", {
            weekday: "long",
            day: "numeric",
            month: "long",
          });
          const activityNames = acts.map((a) => a.name).join(", ");
          return `le ${dateFormatted} : ${activityNames}`;
        });
        message = `⚠️ Attention : ${datesAssigned} date(s) assignée(s), mais des conflits détectés. Faire un choix entre ${conflictMessages.join(" | ")}`;
      } else {
        message = `${datesAssigned} date(s) assignée(s) automatiquement en tenant compte des jours disponibles !`;
      }

      if (divingActivitiesWithoutDate.length > 0) {
        hasWarnings = true;
        message += ` ⚠️ ATTENTION SÉCURITÉ : Les activités de plongée (${divingActivitiesWithoutDate.join(", ")}) n'ont pas pu être assignées car il faut un minimum de 2 jours entre la plongée et le départ (risque de décompression).`;
      }

      if (activitiesWithoutDate.length > 0) {
        hasWarnings = true;
        message += ` ⚠️ Les activités (${activitiesWithoutDate.join(", ")}) n'ont pas pu être assignées car aucune date disponible ne correspond à leurs jours disponibles dans la période du séjour.`;
      }

      if (hasWarnings) {
        toast.warning(message, { duration: 10000 });
      } else {
        toast.success(message);
      }
    } else {
      let message = "Aucune date n'a pu être assignée. Vérifiez les jours disponibles des activités.";
      if (divingActivitiesWithoutDate.length > 0) {
        message += ` ⚠️ ATTENTION SÉCURITÉ : Les activités de plongée (${divingActivitiesWithoutDate.join(", ")}) nécessitent un minimum de 2 jours entre la plongée et le départ.`;
      }
      if (activitiesWithoutDate.length > 0) {
        message += ` ⚠️ Les activités (${activitiesWithoutDate.join(", ")}) n'ont pas de dates disponibles correspondant à leurs jours disponibles dans la période du séjour.`;
      }
      toast.warning(message, { duration: 10000 });
    }
  }, [client.arrivalDate, client.departureDate, items, activitiesMap, stopSalesMap, pushSalesMap, setItems]);

  return handleAutoFillDates;
}
