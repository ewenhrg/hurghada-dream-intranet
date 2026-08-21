/** Documents client (hôtel ou devis activités) — métadonnées + URL Storage. */

export const HOTEL_CLIENT_DOC_TYPES = [
  { value: "passport", label: "Passeport" },
  { value: "flight_ticket", label: "Billet d’avion" },
  { value: "visa", label: "Visa" },
  { value: "id_card", label: "Pièce d’identité" },
  { value: "other", label: "Autre" },
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
