import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
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

const MotionDiv = motion.div;

/**
 * Modale détail activité : calendrier (temps + devis) + bilan du mois.
 */
export function UserActivityDetailModal({
  open,
  onClose,
  user,
  activityDays = [],
  quoteCountByDay,
  isOnline = false,
}) {
  const reduceMotion = useReducedMotion();
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
        <MotionDiv
          className="fixed inset-0 z-[220] flex items-end justify-center p-3 sm:items-center sm:p-6"
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          role="presentation"
        >
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/50 backdrop-blur-[4px]"
            aria-label="Fermer"
            onClick={onClose}
          />

          <MotionDiv
            role="dialog"
            aria-modal="true"
            aria-labelledby="hd-user-activity-title"
            initial={reduceMotion ? false : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="relative z-10 flex max-h-[min(92vh,840px)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/20"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-100 px-5 py-4 sm:px-6">
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-base font-semibold text-white ${
                    isOnline ? "bg-emerald-600" : "bg-slate-400"
                  }`}
                  aria-hidden
                >
                  {(user.name || "?").slice(0, 1).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <h2
                    id="hd-user-activity-title"
                    className="truncate text-xl font-semibold tracking-tight text-slate-900"
                  >
                    {user.name || "—"}
                  </h2>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-slate-500">
                    {user.code ? <span>Code {user.code}</span> : null}
                    <span className={isOnline ? "text-emerald-600" : "text-slate-400"}>
                      {isOnline ? "En ligne" : "Hors ligne"}
                    </span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
                aria-label="Fermer la modale"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/80 px-4 py-3 sm:px-6">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={goPrev}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50"
                  aria-label="Mois précédent"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="min-w-[9.5rem] text-center text-sm font-semibold text-slate-900">
                  {MONTH_NAMES[viewMonth]} {viewYear}
                </span>
                <button
                  type="button"
                  onClick={goNext}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50"
                  aria-label="Mois suivant"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={goToday}
                  className="ml-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
                >
                  Aujourd’hui
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" /> Connecté
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-slate-300" /> Absent
                </span>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="grid gap-6 p-4 sm:p-6 lg:grid-cols-[minmax(0,1fr)_200px]">
                <div>
                  <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                    <CalendarDays className="h-3.5 w-3.5" aria-hidden />
                    Calendrier
                  </div>
                  <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                    {WEEK_HEADERS.map((h) => (
                      <div key={h} className="py-1">
                        {h}
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 gap-1">
                    {cells.map((cell) => {
                      const dateKey = calendarCellDateKey(cell.date);
                      const inMonth = cell.inCurrentMonth;
                      const durationMs = inMonth ? durationByDay.get(dateKey) || 0 : 0;
                      const quotes =
                        inMonth && quoteCountByDay ? quoteCountByDay.get(dateKey) || 0 : 0;
                      const connected = durationMs > 0;
                      const isFuture = inMonth && dateKey > todayKey;
                      const isToday = dateKey === todayKey;

                      let tone = "text-slate-300";
                      if (inMonth && !isFuture) {
                        tone = connected
                          ? "bg-emerald-50 text-emerald-950"
                          : "bg-slate-50 text-slate-600";
                      } else if (inMonth && isFuture) {
                        tone = "text-slate-300";
                      }

                      return (
                        <div
                          key={`${dateKey}-${inMonth ? "in" : "out"}`}
                          title={
                            inMonth && !isFuture
                              ? connected
                                ? `${formatDurationMs(durationMs)} · ${quotes} devis`
                                : quotes > 0
                                  ? `Absent · ${quotes} devis`
                                  : "Absent"
                              : undefined
                          }
                          className={`flex min-h-[3.75rem] flex-col items-center justify-start gap-0.5 rounded-lg p-1.5 ${tone} ${
                            isToday && inMonth ? "ring-2 ring-slate-900/15 ring-offset-1" : ""
                          }`}
                        >
                          <span
                            className={`text-xs font-semibold tabular-nums ${
                              inMonth ? "" : "opacity-30"
                            }`}
                          >
                            {cell.date.getDate()}
                          </span>
                          {inMonth && !isFuture && connected ? (
                            <span className="text-[10px] font-bold tabular-nums leading-none text-emerald-800">
                              {formatDurationCompact(durationMs)}
                            </span>
                          ) : null}
                          {inMonth && !isFuture && quotes > 0 ? (
                            <span
                              className={`text-[10px] font-medium tabular-nums ${
                                connected ? "text-emerald-800/80" : "text-slate-500"
                              }`}
                            >
                              {quotes}d
                            </span>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                  <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
                    Temps = connexion réelle · Devis = créés ce jour (même si hors ligne)
                  </p>
                </div>

                <aside className="flex flex-col gap-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Bilan du mois
                  </p>
                  <div className="rounded-xl border border-slate-200 bg-white p-4">
                    <div className="mb-1 flex items-center gap-2 text-slate-500">
                      <FileText className="h-3.5 w-3.5" aria-hidden />
                      <span className="text-[11px] font-semibold uppercase tracking-wide">Devis</span>
                    </div>
                    <p className="text-3xl font-semibold tabular-nums tracking-tight text-slate-900">
                      {monthQuotes}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">créés ce mois</p>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-white p-4">
                    <div className="mb-1 flex items-center gap-2 text-slate-500">
                      <Clock3 className="h-3.5 w-3.5" aria-hidden />
                      <span className="text-[11px] font-semibold uppercase tracking-wide">Temps</span>
                    </div>
                    <p className="text-2xl font-semibold tabular-nums tracking-tight text-slate-900">
                      {formatDurationMs(monthHoursMs)}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">connecté ce mois</p>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-white p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                      Jours connectés
                    </p>
                    <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">
                      {connectedDaysInMonth}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      sur {MONTH_NAMES[viewMonth].toLowerCase()}
                    </p>
                  </div>
                </aside>
              </div>
            </div>
          </MotionDiv>
        </MotionDiv>
      ) : null}
    </AnimatePresence>,
    document.body
  );
}
