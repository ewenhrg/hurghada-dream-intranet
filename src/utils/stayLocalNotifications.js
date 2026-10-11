import { App } from "@capacitor/app";
import { Capacitor, registerPlugin } from "@capacitor/core";
import { SITE_KEY } from "../constants";
import { fetchClientStayByPhone, loadSavedStayPhone } from "./clientStay";

const StayNotifications = registerPlugin("StayNotifications");

const ENABLED_KEY = "hd_stay_notify_on";
const FP_KEY = "hd_stay_notify_fp";
const CHANGE_ID = 910001;

export function stayNotifyEnabled() {
  try {
    return localStorage.getItem(ENABLED_KEY) === "1";
  } catch {
    return false;
  }
}

function fingerprint(items) {
  return (items || [])
    .map((it) => `${it.activityName}|${it.date}|${it.pickupTime}`)
    .join("\n");
}

function splitLine(line) {
  const last = line.lastIndexOf("|");
  const earlier = last < 0 ? -1 : line.lastIndexOf("|", last - 1);
  if (last < 0 || earlier < 0) return { name: line, date: "", pickup: "" };
  return {
    name: line.slice(0, earlier),
    date: line.slice(earlier + 1, last),
    pickup: line.slice(last + 1),
  };
}

function changeBody(prevFp, nextFp) {
  const prevLines = String(prevFp || "").split("\n");
  const nextLines = String(nextFp || "").split("\n");
  const n = Math.max(prevLines.length, nextLines.length);
  let changed = "";
  let count = 0;
  for (let i = 0; i < n; i += 1) {
    const before = prevLines[i] || "";
    const after = nextLines[i] || "";
    if (before === after) continue;
    count += 1;
    changed = after || before;
  }
  if (count === 1 && changed) {
    const parts = splitLine(changed);
    const time = parts.pickup || "heure à confirmer";
    const name = parts.name || "Activité";
    return `Prise en charge mise à jour : ${name} à ${time}.`;
  }
  return "Vos heures de prise en charge ont été mises à jour. Ouvrez Mon séjour.";
}

async function ensureNotifyEnabled() {
  if (!Capacitor.isNativePlatform()) return false;
  if (stayNotifyEnabled()) return true;
  try {
    const status = await StayNotifications.isGranted();
    if (status?.granted) {
      localStorage.setItem(ENABLED_KEY, "1");
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

function supabasePublicConfig() {
  const env = import.meta.env || {};
  return {
    url: String(env.VITE_SUPABASE_URL || env.REACT_APP_SUPABASE_URL || "").trim(),
    anonKey: String(env.VITE_SUPABASE_ANON_KEY || env.REACT_APP_SUPABASE_ANON_KEY || "").trim(),
  };
}

function stableId(seed) {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (Math.imul(hash, 31) + seed.charCodeAt(i)) | 0;
  }
  return 1200 + (Math.abs(hash) % 800000);
}

/** 30 min avant l'heure, ou 8h le jour de l'activité si l'heure n'est pas encore connue. */
function reminderAt(dateStr, timeStr) {
  const day = String(dateStr || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const match = String(timeStr || "").match(/(\d{1,2})\s*[:hH]\s*(\d{2})/);
  const hours = match ? Number(match[1]) : 8;
  const minutes = match ? Number(match[2]) : 0;
  if (hours > 23 || minutes > 59) return null;
  const [year, month, date] = day.split("-").map(Number);
  const at = new Date(year, month - 1, date, hours, minutes, 0, 0);
  if (match) at.setMinutes(at.getMinutes() - 30);
  if (at.getTime() <= Date.now() + 60_000) return null;
  return { at, hasTime: Boolean(match), hours, minutes };
}

function reminderBody(item, when) {
  const name = String(item.activityName || "Activité").trim();
  if (!when.hasTime) {
    return `Aujourd'hui : ${name}. L'heure de prise en charge sera confirmée.`;
  }
  const hh = String(when.hours).padStart(2, "0");
  const mm = String(when.minutes).padStart(2, "0");
  return `Dans 30 min : ${name}. Prise en charge à ${hh}:${mm}.`;
}

let launchAskStarted = false;

/** À l’ouverture : le système a déjà affiché la demande. On active les rappels dès que c’est accepté. */
export function askStayNotificationsOnLaunch() {
  if (!Capacitor.isNativePlatform() || launchAskStarted) return;
  launchAskStarted = true;
  window.setTimeout(() => {
    void (async () => {
      for (let attempt = 0; attempt < 12; attempt += 1) {
        let granted = false;
        try {
          const status = await StayNotifications.isGranted();
          granted = Boolean(status?.granted);
        } catch {
          granted = false;
        }
        if (granted) {
          localStorage.setItem(ENABLED_KEY, "1");
          const phone = loadSavedStayPhone();
          if (phone) {
            const stay = await fetchClientStayByPhone(phone);
            if (stay?.found) await syncStayReminders(stay.items, { announceChange: true });
          }
          return;
        }
        await new Promise((resolve) => window.setTimeout(resolve, 700));
      }
    })();
  }, 600);
}

export async function enableStayReminders(items) {
  if (!Capacitor.isNativePlatform()) return { ok: false, error: "unsupported" };
  const permission = await StayNotifications.requestPermission();
  if (!permission?.granted) return { ok: false, error: "denied" };
  localStorage.setItem(ENABLED_KEY, "1");
  await syncStayReminders(items);
  return { ok: true };
}

export async function syncStayReminders(items, { announceChange = false } = {}) {
  if (!Capacitor.isNativePlatform()) return;
  if (!(await ensureNotifyEnabled())) return;
  const nextFp = fingerprint(items);
  const prevFp = localStorage.getItem(FP_KEY);
  if (announceChange && prevFp && prevFp !== nextFp) {
    await notifyStayChanged(changeBody(prevFp, nextFp));
  }
  if (prevFp === nextFp) return;

  const notifications = [];
  const seen = new Set();
  for (const item of items || []) {
    const when = reminderAt(item.date, item.pickupTime);
    if (!when) continue;
    const seed = `${item.date}|${item.pickupTime}|${item.activityName}`;
    let id = stableId(seed);
    while (seen.has(id) || id === CHANGE_ID) id += 1;
    seen.add(id);
    notifications.push({
      id,
      title: "Hurghada Dream",
      body: reminderBody(item, when),
      atMs: when.at.getTime(),
    });
  }
  await StayNotifications.sync({ notifications });
  localStorage.setItem(FP_KEY, nextFp);
}

export async function notifyStayChanged(body) {
  if (!Capacitor.isNativePlatform()) return;
  if (!(await ensureNotifyEnabled())) return;
  await StayNotifications.showNow({
    title: "Hurghada Dream",
    body: body || "Vos heures de prise en charge ont été mises à jour. Ouvrez Mon séjour.",
  });
}

let watchStarted = false;
let watchBusy = false;

async function armNativeWatch(phone) {
  const { url, anonKey } = supabasePublicConfig();
  if (!url || !anonKey) return;
  await StayNotifications.armWatch({
    phone,
    siteKey: SITE_KEY,
    supabaseUrl: url,
    anonKey,
  });
}

/** Surveille le programme sur toutes les pages, et aussi quand l'appli est en arrière-plan. */
export function startStayChangeWatch() {
  if (!Capacitor.isNativePlatform() || watchStarted) return;
  watchStarted = true;
  const tick = () => {
    void refreshStayWatch();
  };
  tick();
  window.setInterval(tick, 10_000);
  App.addListener("appStateChange", ({ isActive }) => {
    if (isActive) tick();
  }).catch(() => {});
}

export async function refreshStayWatch() {
  if (!Capacitor.isNativePlatform() || watchBusy) return;
  watchBusy = true;
  try {
    if (!(await ensureNotifyEnabled())) return;
    const phone = loadSavedStayPhone();
    if (!phone) {
      await StayNotifications.disarmWatch().catch(() => {});
      return;
    }
    await armNativeWatch(phone);
    const stay = await fetchClientStayByPhone(phone);
    if (stay?.found) await syncStayReminders(stay.items, { announceChange: true });
  } catch {
    /* le prochain cycle réessaiera */
  } finally {
    watchBusy = false;
  }
}

export async function disarmStayWatch() {
  if (!Capacitor.isNativePlatform()) return;
  try {
    localStorage.removeItem(FP_KEY);
    await StayNotifications.disarmWatch();
  } catch {
    /* ignore */
  }
}

export function listenStayNotificationOpens(navigate) {
  if (!Capacitor.isNativePlatform()) return () => {};
  let cancelled = false;
  StayNotifications.consumeOpen()
    .then((result) => {
      if (!cancelled && result?.open) navigate("/sejour");
    })
    .catch(() => {});
  return () => {
    cancelled = true;
  };
}
