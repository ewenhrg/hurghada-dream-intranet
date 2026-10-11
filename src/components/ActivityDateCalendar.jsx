import { useEffect, useMemo, useState } from "react";
import {
  getCatalogueStayActivityBounds,
  getEarliestBookableActivityDateYmd,
  getPublicCatalogDayStatus,
  isPublicCatalogDateSelectable,
  toDateSet,
} from "../utils/activityAvailableDates";
import { isDivingActivityName } from "../utils/divingSafety.js";
import { isArrivalDayServiceActivity } from "../utils/activityHelpers";

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
 * Calendrier public : séjour, délai (pas demain), stop/push, plongée.
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
  stayArrivalDate = "",
  stayDepartureDate = "",
}) {
  const pinToArrival = Boolean(activity && isArrivalDayServiceActivity(activity.name));
  const earliestYmd = useMemo(() => {
    if (pinToArrival && stayArrivalDate) return String(stayArrivalDate).trim();
    return getEarliestBookableActivityDateYmd();
  }, [pinToArrival, stayArrivalDate]);
  const stayBounds = useMemo(
    () =>
      getCatalogueStayActivityBounds(stayArrivalDate, stayDepartureDate, new Date(), {
        includeArrivalDay: pinToArrival,
      }),
    [stayArrivalDate, stayDepartureDate, pinToArrival]
  );
  const isDiving = Boolean(activity && isDivingActivityName(activity.name));

  const minView = useMemo(() => {
    if (stayBounds && !stayBounds.empty) {
      const d = new Date(`${stayBounds.start}T12:00:00`);
      if (!Number.isNaN(d.getTime())) return { y: d.getFullYear(), m: d.getMonth() };
    }
    const t = new Date(`${earliestYmd}T12:00:00`);
    return { y: t.getFullYear(), m: t.getMonth() };
  }, [stayBounds, earliestYmd]);

  const maxView = useMemo(() => {
    if (stayBounds && !stayBounds.empty) {
      const d = new Date(`${stayBounds.end}T12:00:00`);
      if (!Number.isNaN(d.getTime())) return { y: d.getFullYear(), m: d.getMonth() };
    }
    const t = new Date();
    t.setDate(t.getDate() + maxDaysAhead);
    return { y: t.getFullYear(), m: t.getMonth() };
  }, [stayBounds, maxDaysAhead]);

  const [view, setView] = useState(() => ({ y: minView.y, m: minView.m }));

  const stops = useMemo(() => toDateSet(stopDateSet), [stopDateSet]);
  const pushes = useMemo(() => toDateSet(pushDateSet), [pushDateSet]);

  useEffect(() => {
    setView({ y: minView.y, m: minView.m });
  }, [minView.y, minView.m]);

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
      return { selectable: false, status: "unavailable", inWindow: false, blockReason: "" };
    }
    const iso = toIsoDate(d);
    const status = getPublicCatalogDayStatus(iso, d.getDay(), days, {
      stopDateSet: stops,
      pushDateSet: pushes,
      activity,
    });

    const windowOk =
      Boolean(stayBounds) &&
      !stayBounds.empty &&
      isPublicCatalogDateSelectable(iso, {
        stayBounds,
        earliestYmd,
        activity,
        departureDate: stayDepartureDate,
        skipEarliestCheck: pinToArrival,
      });

    let blockReason = "";
    if (!windowOk) {
      if (!pinToArrival && iso < earliestYmd) {
        blockReason = "Réservation à partir d’après-demain uniquement";
      } else if (stayBounds && (iso < stayBounds.start || iso > stayBounds.end || stayBounds.empty)) {
        blockReason = pinToArrival
          ? "Zero Tracas : uniquement le jour d’arrivée"
          : "Hors de votre séjour";
      } else if (isDiving && stayDepartureDate) {
        blockReason = "Plongée trop proche du départ (min. 2 jours)";
      } else {
        blockReason = "Date non disponible";
      }
    }

    const selectable =
      windowOk && (status === "available" || status === "push-sale");

    return {
      selectable,
      status: !windowOk && isDiving && blockReason.includes("Plongée") ? "diving-blocked" : status,
      inWindow: windowOk,
      blockReason,
      iso,
    };
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
  const stayLabel =
    stayArrivalDate && stayDepartureDate
      ? (() => {
          try {
            const a = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" }).format(
              new Date(`${stayArrivalDate}T12:00:00`)
            );
            const b = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" }).format(
              new Date(`${stayDepartureDate}T12:00:00`)
            );
            return `${a} → ${b}`;
          } catch {
            return `${stayArrivalDate} → ${stayDepartureDate}`;
          }
        })()
      : "";

  return (
    <div className="rounded-[1.4rem] bg-white p-3.5 ring-1 ring-catalog-line">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[0.6875rem] font-bold uppercase tracking-[0.18em] text-catalog-lagoon">Date</p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={goPrev}
            disabled={!canPrevMonth || disabled}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-catalog-bg text-catalog-ink transition hover:bg-catalog-mist disabled:opacity-35"
            aria-label="Mois précédent"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
          <span className="min-w-[8rem] text-center font-catalog-display text-base font-medium capitalize text-catalog-ink">{title}</span>
          <button
            type="button"
            onClick={goNext}
            disabled={!canNextMonth || disabled}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-catalog-bg text-catalog-ink transition hover:bg-catalog-mist disabled:opacity-35"
            aria-label="Mois suivant"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="m9 18 6-6 6-6" />
            </svg>
          </button>
        </div>
      </div>

      {stayLabel ? (
        <p className="mb-2 rounded-xl bg-catalog-lagoonSoft px-3 py-2 text-center text-[11px] font-semibold text-catalog-ink">
          Dates de votre séjour : {stayLabel}
          <span className="mt-0.5 block font-medium text-catalog-lagoon">
            {pinToArrival
              ? "Zero Tracas : date fixée au jour d’arrivée"
              : `Excursions à partir du lendemain d’arrivée · pas demain${
                  isDiving ? " · plongée : min. 2 jours avant le départ" : ""
                }`}
          </span>
        </p>
      ) : (
        <p className="mb-2 rounded-xl bg-catalog-brassSoft px-3 py-2 text-center text-[11px] font-semibold text-catalog-ink">
          Indiquez d’abord vos dates de séjour pour choisir une date.
        </p>
      )}

      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-bold text-catalog-muted sm:text-xs">
        {WEEK_HEADERS.map((h) => (
          <div key={h} className="py-1">
            {h}
          </div>
        ))}
        {cells.map((cell, idx) => {
          const { selectable, status, inWindow, blockReason, iso } = dayMeta(cell.date);
          const selected = value === iso;
          const muted = !cell.inCurrentMonth;

          let colorClass = "";
          if (selected) {
            colorClass = "bg-[#0B4F5C] font-bold text-white ring-2 ring-[#0B4F5C]";
          } else if (cell.inCurrentMonth && status === "stop-sale") {
            colorClass =
              "cursor-not-allowed bg-[#F8D9D2] font-bold text-[#7A2414] ring-2 ring-[#C04A32]";
          } else if (cell.inCurrentMonth && status === "diving-blocked") {
            colorClass =
              "cursor-not-allowed bg-[#F8D9D2] font-semibold text-[#7A2414] ring-2 ring-[#E7B2A4]";
          } else if (selectable && status === "push-sale") {
            colorClass =
              "cursor-pointer bg-[#FBF0DC] font-bold text-[#6B4A10] ring-2 ring-[#C4922A] hover:bg-[#F6E4C0]";
          } else if (selectable && cell.inCurrentMonth) {
            colorClass =
              "cursor-pointer bg-[#D7EFEA] font-bold text-[#0C3F3A] ring-2 ring-[#1F6B62] hover:bg-[#C5E6DF]";
          } else if (selectable && !cell.inCurrentMonth) {
            colorClass = "cursor-pointer font-semibold text-[#1F6B62] hover:bg-[#D7EFEA]";
          } else if (cell.inCurrentMonth && inWindow && status === "unavailable") {
            colorClass = "cursor-not-allowed bg-[#F8D9D2] font-semibold text-[#7A2414] ring-2 ring-[#E7B2A4]";
          } else if (cell.inCurrentMonth) {
            colorClass = "cursor-not-allowed text-catalog-subtle";
          } else {
            colorClass = "cursor-default text-catalog-subtle/70";
          }

          const titleHint = selectable
            ? status === "push-sale"
              ? "Push sale — ouverture exceptionnelle"
              : "Disponible"
            : blockReason ||
              (status === "stop-sale"
                ? "Stop sale — date indisponible"
                : status === "unavailable"
                  ? "Non disponible"
                  : "Date non disponible");

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
                "relative flex h-11 min-w-0 items-center justify-center rounded-full text-sm tabular-nums transition-colors",
                muted && !selected && status !== "stop-sale" && status !== "push-sale" && status !== "unavailable" ? "opacity-80" : "",
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
        <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 border-t border-catalog-line pt-2.5 text-[11px] font-semibold text-catalog-muted">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full bg-[#D7EFEA] ring-2 ring-[#1F6B62]" aria-hidden />
            Ouvert
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full bg-[#F8D9D2] ring-2 ring-[#C04A32]" aria-hidden />
            Stop sale
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full bg-[#FBF0DC] ring-2 ring-[#C4922A]" aria-hidden />
            Push sale
          </span>
        </div>
      ) : null}

      {value ? (
        <p className="mt-2 text-center text-xs text-catalog-muted">
          Sélection :{" "}
          <span className="font-bold capitalize text-catalog-ink">
            {new Intl.DateTimeFormat("fr-FR", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            }).format(new Date(value + "T12:00:00"))}
          </span>
        </p>
      ) : (
        <p className="mt-2 text-center text-xs text-catalog-muted">
          Choisis un jour ouvert pendant votre séjour
        </p>
      )}
    </div>
  );
}
