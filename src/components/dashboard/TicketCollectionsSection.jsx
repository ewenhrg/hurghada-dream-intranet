import { memo, useMemo, useState, useEffect, useRef } from "react";
import { Banknote, CreditCard, Sigma, CalendarDays } from "lucide-react";
import { GhostBtn } from "../ui";
import { currencyNoCents } from "../../utils";
import {
  MONTH_NAMES,
  WEEK_HEADERS,
  buildMonthCellsMondayFirst,
  calendarCellDateKey,
  toLocalDateKey,
} from "../../utils/quoteUserStats";
import {
  buildCollectionsByDay,
  getCollectionsForDay,
  getMonthCollectionsTotal,
} from "../../utils/ticketCollections";

function MonthNavigator({ viewYear, viewMonth, onPrev, onNext, onToday }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <GhostBtn type="button" variant="neutral" size="sm" className="min-h-0 py-1.5 px-2.5" onClick={onPrev}>
        ←
      </GhostBtn>
      <span className="min-w-[9rem] text-center text-sm font-semibold text-slate-800">
        {MONTH_NAMES[viewMonth]} {viewYear}
      </span>
      <GhostBtn type="button" variant="neutral" size="sm" className="min-h-0 py-1.5 px-2.5" onClick={onNext}>
        →
      </GhostBtn>
      <GhostBtn type="button" variant="neutral" size="sm" className="min-h-0 py-1.5 px-2.5" onClick={onToday}>
        Aujourd&apos;hui
      </GhostBtn>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, hint, tone }) {
  const tones = {
    cash: "border-emerald-200/80 bg-emerald-50/80 text-emerald-950",
    stripe: "border-indigo-200/80 bg-indigo-50/80 text-indigo-950",
    total: "border-slate-300 bg-white text-slate-950",
    mixed: "border-amber-200/80 bg-amber-50/70 text-amber-950",
  };
  const iconTone = {
    cash: "bg-emerald-600 text-white",
    stripe: "bg-indigo-600 text-white",
    total: "bg-slate-800 text-white",
    mixed: "bg-amber-600 text-white",
  };
  return (
    <div className={`rounded-xl border px-4 py-3 shadow-sm ${tones[tone] || tones.total}`}>
      <div className="flex items-start gap-3">
        <span
          className={`mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg ${iconTone[tone] || iconTone.total}`}
          aria-hidden
        >
          <Icon className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide opacity-70">{label}</p>
          <p className="mt-0.5 text-xl font-bold tabular-nums tracking-tight sm:text-2xl">{value}</p>
          {hint ? <p className="mt-0.5 text-[11px] opacity-70">{hint}</p> : null}
        </div>
      </div>
    </div>
  );
}

/**
 * Encaissements du jour (Cash / Stripe / Total) — visible Ewen & Karim uniquement (parent).
 */
export const TicketCollectionsSection = memo(function TicketCollectionsSection({ quotes = [] }) {
  const today = useMemo(() => new Date(), []);
  const todayKey = useMemo(() => toLocalDateKey(today), [today]);
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selectedDay, setSelectedDay] = useState(todayKey);
  const didAutoSelectDay = useRef(false);

  const { byDay, undatedPaidQuotes, approximateDateQuotes } = useMemo(
    () => buildCollectionsByDay(quotes),
    [quotes]
  );

  // Une fois : si aujourd’hui est à 0, ouvrir le dernier jour avec encaissement
  useEffect(() => {
    if (didAutoSelectDay.current || !byDay?.size) return;
    const todayBucket = getCollectionsForDay(byDay, todayKey);
    if (todayBucket.total > 0) {
      didAutoSelectDay.current = true;
      return;
    }
    const keys = [...byDay.keys()].sort();
    const lastKey = keys[keys.length - 1];
    if (!lastKey) return;
    didAutoSelectDay.current = true;
    setSelectedDay(lastKey);
    const [y, m] = lastKey.split("-").map(Number);
    if (Number.isFinite(y) && Number.isFinite(m)) {
      setViewYear(y);
      setViewMonth(m - 1);
    }
  }, [byDay, todayKey]);

  const cells = useMemo(
    () => buildMonthCellsMondayFirst(viewYear, viewMonth),
    [viewYear, viewMonth]
  );
  const monthTotals = useMemo(
    () => getMonthCollectionsTotal(byDay, viewYear, viewMonth),
    [byDay, viewYear, viewMonth]
  );
  const dayTotals = useMemo(
    () => getCollectionsForDay(byDay, selectedDay),
    [byDay, selectedDay]
  );

  const selectedLabel = useMemo(() => {
    if (!selectedDay) return "—";
    try {
      return new Date(`${selectedDay}T12:00:00`).toLocaleDateString("fr-FR", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      });
    } catch {
      return selectedDay;
    }
  }, [selectedDay]);

  const goPrev = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const goNext = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const goToday = () => {
    const now = new Date();
    setViewYear(now.getFullYear());
    setViewMonth(now.getMonth());
    setSelectedDay(toLocalDateKey(now));
  };

  return (
    <section aria-labelledby="hd-collections-heading" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="hd-collections-heading" className="text-sm font-semibold text-slate-900">
            Encaissements
          </h2>
          <p className="mt-0.5 max-w-xl text-xs text-slate-500">
            Devis avec n° de tickets. Cash / Stripe selon le mode au paiement (sinon cash).
            Date = Pay ; à défaut dernière mise à jour du devis.
          </p>
          {approximateDateQuotes > 0 ? (
            <p className="mt-1.5 text-xs font-medium text-amber-700">
              {approximateDateQuotes} devis avec date approximative (payés avant le suivi
              d’encaissement).
            </p>
          ) : null}
          {undatedPaidQuotes > 0 ? (
            <p className="mt-1 text-xs font-medium text-rose-700">
              {undatedPaidQuotes} devis ticketés sans aucune date utilisable.
            </p>
          ) : null}
        </div>
        <MonthNavigator
          viewYear={viewYear}
          viewMonth={viewMonth}
          onPrev={goPrev}
          onNext={goNext}
          onToday={goToday}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-slate-600">
            <CalendarDays className="size-3.5 text-slate-400" aria-hidden />
            <span>
              {MONTH_NAMES[viewMonth]} {viewYear}
              {monthTotals.total > 0 ? (
                <span className="ml-1.5 font-normal text-slate-400">
                  · mois {currencyNoCents(monthTotals.total, "EUR")} · {monthTotals.quotesCount} devis
                </span>
              ) : null}
            </span>
          </div>
          <div className="grid grid-cols-7 gap-0.5 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            {WEEK_HEADERS.map((h) => (
              <div key={h} className="py-1">
                {h}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {cells.map((cell) => {
              const dateKey = calendarCellDateKey(cell.date);
              const bucket = cell.inCurrentMonth ? getCollectionsForDay(byDay, dateKey) : null;
              const hasMoney = bucket && bucket.total > 0;
              const isSelected = dateKey === selectedDay;
              const isToday = dateKey === todayKey;

              return (
                <button
                  key={`${dateKey}-${cell.inCurrentMonth}`}
                  type="button"
                  disabled={!cell.inCurrentMonth}
                  onClick={() => cell.inCurrentMonth && setSelectedDay(dateKey)}
                  className={`flex min-h-[2.5rem] flex-col items-center justify-center rounded-md border text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/60 ${
                    !cell.inCurrentMonth
                      ? "cursor-default border-transparent text-slate-300"
                      : isSelected
                        ? "border-indigo-400 bg-indigo-50 text-indigo-950 ring-1 ring-indigo-300"
                        : hasMoney
                          ? "border-emerald-200/80 bg-emerald-50/70 text-slate-800 hover:border-emerald-300"
                          : "border-transparent bg-slate-50/60 text-slate-500 hover:bg-slate-100"
                  } ${isToday && cell.inCurrentMonth && !isSelected ? "ring-1 ring-slate-400/50" : ""}`}
                  title={
                    cell.inCurrentMonth && hasMoney
                      ? `${currencyNoCents(bucket.total, "EUR")} · ${bucket.quotesCount} devis`
                      : undefined
                  }
                >
                  <span className="tabular-nums">{cell.date.getDate()}</span>
                  {hasMoney ? (
                    <span className="mt-0.5 max-w-full truncate px-0.5 text-[9px] font-bold tabular-nums text-emerald-800">
                      {currencyNoCents(bucket.total, "EUR")}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-3">
          <div className="rounded-xl border border-slate-200/90 bg-slate-50/80 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Jour sélectionné</p>
            <p className="mt-0.5 text-sm font-semibold capitalize text-slate-900">{selectedLabel}</p>
            <p className="mt-1 text-xs text-slate-500">
              {dayTotals.quotesCount > 0
                ? `${dayTotals.quotesCount} devis payé${dayTotals.quotesCount > 1 ? "s" : ""}`
                : "Aucun devis payé ce jour"}
            </p>
          </div>

          <div className="grid gap-2.5 sm:grid-cols-1">
            <StatCard
              icon={Banknote}
              label="Cash"
              tone="cash"
              value={currencyNoCents(dayTotals.cash, "EUR")}
              hint={
                dayTotals.cashCount > 0
                  ? `${dayTotals.cashCount} devis cash seul`
                  : dayTotals.cash > 0
                    ? null
                    : "—"
              }
            />
            <StatCard
              icon={CreditCard}
              label="Stripe (carte +3 %)"
              tone="stripe"
              value={currencyNoCents(dayTotals.stripe, "EUR")}
              hint={
                dayTotals.stripeCount > 0
                  ? `${dayTotals.stripeCount} devis Stripe seul`
                  : dayTotals.stripe > 0
                    ? null
                    : "—"
              }
            />
            {dayTotals.mixed > 0 ? (
              <StatCard
                icon={Banknote}
                label="Mixte (cash + Stripe)"
                tone="mixed"
                value={currencyNoCents(dayTotals.mixed, "EUR")}
                hint={`${dayTotals.mixedCount} devis — montant base espèces`}
              />
            ) : null}
            <StatCard
              icon={Sigma}
              label="Total encaissé"
              tone="total"
              value={currencyNoCents(dayTotals.total, "EUR")}
              hint="Cash + Stripe + mixtes"
            />
          </div>
        </div>
      </div>
    </section>
  );
});
