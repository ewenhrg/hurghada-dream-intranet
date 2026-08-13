import { useEffect, useMemo, useState } from "react";
import { getPublicCatalogDayStatus, toDateSet } from "../utils/activityAvailableDates";

const WEEK_HEADERS = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];

const MONTH_NAMES = [
  "Janvier",
  "Février",
  "Mars",
  "Avril",
  "Mai",
  "Juin",
  "Juillet",
  "Août",
  "Septembre",
  "Octobre",
  "Novembre",
  "Décembre",
];

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(12, 0, 0, 0);
  return x;
}

/** @param {Date} d */
function toIsoDate(d) {
  const x = startOfDay(d);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, "0");
  const day = String(x.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Grille mois (dimanche = première colonne, aligné sur Date.getDay()).
 * @param {number} year
 * @param {number} month 0-11
 */
function buildMonthCells(year, month) {
  const cells = [];
  const first = new Date(year, month, 1);
  const startWeekDay = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const lastPrev = new Date(year, month, 0).getDate();

  for (let i = 0; i < startWeekDay; i++) {
    const day = lastPrev - startWeekDay + 1 + i;
    cells.push({ date: new Date(year, month - 1, day), inCurrentMonth: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: new Date(year, month, d), inCurrentMonth: true });
  }
  let n = 1;
  while (cells.length % 7 !== 0) {
    cells.push({ date: new Date(year, month + 1, n), inCurrentMonth: false });
    n += 1;
  }
  return cells;
}

/**
 * Calendrier public : jours ouverts, stop sale (rouge) et push sale (vert).
 * @param {{
 *   value: string,
 *   onChange: (iso: string) => void,
 *   normalizedDays: boolean[],
 *   disabled?: boolean,
 *   maxDaysAhead?: number,
 *   stopDateSet?: Iterable<string>|Set<string>,
 *   pushDateSet?: Iterable<string>|Set<string>,
 *   activity?: object|null,
 * }} props
 */
export function ActivityDateCalendar({
  value,
  onChange,
  normalizedDays,
  disabled = false,
  maxDaysAhead = 120,
  stopDateSet,
  pushDateSet,
  activity = null,
}) {
  const minView = useMemo(() => {
    const t = new Date();
    return { y: t.getFullYear(), m: t.getMonth() };
  }, []);

  const maxView = useMemo(() => {
    const t = new Date();
    t.setDate(t.getDate() + maxDaysAhead);
    return { y: t.getFullYear(), m: t.getMonth() };
  }, [maxDaysAhead]);

  const [view, setView] = useState(() => ({ y: minView.y, m: minView.m }));

  const stops = useMemo(() => toDateSet(stopDateSet), [stopDateSet]);
  const pushes = useMemo(() => toDateSet(pushDateSet), [pushDateSet]);

  useEffect(() => {
    if (!value) return;
    const d = new Date(`${value}T12:00:00`);
    if (Number.isNaN(d.getTime())) return;
    setView((prev) => {
      const y = d.getFullYear();
      const m = d.getMonth();
      if (prev.y === y && prev.m === m) return prev;
      return { y, m };
    });
  }, [value]);

  const days = useMemo(
    () => (Array.isArray(normalizedDays) && normalizedDays.length === 7 ? normalizedDays : null),
    [normalizedDays]
  );

  const cells = useMemo(() => buildMonthCells(view.y, view.m), [view.y, view.m]);

  function dayMeta(d) {
    if (disabled || !days) {
      return { selectable: false, status: "unavailable", inRange: false };
    }
    const x = startOfDay(d);
    const t0 = startOfDay(new Date());
    const limit = new Date();
    limit.setHours(12, 0, 0, 0);
    limit.setDate(limit.getDate() + maxDaysAhead);
    const inRange = x >= t0 && x <= limit;
    const iso = toIsoDate(d);
    const status = getPublicCatalogDayStatus(iso, x.getDay(), days, {
      stopDateSet: stops,
      pushDateSet: pushes,
      activity,
    });
    const selectable = inRange && (status === "available" || status === "push-sale");
    return { selectable, status, inRange, iso };
  }

  const canPrevMonth = view.y > minView.y || (view.y === minView.y && view.m > minView.m);
  const canNextMonth = view.y < maxView.y || (view.y === maxView.y && view.m < maxView.m);

  function goPrev() {
    if (!canPrevMonth) return;
    setView((v) => {
      if (v.m === 0) return { y: v.y - 1, m: 11 };
      return { y: v.y, m: v.m - 1 };
    });
  }

  function goNext() {
    if (!canNextMonth) return;
    setView((v) => {
      if (v.m === 11) return { y: v.y + 1, m: 0 };
      return { y: v.y, m: v.m + 1 };
    });
  }

  const title = `${MONTH_NAMES[view.m]} ${view.y}`;
  const showSalesLegend = stops.size > 0 || pushes.size > 0;

  return (
    <div className="rounded-xl border border-gray-300 bg-white p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Date</p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={goPrev}
            disabled={!canPrevMonth || disabled}
            className="rounded-lg p-1.5 text-gray-700 transition hover:bg-gray-100 disabled:opacity-40"
            aria-label="Mois précédent"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
          <span className="min-w-[9rem] text-center text-sm font-semibold text-gray-900">{title}</span>
          <button
            type="button"
            onClick={goNext}
            disabled={!canNextMonth || disabled}
            className="rounded-lg p-1.5 text-gray-700 transition hover:bg-gray-100 disabled:opacity-40"
            aria-label="Mois suivant"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="m9 18 6-6 6-6" />
            </svg>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-0.5 text-center text-[11px] font-medium text-gray-500 sm:text-xs">
        {WEEK_HEADERS.map((h) => (
          <div key={h} className="py-1">
            {h}
          </div>
        ))}
        {cells.map((cell, idx) => {
          const { selectable, status, inRange, iso } = dayMeta(cell.date);
          const selected = value === iso;
          const muted = !cell.inCurrentMonth;

          let colorClass = "";
          if (selected) {
            colorClass = "bg-emerald-600 text-white shadow-inner ring-2 ring-emerald-700";
          } else if (cell.inCurrentMonth && inRange && status === "stop-sale") {
            colorClass =
              "cursor-not-allowed bg-red-500 font-bold text-white ring-1 ring-red-600 shadow-sm shadow-red-500/40";
          } else if (selectable && status === "push-sale") {
            colorClass =
              "cursor-pointer bg-emerald-500 font-bold text-white ring-1 ring-emerald-600 shadow-sm shadow-emerald-500/40 hover:bg-emerald-600";
          } else if (selectable && cell.inCurrentMonth) {
            colorClass =
              "cursor-pointer bg-emerald-50/90 text-emerald-900 ring-1 ring-emerald-200 hover:bg-emerald-100";
          } else if (selectable && !cell.inCurrentMonth) {
            colorClass = "cursor-pointer text-emerald-800 hover:bg-emerald-50";
          } else if (cell.inCurrentMonth && inRange && status === "unavailable") {
            colorClass = "cursor-not-allowed bg-red-50 text-red-400/90 ring-1 ring-red-100";
          } else if (cell.inCurrentMonth) {
            colorClass = "cursor-not-allowed text-gray-300";
          } else {
            colorClass = "cursor-default text-gray-300";
          }

          const titleHint =
            status === "stop-sale"
              ? "Stop sale — date indisponible"
              : status === "push-sale"
                ? "Push sale — ouverture exceptionnelle"
                : status === "available"
                  ? "Disponible"
                  : "Non disponible";

          return (
            <button
              key={`${iso}-${idx}`}
              type="button"
              disabled={!selectable}
              title={cell.inCurrentMonth ? titleHint : undefined}
              aria-label={
                cell.inCurrentMonth
                  ? `${cell.date.getDate()} — ${titleHint}`
                  : String(cell.date.getDate())
              }
              onClick={() => selectable && onChange(iso)}
              className={[
                "relative flex h-9 min-w-0 items-center justify-center rounded-lg text-sm font-medium transition sm:h-10",
                muted && !selected && status !== "stop-sale" && status !== "push-sale" ? "opacity-70" : "",
                colorClass,
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {cell.date.getDate()}
            </button>
          );
        })}
      </div>

      {showSalesLegend ? (
        <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 border-t border-gray-100 pt-2 text-[11px] text-gray-600">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded bg-emerald-50 ring-1 ring-emerald-200" aria-hidden />
            Ouvert
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded bg-red-500" aria-hidden />
            Stop sale
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded bg-emerald-500" aria-hidden />
            Push sale
          </span>
        </div>
      ) : null}

      {value ? (
        <p className="mt-2 text-center text-xs text-gray-600">
          Sélection :{" "}
          <span className="font-semibold text-gray-900">
            {new Intl.DateTimeFormat("fr-FR", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            }).format(new Date(value + "T12:00:00"))}
          </span>
        </p>
      ) : (
        <p className="mt-2 text-center text-xs text-gray-500">
          Choisis un jour en vert — les dates en rouge (stop sale) sont bloquées
        </p>
      )}
    </div>
  );
}
