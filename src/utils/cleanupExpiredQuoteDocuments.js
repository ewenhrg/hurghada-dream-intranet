import {
  normalizeClientDocuments,
  serializeClientDocuments,
} from "./hotelRequestDocuments.js";
import { storageRefFromPublicUrl } from "./cleanupExpiredHotelRequestDocuments.js";

/**
 * Une fois la date de la dernière activité dépassée (jour suivant),
 * les documents client (passeports, etc.) du devis sont purgés.
 */
export const QUOTE_DOCS_RETENTION_DAYS_AFTER_LAST_ACTIVITY = 0;

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

/** Date YYYY-MM-DD de la dernière activité du devis, ou null. */
export function getQuoteLastActivityDate(quote) {
  const dates = (Array.isArray(quote?.items) ? quote.items : [])
    .map((it) => String(it?.date || "").trim())
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort();
  return dates.length > 0 ? dates[dates.length - 1] : null;
}

/** True si aujourd’hui est strictement après lastActivity + daysAfter. */
export function isQuoteLastActivityPastRetention(
  quoteOrLastDate,
  daysAfter = QUOTE_DOCS_RETENTION_DAYS_AFTER_LAST_ACTIVITY,
  asOf = new Date()
) {
  const lastIso =
    typeof quoteOrLastDate === "string"
      ? quoteOrLastDate
      : getQuoteLastActivityDate(quoteOrLastDate);
  const last = parseIsoDateOnly(lastIso);
  if (!last) return false;
  const cutoff = new Date(last);
  cutoff.setDate(cutoff.getDate() + Number(daysAfter) || 0);
  return startOfLocalDay(asOf).getTime() > startOfLocalDay(cutoff).getTime();
}

function collectDocStorageRefs(docs) {
  const refs = [];
  for (const d of normalizeClientDocuments(docs)) {
    const ref = storageRefFromPublicUrl(d.url);
    if (ref?.bucket && ref?.path) refs.push(ref);
  }
  return refs;
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
      logger?.warn?.("cleanup quote docs storage:", bucket, error.message || error);
    }
  }
}

/**
 * Pour chaque devis dont la dernière activité est passée :
 * supprime les fichiers Storage des documents client et vide client_documents.
 * @returns {Promise<{ cleaned: number, cleanedIds: string[] }>}
 */
export async function cleanupExpiredQuoteDocuments({
  supabase,
  siteKey,
  quotes,
  logger,
} = {}) {
  if (!supabase || !siteKey || !Array.isArray(quotes) || quotes.length === 0) {
    return { cleaned: 0, cleanedIds: [] };
  }

  const cleanedIds = [];

  for (const quote of quotes) {
    const docs = normalizeClientDocuments(quote.clientDocuments);
    if (docs.length === 0) continue;
    if (!isQuoteLastActivityPastRetention(quote)) continue;

    const quoteId = quote.id;
    const supabaseId = quote.supabase_id;

    await removeStorageRefs(supabase, collectDocStorageRefs(docs), logger);

    const emptyDocs = serializeClientDocuments([]);
    const updatedAt = new Date().toISOString();

    let updateQuery = supabase
      .from("quotes")
      .update({
        client_documents: emptyDocs,
        updated_at: updatedAt,
      })
      .eq("site_key", siteKey);

    if (supabaseId) {
      updateQuery = updateQuery.eq("id", supabaseId);
    } else if (quote.client?.phone && quote.createdAt) {
      updateQuery = updateQuery
        .eq("client_phone", quote.client.phone || "")
        .eq("created_at", quote.createdAt);
    } else {
      logger?.warn?.("cleanup quote docs: devis sans id Supabase, purge locale seule", quoteId);
      if (quoteId) cleanedIds.push(String(quoteId));
      continue;
    }

    const { error } = await updateQuery;
    if (error) {
      if (/client_documents/i.test(error.message || "")) {
        logger?.warn?.(
          "cleanup quote docs: colonne client_documents absente — exécutez supabase_quotes_add_client_documents.sql"
        );
        break;
      }
      logger?.error?.("cleanup quote docs update:", error);
      continue;
    }

    if (quoteId) cleanedIds.push(String(quoteId));
  }

  return { cleaned: cleanedIds.length, cleanedIds };
}
