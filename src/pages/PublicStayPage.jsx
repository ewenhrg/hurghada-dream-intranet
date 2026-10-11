import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Bell, BellRing, CalendarDays, Clock, Hotel, LogOut, MapPin, RefreshCw, ShieldCheck, Ticket, Users, Wallet } from "lucide-react";
import { PublicAppShell } from "../components/public/PublicAppShell";
import { HdLoader } from "../components/public/GuestPageLoader";
import { StateCard, WhatsAppGlyph } from "../components/public/PublicUI";
import { formatPhoneWithPlus } from "../utils";
import {
  clearStayPhone,
  fetchClientStayByPhone,
  loadSavedStayPhone,
  saveStayPhone,
} from "../utils/clientStay";
import {
  enableStayPushNotifications,
  isStayPushSupported,
  stayPushPermissionLabel,
} from "../utils/clientStayPush";
import {
  disarmStayWatch,
  enableStayReminders,
  stayNotifyEnabled,
  syncStayReminders,
} from "../utils/stayLocalNotifications";

const AGENCY_WHATSAPP = "201062002850";
const STAY_HERO_IMAGE = "/client/home-hero-red-sea.jpg";
const STAY_FORM_IMAGE = "/client/home-tile-stay-calendar.jpg";
const DAY_MS = 86400000;

function keyToTime(key) {
  return new Date(`${key}T12:00:00`).getTime();
}

function daysBetween(fromKey, toKey) {
  return Math.round((keyToTime(toKey) - keyToTime(fromKey)) / DAY_MS);
}

/** Avancement du séjour : avant l’arrivée (J-x), pendant (jour n / total), ou terminé. */
function stayProgress(arrivalIso, departureIso) {
  const arrival = dateKey(arrivalIso);
  const departure = dateKey(departureIso);
  if (!arrival || !departure) return null;
  const total = daysBetween(arrival, departure) + 1;
  if (total < 1) return null;
  const today = todayKey();
  if (today < arrival) return { phase: "before", left: daysBetween(today, arrival), total, ratio: 0 };
  if (today > departure) return { phase: "after", total, ratio: 1 };
  const day = daysBetween(arrival, today) + 1;
  return { phase: "during", day, total, ratio: day / total };
}

function relativeDayLabel(key) {
  if (!key || key === "sans-date") return "Date à confirmer";
  const diff = daysBetween(todayKey(), key);
  if (diff === 0) return "Aujourd’hui";
  if (diff === 1) return "Demain";
  return formatStayDate(key);
}

function dayBadge(key) {
  if (!key || key === "sans-date") return { day: "?", month: "" };
  const d = new Date(`${key}T12:00:00`);
  return {
    day: d.toLocaleDateString("fr-FR", { day: "numeric" }),
    month: d.toLocaleDateString("fr-FR", { month: "short" }).replace(".", ""),
  };
}

function formatStayDate(iso) {
  const s = String(iso || "").trim();
  if (!s) return "";
  const d = new Date(`${s.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return s;
  const weekday = d.toLocaleDateString("fr-FR", { weekday: "long" });
  const rest = d.toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
  return `${weekday}\u00a0${rest}`;
}

function dateKey(iso) {
  const s = String(iso || "").trim();
  if (!s) return "";
  return s.slice(0, 10);
}

function todayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function participantsLabel(item) {
  const adults = Math.max(0, Number(item?.adults) || 0);
  const children = Math.max(0, Number(item?.children) || 0);
  const babies = Math.max(0, Number(item?.babies) || 0);
  const parts = [];
  if (adults) parts.push(`${adults} adulte${adults > 1 ? "s" : ""}`);
  if (children) parts.push(`${children} enfant${children > 1 ? "s" : ""}`);
  if (babies) parts.push(`${babies} bébé${babies > 1 ? "s" : ""}`);
  return parts.join(" · ");
}

function groupItemsByDate(items) {
  const groups = new Map();
  for (const item of items || []) {
    const key = dateKey(item.date) || "sans-date";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  const keys = [...groups.keys()].sort((a, b) => {
    if (a === "sans-date") return 1;
    if (b === "sans-date") return -1;
    return a.localeCompare(b);
  });
  return keys.map((key) => ({
    key,
    label: key === "sans-date" ? "Date à confirmer" : formatStayDate(key),
    isToday: key === todayKey(),
    items: groups.get(key).sort((a, b) =>
      String(a.pickupTime || "").localeCompare(String(b.pickupTime || ""), "fr", { numeric: true })
    ),
  }));
}

function pickupFingerprint(items) {
  return (items || [])
    .map((it) => `${it.activityName}|${it.date}|${it.pickupTime}`)
    .join("\n");
}

function formatUpdatedAt(iso) {
  const s = String(iso || "").trim();
  if (!s) return "";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("fr-FR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function PublicStayPage() {
  const [phone, setPhone] = useState(() => loadSavedStayPhone());
  const [inputPhone, setInputPhone] = useState(() => loadSavedStayPhone());
  const [loading, setLoading] = useState(() => Boolean(loadSavedStayPhone()));
  const [stay, setStay] = useState(null);
  const [error, setError] = useState("");
  const [programUpdated, setProgramUpdated] = useState(false);
  const [pushState, setPushState] = useState("unknown");
  const [pushBusy, setPushBusy] = useState(false);
  const stayRef = useRef(stay);

  useEffect(() => {
    stayRef.current = stay;
  }, [stay]);

  const loadStay = useCallback(async (rawPhone, { silent = false } = {}) => {
    const formatted = formatPhoneWithPlus(rawPhone);
    if (formatted.replace(/\D/g, "").length < 10) {
      setError("Indiquez votre numéro WhatsApp (au moins 10 chiffres).");
      return;
    }
    if (!silent) {
      setError("");
      setLoading(true);
    }
    try {
      const result = await fetchClientStayByPhone(formatted);
      if (!result.ok) {
        if (!silent) {
          setError("Impossible de charger votre programme. Réessayez.");
          setStay(null);
        }
        return;
      }
      if (!result.found) {
        setStay({ found: false, client: {}, items: [] });
        saveStayPhone(formatted);
        setPhone(formatted);
        return;
      }
      const pickupChanged =
        silent &&
        stayRef.current?.found &&
        pickupFingerprint(stayRef.current.items) !== pickupFingerprint(result.items);
      if (pickupChanged) setProgramUpdated(true);
      void syncStayReminders(result.items, { announceChange: pickupChanged });
      saveStayPhone(formatted);
      setPhone(formatted);
      setStay(result);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const saved = loadSavedStayPhone();
    if (saved) {
      void loadStay(saved);
    }
  }, [loadStay]);

  useEffect(() => {
    if (!phone || !stay?.found) return undefined;
    const id = window.setInterval(() => {
      void loadStay(phone, { silent: true });
    }, 10000);
    return () => window.clearInterval(id);
  }, [phone, stay?.found, loadStay]);

  useEffect(() => {
    if (!phone || !stay?.found) return undefined;
    let cancelled = false;
    (async () => {
      if (Capacitor.isNativePlatform() && stayNotifyEnabled()) {
        if (!cancelled) setPushState("subscribed");
        return;
      }
      const label = stayPushPermissionLabel();
      if (label !== "granted") {
        if (!cancelled) setPushState(label === "unsupported" && Capacitor.isNativePlatform() ? "default" : label);
        return;
      }
      try {
        const result = await enableStayPushNotifications(phone);
        if (!cancelled) {
          if (result.ok) setPushState("subscribed");
          else if (result.error === "ios-install") setPushState("ios-install");
          else if (result.error === "denied") setPushState("denied");
          else setPushState("default");
        }
      } catch {
        if (!cancelled) setPushState("default");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [phone, stay?.found]);

  const days = useMemo(() => groupItemsByDate(stay?.items || []), [stay]);

  const handleLogout = () => {
    clearStayPhone();
    void disarmStayWatch();
    setPhone("");
    setInputPhone("");
    setStay(null);
    setError("");
    setProgramUpdated(false);
    setPushState("unknown");
  };

  const handleEnablePush = async () => {
    setPushBusy(true);
    try {
      if (Capacitor.isNativePlatform()) {
        const local = await enableStayReminders(stay?.items);
        if (isStayPushSupported()) void enableStayPushNotifications(phone);
        if (local.ok) {
          setPushState("subscribed");
          return;
        }
        setPushState(local.error === "denied" ? "denied" : "default");
        return;
      }
      const result = await enableStayPushNotifications(phone);
      if (result.ok) setPushState("subscribed");
      else setPushState(result.error === "ios-install" ? "ios-install" : stayPushPermissionLabel() === "denied" ? "denied" : "default");
    } finally {
      setPushBusy(false);
    }
  };

  const clientName = String(stay?.client?.name || "").trim();
  const hotel = String(stay?.client?.hotel || "").trim();
  const room = String(stay?.client?.room || "").trim();
  const progress = stayProgress(stay?.client?.arrivalDate, stay?.client?.departureDate);
  const today = todayKey();
  const nextDay = days.find((day) => day.key !== "sans-date" && day.key >= today) || null;
  const nextItem = nextDay?.items[0] || null;
  const activityCount = (stay?.items || []).length;

  return (
    <PublicAppShell
      title="Mon séjour"
      revealKey={`${loading ? "l" : "r"}-${stay ? (stay.found === false ? "none" : days.length) : "form"}`}
      right={
        phone ? (
          <button
            type="button"
            data-press
            onClick={handleLogout}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-white px-3.5 text-xs font-semibold text-catalog-ink ring-1 ring-catalog-border"
          >
            <LogOut className="h-3.5 w-3.5" aria-hidden />
            Changer
          </button>
        ) : null
      }
    >
      <main className="mx-auto w-full max-w-lg px-4 pb-14 pt-2">
        {loading && !stay ? (
          <HdLoader label="Chargement de votre programme…" className="py-28" />
        ) : !phone || !stay ? (
          <section>
            <div data-hero-media className="relative h-[19rem] overflow-hidden rounded-[1.5rem] bg-catalog-raised">
              <img data-hero-img src={STAY_FORM_IMAGE} alt="" className="absolute inset-0 h-full w-full object-cover" />
              <div aria-hidden className="absolute inset-0 bg-[linear-gradient(180deg,rgba(10,42,51,0.15)_0%,rgba(11,79,92,0.35)_45%,rgba(8,36,46,0.9)_100%)]" />
              <div className="absolute inset-x-5 bottom-14">
                <p className="flex items-center gap-2 text-[0.6875rem] font-semibold uppercase tracking-[0.22em] text-white/85">
                  <span className="h-[2px] w-5 rounded-full bg-catalog-sand" />
                  Votre programme
                </p>
                <h1 data-split className="mt-2 font-catalog-display text-[2.125rem] leading-[1.05] !text-white">
                  Votre séjour, <span className="hdc-serif text-catalog-sand">heure par heure.</span>
                </h1>
              </div>
            </div>

            <div data-reveal="item" className="hdc-card relative z-[1] mx-2 -mt-9 p-5">
              <label className="block">
                <span className="text-sm font-semibold text-catalog-ink">Votre numéro WhatsApp</span>
                <span className="relative mt-2 block">
                  <WhatsAppGlyph className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#1F8F55]" />
                  <input
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    value={inputPhone}
                    onChange={(e) => setInputPhone(formatPhoneWithPlus(e.target.value))}
                    placeholder="+20 …"
                    className="hdc-input !pl-12"
                  />
                </span>
              </label>
              <p className="mt-2 text-xs leading-relaxed text-catalog-muted">Celui utilisé pour vos réservations avec nous.</p>
              {error ? (
                <p className="mt-3 text-sm text-catalog-coralDeep" role="alert">
                  {error}
                </p>
              ) : null}
              <button
                type="button"
                data-press
                onClick={() => void loadStay(inputPhone)}
                disabled={loading}
                className="hdc-btn hdc-btn-primary mt-4 w-full"
              >
                {loading ? "Recherche…" : "Voir mon séjour"}
              </button>
            </div>

            <ul className="mt-7 space-y-3 px-1">
              {[
                { icon: Clock, title: "Heures de prise en charge", text: "Chaque sortie, jour par jour, à l’heure près." },
                { icon: BellRing, title: "Alerte en cas de changement", text: "Vous êtes prévenu si une heure bouge." },
                { icon: ShieldCheck, title: "Équipe locale 7j/7", text: "Une question ? On vous répond sur WhatsApp." },
              ].map(({ icon: Icon, title, text }) => (
                <li key={title} data-reveal="item" className="flex items-start gap-3.5">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-catalog-lagoonSoft text-catalog-lagoon">
                    <Icon className="h-[1.125rem] w-[1.125rem]" strokeWidth={1.75} aria-hidden />
                  </span>
                  <span className="min-w-0 pt-0.5">
                    <span className="block text-sm font-semibold text-catalog-ink">{title}</span>
                    <span className="block text-xs leading-relaxed text-catalog-muted">{text}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : stay.found === false ? (
          <StateCard
            title="Aucun programme trouvé"
            action={
              <a href={`https://wa.me/${AGENCY_WHATSAPP}`} data-press className="hdc-btn hdc-btn-ink">
                <WhatsAppGlyph className="h-5 w-5" />
                Écrire sur WhatsApp
              </a>
            }
          >
            Vérifiez le numéro, ou écrivez-nous : nous retrouvons votre réservation.
          </StateCard>
        ) : (
          <>
            {/* ——— Carte séjour ——— */}
            <section data-hero-media className="relative overflow-hidden rounded-[1.5rem] bg-catalog-raised text-white shadow-catalog-float">
              <img data-hero-img src={STAY_HERO_IMAGE} alt="" className="absolute inset-0 h-full w-full object-cover" />
              <div aria-hidden className="absolute inset-0 bg-[linear-gradient(165deg,rgba(11,79,92,0.55)_0%,rgba(10,59,74,0.82)_55%,rgba(8,36,46,0.95)_100%)]" />
              <div aria-hidden className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-[radial-gradient(circle,rgba(227,174,85,0.4)_0%,rgba(227,174,85,0)_70%)]" />
              <div className="relative p-5 pt-6">
                <p className="flex items-center gap-2 text-[0.6875rem] font-semibold uppercase tracking-[0.22em] text-white/80">
                  <span className="h-[2px] w-5 rounded-full bg-catalog-sand" />
                  Bon séjour
                </p>
                <h1 data-split className="mt-2 font-catalog-display text-[2.125rem] leading-[1.05] !text-white">
                  {clientName || <>Votre <span className="hdc-serif text-catalog-sand">séjour</span></>}
                </h1>
                <div className="mt-4 flex flex-wrap gap-2">
                  {hotel ? (
                    <span className="inline-flex min-h-9 max-w-full items-center gap-2 rounded-full bg-white/15 px-3 text-xs font-semibold ring-1 ring-white/25 backdrop-blur-md">
                      <Hotel className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
                      <span className="truncate">
                        {hotel}
                        {room ? ` · ch. ${room}` : ""}
                      </span>
                    </span>
                  ) : null}
                  {activityCount ? (
                    <span className="inline-flex min-h-9 items-center gap-2 rounded-full bg-white/15 px-3 text-xs font-semibold ring-1 ring-white/25 backdrop-blur-md">
                      <MapPin className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                      {activityCount} sortie{activityCount > 1 ? "s" : ""}
                    </span>
                  ) : null}
                </div>

                {(stay.client?.arrivalDate || stay.client?.departureDate) && (
                  <div className="mt-5 rounded-[1rem] bg-white/10 p-4 ring-1 ring-white/15 backdrop-blur-md">
                    <div className="flex items-end justify-between gap-3">
                      <p className="flex min-w-0 items-center gap-2 text-xs capitalize text-white/85">
                        <CalendarDays className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
                        <span className="truncate">
                          {formatStayDate(stay.client.arrivalDate) || "…"}
                          {stay.client.departureDate ? ` → ${formatStayDate(stay.client.departureDate)}` : ""}
                        </span>
                      </p>
                      {progress ? (
                        <p className="shrink-0 font-catalog-display text-[1.375rem] leading-none !text-white tabular-nums">
                          {progress.phase === "before"
                            ? `J-${progress.left}`
                            : progress.phase === "during"
                              ? `Jour ${progress.day}/${progress.total}`
                              : "Terminé"}
                        </p>
                      ) : null}
                    </div>
                    {progress ? (
                      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/20">
                        <div
                          className="h-full origin-left rounded-full bg-[linear-gradient(90deg,#E3AE55_0%,#F07A4A_100%)]"
                          style={{ transform: `scaleX(${Math.max(0.04, progress.ratio)})` }}
                        />
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            </section>

            {/* ——— Prochaine sortie ——— */}
            {nextItem ? (
              <section
                data-reveal="item"
                className="relative mt-4 overflow-hidden rounded-[1.5rem] bg-catalog-sunset p-5 text-white shadow-catalog-cta"
              >
                <div aria-hidden className="pointer-events-none absolute -bottom-16 -right-10 h-44 w-44 rounded-full bg-white/10" />
                <p className="relative text-[0.6875rem] font-semibold uppercase tracking-[0.2em] text-white/85">
                  Prochaine sortie · {relativeDayLabel(nextDay.key)}
                </p>
                <div className="relative mt-3 flex items-end gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="font-catalog-display text-[1.5rem] leading-tight !text-white">{nextItem.activityName}</p>
                    <p className="mt-1 text-xs text-white/85">Prise en charge à votre hôtel</p>
                  </div>
                  <div className="shrink-0 rounded-[1rem] bg-white px-3.5 py-2.5 text-center text-catalog-coralDeep">
                    <span className="block text-[0.625rem] font-semibold uppercase tracking-[0.12em]">Départ</span>
                    <span className="mt-0.5 block font-catalog-display text-[1.75rem] leading-none tabular-nums">
                      {String(nextItem.pickupTime || "").trim() || "—"}
                    </span>
                  </div>
                </div>
              </section>
            ) : null}

            {/* ——— Alertes ——— */}
            <div className="mt-4 space-y-3">
              {programUpdated ? (
                <p data-reveal="item" className="flex items-center gap-3 rounded-[1rem] bg-catalog-lagoonSoft px-4 py-3.5 text-sm font-medium text-catalog-lagoon">
                  <BellRing className="h-5 w-5 shrink-0" aria-hidden />
                  Vos heures de prise en charge ont été mises à jour.
                </p>
              ) : null}
              {pushState === "ios-install" ? (
                <p data-reveal="item" className="rounded-[1rem] bg-catalog-brassSoft px-4 py-3.5 text-sm text-catalog-body">
                  Sur iPhone : Partager → Sur l’écran d’accueil, puis ouvrez Mon séjour pour activer les notifications.
                </p>
              ) : null}
              {pushState === "default" || pushState === "unknown" ? (
                <button
                  type="button"
                  data-reveal="item"
                  data-press
                  onClick={() => void handleEnablePush()}
                  disabled={pushBusy}
                  className="flex min-h-[4rem] w-full items-center gap-3.5 rounded-[1rem] bg-white p-3.5 text-left shadow-catalog-card ring-1 ring-catalog-line disabled:opacity-60"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-catalog-abyss text-white">
                    <Bell className="h-5 w-5" strokeWidth={1.75} aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-catalog-ink">
                      {pushBusy ? "Activation…" : "Recevoir les horaires sur mon téléphone"}
                    </span>
                    <span className="block text-xs text-catalog-muted">Alerte si une heure de prise en charge change</span>
                  </span>
                </button>
              ) : null}
              {pushState === "subscribed" ? (
                <p data-reveal="item" className="flex items-center gap-2 px-1 text-xs text-catalog-muted">
                  <BellRing className="h-3.5 w-3.5 text-catalog-lagoon" aria-hidden />
                  Notifications activées : vous serez prévenu si une heure change.
                </p>
              ) : null}
            </div>

            {/* ——— Programme ——— */}
            <div data-reveal="item" className="mt-9 flex items-end justify-between gap-3">
              <div>
                <p className="hdc-eyebrow">Programme</p>
                <h2 className="mt-1.5 font-catalog-display text-[1.75rem] leading-tight">
                  Jour <span className="hdc-serif">par jour</span>
                </h2>
              </div>
              {formatUpdatedAt(stay.updatedAt) ? (
                <p className="flex shrink-0 items-center gap-1.5 pb-1 text-[0.6875rem] text-catalog-muted">
                  <RefreshCw className="h-3 w-3" aria-hidden />
                  {formatUpdatedAt(stay.updatedAt)}
                </p>
              ) : null}
            </div>

            <div className="mt-5">
              {days.length === 0 ? (
                <StateCard title="Aucune activité pour le moment">
                  Vos excursions réservées apparaîtront ici avec leur heure de prise en charge.
                </StateCard>
              ) : (
                days.map((day, dayIdx) => {
                  const badge = dayBadge(day.key);
                  const isPast = day.key !== "sans-date" && day.key < today;
                  const isLast = dayIdx === days.length - 1;
                  return (
                    <section key={day.key} className="relative flex gap-3.5">
                      {/* Rail chronologique */}
                      <div className="relative flex w-12 shrink-0 flex-col items-center">
                        <div
                          data-reveal="item"
                          className={`relative z-[1] flex h-12 w-12 flex-col items-center justify-center rounded-[0.875rem] leading-none ${
                            day.isToday
                              ? "bg-catalog-sunset text-white shadow-catalog-cta"
                              : isPast
                                ? "bg-catalog-bgDeep text-catalog-muted"
                                : "bg-catalog-abyss text-white shadow-catalog-card"
                          }`}
                        >
                          <span className="font-catalog-display text-[1.25rem]">{badge.day}</span>
                          <span className="mt-0.5 text-[0.5625rem] font-semibold uppercase tracking-[0.1em] opacity-85">{badge.month}</span>
                        </div>
                        {!isLast ? (
                          <span aria-hidden className="mt-1 w-[2px] flex-1 rounded-full bg-[linear-gradient(180deg,rgba(14,124,134,0.35),rgba(227,174,85,0.35))]" />
                        ) : null}
                      </div>

                      <div className={`min-w-0 flex-1 ${isLast ? "" : "pb-7"}`}>
                        <h3 data-reveal="item" className="flex min-h-12 flex-wrap items-center gap-x-2.5 font-catalog-display text-[1.25rem] capitalize leading-tight">
                          <span className={day.isToday ? "text-catalog-coral" : "text-catalog-ink"}>{day.label}</span>
                          {day.isToday ? (
                            <span className="rounded-full bg-catalog-coralSoft px-2 py-0.5 font-catalog-sans text-[0.625rem] font-bold uppercase tracking-[0.14em] text-catalog-coralDeep">
                              Aujourd’hui
                            </span>
                          ) : null}
                        </h3>
                        <ol className="mt-2 space-y-3">
                          {day.items.map((item, idx) => {
                            const pickup = String(item.pickupTime || "").trim();
                            const ticket = String(item.ticketNumber || "").trim();
                            const rest = Math.round(Number(item.restAmount) || 0);
                            const people = participantsLabel(item);
                            return (
                              <li key={`${day.key}-${idx}-${item.activityName}`} data-reveal="card" className="hdc-card overflow-hidden">
                                <div className="flex items-stretch">
                                  <div className="min-w-0 flex-1 p-4">
                                    <p className="font-catalog-display text-[1.1875rem] leading-snug text-catalog-ink">{item.activityName}</p>
                                    <div className="mt-2 flex flex-wrap gap-1.5 text-[0.6875rem] font-medium">
                                      {people ? (
                                        <span className="inline-flex items-center gap-1 rounded-full bg-catalog-mist px-2 py-1 text-catalog-body">
                                          <Users className="h-3 w-3" aria-hidden />
                                          {people}
                                        </span>
                                      ) : null}
                                      {ticket ? (
                                        <span className="inline-flex items-center gap-1 rounded-full bg-catalog-lagoonSoft px-2 py-1 text-catalog-lagoon">
                                          <Ticket className="h-3 w-3" aria-hidden />
                                          Ticket {ticket}
                                        </span>
                                      ) : null}
                                      {rest > 0 ? (
                                        <span className="inline-flex items-center gap-1 rounded-full bg-catalog-coralSoft px-2 py-1 font-semibold text-catalog-coralDeep">
                                          <Wallet className="h-3 w-3" aria-hidden />
                                          Reste {rest} €
                                        </span>
                                      ) : null}
                                    </div>
                                  </div>
                                  <div
                                    className={`flex w-[5.25rem] shrink-0 flex-col items-center justify-center px-2 text-center ${
                                      day.isToday ? "bg-catalog-sunset text-white" : "bg-catalog-lagoonSoft text-catalog-lagoon"
                                    }`}
                                  >
                                    <Clock className="h-3.5 w-3.5 opacity-80" aria-hidden />
                                    <span className={`mt-1 tabular-nums ${pickup ? "font-catalog-display text-[1.5rem] leading-none" : "text-[0.6875rem] font-semibold"}`}>
                                      {pickup || "À confirmer"}
                                    </span>
                                    <span className="mt-1 text-[0.5625rem] font-semibold uppercase tracking-[0.1em] opacity-80">Prise en charge</span>
                                  </div>
                                </div>
                              </li>
                            );
                          })}
                        </ol>
                      </div>
                    </section>
                  );
                })
              )}
            </div>

            {/* ——— Aide ——— */}
            <a
              href={`https://wa.me/${AGENCY_WHATSAPP}`}
              target="_blank"
              rel="noopener noreferrer"
              data-reveal="item"
              data-press
              className="mt-10 flex min-h-[4.5rem] items-center gap-3.5 rounded-[1.25rem] bg-white p-4 text-left shadow-catalog-card ring-1 ring-catalog-line"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#E7F6EE]">
                <WhatsAppGlyph className="h-5 w-5 text-[#1F8F55]" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-catalog-ink">Une question sur votre programme ?</span>
                <span className="block text-xs text-catalog-muted">L’équipe locale vous répond 7j/7 sur WhatsApp.</span>
              </span>
            </a>
          </>
        )}
      </main>
    </PublicAppShell>
  );
}
