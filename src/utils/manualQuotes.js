import { SITE_KEY } from "../constants";
import { formatPhoneWithPlus, uuid } from "../utils";
import { logger } from "./logger";

export function emptyManualLine() {
  return {
    id: uuid(),
    label: "",
    date: "",
    price: "",
  };
}

/** Même base d’infos client que le devis classique. */
export function emptyManualClient() {
  return {
    name: "",
    phone: "",
    emergencyPhone: "",
    email: "",
    hotel: "",
    room: "",
    neighborhood: "",
    arrivalDate: "",
    departureDate: "",
    isAirbnb: false,
    airbnbMapsUrl: "",
  };
}

export function normalizeManualClient(raw) {
  const base = raw && typeof raw === "object" ? raw : {};
  return {
    name: String(base.name || "").trim(),
    phone: formatPhoneWithPlus(String(base.phone || "").trim()),
    emergencyPhone: formatPhoneWithPlus(String(base.emergencyPhone || "").trim()),
    email: String(base.email || "").trim(),
    hotel: String(base.hotel || "").trim(),
    room: String(base.room || "").trim(),
    neighborhood: String(base.neighborhood || "").trim(),
    arrivalDate: String(base.arrivalDate || "").trim(),
    departureDate: String(base.departureDate || "").trim(),
    isAirbnb: Boolean(base.isAirbnb),
    airbnbMapsUrl: String(base.airbnbMapsUrl || "").trim(),
  };
}

export function normalizeManualLines(raw) {
  const list = Array.isArray(raw) ? raw : [];
  return list.map((line) => ({
    id: String(line?.id || uuid()),
    label: String(line?.label || "").trim(),
    date: String(line?.date || "").trim(),
    price: Number(line?.price) || 0,
  }));
}

export function computeManualQuoteTotal(lines) {
  return normalizeManualLines(lines).reduce((sum, line) => sum + (Number(line.price) || 0), 0);
}

export function rowToManualQuote(row) {
  if (!row) return null;
  const lines = normalizeManualLines(row.lines);
  const client = normalizeManualClient(row.client);
  if (!client.name && row.client_name) client.name = String(row.client_name).trim();
  return {
    id: row.id,
    siteKey: row.site_key || SITE_KEY,
    client,
    clientName: client.name || String(row.client_name || "").trim(),
    note: String(row.note || "").trim(),
    currency: row.currency || "EUR",
    lines,
    total: Number(row.total) || computeManualQuoteTotal(lines),
    createdByName: String(row.created_by_name || "").trim(),
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at || row.created_at || new Date().toISOString(),
  };
}

const MANUAL_QUOTE_SELECT =
  "id, site_key, client_name, client, note, currency, lines, total, created_by_name, created_at, updated_at";

export async function fetchManualQuotes(supabase, { limit = 200 } = {}) {
  if (!supabase) return { ok: false, quotes: [], error: new Error("no supabase") };
  try {
    const { data, error } = await supabase
      .from("manual_quotes")
      .select(MANUAL_QUOTE_SELECT)
      .eq("site_key", SITE_KEY)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) {
      logger.warn("fetchManualQuotes:", error);
      return { ok: false, quotes: [], error };
    }
    return {
      ok: true,
      quotes: (data || []).map(rowToManualQuote).filter(Boolean),
      error: null,
    };
  } catch (err) {
    logger.warn("fetchManualQuotes exception:", err);
    return { ok: false, quotes: [], error: err };
  }
}

export async function saveManualQuote(supabase, draft, userName = "") {
  if (!supabase) return { ok: false, quote: null, error: new Error("no supabase") };
  const lines = normalizeManualLines(draft?.lines).filter((line) => line.label || line.price);
  if (lines.length === 0) {
    return { ok: false, quote: null, error: new Error("empty") };
  }
  const client = normalizeManualClient(draft?.client);
  const total = computeManualQuoteTotal(lines);
  const payload = {
    site_key: SITE_KEY,
    client_name: client.name,
    client,
    note: String(draft?.note || "").trim(),
    currency: draft?.currency || "EUR",
    lines,
    total,
    created_by_name: String(userName || "").trim(),
    updated_at: new Date().toISOString(),
  };
  try {
    const { data, error } = await supabase
      .from("manual_quotes")
      .insert(payload)
      .select(MANUAL_QUOTE_SELECT)
      .single();
    if (error) {
      logger.warn("saveManualQuote:", error);
      return { ok: false, quote: null, error };
    }
    return { ok: true, quote: rowToManualQuote(data), error: null };
  } catch (err) {
    logger.warn("saveManualQuote exception:", err);
    return { ok: false, quote: null, error: err };
  }
}

export async function deleteManualQuote(supabase, id) {
  if (!supabase || id == null) return { ok: false, error: new Error("missing") };
  try {
    const { error } = await supabase.from("manual_quotes").delete().eq("id", id).eq("site_key", SITE_KEY);
    if (error) {
      logger.warn("deleteManualQuote:", error);
      return { ok: false, error };
    }
    return { ok: true, error: null };
  } catch (err) {
    logger.warn("deleteManualQuote exception:", err);
    return { ok: false, error: err };
  }
}
