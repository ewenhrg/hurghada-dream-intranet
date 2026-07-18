import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FileText,
  X,
} from "lucide-react";
import {
  MONTH_NAMES,
  WEEK_HEADERS,
  buildMonthCellsMondayFirst,
  calendarCellDateKey,
  getMonthQuoteTotal,
  toLocalDateKey,
} from "../../utils/quoteUserStats";
import {
  buildDurationByDayMap,
  formatDurationCompact,
  formatDurationMs,
  getMonthDurationTotal,
} from "../../utils/presenceSessions";

/**
 * Modale détail activité : calendrier connexion (vert/rouge) + devis + totaux du mois.
 */
export function UserActivityDetailModal({
  open,
  onClose,
  user,
  activityDays = [],
  quoteCountByDay,
  isOnline = false,
}) {
  const today = useMemo(() => new Date(), []);
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  useEffect(() => {
    if (!open) return;
    const now = new Date();
    setViewYear(now.getFullYear());
    setViewMonth(now.getMonth());
  }, [open, user?.name, user?.code]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  const durationByDay = useMemo(() => buildDurationByDayMap(activityDays), [activityDays]);
  const cells = useMemo(
    () => buildMonthCellsMondayFirst(viewYear, viewMonth),
    [viewYear, viewMonth]
  );
  const monthHoursMs = useMemo(
    () => getMonthDurationTotal(activityDays, viewYear, viewMonth),
    [activityDays, viewYear, viewMonth]
  );
  const monthQuotes = useMemo(
    () => getMonthQuoteTotal(quoteCountByDay, viewYear, viewMonth),
    [quoteCountByDay, viewYear, viewMonth]
  );
  const connectedDaysInMonth = useMemo(() => {
    const prefix = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-`;
    let n = 0;
    for (const [key, ms] of durationByDay) {
      if (key.startsWith(prefix) && ms > 0) n += 1;
    }
    return n;
  }, [durationByDay, viewYear, viewMonth]);

  const todayKey = toLocalDateKey(today);

  const goPrev = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else setViewMonth((m) => m - 1);
  };
  const goNext = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else setViewMonth((m) => m + 1);
  };
  const goToday = () => {
    const now = new Date();
    setViewYear(now.getFullYear());
    setViewMonth(now.getMonth());
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open && user ? (
        <motion.div
          className="fixed inset-0 z-[220] flex items-end justify-center p-3 sm:items-center sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          role="presentation"
        >
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/55 backdrop-blur-[6px]"
            aria-label="Fermer"
            onClick={onClose}
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="hd-user-activity-title"
            initial={{ opacity: 0, y: 28, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            className="relative z-10 flex max-h-[min(92vh,880px)] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-white/20 bg-white shadow-[0_40px_100px_-24px_rgba(15,23,42,0.55)]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="relative shrink-0 overflow-hidden border-b border-slate-100 bg-gradient-to-br from-slate-900 via-[#1e1b4b] to-cyan-950 px-5 py-5 text-white sm:px-6">
              <div
                className="pointer-events-none absolute -right-10 -top-16 h-40 w-40 rounded-full bg-emerald-400/20 blur-3xl"
                aria-hidden
              />
              <div
                className="pointer-events-none absolute -bottom-20 left-1/3 h-36 w-36 rounded-full bg-violet-500/25 blur-3xl"
                aria-hidden
              />
              <div className="relative flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3.5">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-cyan-500 text-lg font-bold shadow-lg shadow-violet-900/40">
                    {(user.name || "?").slice(0, 1).toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-200/80">
                      Activité mensuelle
                    </p>
                    <h2
                      id="hd-user-activity-title"
                      className="truncate text-xl font-bold tracking-tight sm:text-2xl"
                    >
                      {user.name || "—"}
                    </h2>
                    <p className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-white/70">
                      {user.code ? <span>Code · {user.code}</span> : null}
                      {isOnline ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-400/15 px-2 py-0.5 text-xs font-semibold text-emerald-200">
                          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-300" />
                          En ligne
                        </span>
                      ) : (
                        <span className="text-xs text-white/50">Hors ligne</span>
                      )}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/10 text-white transition hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60"
                  aria-label="Fermer la modale"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Toolbar */}
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/80 px-4 py-3 sm:px-6">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={goPrev}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:border-violet-300 hover:text-violet-700"
                  aria-label="Mois précédent"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="min-w-[10.5rem] text-center text-sm font-semibold text-slate-900">
                  {MONTH_NAMES[viewMonth]} {viewYear}
                </span>
                <button
                  type="button"
                  onClick={goNext}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:border-violet-300 hover:text-violet-700"
                  aria-label="Mois suivant"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={goToday}
                  className="ml-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-cyan-300 hover:text-cyan-800"
                >
                  Aujourd&apos;hui
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-[11px] font-medium text-slate-600">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" /> Connecté
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm bg-rose-400" /> Absent
                </span>
              </div>
            </div>

            {/* Body */}
            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="grid gap-5 p-4 sm:p-6 lg:grid-cols-[minmax(0,1fr)_220px]">
                {/* Calendar */}
                <div>
                  <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <CalendarDays className="h-3.5 w-3.5" />
                    Calendrier
                  </div>
                  <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                    {WEEK_HEADERS.map((h) => (
                      <div key={h} className="py-1">
                        {h}
                      </div>
                    ))}
                  </div>
                  <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-medium text-slate-500">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" /> Connecté = heures + devis du jour
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-sm bg-rose-400" /> Absent = pas de devis affiché
                    </span>
                  </div>
                  <div className="grid grid-cols-7 gap-1.5">
                    {cells.map((cell) => {
                      const dateKey = calendarCellDateKey(cell.date);
                      const inMonth = cell.inCurrentMonth;
                      const durationMs = inMonth ? durationByDay.get(dateKey) || 0 : 0;
                      const quotes =
                        inMonth && quoteCountByDay ? quoteCountByDay.get(dateKey) || 0 : 0;
                      const connected = durationMs > 0;
                      const isFuture = inMonth && dateKey > todayKey;
                      const isToday = dateKey === todayKey;

                      let tone =
                        "border-transparent bg-slate-50/40 text-slate-300";
                      if (inMonth && !isFuture) {
                        tone = connected
                          ? "border-emerald-200/90 bg-gradient-to-b from-emerald-50 to-emerald-100/80 text-emerald-950 shadow-sm shadow-emerald-900/5"
                          : "border-rose-200/80 bg-gradient-to-b from-rose-50 to-rose-100/70 text-rose-950";
                      } else if (inMonth && isFuture) {
                        tone = "border-slate-100 bg-slate-50/70 text-slate-400";
                      }

                      return (
                        <div
                          key={`${dateKey}-${inMonth ? "in" : "out"}`}
                          title={
                            inMonth && !isFuture
                              ? connected
                                ? `${formatDurationMs(durationMs)} · ${quotes} devis créés`
                                : "Non connecté"
                              : undefined
                          }
                          className={`flex min-h-[4.75rem] flex-col items-center justify-start gap-0.5 rounded-xl border p-1.5 transition ${tone} ${
                            isToday && inMonth ? "ring-2 ring-violet-400/70 ring-offset-1" : ""
                          }`}
                        >
                          <span
                            className={`text-xs font-bold tabular-nums ${
                              inMonth ? "" : "opacity-40"
                            }`}
                          >
                            {cell.date.getDate()}
                          </span>
                          {inMonth && !isFuture && connected ? (
                            <>
                              <span className="rounded-md bg-emerald-700/15 px-1.5 py-0.5 text-[10px] font-bold tabular-nums leading-none text-emerald-900">
                                {formatDurationCompact(durationMs)}
                              </span>
                              <span className="text-[10px] font-semibold tabular-nums text-emerald-900/85">
                                {quotes} devis
                              </span>
                            </>
                          ) : null}
                          {inMonth && !isFuture && !connected ? (
                            <span className="mt-1 text-[10px] font-medium text-rose-700/80">Absent</span>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Right stats */}
                <aside className="flex flex-col gap-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Bilan du mois
                  </p>
                  <div className="rounded-2xl border border-violet-200/70 bg-gradient-to-br from-violet-50 via-white to-cyan-50 p-4 shadow-sm">
                    <div className="mb-2 flex items-center gap-2 text-violet-800">
                      <FileText className="h-4 w-4" />
                      <span className="text-xs font-semibold uppercase tracking-wide">Devis</span>
                    </div>
                    <p className="text-3xl font-bold tabular-nums tracking-tight text-slate-900">
                      {monthQuotes}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      créés ce mois (date de création, heure Hurghada)
                    </p>
                  </div>

                  <div className="rounded-2xl border border-cyan-200/70 bg-gradient-to-br from-cyan-50 via-white to-emerald-50 p-4 shadow-sm">
                    <div className="mb-2 flex items-center gap-2 text-cyan-800">
                      <Clock3 className="h-4 w-4" />
                      <span className="text-xs font-semibold uppercase tracking-wide">Temps</span>
                    </div>
                    <p className="text-2xl font-bold tabular-nums tracking-tight text-slate-900 sm:text-3xl">
                      {formatDurationMs(monthHoursMs)}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">connecté ce mois</p>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Jours connectés
                    </p>
                    <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">
                      {connectedDaysInMonth}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      jours verts sur {MONTH_NAMES[viewMonth].toLowerCase()}
                    </p>
                  </div>
                </aside>
              </div>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body
  );
}
