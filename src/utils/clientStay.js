import { Capacitor } from "@capacitor/core";
import { SITE_KEY } from "../constants";
import { supabase } from "../lib/supabase";
import { logger } from "./logger";

const STAY_CODE_KEY = "hd_client_stay_code";

export function normalizeReservationCode(raw) {
  return String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

export function loadSavedStayCode() {
  try {
    const session = normalizeReservationCode(sessionStorage.getItem(STAY_CODE_KEY) || "");
    if (session) return session;
    if (Capacitor.isNativePlatform()) {
      return normalizeReservationCode(localStorage.getItem(STAY_CODE_KEY) || "");
    }
    return "";
  } catch {
    return "";
  }
}

export function saveStayCode(code) {
  try {
    const value = normalizeReservationCode(code);
    if (value) sessionStorage.setItem(STAY_CODE_KEY, value);
    else sessionStorage.removeItem(STAY_CODE_KEY);
    if (!Capacitor.isNativePlatform()) return;
    if (value) localStorage.setItem(STAY_CODE_KEY, value);
    else localStorage.removeItem(STAY_CODE_KEY);
  } catch {
    /* ignore */
  }
}

export function clearStayCode() {
  saveStayCode("");
}

function stayPayload(data) {
  const payload = data && typeof data === "object" ? data : {};
  const items = (Array.isArray(payload.items) ? payload.items : []).filter(
    (item) => item?.ticketKind !== "modification" && item?.isCancelled !== true
  );
  return {
    ok: payload.ok !== false,
    found: payload.found === true,
    expired: payload.expired === true,
    reservationCode: String(payload.reservationCode || ""),
    client: payload.client && typeof payload.client === "object" ? payload.client : {},
    items,
    updatedAt: String(payload.updatedAt || ""),
    error: null,
  };
}

/**
 * Programme client : toutes les activités des devis qui partagent ce n° de réservation.
 */
export async function fetchClientStayByCode(code) {
  const normalized = normalizeReservationCode(code);
  if (!/^[A-Z]{2}-\d{3,}$/.test(normalized)) {
    return { ok: false, found: false, expired: false, error: new Error("Numéro invalide") };
  }
  if (!supabase) {
    return { ok: false, found: false, expired: false, error: new Error("Connexion indisponible") };
  }
  try {
    const { data, error } = await supabase.rpc("get_client_stay_by_code", {
      p_site_key: SITE_KEY,
      p_code: normalized,
    });
    if (error) {
      logger.warn("get_client_stay_by_code:", error);
      return { ok: false, found: false, expired: false, error };
    }
    const parsed = stayPayload(data);
    if (!parsed.reservationCode) parsed.reservationCode = normalized;
    return parsed;
  } catch (err) {
    logger.warn("get_client_stay_by_code exception:", err);
    return { ok: false, found: false, expired: false, error: err };
  }
}

/**
 * Au paiement : crée ou réutilise le n° de réservation du client.
 * Format : 2 lettres du prénom, tiret, numéro unique (ex. HU-10042).
 * @returns {{ ok: boolean, code: string, error: Error|null }}
 */
export async function assignReservationCodeForQuote(quote, quoteDbId) {
  const id = Number(quoteDbId ?? quote?.supabase_id ?? quote?.id);
  if (!supabase || !Number.isFinite(id) || id <= 0) {
    return { ok: false, code: "", error: new Error("Devis introuvable") };
  }
  try {
    const { data, error } = await supabase.rpc("assign_client_reservation_code", {
      p_site_key: SITE_KEY,
      p_quote_id: id,
      p_client_name: String(quote?.client?.name || ""),
      p_phone: String(quote?.client?.phone || ""),
    });
    if (error) {
      logger.warn("assign_client_reservation_code:", error);
      return { ok: false, code: "", error };
    }
    const code = normalizeReservationCode(typeof data === "string" ? data : "");
    return { ok: Boolean(code), code, error: code ? null : new Error("Code vide") };
  } catch (err) {
    logger.warn("assign_client_reservation_code exception:", err);
    return { ok: false, code: "", error: err };
  }
}
