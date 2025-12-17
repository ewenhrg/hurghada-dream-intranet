import { useMemo } from "react";
import { isBuggyActivity, isMotoCrossActivity } from "../utils/activityHelpers";

/**
 * Hook de validation intelligente pour les devis
 * Détecte les erreurs et avertissements en temps réel
 */
export function useQuoteValidation(client, items, computed, activitiesMap, stopSalesMap, pushSalesMap) {
  const validation = useMemo(() => {
    const errors = [];
    const warnings = [];
    const info = [];

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // 1. VALIDATION DES INFORMATIONS CLIENT
    if (!client.name || client.name.trim() === "") {
      errors.push({
        type: "client",
        field: "name",
        message: "Le nom du client est requis",
        severity: "error",
      });
    }

    if (!client.phone || client.phone.trim() === "") {
      errors.push({
        type: "client",
        field: "phone",
        message: "Le numéro de téléphone est requis",
        severity: "error",
      });
    }

    // Vérifier le format du téléphone (doit contenir au moins 8 chiffres)
    if (client.phone && client.phone.trim() !== "") {
      const phoneDigits = client.phone.replace(/\D/g, "");
      if (phoneDigits.length < 8) {
        warnings.push({
          type: "client",
          field: "phone",
          message: "Le numéro de téléphone semble incomplet (moins de 8 chiffres)",
          severity: "warning",
        });
      }
    }

    // Vérifier si l'hôtel existe dans la liste
    if (client.hotel && client.hotel.trim() !== "" && client.neighborhood === "") {
      warnings.push({
        type: "client",
        field: "hotel",
        message: "Un hôtel est renseigné mais le quartier n'est pas sélectionné",
        severity: "warning",
      });
    }

    // Vérifier la cohérence des dates d'arrivée/départ
    if (client.arrivalDate && client.departureDate) {
      const arrival = new Date(client.arrivalDate + "T12:00:00");
      const departure = new Date(client.departureDate + "T12:00:00");
      
      if (arrival > departure) {
        errors.push({
          type: "client",
          field: "dates",
          message: "La date d'arrivée est postérieure à la date de départ",
          severity: "error",
        });
      }

      const diffDays = Math.ceil((departure - arrival) / (1000 * 60 * 60 * 24));
      if (diffDays > 30) {
        warnings.push({
          type: "client",
          field: "dates",
          message: `Séjour très long (${diffDays} jours). Vérifiez les dates.`,
          severity: "warning",
        });
      }
    }

    // 2. VALIDATION DES ACTIVITÉS
    const validComputed = computed.filter((c) => c.act && c.act.id);
    
    if (validComputed.length === 0) {
      errors.push({
        type: "activities",
        field: "empty",
        message: "Aucune activité sélectionnée",
        severity: "error",
      });
    }

    // Analyser chaque activité
    validComputed.forEach((c, index) => {
      const activity = c.act;
      const item = c.raw;
      const activityName = activity.name || "Activité sans nom";

      // Vérifier les participants
      const adults = Number(item.adults || 0);
      const children = Number(item.children || 0);
      const babies = Number(item.babies || 0);
      const totalParticipants = adults + children + babies;

      // Vérifier si c'est un transfert (pas besoin de participants)
      const isTransferActivity = activity.name && (
        activity.name.toLowerCase().includes("hurghada - le caire") ||
        activity.name.toLowerCase().includes("hurghada - louxor") ||
        activity.name.toLowerCase().includes("aeroport") ||
        activity.name.toLowerCase().includes("aerport")
      );

      // Pour les activités buggy/moto, vérifier les véhicules
      const isBuggy = isBuggyActivity(activity.name);
      const isMoto = isMotoCrossActivity(activity.name);
      
      if (isBuggy) {
        const buggySimple = Number(item.buggySimple || 0);
        const buggyFamily = Number(item.buggyFamily || 0);
        const totalVehicles = buggySimple + buggyFamily;
        
        if (totalVehicles === 0) {
          errors.push({
            type: "activity",
            index,
            activity: activityName,
            field: "vehicles",
            message: `${activityName} : Aucun véhicule sélectionné`,
            severity: "error",
          });
        }
      } else if (isMoto) {
        const yamaha250 = Number(item.yamaha250 || 0);
        const ktm640 = Number(item.ktm640 || 0);
        const ktm530 = Number(item.ktm530 || 0);
        const totalVehicles = yamaha250 + ktm640 + ktm530;
        
        if (totalVehicles === 0) {
          errors.push({
            type: "activity",
            index,
            activity: activityName,
            field: "vehicles",
            message: `${activityName} : Aucune moto sélectionnée`,
            severity: "error",
          });
        }
      } else if (isTransferActivity) {
        // Pour les transferts, vérifier qu'au moins allerSimple ou allerRetour est sélectionné
        if (!item.allerSimple && !item.allerRetour) {
          errors.push({
            type: "activity",
            index,
            activity: activityName,
            field: "transfer",
            message: `${activityName} : Sélectionnez "Aller simple" ou "Aller retour"`,
            severity: "error",
          });
        }
      } else {
        // Pour les autres activités, vérifier les participants
        if (totalParticipants === 0) {
          errors.push({
            type: "activity",
            index,
            activity: activityName,
            field: "participants",
            message: `${activityName} : Aucun participant (adulte, enfant ou bébé)`,
            severity: "error",
          });
        }
      }

      // Vérifier les ratios enfants/adultes suspects
      if (adults > 0 && children > 0 && children > adults * 3) {
        warnings.push({
          type: "activity",
          index,
          activity: activityName,
          field: "participants",
          message: `${activityName} : Ratio enfants/adultes élevé (${children} enfants pour ${adults} adultes)`,
          severity: "warning",
        });
      }

      // Vérifier les dates
      if (!item.date || item.date.trim() === "") {
        errors.push({
          type: "activity",
          index,
          activity: activityName,
          field: "date",
          message: `${activityName} : Date non renseignée`,
          severity: "error",
        });
      } else {
        const activityDate = new Date(item.date + "T12:00:00");
        activityDate.setHours(0, 0, 0, 0);

        // Date passée ou aujourd'hui
        if (activityDate <= today) {
          errors.push({
            type: "activity",
            index,
            activity: activityName,
            field: "date",
            message: `${activityName} : Date passée ou aujourd'hui (${item.date})`,
            severity: "error",
          });
        }

        // Date en dehors de la période d'arrivée/départ
        if (client.arrivalDate && client.departureDate) {
          const arrival = new Date(client.arrivalDate + "T12:00:00");
          const departure = new Date(client.departureDate + "T12:00:00");
          
          if (activityDate < arrival || activityDate > departure) {
            warnings.push({
              type: "activity",
              index,
              activity: activityName,
              field: "date",
              message: `${activityName} : Date (${item.date}) en dehors de la période du séjour`,
              severity: "warning",
            });
          }
        }

        // Vérifier les stop sales
        if (c.isStopSale) {
          errors.push({
            type: "activity",
            index,
            activity: activityName,
            field: "stopSale",
            message: `${activityName} : STOP SALE pour le ${item.date}`,
            severity: "error",
          });
        }

        // Vérifier la disponibilité (hors push sale)
        if (c.weekday != null && !c.baseAvailable && !c.isPushSale) {
          warnings.push({
            type: "activity",
            index,
            activity: activityName,
            field: "availability",
            message: `${activityName} : Normalement non disponible ce jour-là (${item.date})`,
            severity: "warning",
          });
        }

        // Vérifier les créneaux pour les activités nécessitant un transfert
        if (client.neighborhood && activity.transfers && activity.transfers[client.neighborhood]) {
          const transferInfo = activity.transfers[client.neighborhood];
          const hasSlots = transferInfo.morningEnabled || transferInfo.afternoonEnabled || transferInfo.eveningEnabled;
          
          if (hasSlots && (!item.slot || item.slot === "")) {
            errors.push({
              type: "activity",
              index,
              activity: activityName,
              field: "slot",
              message: `${activityName} : Créneau non sélectionné`,
              severity: "error",
            });
          }
        }

        // Règle spéciale pour les plongées : 2 jours minimum avant le départ
        const isDivingActivity = activity.name && (
          activity.name.toLowerCase().includes('plongée') ||
          activity.name.toLowerCase().includes('plongee') ||
          activity.name.toLowerCase().includes('diving')
        );

        if (isDivingActivity && client.departureDate) {
          const departure = new Date(client.departureDate + "T12:00:00");
          const diffTime = departure.getTime() - activityDate.getTime();
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          
          if (diffDays < 2) {
            errors.push({
              type: "activity",
              index,
              activity: activityName,
              field: "date",
              message: `${activityName} : Plongée trop proche du départ (minimum 2 jours avant)`,
              severity: "error",
            });
          }
        }
      }

      // Vérifier les prix anormaux
      const lineTotal = c.lineTotal || 0;
      
      // Prix à 0 pour une activité normale (hors transferts, buggy, moto)
      if (!isTransferActivity && !isBuggy && !isMoto && lineTotal === 0 && totalParticipants > 0) {
        warnings.push({
          type: "activity",
          index,
          activity: activityName,
          field: "price",
          message: `${activityName} : Prix à 0€ malgré des participants`,
          severity: "warning",
        });
      }

      // Pour les transferts, vérifier qu'un prix est défini
      if (isTransferActivity && lineTotal === 0) {
        warnings.push({
          type: "activity",
          index,
          activity: activityName,
          field: "price",
          message: `${activityName} : Prix à 0€. Vérifiez que "Aller simple" ou "Aller retour" est sélectionné.`,
          severity: "warning",
        });
      }

      // Prix très élevé (plus de 1000€ par ligne)
      if (lineTotal > 1000) {
        warnings.push({
          type: "activity",
          index,
          activity: activityName,
          field: "price",
          message: `${activityName} : Prix très élevé (${Math.round(lineTotal)}€). Vérifiez les montants.`,
          severity: "warning",
        });
      }

      // Vérifier les extras suspects
      const extraAmount = Number(item.extraAmount || 0);
      if (Math.abs(extraAmount) > 500) {
        warnings.push({
          type: "activity",
          index,
          activity: activityName,
          field: "extra",
          message: `${activityName} : Extra très élevé (${extraAmount}€). Vérifiez le montant.`,
          severity: "warning",
        });
      }
    });

    // 3. VALIDATION GLOBALE
    const grandTotal = validComputed.reduce((s, c) => s + (c.lineTotal || 0), 0);
    
    if (grandTotal === 0 && validComputed.length > 0) {
      errors.push({
        type: "global",
        field: "total",
        message: "Le total du devis est à 0€",
        severity: "error",
      });
    }

    if (grandTotal > 10000) {
      warnings.push({
        type: "global",
        field: "total",
        message: `Total très élevé (${Math.round(grandTotal)}€). Vérifiez les montants.`,
        severity: "warning",
      });
    }

    // Vérifier les doublons d'activités à la même date
    const activityDateMap = new Map();
    validComputed.forEach((c, index) => {
      if (c.act && c.raw.date) {
        const key = `${c.act.id}_${c.raw.date}`;
        if (activityDateMap.has(key)) {
          warnings.push({
            type: "activity",
            index,
            activity: c.act.name,
            field: "duplicate",
            message: `${c.act.name} : Activité déjà présente à la même date (${c.raw.date})`,
            severity: "warning",
          });
        } else {
          activityDateMap.set(key, index);
        }
      }
    });

    return {
      errors,
      warnings,
      info,
      isValid: errors.length === 0,
      hasWarnings: warnings.length > 0,
      errorCount: errors.length,
      warningCount: warnings.length,
    };
  }, [client, items, computed, activitiesMap, stopSalesMap, pushSalesMap]);

  return validation;
}

