import { useMemo } from "react";
import { calculateCardPrice } from "../utils";
import { SPEED_BOAT_EXTRAS } from "../constants/activityExtras";
import { isBuggyActivity, getBuggyPrices, isMotoCrossActivity, getMotoCrossPrices } from "../utils/activityHelpers";

/**
 * Hook personnalisé pour calculer les prix des activités
 * @param {Array} items - Les items du formulaire
 * @param {Map} activitiesMap - Map des activités pour recherche O(1)
 * @param {string} neighborhood - Quartier du client
 * @param {Map} stopSalesMap - Map des stop sales
 * @param {Map} pushSalesMap - Map des push sales
 * @returns {Object} - Objet contenant computed, grandTotal, grandTotalCash, grandTotalCard, grandCurrency
 */
export function useActivityPriceCalculator(items, activitiesMap, neighborhood, stopSalesMap, pushSalesMap) {
  const computed = useMemo(() => {
    return items.map((it) => {
      // Recherche optimisée O(1) avec Map au lieu de O(n) avec find
      const act = activitiesMap.get(it.activityId);
      const weekday = it.date ? new Date(it.date + "T12:00:00").getDay() : null;
      const baseAvailable = act && weekday != null ? !!act.availableDays?.[weekday] : true;
      
      // Vérifier les stop sales et push sales (optimisé avec Maps O(1))
      // Vérifier avec l'ID local (id) et l'ID Supabase (supabase_id) car les stop/push sales peuvent utiliser l'un ou l'autre
      let isStopSale = false;
      let isPushSale = false;
      if (act && it.date) {
        const keyId = `${act.id}_${it.date}`;
        const keySupabaseId = act.supabase_id ? `${act.supabase_id}_${it.date}` : null;
        isStopSale = stopSalesMap.has(keyId) || (keySupabaseId && stopSalesMap.has(keySupabaseId));
        isPushSale = pushSalesMap.has(keyId) || (keySupabaseId && pushSalesMap.has(keySupabaseId));
      }
      
      // Disponibilité finale : disponible si push sale OU (baseAvailable ET pas de stop sale)
      const available = isPushSale || (baseAvailable && !isStopSale);
      
      const transferInfo = act && neighborhood ? act.transfers?.[neighborhood] || null : null;

      let lineTotal = 0;
      const currencyCode = act?.currency || "EUR";

      // cas spécial Speed Boat
      if (act && act.name && act.name.toLowerCase().includes("speed boat")) {
        const ad = Number(it.adults || 0);
        const ch = Number(it.children || 0);

        // Prix de base : 145€ pour 1 ou 2 adultes
        lineTotal = 145;

        // Si plus de 2 adultes : +20€ par adulte supplémentaire (au-delà de 2)
        if (ad > 2) {
          const extraAdults = ad - 2;
          lineTotal += extraAdults * 20;
        }

        // Tous les enfants : +10€ par enfant
        lineTotal += ch * 10;

        // Extra dauphin : +20€ si la case est cochée
        if (it.extraDolphin) {
          lineTotal += 20;
        }

        // Extra Speed Boat (plusieurs extras possibles) : calcul basé sur adultes et enfants
        if (it.speedBoatExtra && Array.isArray(it.speedBoatExtra) && it.speedBoatExtra.length > 0) {
          it.speedBoatExtra.forEach((extraId) => {
            if (extraId) { // Ignorer les valeurs vides
              const selectedExtra = SPEED_BOAT_EXTRAS.find((e) => e.id === extraId);
              if (selectedExtra) {
                lineTotal += ad * selectedExtra.priceAdult;
                lineTotal += ch * selectedExtra.priceChild;
              }
            }
          });
        }
        // Compatibilité avec l'ancien format (string) si présent
        else if (it.speedBoatExtra && typeof it.speedBoatExtra === "string" && it.speedBoatExtra !== "") {
          const selectedExtra = SPEED_BOAT_EXTRAS.find((e) => e.id === it.speedBoatExtra);
          if (selectedExtra) {
            lineTotal += ad * selectedExtra.priceAdult;
            lineTotal += ch * selectedExtra.priceChild;
          }
        }

      } else if (act && isBuggyActivity(act.name)) {
        // cas spécial BUGGY + SHOW et BUGGY SAFARI MATIN : calcul basé sur buggy simple et family
        const buggySimple = Number(it.buggySimple || 0);
        const buggyFamily = Number(it.buggyFamily || 0);
        const prices = getBuggyPrices(act.name);
        lineTotal = buggySimple * prices.simple + buggyFamily * prices.family;
      } else if (act && isMotoCrossActivity(act.name)) {
        // cas spécial MOTO CROSS : calcul basé sur les trois types de moto
        const yamaha250 = Number(it.yamaha250 || 0);
        const ktm640 = Number(it.ktm640 || 0);
        const ktm530 = Number(it.ktm530 || 0);
        const prices = getMotoCrossPrices();
        lineTotal = yamaha250 * prices.yamaha250 + ktm640 * prices.ktm640 + ktm530 * prices.ktm530;
      } else if (act && (act.name.toLowerCase().includes("hurghada") && (act.name.toLowerCase().includes("le caire") || act.name.toLowerCase().includes("louxor")))) {
        // cas spécial HURGHADA - LE CAIRE et HURGHADA - LOUXOR
        // Prix fixe : Aller simple = 150€, Aller retour = 300€
        // Les adultes/enfants/bébés ne changent pas le prix
        if (it.allerSimple) {
          lineTotal = 150;
        } else if (it.allerRetour) {
          lineTotal = 300;
        }
        // Sinon, le prix reste à 0
      } else if (act && act.name.toLowerCase().includes("soma bay") && act.name.toLowerCase().includes("aeroport") && act.name.toLowerCase().includes("7")) {
        // cas spécial SOMA BAY - AEROPORT 7 pax
        // Prix fixe : Aller simple = 40€, Aller retour = 80€
        // Les adultes/enfants/bébés ne changent pas le prix
        if (it.allerSimple) {
          lineTotal = 40;
        } else if (it.allerRetour) {
          lineTotal = 80;
        }
        // Sinon, le prix reste à 0
      } else if (act && act.name.toLowerCase().includes("soma bay") && act.name.toLowerCase().includes("aeroport") && act.name.toLowerCase().includes("4")) {
        // cas spécial SOMA BAY - AEROPORT 4 pax
        // Prix fixe : Aller simple = 35€, Aller retour = 70€
        // Les adultes/enfants/bébés ne changent pas le prix
        if (it.allerSimple) {
          lineTotal = 35;
        } else if (it.allerRetour) {
          lineTotal = 70;
        }
        // Sinon, le prix reste à 0
      } else if (act && act.name.toLowerCase().includes("hors zone") && (act.name.toLowerCase().includes("aeroport") || act.name.toLowerCase().includes("aerport")) && act.name.toLowerCase().includes("7")) {
        // cas spécial HORS ZONE - AERPORT 7 pax
        // Prix fixe : Aller simple = 30€, Aller retour = 60€
        // Les adultes/enfants/bébés ne changent pas le prix
        if (it.allerSimple) {
          lineTotal = 30;
        } else if (it.allerRetour) {
          lineTotal = 60;
        }
        // Sinon, le prix reste à 0
      } else if (act && act.name.toLowerCase().includes("hors zone") && (act.name.toLowerCase().includes("aeroport") || act.name.toLowerCase().includes("aerport")) && act.name.toLowerCase().includes("4")) {
        // cas spécial HORS ZONE - AERPORT 4 pax
        // Prix fixe : Aller simple = 25€, Aller retour = 50€
        // Les adultes/enfants/bébés ne changent pas le prix
        if (it.allerSimple) {
          lineTotal = 25;
        } else if (it.allerRetour) {
          lineTotal = 50;
        }
        // Sinon, le prix reste à 0
      } else if (act && act.name.toLowerCase().includes("aeroport") && act.name.toLowerCase().includes("7")) {
        // cas spécial HURGHADA - AEROPORT 7 pax
        // Prix fixe : Aller simple = 25€, Aller retour = 50€
        // Les adultes/enfants/bébés ne changent pas le prix
        if (it.allerSimple) {
          lineTotal = 25;
        } else if (it.allerRetour) {
          lineTotal = 50;
        }
        // Sinon, le prix reste à 0
      } else if (act && act.name.toLowerCase().includes("soma bay") && (act.name.toLowerCase().includes("aeroport") || act.name.toLowerCase().includes("aerport")) && act.name.toLowerCase().includes("4")) {
        // cas spécial SOMA BAY - AEROPORT 4 pax
        // Prix fixe : Aller simple = 35€, Aller retour = 70€
        // Les adultes/enfants/bébés ne changent pas le prix
        if (it.allerSimple) {
          lineTotal = 35;
        } else if (it.allerRetour) {
          lineTotal = 70;
        }
        // Sinon, le prix reste à 0
      } else if (act && act.name.toLowerCase().includes("aeroport") && act.name.toLowerCase().includes("4")) {
        // cas spécial HURGHADA - AEROPORT 4 pax
        // Prix fixe : Aller simple = 20€, Aller retour = 40€
        // Les adultes/enfants/bébés ne changent pas le prix
        if (it.allerSimple) {
          lineTotal = 20;
        } else if (it.allerRetour) {
          lineTotal = 40;
        }
        // Sinon, le prix reste à 0
      } else if (act) {
        lineTotal += Number(it.adults || 0) * Number(act.priceAdult || 0);
        lineTotal += Number(it.children || 0) * Number(act.priceChild || 0);
        lineTotal += Number(it.babies || 0) * Number(act.priceBaby || 0);
        
      }

      // supplément transfert PAR ADULTE ET ENFANT (bébés gratuits)
      if (transferInfo && transferInfo.surcharge) {
        if (act && isMotoCrossActivity(act.name)) {
          // Pour MOTO CROSS, le supplément est calculé sur le nombre total de motos
          const totalMotos = Number(it.yamaha250 || 0) + Number(it.ktm640 || 0) + Number(it.ktm530 || 0);
          lineTotal += Number(transferInfo.surcharge || 0) * totalMotos;
        } else {
          // Pour toutes les autres activités (y compris buggy), le supplément est calculé sur le nombre d'adultes + enfants (bébés gratuits)
          const adults = Number(it.adults || 0);
          const children = Number(it.children || 0);
          lineTotal += Number(transferInfo.surcharge || 0) * (adults + children);
        }
      }

      // extra (montant à ajouter ou soustraire) - s'applique à toutes les activités
      // Convertir en string d'abord pour gérer les cas où c'est déjà un nombre
      const extraAmountStr = String(it.extraAmount || "").trim();
      if (extraAmountStr !== "" && extraAmountStr !== "0" && extraAmountStr !== "0.00") {
        const extraAmountValue = Number(extraAmountStr);
        if (!isNaN(extraAmountValue) && extraAmountValue !== 0) {
          lineTotal += extraAmountValue;
        }
      }

      const pickupTime =
        it.slot === "morning"
          ? transferInfo?.morningTime
          : it.slot === "afternoon"
            ? transferInfo?.afternoonTime
            : it.slot === "evening"
              ? transferInfo?.eveningTime
              : "";

      return {
        raw: it,
        act,
        weekday,
        available,
        baseAvailable,
        isStopSale,
        isPushSale,
        transferInfo,
        lineTotal,
        pickupTime,
        currency: currencyCode,
      };
    });
  }, [items, activitiesMap, neighborhood, stopSalesMap, pushSalesMap]);

  // Mémoïser les calculs de totaux pour éviter les recalculs inutiles
  const grandCurrency = useMemo(() => computed.find((c) => c.currency)?.currency || "EUR", [computed]);
  const grandTotal = useMemo(() => computed.reduce((s, c) => s + (c.lineTotal || 0), 0), [computed]);
  const grandTotalCash = useMemo(() => Math.round(grandTotal), [grandTotal]); // Prix espèces (arrondi sans centimes)
  const grandTotalCard = useMemo(() => calculateCardPrice(grandTotal), [grandTotal]); // Prix carte (espèces + 3% arrondi à l'euro supérieur)

  return {
    computed,
    grandCurrency,
    grandTotal,
    grandTotalCash,
    grandTotalCard,
  };
}

