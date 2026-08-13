import { supabase } from "../lib/supabase";
import { SITE_KEY } from "../constants";
import { logger } from "./logger";

export const PUBLIC_QUOTE_TTL_MS = 48 * 60 * 60 * 1000;

export function isPublicQuotePending(row) {
  return !String(row?.treated_by_name || row?.treatedByName || "").trim();
}

export function playPublicQuoteChime() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(0.18, now + 0.02);
    master.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);
    master.connect(ctx.destination);

    const beep = (freq, start, dur) => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, start);
      osc.connect(master);
      osc.start(start);
      osc.stop(start + dur);
    };

    beep(880, now, 0.16);
    beep(1174, now + 0.14, 0.28);

    setTimeout(() => {
      ctx.close().catch(() => {});
    }, 800);
  } catch (err) {
    logger.warn("Son devis public indisponible:", err);
  }
}

export async function fetchPendingPublicQuotesCount() {
  if (!supabase) return { count: 0, ids: [] };
  const cutoff = new Date(Date.now() - PUBLIC_QUOTE_TTL_MS).toISOString();
  const query = () =>
    supabase
      .from("public_quotes")
      .select("id, treated_by_name")
      .eq("site_key", SITE_KEY)
      .gte("created_at", cutoff)
      .limit(500);

  let { data, error } = await query();
  if (error && (/treated_by_name/i.test(String(error.message || "")) || error.code === "PGRST204")) {
    const retry = await supabase
      .from("public_quotes")
      .select("id")
      .eq("site_key", SITE_KEY)
      .gte("created_at", cutoff)
      .limit(500);
    data = retry.data;
    error = retry.error;
    if (!error) {
      const rows = data || [];
      return { count: rows.length, ids: rows.map((row) => String(row.id)) };
    }
  }

  if (error) {
    logger.warn("fetchPendingPublicQuotesCount:", error);
    return { count: 0, ids: [] };
  }
  const rows = data || [];
  return {
    count: rows.filter(isPublicQuotePending).length,
    ids: rows.map((row) => String(row.id)),
  };
}

export async function markPublicQuoteTreated(quoteId, userName) {
  const name = String(userName || "").trim();
  if (!supabase || !quoteId || !name) {
    return { ok: false, error: "Utilisateur ou devis manquant." };
  }
  const payload = {
    treated_by_name: name,
    treated_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from("public_quotes").update(payload).eq("id", quoteId);
  if (error) {
    logger.error("markPublicQuoteTreated:", error);
    const msg = String(error.message || "");
    if (/treated_by_name|treated_at/i.test(msg) || error.code === "PGRST204") {
      return {
        ok: false,
        error:
          "Colonne treated_by_name absente : exécutez supabase_public_quotes_add_treated_by.sql dans Supabase.",
      };
    }
    return { ok: false, error: error.message || "Impossible de marquer la demande comme traitée." };
  }
  return { ok: true };
}
