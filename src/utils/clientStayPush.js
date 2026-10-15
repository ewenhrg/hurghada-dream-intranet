import { SITE_KEY } from "../constants";
import { VAPID_PUBLIC_KEY } from "../config/vapidPublicKey";
import { supabase } from "../lib/supabase";
import { cleanPhoneNumber } from "../utils";
import { logger } from "./logger";

export function isStayPushSupported() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function isIosSafari() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const iOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return iOS && /WebKit/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
}

export function isStandaloneDisplay() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true
  );
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

export async function registerStayServiceWorker() {
  if (!("serviceWorker" in navigator)) return null;
  const reg = await navigator.serviceWorker.register("/stay-sw.js", { scope: "/" });
  await navigator.serviceWorker.ready;
  return reg;
}

export function stayPushPermissionLabel() {
  if (!isStayPushSupported()) return "unsupported";
  if (isIosSafari() && !isStandaloneDisplay()) return "ios-install";
  return Notification.permission;
}

export async function enableStayPushNotifications(phone, reservationCode) {
  const digits = cleanPhoneNumber(phone);
  const stayCode = String(reservationCode || "").trim();
  if (digits.length < 10) return { ok: false, error: "phone" };
  if (stayCode.length < 4) return { ok: false, error: "code" };
  if (!isStayPushSupported()) return { ok: false, error: "unsupported" };
  if (isIosSafari() && !isStandaloneDisplay()) return { ok: false, error: "ios-install" };
  if (!supabase) return { ok: false, error: "unavailable" };

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return { ok: false, error: "denied" };

  const reg = await registerStayServiceWorker();
  if (!reg?.pushManager) return { ok: false, error: "unsupported" };

  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
  });
  const json = sub.toJSON();
  const { error } = await supabase.rpc("register_client_stay_push", {
    p_site_key: SITE_KEY,
    p_phone: digits,
    p_endpoint: json.endpoint,
    p_p256dh: json.keys?.p256dh,
    p_auth: json.keys?.auth,
    p_reservation_code: stayCode,
  });
  if (error) {
    logger.warn("register_client_stay_push:", error);
    return { ok: false, error: error.message || "rpc" };
  }
  return { ok: true };
}

async function currentPushEndpoint() {
  if (!("serviceWorker" in navigator)) return "";
  try {
    const reg = await navigator.serviceWorker.getRegistration("/");
    const sub = await reg?.pushManager?.getSubscription();
    return String(sub?.endpoint || "");
  } catch {
    return "";
  }
}

export async function touchStayPushPresence(reservationCode) {
  if (!supabase) return;
  const endpoint = await currentPushEndpoint();
  const stayCode = String(reservationCode || "").trim();
  if (endpoint.length < 20 || stayCode.length < 4) return;
  const { error } = await supabase.rpc("touch_client_stay_push", {
    p_site_key: SITE_KEY,
    p_endpoint: endpoint,
    p_reservation_code: stayCode,
  });
  if (error) logger.warn("touch_client_stay_push:", error);
}

export async function releaseStayPushPresence() {
  if (!supabase) return;
  const endpoint = await currentPushEndpoint();
  if (endpoint.length < 20) return;
  const { error } = await supabase.rpc("release_client_stay_push", {
    p_site_key: SITE_KEY,
    p_endpoint: endpoint,
  });
  if (error) logger.warn("release_client_stay_push:", error);
}

export async function requestClientStayPush(phone) {
  if (!supabase?.functions?.invoke) return { ok: false, sent: 0 };
  const digits = cleanPhoneNumber(phone);
  if (digits.length < 10) return { ok: true, sent: 0 };
  try {
    const { data, error } = await supabase.functions.invoke("notify-stay-update", {
      body: { p_site_key: SITE_KEY, p_phone: digits },
    });
    if (error) {
      logger.warn("notify-stay-update:", error);
      return { ok: false, sent: 0 };
    }
    return { ok: true, sent: Number(data?.sent) || 0 };
  } catch (err) {
    logger.warn("notify-stay-update:", err);
    return { ok: false, sent: 0 };
  }
}
