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
