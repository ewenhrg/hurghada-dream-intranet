import { SITE_KEY } from "../constants";
import { supabase } from "../lib/supabase";
import { logger } from "./logger";
import { cleanPhoneNumber } from "../utils";

const STAY_PHONE_KEY = "hd_client_stay_phone";

export function loadSavedStayPhone() {
  try {
    return String(sessionStorage.getItem(STAY_PHONE_KEY) || "").trim();
  } catch {
    return "";
  }
}

export function saveStayPhone(phone) {
  try {
    const value = String(phone || "").trim();
    if (value) sessionStorage.setItem(STAY_PHONE_KEY, value);
    else sessionStorage.removeItem(STAY_PHONE_KEY);
  } catch {
    /* ignore */
  }
}

export function clearStayPhone() {
  saveStayPhone("");
}

/**
 * Charge le programme client (activités + pickups) pour un n° WhatsApp.
 */
export async function fetchClientStayByPhone(phone) {
  const digits = cleanPhoneNumber(phone);
  if (digits.length < 10) {
    return { ok: false, found: false, error: new Error("Numéro trop court") };
  }
  if (!supabase) {
    return { ok: false, found: false, error: new Error("Connexion indisponible") };
  }
  try {
    const { data, error } = await supabase.rpc("get_client_stay_by_phone", {
      p_site_key: SITE_KEY,
      p_phone: digits,
    });
    if (error) {
      logger.warn("get_client_stay_by_phone:", error);
      return { ok: false, found: false, error };
    }
    const payload = data && typeof data === "object" ? data : {};
    const items = Array.isArray(payload.items) ? payload.items : [];
    return {
      ok: payload.ok !== false,
      found: payload.found === true,
      client: payload.client && typeof payload.client === "object" ? payload.client : {},
      items,
      updatedAt: String(payload.updatedAt || ""),
      error: null,
    };
  } catch (err) {
    logger.warn("get_client_stay_by_phone exception:", err);
    return { ok: false, found: false, error: err };
  }
}
