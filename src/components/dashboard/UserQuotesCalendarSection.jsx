import { memo, useMemo, useState } from "react";
import { GhostBtn } from "../ui";
import { loadLS } from "../../utils";
import { LS_KEYS } from "../../constants";
import {
  MONTH_NAMES,
  WEEK_HEADERS,
  buildMonthCellsMondayFirst,
  buildQuotesCountByUserAndDay,
  collectQuoteUserNames,
  getMonthQuoteTotal,
  toLocalDateKey,
} from "../../utils/quoteUserStats";

function MonthNavigator({ viewYear, viewMonth, onPrev, onNext, onToday }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <GhostBtn type="button" variant="neutral" size="sm" className="min-h-0 py-1.5 px-2.5" onClick={onPrev}>
        ←
      </GhostBtn>
      <span className="min-w-[9rem] text-center text-sm font-semibold text-slate-900">
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

const UserMonthCalendar = memo(function UserMonthCalendar({ userName, countByDay, viewYear, viewMonth }) {
  const cells = useMemo(
    () => buildMonthCellsMondayFirst(viewYear, viewMonth),
    [viewYear, viewMonth]
  );
  const monthTotal = useMemo(
    () => getMonthQuoteTotal(countByDay, viewYear, viewMonth),
    [countByDay, viewYear, viewMonth]
  );

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-sm font-bold text-white">
            {(userName || "?").slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0">
            <h3 className="truncate font-semibold text-slate-900">{userName}</h3>
            <p className="text-xs text-slate-500">
              {monthTotal} devis ce mois
            </p>
          </div>
        </div>
        <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold tabular-nums text-indigo-800">
          Total : {monthTotal}
        </span>
      </div>

      <div className="grid grid-cols-7 gap-0.5 text-center text-[10px] font-semibold uppercase text-slate-400">
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
                    ? "border-indigo-200 bg-indigo-50/80"
                    : "border-transparent bg-slate-50/50 text-slate-400"
                  : "border-transparent text-slate-300"
              } ${isToday && cell.inCurrentMonth ? "ring-1 ring-indigo-400" : ""}`}
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
                <span className="mt-0.5 rounded px-1 text-[10px] font-bold tabular-nums text-indigo-700">
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

export const UserQuotesCalendarSection = memo(function UserQuotesCalendarSection({ quotes = [] }) {
  const today = useMemo(() => new Date(), []);
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  const users = useMemo(() => loadLS(LS_KEYS.users, []), []);
  const userNames = useMemo(() => collectQuoteUserNames(users, quotes), [users, quotes]);
  const countsByUser = useMemo(() => buildQuotesCountByUserAndDay(quotes), [quotes]);

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
    const unknown = countsByUser.get("Non renseigné");
    if (unknown && !userNames.includes("Non renseigné")) {
      total += getMonthQuoteTotal(unknown, viewYear, viewMonth);
    }
    return total;
  }, [userNames, countsByUser, viewYear, viewMonth]);

  const displayNames = useMemo(() => {
    const names = [...userNames];
    if (countsByUser.has("Non renseigné") && !names.includes("Non renseigné")) {
      names.push("Non renseigné");
    }
    return names;
  }, [userNames, countsByUser]);

  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white/95 shadow-lg shadow-slate-200/40 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 bg-gradient-to-r from-indigo-50/90 to-violet-50/80 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Devis par utilisateur</h2>
          <p className="text-sm text-slate-600">
            Nombre de devis créés par jour (date de création du devis). {quotes.length} devis au total.
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
          <span className="text-xs font-medium tabular-nums text-indigo-800">
            {monthGrandTotal} devis sur le mois affiché
          </span>
        </div>
      </div>

      {displayNames.length === 0 ? (
        <div className="p-8 text-center text-sm text-slate-500">
          Aucun utilisateur trouvé. Ajoutez des utilisateurs dans l&apos;onglet Utilisateurs ou créez des devis.
        </div>
      ) : (
        <div className="p-4 md:p-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {displayNames.map((name) => (
            <UserMonthCalendar
              key={name}
              userName={name}
              countByDay={countsByUser.get(name) || new Map()}
              viewYear={viewYear}
              viewMonth={viewMonth}
            />
          ))}
        </div>
      )}
    </section>
  );
});
