import { supabase } from "../lib/supabase";
import { SITE_KEY, getQuoteSiteKeysForSync } from "../constants";
import { logger } from "./logger";

/**
 * Parse `quotes.items` (JSONB) même si double-encodé en string.
 */
export function parseQuoteItemsColumn(raw) {
  let value = raw;
  for (let i = 0; i < 3; i += 1) {
    if (typeof value !== "string") break;
    try {
      value = JSON.parse(value);
    } catch {
      return [];
    }
  }
  return Array.isArray(value) ? value : [];
}

/**
 * Met à jour les items (ex. tickets) d’un devis sur Supabase de façon robuste :
 * - items envoyés en tableau (JSONB), pas stringify
 * - match par id sans se limiter à un seul site_key
 * - vérifie qu’au moins une ligne a été modifiée
 */
export async function persistQuoteItemsToSupabase(
  quote,
  items,
  { updatedAt, paidCash, paidStripe } = {}
) {
  if (!supabase || !quote) {
    return { ok: false, error: new Error("Supabase ou devis manquant") };
  }

  const payload = {
    items: Array.isArray(items) ? items : [],
    updated_at: updatedAt || new Date().toISOString(),
  };
  if (paidCash != null && Number.isFinite(Number(paidCash))) {
    payload.paid_cash = Math.round(Number(paidCash));
  }
  if (paidStripe != null && Number.isFinite(Number(paidStripe))) {
    payload.paid_stripe = Math.round(Number(paidStripe));
  }

  const siteKeys = getQuoteSiteKeysForSync();

  const run = (build) => {
    let query = supabase.from("quotes").update(payload);
    query = build(query);
    return query.select("id, items");
  };

  const attempts = [];

  const supabaseId = quote.supabase_id ?? null;
  if (supabaseId != null && String(supabaseId).trim() !== "") {
    attempts.push((q) => q.eq("id", supabaseId));
  }

  const localId = quote.id;
  if (
    localId != null &&
    String(localId).trim() !== "" &&
    String(localId) !== String(supabaseId || "") &&
    /^\d+$/.test(String(localId))
  ) {
    attempts.push((q) => q.eq("id", localId));
  }

  if (quote.client?.phone && quote.createdAt) {
    attempts.push((q) =>
      q
        .eq("client_phone", quote.client.phone || "")
        .eq("created_at", quote.createdAt)
        .in("site_key", siteKeys)
    );
    // Certains devis n’ont que SITE_KEY courant
    attempts.push((q) =>
      q
        .eq("client_phone", quote.client.phone || "")
        .eq("created_at", quote.createdAt)
        .eq("site_key", SITE_KEY)
    );
  }

  let lastError = null;
  for (const build of attempts) {
    try {
      const { data, error } = await run(build);
      if (error) {
        lastError = error;
        continue;
      }
      if (Array.isArray(data) && data.length > 0) {
        return { ok: true, data: data[0], error: null };
      }
    } catch (e) {
      lastError = e;
      logger.warn("persistQuoteItemsToSupabase attempt failed:", e);
    }
  }

  return {
    ok: false,
    data: null,
    error: lastError || new Error("Aucune ligne devis mise à jour (id / téléphone introuvable)."),
  };
}
