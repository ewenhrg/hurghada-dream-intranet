/** Origine d’un devis interne : saisie intranet ou demande catalogue public. */
export const QUOTE_SOURCE_WEB = "web";
export const QUOTE_SOURCE_MANUAL = "manual";

/**
 * @param {unknown} raw
 * @param {unknown} [createdByName]
 * @returns {"web"|"manual"}
 */
export function normalizeQuoteSource(raw, createdByName = "") {
  const s = String(raw || "").trim().toLowerCase();
  if (s === QUOTE_SOURCE_WEB || s === "catalogue" || s === "public" || s === "demande_web") {
    return QUOTE_SOURCE_WEB;
  }
  if (s === QUOTE_SOURCE_MANUAL || s === "manuel" || s === "intranet") {
    return QUOTE_SOURCE_MANUAL;
  }
  const by = String(createdByName || "").trim().toLowerCase();
  if (by === "public devis" || by.startsWith("public ") || by.includes("catalogue")) {
    return QUOTE_SOURCE_WEB;
  }
  return QUOTE_SOURCE_MANUAL;
}

/** @param {{ source?: unknown, createdByName?: unknown }|null|undefined} quote */
export function isQuoteFromWeb(quote) {
  return normalizeQuoteSource(quote?.source, quote?.createdByName) === QUOTE_SOURCE_WEB;
}

/**
 * @param {unknown} error
 * @returns {boolean}
 */
export function isMissingQuoteSourceColumnError(error) {
  const msg = `${error?.message || ""} ${error?.details || ""} ${error?.hint || ""}`.toLowerCase();
  return msg.includes("source") && (msg.includes("column") || msg.includes("schema cache") || msg.includes("does not exist"));
}

/** @param {Record<string, unknown>} payload */
export function stripQuoteSourceColumn(payload) {
  if (!payload || typeof payload !== "object") return payload;
  const next = { ...payload };
  delete next.source;
  return next;
}
