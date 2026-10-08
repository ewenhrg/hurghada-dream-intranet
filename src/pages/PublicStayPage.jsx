import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Bell, CalendarDays, Clock, Hotel, LogOut, MessageCircle, Ticket, Users } from "lucide-react";
import { formatPhoneWithPlus } from "../utils";
import {
  clearStayPhone,
  fetchClientStayByPhone,
  loadSavedStayPhone,
  saveStayPhone,
} from "../utils/clientStay";
import {
  enableStayPushNotifications,
  stayPushPermissionLabel,
} from "../utils/clientStayPush";

const AGENCY_WHATSAPP = "201062002850";

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
      if (silent) {
        const prev = stayRef.current;
        if (
          prev?.found &&
          pickupFingerprint(prev.items) !== pickupFingerprint(result.items)
        ) {
          setProgramUpdated(true);
        }
      }
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
    }, 45000);
    return () => window.clearInterval(id);
  }, [phone, stay?.found, loadStay]);

  useEffect(() => {
    if (!phone || !stay?.found) return undefined;
    let cancelled = false;
    (async () => {
      const label = stayPushPermissionLabel();
      if (label !== "granted") {
        if (!cancelled) setPushState(label);
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

  return (
    <div className="hd-public-catalog relative isolate flex min-h-screen flex-col overflow-x-hidden bg-catalog-bg font-catalog-sans text-catalog-body antialiased">
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0 bg-catalog-bg" />
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0 bg-catalog-mesh opacity-[0.42]" />

      <header className="sticky top-0 z-30 border-b border-violet-500/25 bg-catalog-night/95 text-white shadow-[0_16px_48px_-12px_rgba(15,8,32,0.65)] backdrop-blur-md">
        <div className="mx-auto flex max-w-lg items-center justify-between gap-3 px-4 py-3.5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-950 via-fuchsia-900 to-orange-600 p-1.5 ring-2 ring-orange-300/50">
              <img src="/logo.png" alt="" className="relative h-full w-full object-contain" />
            </div>
            <div className="min-w-0">
              <p className="truncate font-catalog-display text-lg font-semibold tracking-tight text-white">
                Hurghada Dream
              </p>
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-violet-200/95">
                Mon séjour
              </p>
            </div>
          </div>
          {phone ? (
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-white/20 px-3 text-xs font-bold text-white/90"
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden />
              Changer
            </button>
          ) : (
            <Link
              to="/catalogue"
              className="text-xs font-bold uppercase tracking-wide text-amber-200"
            >
              Catalogue
            </Link>
          )}
        </div>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-lg flex-1 px-4 py-6 pb-28">
        {loading && !stay ? (
          <section className="rounded-3xl border border-violet-200/80 bg-white p-8 text-center shadow-catalog-premium">
            <p className="text-sm font-bold text-violet-800">Chargement de votre programme…</p>
          </section>
        ) : !phone || !stay ? (
          <section className="rounded-3xl border border-violet-200/80 bg-white p-5 shadow-catalog-premium sm:p-7">
            <h1 className="font-catalog-display text-2xl font-semibold tracking-tight text-catalog-ink">
              Votre programme
            </h1>
            <p className="mt-2 text-sm font-semibold leading-relaxed text-catalog-muted">
              Entrez le numéro WhatsApp utilisé pour vos réservations. Vous verrez vos activités et
              les heures de prise en charge.
            </p>
            <label className="mt-5 block text-xs font-bold uppercase tracking-wide text-violet-800">
              Numéro WhatsApp
              <input
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={inputPhone}
                onChange={(e) => setInputPhone(formatPhoneWithPlus(e.target.value))}
                placeholder="+20 …"
                className="mt-2 w-full rounded-2xl border-2 border-violet-200 bg-violet-50/40 px-4 py-3.5 text-base font-semibold text-catalog-ink outline-none focus:border-violet-500"
              />
            </label>
            {error ? (
              <p className="mt-3 text-sm font-semibold text-rose-700" role="alert">
                {error}
              </p>
            ) : null}
            <button
              type="button"
              onClick={() => void loadStay(inputPhone)}
              disabled={loading}
              className="mt-5 inline-flex min-h-[48px] w-full items-center justify-center rounded-2xl bg-gradient-to-r from-violet-800 to-orange-600 px-5 text-sm font-extrabold text-white shadow-md disabled:opacity-60"
            >
              {loading ? "Recherche…" : "Voir mon séjour"}
            </button>
          </section>
        ) : stay.found === false ? (
          <section className="rounded-3xl border border-violet-200/80 bg-white p-6 text-center shadow-catalog-premium">
            <p className="font-catalog-display text-xl font-semibold text-catalog-ink">
              Aucun programme trouvé
            </p>
            <p className="mt-2 text-sm font-semibold text-catalog-muted">
              Vérifiez le numéro, ou écrivez-nous sur WhatsApp.
            </p>
            <a
              href={`https://wa.me/${AGENCY_WHATSAPP}`}
              className="mt-5 inline-flex min-h-[44px] items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 text-sm font-bold text-white"
            >
              <MessageCircle className="h-4 w-4" aria-hidden />
              WhatsApp
            </a>
          </section>
        ) : (
          <>
            {programUpdated ? (
              <p className="mb-4 rounded-2xl bg-emerald-100 px-4 py-3 text-sm font-bold text-emerald-900">
                Vos heures de prise en charge ont été mises à jour.
              </p>
            ) : null}
            {pushState === "ios-install" ? (
              <p className="mb-4 rounded-2xl bg-violet-100 px-4 py-3 text-sm font-semibold text-violet-950">
                Sur iPhone : Partager → Sur l’écran d’accueil, puis ouvrez Mon séjour pour activer
                les notifications.
              </p>
            ) : null}
            {pushState === "default" || pushState === "unknown" ? (
              <button
                type="button"
                onClick={() => void handleEnablePush()}
                disabled={pushBusy}
                className="mb-4 inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl bg-violet-800 px-4 text-sm font-extrabold text-white disabled:opacity-60"
              >
                <Bell className="h-4 w-4" aria-hidden />
                {pushBusy ? "Activation…" : "Recevoir les horaires sur mon téléphone"}
              </button>
            ) : null}
            {pushState === "subscribed" ? (
              <p className="mb-4 rounded-2xl bg-white px-4 py-3 text-xs font-semibold text-catalog-muted">
                Notifications activées : vous serez prévenu si une heure change.
              </p>
            ) : null}
            <section className="rounded-3xl border border-violet-200/80 bg-white p-5 shadow-catalog-premium">
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-violet-700">
                Bonjour
              </p>
              <h1 className="mt-1 font-catalog-display text-2xl font-semibold tracking-tight text-catalog-ink">
                {clientName || "Votre séjour"}
              </h1>
              {hotel ? (
                <p className="mt-2 flex items-start gap-2 text-sm font-semibold text-catalog-body">
                  <Hotel className="mt-0.5 h-4 w-4 shrink-0 text-violet-700" aria-hidden />
                  <span>
                    {hotel}
                    {room ? ` · chambre ${room}` : ""}
                  </span>
                </p>
              ) : null}
              {(stay.client?.arrivalDate || stay.client?.departureDate) && (
                <p className="mt-1 flex items-center gap-2 text-xs font-bold text-catalog-muted">
                  <CalendarDays className="h-3.5 w-3.5" aria-hidden />
                  {formatStayDate(stay.client.arrivalDate) || "…"}
                  {stay.client.departureDate
                    ? ` → ${formatStayDate(stay.client.departureDate)}`
                    : ""}
                </p>
              )}
              {formatUpdatedAt(stay.updatedAt) ? (
                <p className="mt-2 text-[11px] font-semibold text-catalog-muted">
                  Mis à jour {formatUpdatedAt(stay.updatedAt)}
                </p>
              ) : null}
            </section>

            <div className="mt-5 space-y-5">
              {days.length === 0 ? (
                <p className="rounded-2xl bg-white p-5 text-center text-sm font-semibold text-catalog-muted">
                  Aucune activité enregistrée pour le moment.
                </p>
              ) : (
                days.map((day) => (
                  <section key={day.key}>
                    <h2
                      className={`mb-2 flex items-center gap-2 text-sm font-extrabold capitalize ${
                        day.isToday ? "text-orange-700" : "text-violet-900"
                      }`}
                    >
                      <CalendarDays className="h-4 w-4" aria-hidden />
                      {day.isToday ? "Aujourd’hui · " : ""}
                      {day.label}
                    </h2>
                    <ul className="space-y-3">
                      {day.items.map((item, idx) => {
                        const pickup = String(item.pickupTime || "").trim();
                        const ticket = String(item.ticketNumber || "").trim();
                        const rest = Math.round(Number(item.restAmount) || 0);
                        const people = participantsLabel(item);
                        return (
                          <li
                            key={`${day.key}-${idx}-${item.activityName}`}
                            className="rounded-3xl border border-violet-200/80 bg-white p-4 shadow-sm"
                          >
                            <p className="font-catalog-display text-lg font-semibold leading-snug text-catalog-ink">
                              {item.activityName}
                            </p>
                            <p
                              className={`mt-2 inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-base font-black ${
                                pickup
                                  ? "bg-violet-700 text-white"
                                  : "bg-amber-100 text-amber-900"
                              }`}
                            >
                              <Clock className="h-4 w-4" aria-hidden />
                              {pickup || "Heure à confirmer"}
                            </p>
                            {people ? (
                              <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-catalog-muted">
                                <Users className="h-3.5 w-3.5" aria-hidden />
                                {people}
                              </p>
                            ) : null}
                            {ticket ? (
                              <p className="mt-1 flex items-center gap-1.5 text-xs font-bold text-violet-800">
                                <Ticket className="h-3.5 w-3.5" aria-hidden />
                                Ticket {ticket}
                              </p>
                            ) : null}
                            {rest > 0 ? (
                              <p className="mt-2 text-xs font-extrabold text-orange-700">
                                Reste à payer : {rest} €
                              </p>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                ))
              )}
            </div>
          </>
        )}
      </main>

      <footer className="fixed inset-x-0 bottom-0 z-20 border-t border-violet-200 bg-white/95 px-4 py-3 backdrop-blur-md">
        <div className="mx-auto flex max-w-lg gap-2">
          <a
            href={`https://wa.me/${AGENCY_WHATSAPP}`}
            className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-2xl bg-emerald-600 text-sm font-bold text-white"
          >
            <MessageCircle className="h-4 w-4" aria-hidden />
            WhatsApp
          </a>
          <Link
            to="/catalogue"
            className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-2xl border-2 border-violet-200 text-sm font-bold text-violet-900"
          >
            Catalogue
          </Link>
        </div>
      </footer>
    </div>
  );
}
