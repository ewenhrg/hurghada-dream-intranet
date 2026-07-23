import { SITE_KEY } from "../constants";
import { supabase, __SUPABASE_DEBUG__ } from "../lib/supabase";
import { normalizeCatalogImageUrlsFromDb } from "./catalogContent";
import { PUBLIC_HOTELS } from "../data/publicHotels";
import { logger } from "./logger";

const TABLE = "public_hotels_catalog";

/** Slug URL-safe à partir d’un nom. */
export function slugifyHotelName(name) {
  const base = String(name || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return base || `hotel-${Date.now()}`;
}

function asStringArray(raw) {
  if (Array.isArray(raw)) {
    return raw.map((x) => String(x || "").trim()).filter(Boolean);
  }
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map((x) => String(x || "").trim()).filter(Boolean);
      }
    } catch {
      return String(raw)
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
    }
  }
  return [];
}

/**
 * Ligne DB → objet hôtel (même forme que PUBLIC_HOTELS + champs admin).
 */
export function mapHotelRowFromDb(row) {
  if (!row) return null;
  const stars = Math.min(5, Math.max(1, Number(row.stars) || 4));
  return {
    id: String(row.slug || row.id || "").trim(),
    dbId: row.id != null ? String(row.id) : null,
    slug: String(row.slug || "").trim(),
    name: String(row.name || "").trim(),
    location: String(row.location || "").trim(),
    address: String(row.address || "").trim(),
    lat: row.lat != null && Number.isFinite(Number(row.lat)) ? Number(row.lat) : null,
    lng: row.lng != null && Number.isFinite(Number(row.lng)) ? Number(row.lng) : null,
    stars,
    description: String(row.description || "").trim(),
    highlights: asStringArray(row.highlights),
    amenities: asStringArray(row.amenities),
    images: normalizeCatalogImageUrlsFromDb(row.image_urls),
    sortOrder: Number(row.sort_order) || 0,
    isPublished: row.is_published !== false,
    siteKey: row.site_key || SITE_KEY,
    updatedAt: row.updated_at || null,
  };
}

/** Objet hôtel → payload insert/update Supabase. */
export function hotelToDbPayload(hotel, { forInsert = false } = {}) {
  const slug = String(hotel.slug || hotel.id || slugifyHotelName(hotel.name)).trim();
  const lat = hotel.lat === "" || hotel.lat == null ? null : Number(hotel.lat);
  const lng = hotel.lng === "" || hotel.lng == null ? null : Number(hotel.lng);
  const payload = {
    site_key: SITE_KEY,
    slug,
    name: String(hotel.name || "").trim(),
    location: String(hotel.location || "").trim(),
    address: String(hotel.address || "").trim(),
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
    tagline: "",
    stars: Math.min(5, Math.max(1, Number(hotel.stars) || 4)),
    badge: "",
    accent: "violet",
    description: String(hotel.description || "").trim(),
    highlights: asStringArray(hotel.highlights),
    amenities: asStringArray(hotel.amenities),
    image_urls: normalizeCatalogImageUrlsFromDb(hotel.images ?? hotel.image_urls),
    sort_order: Number(hotel.sortOrder ?? hotel.sort_order) || 0,
    is_published: hotel.isPublished !== false && hotel.is_published !== false,
    updated_at: new Date().toISOString(),
  };
  if (forInsert) {
    payload.created_at = new Date().toISOString();
  }
  return payload;
}

/**
 * Charge le catalogue (admin = tous ; public = publiés seulement).
 * @returns {Promise<{ hotels: Array, error: string|null, fromFallback: boolean, tableEmpty?: boolean }>}
 */
export async function loadPublicHotelsCatalog({ publishedOnly = false } = {}) {
  if (!__SUPABASE_DEBUG__?.isConfigured || !supabase) {
    return {
      hotels: PUBLIC_HOTELS.map((h) => ({ ...h, dbId: null, slug: h.id, isPublished: true, sortOrder: 0 })),
      error: "Supabase non configuré",
      fromFallback: true,
      tableEmpty: false,
    };
  }

  try {
    let query = supabase
      .from(TABLE)
      .select("*")
      .eq("site_key", SITE_KEY)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    if (publishedOnly) {
      query = query.eq("is_published", true);
    }

    const { data, error } = await query;
    if (error) {
      const msg = error.message || String(error);
      logger.warn("publicHotelsCatalog load:", msg);
      return {
        hotels: PUBLIC_HOTELS.map((h) => ({
          ...h,
          dbId: null,
          slug: h.id,
          isPublished: true,
          sortOrder: 0,
        })),
        error: msg,
        fromFallback: true,
        tableEmpty: false,
      };
    }

    const hotels = (data || []).map(mapHotelRowFromDb).filter(Boolean);
    if (hotels.length === 0) {
      // Admin : table vide → import. Public : seed local pour ne pas afficher une page vide.
      if (publishedOnly) {
        return {
          hotels: PUBLIC_HOTELS.map((h) => ({
            ...h,
            dbId: null,
            slug: h.id,
            isPublished: true,
            sortOrder: 0,
          })),
          error: null,
          fromFallback: true,
          tableEmpty: true,
        };
      }
      return {
        hotels: [],
        error: null,
        fromFallback: false,
        tableEmpty: true,
      };
    }

    return { hotels, error: null, fromFallback: false, tableEmpty: false };
  } catch (err) {
    logger.error("publicHotelsCatalog load:", err);
    return {
      hotels: PUBLIC_HOTELS.map((h) => ({
        ...h,
        dbId: null,
        slug: h.id,
        isPublished: true,
        sortOrder: 0,
      })),
      error: err?.message || String(err),
      fromFallback: true,
      tableEmpty: false,
    };
  }
}

export async function loadPublicHotelBySlug(slug) {
  const target = String(slug || "").trim();
  if (!target) return { hotel: null, error: "Slug manquant", fromFallback: false };

  if (!__SUPABASE_DEBUG__?.isConfigured || !supabase) {
    const local = PUBLIC_HOTELS.find((h) => h.id === target) || null;
    return {
      hotel: local
        ? { ...local, dbId: null, slug: local.id, isPublished: true, sortOrder: 0 }
        : null,
      error: local ? null : "Hôtel introuvable",
      fromFallback: true,
    };
  }

  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select("*")
      .eq("site_key", SITE_KEY)
      .eq("slug", target)
      .eq("is_published", true)
      .maybeSingle();

    if (error) {
      const local = PUBLIC_HOTELS.find((h) => h.id === target) || null;
      return {
        hotel: local
          ? { ...local, dbId: null, slug: local.id, isPublished: true, sortOrder: 0 }
          : null,
        error: error.message || String(error),
        fromFallback: Boolean(local),
      };
    }

    if (data) {
      return { hotel: mapHotelRowFromDb(data), error: null, fromFallback: false };
    }

    const local = PUBLIC_HOTELS.find((h) => h.id === target) || null;
    return {
      hotel: local
        ? { ...local, dbId: null, slug: local.id, isPublished: true, sortOrder: 0 }
        : null,
      error: local ? null : "Hôtel introuvable",
      fromFallback: Boolean(local),
    };
  } catch (err) {
    const local = PUBLIC_HOTELS.find((h) => h.id === target) || null;
    return {
      hotel: local
        ? { ...local, dbId: null, slug: local.id, isPublished: true, sortOrder: 0 }
        : null,
      error: err?.message || String(err),
      fromFallback: Boolean(local),
    };
  }
}

export async function savePublicHotel(hotel) {
  if (!__SUPABASE_DEBUG__?.isConfigured || !supabase) {
    return { ok: false, error: "Supabase non configuré", hotel: null };
  }

  const isUpdate = Boolean(hotel?.dbId);
  const payload = hotelToDbPayload(hotel, { forInsert: !isUpdate });

  try {
    if (isUpdate) {
      const { data, error } = await supabase
        .from(TABLE)
        .update(payload)
        .eq("id", hotel.dbId)
        .select("*")
        .maybeSingle();
      if (error) return { ok: false, error: error.message || String(error), hotel: null };
      return { ok: true, error: null, hotel: mapHotelRowFromDb(data) };
    }

    const { data, error } = await supabase.from(TABLE).insert(payload).select("*").maybeSingle();
    if (error) return { ok: false, error: error.message || String(error), hotel: null };
    return { ok: true, error: null, hotel: mapHotelRowFromDb(data) };
  } catch (err) {
    return { ok: false, error: err?.message || String(err), hotel: null };
  }
}

export async function deletePublicHotel(dbId) {
  if (!__SUPABASE_DEBUG__?.isConfigured || !supabase) {
    return { ok: false, error: "Supabase non configuré" };
  }
  if (!dbId) return { ok: false, error: "Identifiant manquant" };
  try {
    const { error } = await supabase.from(TABLE).delete().eq("id", dbId);
    if (error) return { ok: false, error: error.message || String(error) };
    return { ok: true, error: null };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
}

/** Importe les hôtels seed manquants (n’écrase pas les fiches déjà en base). */
export async function seedPublicHotelsFromDefaults({ force = false } = {}) {
  if (!__SUPABASE_DEBUG__?.isConfigured || !supabase) {
    return { ok: false, error: "Supabase non configuré", inserted: 0 };
  }

  try {
    const { data: existingRows, error: existingError } = await supabase
      .from(TABLE)
      .select("slug")
      .eq("site_key", SITE_KEY);
    if (existingError) {
      return { ok: false, error: existingError.message || String(existingError), inserted: 0 };
    }

    const existingSlugs = new Set((existingRows || []).map((r) => String(r.slug || "").trim()));
    const missing = PUBLIC_HOTELS.filter((h) => !existingSlugs.has(h.id));

    if (missing.length === 0 && !force) {
      return {
        ok: true,
        error: null,
        inserted: 0,
        skipped: true,
        total: PUBLIC_HOTELS.length,
      };
    }

    const source = force ? PUBLIC_HOTELS : missing;
    const rows = source.map((h, index) =>
      hotelToDbPayload(
        {
          ...h,
          slug: h.id,
          sortOrder: PUBLIC_HOTELS.findIndex((x) => x.id === h.id) + 1 || index + 1,
          isPublished: true,
        },
        { forInsert: true }
      )
    );

    const { data, error } = await supabase
      .from(TABLE)
      .upsert(rows, {
        onConflict: "site_key,slug",
        ignoreDuplicates: !force,
      })
      .select("id");
    if (error) return { ok: false, error: error.message || String(error), inserted: 0 };
    return {
      ok: true,
      error: null,
      inserted: Array.isArray(data) ? data.length : rows.length,
      total: PUBLIC_HOTELS.length,
    };
  } catch (err) {
    return { ok: false, error: err?.message || String(err), inserted: 0 };
  }
}

export function emptyHotelDraft() {
  return {
    id: "",
    dbId: null,
    slug: "",
    name: "",
    location: "",
    address: "",
    lat: "",
    lng: "",
    stars: 4,
    description: "",
    highlights: [],
    amenities: [],
    images: [],
    sortOrder: 0,
    isPublished: true,
  };
}
