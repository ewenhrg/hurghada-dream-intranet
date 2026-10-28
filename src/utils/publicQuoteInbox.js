import { supabase } from "../lib/supabase";
import { SITE_KEY } from "../constants";
import { logger } from "./logger";

export const PUBLIC_QUOTE_TTL_MS = 48 * 60 * 60 * 1000;
/** Rappel sonore tant qu’au moins une demande catalogue reste en attente. */
export const PUBLIC_QUOTE_ALERT_REPEAT_MS = 60 * 1000;

export function isPublicQuotePending(row) {
  return !String(row?.treated_by_name || row?.treatedByName || "").trim();
}

let sharedAudioCtx = null;
let baseDocumentTitle = "";

function getAudioContext() {
  if (typeof window === "undefined") return null;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  if (!sharedAudioCtx || sharedAudioCtx.state === "closed") {
    sharedAudioCtx = new Ctx();
  }
  return sharedAudioCtx;
}

/** Débloque l’audio après un clic (requis par Chrome / Safari). */
export async function unlockPublicQuoteAudio() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return false;
    if (ctx.state === "suspended") await ctx.resume();
    return ctx.state === "running";
  } catch (err) {
    logger.warn("Audio devis public non débloqué:", err);
    return false;
  }
}

export async function ensurePublicQuoteNotifyPermission() {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  try {
    if (Notification.permission === "granted") return "granted";
    if (Notification.permission === "denied") return "denied";
    const result = await Notification.requestPermission();
    return result;
  } catch (err) {
    logger.warn("Permission notification devis public:", err);
    return "error";
  }
}

/**
 * Alarme audible (plus forte qu’un simple bip) — à appeler à l’arrivée et chaque minute.
 */
export function playPublicQuoteChime({ urgent = false } = {}) {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === "suspended") {
      void ctx.resume().then(() => playPublicQuoteChime({ urgent }));
      return;
    }

    const now = ctx.currentTime;
    const master = ctx.createGain();
    const peak = urgent ? 0.32 : 0.24;
    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(peak, now + 0.02);
    master.gain.exponentialRampToValueAtTime(0.0001, now + (urgent ? 1.35 : 0.9));
    master.connect(ctx.destination);

    const beep = (freq, start, dur, type = "square") => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.9, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
      osc.connect(gain);
      gain.connect(master);
      osc.start(start);
      osc.stop(start + dur + 0.02);
    };

    // Motif « alerte » : 3 coups graves puis 2 aigus.
    beep(620, now, 0.14);
    beep(620, now + 0.2, 0.14);
    beep(620, now + 0.4, 0.14);
    beep(980, now + 0.62, 0.18, "sawtooth");
    beep(1240, now + 0.84, 0.28, "sawtooth");
  } catch (err) {
    logger.warn("Son devis public indisponible:", err);
  }
}

export function showPublicQuoteDesktopNotification(pendingCount = 1) {
  if (typeof window === "undefined" || !("Notification" in window)) return false;
  if (Notification.permission !== "granted") return false;
  const n = Math.max(1, Number(pendingCount) || 1);
  const title = n > 1 ? `${n} demandes de devis en attente` : "Nouvelle demande de devis";
  const body =
    n > 1
      ? "Des clients attendent une réponse sur Devis public. Ouvrez l’intranet."
      : "Un client a envoyé une demande depuis le catalogue. Ouvrez Devis public.";
  try {
    const notif = new Notification(title, {
      body,
      tag: "hd-public-quote-pending",
      renotify: true,
      requireInteraction: true,
      silent: false,
    });
    notif.onclick = () => {
      try {
        window.focus();
        window.dispatchEvent(new CustomEvent("hd-open-public-devis-tab"));
      } catch {
        /* ignore */
      }
      notif.close();
    };
    return true;
  } catch (err) {
    logger.warn("Notification devis public:", err);
    return false;
  }
}

export function pulsePublicQuoteDocumentTitle(pendingCount = 0) {
  if (typeof document === "undefined") return;
  if (!baseDocumentTitle) baseDocumentTitle = document.title || "Hurghada Dream";
  const n = Math.max(0, Number(pendingCount) || 0);
  if (n <= 0) {
    if (document.title !== baseDocumentTitle && baseDocumentTitle) {
      document.title = baseDocumentTitle;
    }
    return;
  }
  document.title = `(${n > 99 ? "99+" : n}) Demande devis — ${baseDocumentTitle}`;
}

/** Son + notification bureau (si permission). */
export function alertPublicQuotePending(pendingCount = 1, { urgent = true } = {}) {
  playPublicQuoteChime({ urgent });
  showPublicQuoteDesktopNotification(pendingCount);
  pulsePublicQuoteDocumentTitle(pendingCount);
}

/** À appeler une fois après login (premier clic) : audio + permission notif. */
export async function primePublicQuoteAlerts() {
  await unlockPublicQuoteAudio();
  await ensurePublicQuoteNotifyPermission();
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
