/**
 * Construit un brouillon d’onglet Devis ({ client, items, notes }) à partir
 * d’une demande catalogue (table `public_quotes` ou modèle d’affichage équivalent).
 */

export const HD_PUBLIC_QUOTE_TO_DRAFT_EVENT = "hd-public-quote-to-draft";

/** Même forme de ligne vide que `blankItemMemo` dans QuotesPage (champs requis pour le formulaire). */
function createBlankQuoteLine() {
  return {
    activityId: "",
    date: new Date().toISOString().slice(0, 10),
    adults: "",
    children: 0,
    babies: 0,
    extraLabel: "",
    extraAmount: "",
    slot: "",
    extraDolphin: false,
    speedBoatExtra: [],
    buggySimple: "",
    buggyFamily: "",
    yamaha250: "",
    ktm640: "",
    ktm530: "",
    allerSimple: false,
    allerRetour: false,
    zeroTracasTransfertVisaSim: "",
    zeroTracasTransfertVisa: "",
    zeroTracasTransfert3Personnes: "",
    zeroTracasTransfertPlus3Personnes: "",
    zeroTracasVisaSim: "",
    zeroTracasVisaSeul: "",
    cairePrivatif4pax: false,
    cairePrivatif5pax: false,
    cairePrivatif6pax: false,
    louxorPrivatif4pax: false,
    louxorPrivatif5pax: false,
    louxorPrivatif6pax: false,
  };
}

/**
 * @param {Array<{ activityId?: string, date?: string, adults?: number|string, children?: number, babies?: number }>} lines
 */
export function mapPublicCatalogLinesToQuoteItems(lines) {
  if (!lines || !lines.length) {
    return [createBlankQuoteLine()];
  }
  return lines.map((line) => {
    const adultsRaw = line.adults;
    const adultsStr =
      adultsRaw === "" || adultsRaw === null || adultsRaw === undefined
        ? ""
        : String(Math.max(0, Number(adultsRaw) || 0));
    return {
      ...createBlankQuoteLine(),
      activityId: String(line.activityId || ""),
      date: line.date || new Date().toISOString().slice(0, 10),
      adults: adultsStr,
      children: Math.max(0, Number(line.children) || 0),
      babies: Math.max(0, Number(line.babies) || 0),
    };
  });
}

/**
 * @param {object} vm - retour de `rowToViewModel` sur PublicDevisPage
 * @returns {{ client: object, items: object[], notes: string }}
 */
export function buildQuoteDraftFromPublicViewModel(vm) {
  const items = mapPublicCatalogLinesToQuoteItems(vm.parsedItems);
  return {
    client: {
      name: vm.client?.name || "",
      phone: vm.client?.phone || "",
      email: vm.client?.email || "",
      hotel: vm.client?.hotel || "",
      room: "",
      neighborhood: "",
      arrivalDate: "",
      departureDate: "",
    },
    items,
    notes: vm.notes || "",
  };
}
