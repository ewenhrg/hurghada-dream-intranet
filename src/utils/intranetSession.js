import { logger } from "./logger.js";

function getSupabaseUrl() {
  if (typeof import.meta !== "undefined" && import.meta.env?.VITE_SUPABASE_URL) {
    return String(import.meta.env.VITE_SUPABASE_URL).replace(/\/$/, "");
  }
  return "";
}

function getAnonKey() {
  if (typeof import.meta !== "undefined" && import.meta.env?.VITE_SUPABASE_ANON_KEY) {
    return String(import.meta.env.VITE_SUPABASE_ANON_KEY);
  }
  return "";
}

function readJwtPayload(accessToken) {
  try {
    const part = String(accessToken || "").split(".")[1];
    if (!part) return null;
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/** Session Auth utilisable pour lire/écrire les tables staff (RLS). */
export function sessionLooksLikeIntranetAuth(session) {
  if (!session?.access_token) return false;
  const payload = readJwtPayload(session.access_token);
  if (!payload) return false;
  if (payload?.app_metadata?.intranet_ops === true) return true;
  const email = String(payload?.email || payload?.user_metadata?.email || "").trim();
  return email.length > 0;
}

async function quotesReadableWithSession(supabase) {
  if (!supabase) return false;
  try {
    const { error } = await supabase.from("quotes").select("id").limit(1);
    return !error;
  } catch (error) {
    logger.warn("Intranet session : sonde devis échouée", error);
    return false;
  }
}

/**
 * Vérifie le code PIN côté Edge Function et ouvre une session Auth
 * (ops partagée, ou compte rédacteur si intranet_auth_email).
 */
export async function openIntranetAuthSession(supabase, sixDigitCode) {
  const url = getSupabaseUrl();
  const anon = getAnonKey();
  if (!url || !anon || !supabase?.auth) {
    return { ok: false, error: "config" };
  }

  let response;
  try {
    response = await fetch(`${url}/functions/v1/intranet-session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: anon,
        Authorization: `Bearer ${anon}`,
      },
      body: JSON.stringify({ code: String(sixDigitCode || "").trim() }),
    });
  } catch (error) {
    logger.warn("Intranet session : fetch échoué", error);
    return { ok: false, error: "network" };
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    return { ok: false, error: "json" };
  }

  if (!response.ok) {
    return { ok: false, error: payload?.error || "http" };
  }
  if (payload?.locked === true) {
    return { ok: false, locked: true };
  }
  if (payload?.ok !== true || !payload?.user || !payload?.token_hash) {
    return { ok: false };
  }

  const { data, error } = await supabase.auth.verifyOtp({
    token_hash: String(payload.token_hash),
    type: "email",
  });
  if (error || !data?.session) {
    logger.warn("Intranet session : verifyOtp refusé", error);
    return { ok: false, error: "otp", user: payload.user };
  }

  return {
    ok: true,
    user: payload.user,
    session: data.session,
    sessionEmail: payload.session_email || null,
  };
}

/**
 * Avant INSERT/UPDATE devis : garantit un JWT Auth (RLS quotes exige authenticated).
 * @returns {{ ok: true } | { ok: false, reason: string, message: string }}
 */
export async function ensureIntranetAuthForQuoteWrites(supabase, sessionUser) {
  let auth = await ensureValidIntranetSession(supabase, sessionUser, { force: false });
  if (!auth.ok) {
    auth = await ensureValidIntranetSession(supabase, sessionUser, { force: true });
  }
  if (auth.ok) return { ok: true, reused: auth.reused === true };

  const reason = auth.reason || "auth_failed";
  const message =
    reason === "locked"
      ? "Trop d’essais de connexion. Réessayez dans quelques minutes, puis reconnectez-vous."
      : reason === "missing_code"
        ? "Session Auth expirée. Reconnectez-vous avec votre code à 6 chiffres pour enregistrer les devis."
        : reason === "rls_blocked"
          ? "Accès devis refusé (RLS). Reconnectez-vous pour ouvrir une session Auth."
          : "Session Auth manquante : les devis ne peuvent pas être enregistrés. Reconnectez-vous.";

  logger.warn("Écriture devis bloquée : session Auth intranet absente", reason);
  return { ok: false, reason, message };
}

/**
 * Au rechargement d’un onglet déjà « connecté » (hd_ok) : réutilise la session Auth
 * ou la rouvre avec le code stocké. Sinon Situation / Data entry restent vides (RLS).
 */
export async function ensureValidIntranetSession(supabase, sessionUser, { force = false } = {}) {
  if (!supabase?.auth) {
    return { ok: false, needLogin: true, reason: "no_client" };
  }

  if (!force) {
    try {
      const { data } = await supabase.auth.getSession();
      if (sessionLooksLikeIntranetAuth(data?.session) && (await quotesReadableWithSession(supabase))) {
        return { ok: true, reused: true, session: data.session };
      }
    } catch (error) {
      logger.warn("Intranet session : getSession échoué", error);
    }
  }

  const code = sessionUser?.code != null ? String(sessionUser.code).trim() : "";
  if (!/^\d{6}$/.test(code)) {
    return { ok: false, needLogin: true, reason: "missing_code" };
  }

  const opened = await openIntranetAuthSession(supabase, code);
  if (!opened.ok || !opened.session) {
    return {
      ok: false,
      needLogin: true,
      reason: opened.locked ? "locked" : opened.error || "auth_failed",
      locked: opened.locked === true,
    };
  }

  if (!(await quotesReadableWithSession(supabase))) {
    return { ok: false, needLogin: true, reason: "rls_blocked" };
  }

  return { ok: true, reused: false, session: opened.session, user: opened.user };
}
