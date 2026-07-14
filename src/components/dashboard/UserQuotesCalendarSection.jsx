import { memo, useMemo, useState } from "react";
import { GhostBtn } from "../ui";
import {
  MONTH_NAMES,
  WEEK_HEADERS,
  buildMonthCellsMondayFirst,
  buildQuotesCountByUserAndDay,
  collectQuoteUserNames,
  getActiveQuoteDaysCount,
  getMonthQuoteTotal,
  getTotalQuotesForUser,
  toLocalDateKey,
} from "../../utils/quoteUserStats";

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

const UserMonthCalendar = memo(function UserMonthCalendar({
  userName,
  countByDay,
  viewYear,
  viewMonth,
  lifetimeTotal = 0,
}) {
  const cells = useMemo(
    () => buildMonthCellsMondayFirst(viewYear, viewMonth),
    [viewYear, viewMonth]
  );
  const monthTotal = useMemo(
    () => getMonthQuoteTotal(countByDay, viewYear, viewMonth),
    [countByDay, viewYear, viewMonth]
  );
  const activeDays = useMemo(() => getActiveQuoteDaysCount(countByDay), [countByDay]);
  const avgPerActiveDay = activeDays > 0 ? (lifetimeTotal / activeDays).toFixed(1) : "—";

  return (
    <article className="rounded-xl border border-slate-200/90 bg-white/90 p-4 shadow-sm shadow-indigo-900/5">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500 to-indigo-600 text-sm font-bold text-white shadow-md shadow-indigo-500/25">
            {(userName || "?").slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0">
            <h3 className="truncate font-semibold text-slate-900">{userName}</h3>
            <p className="text-xs text-slate-500">
              {monthTotal} devis ce mois · {lifetimeTotal} au total
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-slate-800">
            Total : {lifetimeTotal}
          </span>
          <span className="text-[10px] tabular-nums text-slate-500">
            {avgPerActiveDay !== "—" ? `~${avgPerActiveDay} / jour actif` : "Pas encore de devis"}
          </span>
        </div>
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
          const dateKey = toLocalDateKey(cell.date);
          const count = cell.inCurrentMonth && countByDay ? countByDay.get(dateKey) || 0 : 0;
          const isToday = dateKey === toLocalDateKey(new Date());

          return (
            <div
              key={`${dateKey}-${cell.inCurrentMonth}`}
              className={`flex min-h-[2.25rem] flex-col items-center justify-center rounded-md border text-[11px] ${
                cell.inCurrentMonth
                  ? count > 0
                    ? "border-cyan-200/80 bg-cyan-50/90"
                    : "border-transparent bg-slate-50/60 text-slate-400"
                  : "border-transparent text-slate-300"
              } ${isToday && cell.inCurrentMonth ? "ring-1 ring-indigo-400/80" : ""}`}
              title={
                cell.inCurrentMonth && count > 0
                  ? `${count} devis le ${cell.date.toLocaleDateString("fr-FR")}`
                  : undefined
              }
            >
              <span className={`tabular-nums ${cell.inCurrentMonth ? "text-slate-600" : ""}`}>
                {cell.date.getDate()}
              </span>
              {cell.inCurrentMonth && count > 0 && (
                <span className="mt-0.5 rounded px-1 text-[10px] font-bold tabular-nums text-cyan-800">
                  {count}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </article>
  );
});

export const UserQuotesCalendarSection = memo(function UserQuotesCalendarSection({
  quotes = [],
  users = [],
}) {
  const today = useMemo(() => new Date(), []);
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  const userNames = useMemo(() => collectQuoteUserNames(users), [users]);
  const countsByUser = useMemo(() => buildQuotesCountByUserAndDay(quotes), [quotes]);
  const totalsByUser = useMemo(() => {
    const map = new Map();
    for (const name of userNames) {
      map.set(name, getTotalQuotesForUser(quotes, name));
    }
    return map;
  }, [userNames, quotes]);

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
  };

  const monthGrandTotal = useMemo(() => {
    let total = 0;
    for (const name of userNames) {
      total += getMonthQuoteTotal(countsByUser.get(name), viewYear, viewMonth);
    }
    return total;
  }, [userNames, countsByUser, viewYear, viewMonth]);

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white/75 shadow-md shadow-slate-900/5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100/90 bg-gradient-to-r from-slate-50/95 via-cyan-50/40 to-indigo-50/50 px-5 py-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Devis par utilisateur</h2>
          <p className="mt-0.5 text-sm text-slate-600">
            Total créé et détail par jour (date de création). Uniquement les comptes encore dans Utilisateurs.
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <MonthNavigator
            viewYear={viewYear}
            viewMonth={viewMonth}
            onPrev={goPrev}
            onNext={goNext}
            onToday={goToday}
          />
          <span className="text-xs font-medium tabular-nums text-slate-600">
            {monthGrandTotal} devis sur le mois · {quotes.length} au total
          </span>
        </div>
      </div>

      {userNames.length === 0 ? (
        <div className="p-8 text-center text-sm text-slate-500">
          Aucun utilisateur dans le répertoire. Ajoutez des comptes dans l&apos;onglet Utilisateurs.
        </div>
      ) : (
        <div className="grid gap-4 p-4 sm:grid-cols-2 md:p-5 xl:grid-cols-3">
          {userNames.map((name) => (
            <UserMonthCalendar
              key={name}
              userName={name}
              countByDay={countsByUser.get(name) || new Map()}
              viewYear={viewYear}
              viewMonth={viewMonth}
              lifetimeTotal={totalsByUser.get(name) || 0}
            />
          ))}
        </div>
      )}
    </section>
  );
});
