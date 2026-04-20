import { useEffect, useMemo, useState } from "react";

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
 * Calendrier pour choisir une date parmi les jours autorisés (available_days).
 * @param {{
 *   value: string,
 *   onChange: (iso: string) => void,
 *   normalizedDays: boolean[],
 *   disabled?: boolean,
 *   maxDaysAhead?: number,
 * }} props
 */
export function ActivityDateCalendar({ value, onChange, normalizedDays, disabled = false, maxDaysAhead = 120 }) {
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

  const days = useMemo(() => (Array.isArray(normalizedDays) && normalizedDays.length === 7 ? normalizedDays : null), [normalizedDays]);

  const cells = useMemo(() => buildMonthCells(view.y, view.m), [view.y, view.m]);

  function isSelectable(d) {
    if (disabled || !days) return false;
    const x = startOfDay(d);
    const t0 = startOfDay(new Date());
    const limit = new Date();
    limit.setHours(12, 0, 0, 0);
    limit.setDate(limit.getDate() + maxDaysAhead);
    if (x < t0 || x > limit) return false;
    return Boolean(days[x.getDay()]);
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
              <path d="m9 18 6-6-6-6" />
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
          const iso = toIsoDate(cell.date);
          const selectable = isSelectable(cell.date);
          const selected = value === iso;
          const muted = !cell.inCurrentMonth;

          return (
            <button
              key={`${iso}-${idx}`}
              type="button"
              disabled={!selectable}
              onClick={() => selectable && onChange(iso)}
              className={[
                "relative flex h-9 min-w-0 items-center justify-center rounded-lg text-sm font-medium transition sm:h-10",
                muted ? "text-gray-300" : "text-gray-900",
                selected ? "bg-emerald-600 text-white shadow-inner ring-2 ring-emerald-700" : "",
                selectable && !selected && cell.inCurrentMonth
                  ? "cursor-pointer bg-emerald-50/90 text-emerald-900 ring-1 ring-emerald-200 hover:bg-emerald-100"
                  : "",
                selectable && !selected && !cell.inCurrentMonth ? "hover:bg-emerald-50 text-emerald-800" : "",
                !selectable && cell.inCurrentMonth ? "cursor-not-allowed text-gray-300" : "",
                !selectable && !cell.inCurrentMonth ? "cursor-default" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {cell.date.getDate()}
            </button>
          );
        })}
      </div>
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
        <p className="mt-2 text-center text-xs text-gray-500">Choisis un jour en vert dans le calendrier</p>
      )}
    </div>
  );
}
