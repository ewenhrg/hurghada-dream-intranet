import { SITE_KEY } from "../constants";
import { supabase, __SUPABASE_DEBUG__ } from "../lib/supabase";
import { logger } from "./logger";

const TABLE = "public_hotel_rates";

function toNumberOrNull(value) {
  if (value === "" || value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function mapHotelRateFromDb(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    siteKey: row.site_key || SITE_KEY,
    hotelSlug: String(row.hotel_slug || "").trim(),
    hotelName: String(row.hotel_name || "").trim(),
    roomCategory: String(row.room_category || "").trim(),
    dateFrom: String(row.date_from || "").trim(),
    dateTo: String(row.date_to || "").trim(),
    priceAdult: row.price_adult != null ? Number(row.price_adult) : null,
    priceChild: row.price_child != null ? Number(row.price_child) : null,
    priceBaby: row.price_baby != null ? Number(row.price_baby) : null,
    currency: String(row.currency || "EUR").trim() || "EUR",
    notes: String(row.notes || "").trim(),
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

export function emptyHotelRateDraft(hotel, roomCategory = "") {
  return {
    id: null,
    hotelSlug: hotel?.slug || hotel?.id || "",
    hotelName: hotel?.name || "",
    roomCategory: roomCategory || "",
    dateFrom: "",
    dateTo: "",
    priceAdult: "",
    priceChild: "",
    priceBaby: "",
    currency: "EUR",
    notes: "",
  };
}

export function validateHotelRateDraft(draft) {
  if (!String(draft.hotelSlug || "").trim()) return "Hôtel manquant.";
  if (!String(draft.roomCategory || "").trim()) return "Catégorie de chambre obligatoire.";
  if (!draft.dateFrom) return "Date de début obligatoire.";
  if (!draft.dateTo) return "Date de fin obligatoire.";
  if (draft.dateTo < draft.dateFrom) return "La date de fin doit être après (ou égale à) la date de début.";
  const adult = toNumberOrNull(draft.priceAdult);
  if (adult == null || adult < 0) return "Prix adulte invalide.";
  const child = toNumberOrNull(draft.priceChild);
  if (draft.priceChild !== "" && draft.priceChild != null && (child == null || child < 0)) {
    return "Prix enfant invalide.";
  }
  const baby = toNumberOrNull(draft.priceBaby);
  if (draft.priceBaby !== "" && draft.priceBaby != null && (baby == null || baby < 0)) {
    return "Prix bébé invalide.";
  }
  return null;
}

function draftToPayload(draft) {
  return {
    site_key: SITE_KEY,
    hotel_slug: String(draft.hotelSlug || "").trim(),
    hotel_name: String(draft.hotelName || "").trim(),
    room_category: String(draft.roomCategory || "").trim(),
    date_from: draft.dateFrom,
    date_to: draft.dateTo,
    price_adult: toNumberOrNull(draft.priceAdult),
    price_child: toNumberOrNull(draft.priceChild),
    price_baby: toNumberOrNull(draft.priceBaby),
    currency: String(draft.currency || "EUR").trim() || "EUR",
    notes: String(draft.notes || "").trim(),
    updated_at: new Date().toISOString(),
  };
}

export async function loadHotelRates({ hotelSlug = null } = {}) {
  if (!__SUPABASE_DEBUG__?.isConfigured || !supabase) {
    return { rates: [], error: "Supabase non configuré" };
  }
  try {
    let query = supabase
      .from(TABLE)
      .select("*")
      .eq("site_key", SITE_KEY)
      .order("date_from", { ascending: true });

    if (hotelSlug) {
      query = query.eq("hotel_slug", String(hotelSlug).trim());
    }

    const { data, error } = await query;
    if (error) {
      logger.warn("loadHotelRates:", error.message || error);
      return { rates: [], error: error.message || String(error) };
    }
    return {
      rates: (data || []).map(mapHotelRateFromDb).filter(Boolean),
      error: null,
    };
  } catch (err) {
    logger.error("loadHotelRates:", err);
    return { rates: [], error: err?.message || String(err) };
  }
}

export async function saveHotelRate(draft) {
  if (!__SUPABASE_DEBUG__?.isConfigured || !supabase) {
    return { ok: false, error: "Supabase non configuré", rate: null };
  }
  const validation = validateHotelRateDraft(draft);
  if (validation) return { ok: false, error: validation, rate: null };

  const payload = draftToPayload(draft);
  try {
    if (draft.id) {
      const { data, error } = await supabase
        .from(TABLE)
        .update(payload)
        .eq("id", draft.id)
        .eq("site_key", SITE_KEY)
        .select("*")
        .maybeSingle();
      if (error) return { ok: false, error: error.message || String(error), rate: null };
      return { ok: true, error: null, rate: mapHotelRateFromDb(data) };
    }

    payload.created_at = new Date().toISOString();
    const { data, error } = await supabase.from(TABLE).insert(payload).select("*").maybeSingle();
    if (error) return { ok: false, error: error.message || String(error), rate: null };
    return { ok: true, error: null, rate: mapHotelRateFromDb(data) };
  } catch (err) {
    return { ok: false, error: err?.message || String(err), rate: null };
  }
}

export async function deleteHotelRate(id) {
  if (!__SUPABASE_DEBUG__?.isConfigured || !supabase) {
    return { ok: false, error: "Supabase non configuré" };
  }
  try {
    const { error } = await supabase.from(TABLE).delete().eq("id", id).eq("site_key", SITE_KEY);
    if (error) return { ok: false, error: error.message || String(error) };
    return { ok: true, error: null };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
}

/**
 * Trouve les grilles tarifaires qui couvrent [arrival, departure) nuit par nuit.
 * Utile pour le calcul devis (à brancher plus tard).
 */
export function ratesCoveringStay(rates, { hotelSlug, roomCategory, arrivalDate, departureDate }) {
  const list = Array.isArray(rates) ? rates : [];
  const slug = String(hotelSlug || "").trim();
  const cat = String(roomCategory || "").trim();
  const from = String(arrivalDate || "").trim();
  const to = String(departureDate || "").trim();
  if (!slug || !cat || !from || !to || to <= from) return [];

  return list.filter(
    (r) =>
      r.hotelSlug === slug &&
      r.roomCategory === cat &&
      r.dateFrom &&
      r.dateTo &&
      r.dateFrom <= to &&
      r.dateTo >= from
  );
}
