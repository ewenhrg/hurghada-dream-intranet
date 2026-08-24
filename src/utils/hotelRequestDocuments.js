/** Documents client (hôtel ou devis activités) — métadonnées + URL Storage. */

export const HOTEL_CLIENT_DOC_TYPES = [
  { value: "passport", label: "Passport" },
  { value: "flight_ticket", label: "Flight reservation" },
  { value: "hotel_reservation", label: "Hotel reservation" },
  { value: "visa", label: "Visa" },
  { value: "id_card", label: "ID card" },
  { value: "other", label: "Other" },
];

/** Documents obligatoires pour Zero Tracas / Zero Tracas Hors zone à l’encaissement. */
export const ZERO_TRACAS_REQUIRED_DOC_TYPES = [
  { value: "passport", label: "Passport" },
  { value: "hotel_reservation", label: "Hotel reservation" },
  { value: "flight_ticket", label: "Flight reservation" },
];

export function hotelClientDocTypeLabel(type, customLabel = "") {
  const t = String(type || "").trim();
  if (t === "other" && String(customLabel || "").trim()) {
    return String(customLabel).trim();
  }
  return HOTEL_CLIENT_DOC_TYPES.find((x) => x.value === t)?.label || "Document";
}

export function normalizeClientDocuments(raw) {
  const list = Array.isArray(raw) ? raw : [];
  return list
    .map((d) => {
      const url = String(d?.url || "").trim();
      if (!url) return null;
      const type = String(d?.type || "other").trim() || "other";
      return {
        id: String(d?.id || `${d?.uploadedAt || ""}-${url}`),
        type,
        label: String(d?.label || "").trim(),
        fileName: String(d?.fileName || "").trim(),
        url,
        mimeType: String(d?.mimeType || "").trim(),
        uploadedAt: String(d?.uploadedAt || "").trim(),
      };
    })
    .filter(Boolean);
}

export function serializeClientDocuments(docs) {
  return normalizeClientDocuments(docs);
}

/** Types requis Zero Tracas encore absents sur le devis. */
export function getMissingZeroTracasDocuments(quote) {
  const docs = normalizeClientDocuments(quote?.clientDocuments);
  return ZERO_TRACAS_REQUIRED_DOC_TYPES.filter(
    (req) => !docs.some((d) => String(d.type || "").trim() === req.value)
  );
}

export function hasAllZeroTracasRequiredDocuments(quote) {
  return getMissingZeroTracasDocuments(quote).length === 0;
}
