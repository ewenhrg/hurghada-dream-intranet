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

function strAdults(raw) {
  if (raw === "" || raw === null || raw === undefined) return "";
  return String(Math.max(0, Number(raw) || 0));
}

/** Aligné sur QuotesPage (champs texte vides si 0). */
function toVehicleCountField(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return "";
  return String(Math.floor(n));
}

/**
 * Fusionne une ligne issue de `public_quotes.items` (JSON) vers une ligne devis interne.
 * @param {object} line
 */
export function mergePublicSavedLineIntoQuoteItem(line) {
  const base = {
    ...createBlankQuoteLine(),
    activityId: String(line.activityId || ""),
    date: line.date || new Date().toISOString().slice(0, 10),
    adults: strAdults(line.adults),
    children: Math.max(0, Number(line.children) || 0),
    babies: Math.max(0, Number(line.babies) || 0),
  };

  const extrasRaw = line.speedBoatExtra;
  base.speedBoatExtra = Array.isArray(extrasRaw)
    ? [...extrasRaw]
    : extrasRaw
      ? [extrasRaw]
      : [];
  base.extraDolphin = Boolean(line.extraDolphin);

  base.buggySimple = toVehicleCountField(line.buggySimple);
  base.buggyFamily = toVehicleCountField(line.buggyFamily);
  base.yamaha250 = toVehicleCountField(line.yamaha250);
  base.ktm640 = toVehicleCountField(line.ktm640);
  base.ktm530 = toVehicleCountField(line.ktm530);

  base.cairePrivatif4pax = Boolean(line.cairePrivatif4pax);
  base.cairePrivatif5pax = Boolean(line.cairePrivatif5pax);
  base.cairePrivatif6pax = Boolean(line.cairePrivatif6pax);
  base.louxorPrivatif4pax = Boolean(line.louxorPrivatif4pax);
  base.louxorPrivatif5pax = Boolean(line.louxorPrivatif5pax);
  base.louxorPrivatif6pax = Boolean(line.louxorPrivatif6pax);

  base.allerSimple = Boolean(line.allerSimple);
  base.allerRetour = Boolean(line.allerRetour);

  base.zeroTracasTransfertVisaSim = line.zeroTracasTransfertVisaSim != null ? String(line.zeroTracasTransfertVisaSim) : "";
  base.zeroTracasTransfertVisa = line.zeroTracasTransfertVisa != null ? String(line.zeroTracasTransfertVisa) : "";
  base.zeroTracasTransfert3Personnes =
    line.zeroTracasTransfert3Personnes != null ? String(line.zeroTracasTransfert3Personnes) : "";
  base.zeroTracasTransfertPlus3Personnes =
    line.zeroTracasTransfertPlus3Personnes != null ? String(line.zeroTracasTransfertPlus3Personnes) : "";
  base.zeroTracasVisaSim = line.zeroTracasVisaSim != null ? String(line.zeroTracasVisaSim) : "";
  base.zeroTracasVisaSeul = line.zeroTracasVisaSeul != null ? String(line.zeroTracasVisaSeul) : "";

  return base;
}

/**
 * @param {Array<object>} lines — éléments de `public_quotes.items` (tableau JSON)
 */
export function mapPublicCatalogLinesToQuoteItems(lines) {
  if (!lines || !lines.length) {
    return [createBlankQuoteLine()];
  }
  return lines.map((line) => mergePublicSavedLineIntoQuoteItem(line));
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
      arrivalDate: vm.client?.arrivalDate || "",
      departureDate: vm.client?.departureDate || "",
    },
    items,
    notes: vm.notes || "",
  };
}
