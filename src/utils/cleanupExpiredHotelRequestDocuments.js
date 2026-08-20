import { normalizeClientDocuments } from "./hotelRequestDocuments.js";
import { normalizePayment } from "./hotelRequestPayment.js";

/** Supprimer les fichiers 2 jours après la date de départ. */
export const HOTEL_DOCS_RETENTION_DAYS_AFTER_DEPARTURE = 2;

function parseIsoDateOnly(iso) {
  const s = String(iso || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfLocalDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Départ dépassé de `daysAfter` jours complets. */
export function isDeparturePastRetention(
  departureDate,
  daysAfter = HOTEL_DOCS_RETENTION_DAYS_AFTER_DEPARTURE,
  asOf = new Date()
) {
  const departure = parseIsoDateOnly(departureDate);
  if (!departure) return false;
  const cutoff = new Date(departure);
  cutoff.setDate(cutoff.getDate() + daysAfter);
  return startOfLocalDay(asOf).getTime() > startOfLocalDay(cutoff).getTime();
}

export function storageRefFromPublicUrl(url) {
  const s = String(url || "").trim();
  if (!s) return null;
  const marker = "/storage/v1/object/public/";
  const idx = s.indexOf(marker);
  if (idx === -1) return null;
  const rest = s.slice(idx + marker.length);
  const slash = rest.indexOf("/");
  if (slash <= 0) return null;
  try {
    return {
      bucket: decodeURIComponent(rest.slice(0, slash)),
      path: decodeURIComponent(rest.slice(slash + 1).split("?")[0]),
    };
  } catch {
    return null;
  }
}

function collectStorageRefsFromPayload(payload) {
  const refs = [];
  for (const d of normalizeClientDocuments(payload?.clientDocuments)) {
    const ref = storageRefFromPublicUrl(d.url);
    if (ref?.bucket && ref?.path) refs.push(ref);
  }
  for (const e of normalizePayment(payload?.payment).entries) {
    const ref = storageRefFromPublicUrl(e.proofUrl);
    if (ref?.bucket && ref?.path) refs.push(ref);
  }
  return refs;
}

function payloadHasFilesToPurge(payload) {
  if (normalizeClientDocuments(payload?.clientDocuments).length > 0) return true;
  return normalizePayment(payload?.payment).entries.some((e) => Boolean(e.proofUrl));
}

function stripFilesFromPayload(rawPayload) {
  const base =
    rawPayload && typeof rawPayload === "object" && !Array.isArray(rawPayload)
      ? { ...rawPayload }
      : {};
  const payment = normalizePayment(base.payment);
  base.clientDocuments = [];
  base.payment = {
    schedule: payment.schedule || undefined,
    entries: payment.entries.map((e) => ({
      id: e.id,
      amount: e.amount,
      paidAt: e.paidAt,
      proofUrl: "",
      proofFileName: "",
    })),
  };
  base.documentsPurgedAt = new Date().toISOString();
  base.updatedAt = new Date().toISOString();
  return base;
}

async function removeStorageRefs(supabase, refs, logger) {
  const byBucket = new Map();
  for (const ref of refs) {
    if (!byBucket.has(ref.bucket)) byBucket.set(ref.bucket, []);
    byBucket.get(ref.bucket).push(ref.path);
  }
  for (const [bucket, paths] of byBucket) {
    const unique = [...new Set(paths)];
    if (unique.length === 0) continue;
    const { error } = await supabase.storage.from(bucket).remove(unique);
    if (error) {
      logger?.warn?.("cleanup hotel docs storage:", bucket, error.message || error);
    }
  }
}

/**
 * Pour chaque demande dont le départ + 2 j est dépassé :
 * supprime les fichiers Storage (documents client + preuves de paiement)
 * et vide les liens dans response_payload (montants de paiement conservés).
 * @returns {Promise<number>} nombre de dossiers nettoyés
 */
export async function cleanupExpiredHotelRequestDocuments({
  supabase,
  siteKey,
  rows,
  logger,
} = {}) {
  if (!supabase || !siteKey || !Array.isArray(rows) || rows.length === 0) return 0;

  let cleaned = 0;
  for (const row of rows) {
    const departure = row.departure_date || row.departureDate || "";
    if (!isDeparturePastRetention(departure)) continue;

    const rawPayload = row.response_payload ?? row.responsePayload;
    const payload =
      typeof rawPayload === "string"
        ? (() => {
            try {
              return JSON.parse(rawPayload);
            } catch {
              return {};
            }
          })()
        : rawPayload && typeof rawPayload === "object"
          ? rawPayload
          : {};

    if (!payloadHasFilesToPurge(payload)) continue;

    const id = row.id ?? row.supabaseId;
    if (id == null) continue;

    await removeStorageRefs(supabase, collectStorageRefsFromPayload(payload), logger);

    const nextPayload = stripFilesFromPayload(payload);
    const { error } = await supabase
      .from("public_hotel_requests")
      .update({
        response_payload: nextPayload,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("site_key", siteKey);

    if (error) {
      logger?.error?.("cleanup hotel docs update:", error);
      continue;
    }
    cleaned += 1;
  }

  return cleaned;
}
