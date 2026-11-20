import { useEffect, useState } from "react";
import { CalendarDays } from "lucide-react";
import { getEarliestBookableActivityDateYmd } from "../../utils/activityAvailableDates";
import {
  getCatalogueTodayYmd,
  getMinDepartureDate,
  isSameDayCatalogueStay,
  isValidCatalogueStay,
  savePublicCatalogueStay,
} from "../../utils/publicCatalogueStayStorage";
import { DateInput } from "../DateInput";
import { useTranslation } from "../../hooks/useTranslation";
import { publicLocale } from "../../i18n/translations";

const fieldClass =
  "mt-1.5 w-full rounded-2xl border border-catalog-border bg-white px-4 py-3 text-sm font-semibold text-catalog-ink outline-none transition focus:border-catalog-lagoon focus:ring-4 focus:ring-catalog-lagoon/20";

/**
 * Modale obligatoire : dates d’arrivée / départ avant navigation catalogue.
 * @param {{
 *   open: boolean,
 *   initialStay?: { arrivalDate?: string, departureDate?: string },
 *   allowDismiss?: boolean,
 *   onClose?: () => void,
 *   onSaved: (stay: { arrivalDate: string, departureDate: string }) => void,
 * }} props
 */
export function CatalogueStayGateModal({
  open,
  initialStay = null,
  allowDismiss = false,
  onClose,
  onSaved,
}) {
  const { t, language } = useTranslation();
  const [arrivalDate, setArrivalDate] = useState("");
  const [departureDate, setDepartureDate] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setArrivalDate(String(initialStay?.arrivalDate || "").trim());
    setDepartureDate(String(initialStay?.departureDate || "").trim());
    setError("");
  }, [open, initialStay?.arrivalDate, initialStay?.departureDate]);

  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  const todayYmd = getCatalogueTodayYmd();
  const earliestActivity = getEarliestBookableActivityDateYmd();
  const sameDaySelected = isSameDayCatalogueStay({ arrivalDate, departureDate });
  const earliestLabel = new Date(`${earliestActivity}T12:00:00`).toLocaleDateString(publicLocale(language), {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  function handleSubmit(e) {
    e.preventDefault();
    setError("");
    const stay = {
      arrivalDate: String(arrivalDate || "").trim(),
      departureDate: String(departureDate || "").trim(),
    };
    if (!stay.arrivalDate || !stay.departureDate) {
      setError(t("public.stayGate.err.missing"));
      return;
    }
    if (stay.arrivalDate < todayYmd || stay.departureDate < todayYmd) {
      setError(t("public.stayGate.err.past"));
      return;
    }
    if (isSameDayCatalogueStay(stay)) {
      setError(t("public.stayGate.err.sameDay"));
      return;
    }
    if (stay.arrivalDate > stay.departureDate) {
      setError(t("public.stayGate.err.order"));
      return;
    }
    if (!isValidCatalogueStay(stay)) {
      setError(t("public.stayGate.err.invalid"));
      return;
    }
    const saved = savePublicCatalogueStay(stay);
    onSaved(saved);
  }

  return (
    <div
      className="fixed inset-0 z-[130] flex items-end justify-center sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="catalogue-stay-title"
    >
      <div className="absolute inset-0 bg-slate-950/75" aria-hidden />
      {allowDismiss ? (
        <button
          type="button"
          className="absolute inset-0 cursor-default"
          aria-label={t("public.common.close")}
          onClick={() => onClose?.()}
        />
      ) : null}

      <form
        onSubmit={handleSubmit}
        className="relative z-10 flex max-h-[94dvh] w-full max-w-lg flex-col rounded-t-[1.75rem] border border-catalog-border bg-white shadow-2xl sm:max-h-[90vh] sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-catalog-line sm:hidden" aria-hidden />
        <div className="flex items-start justify-between gap-3 px-5 pb-2 pt-4 sm:px-6 sm:pt-6">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-catalog-lagoon">
              {t("public.stayGate.eyebrow")}
            </p>
            <h2
              id="catalogue-stay-title"
              className="mt-1 flex items-center gap-2 font-catalog-display text-xl font-semibold text-catalog-ink sm:text-2xl"
            >
              <CalendarDays className="h-6 w-6 shrink-0 text-catalog-lagoon" aria-hidden />
              {t("public.stayGate.title")}
            </h2>
            <p className="mt-2 text-sm font-medium leading-relaxed text-catalog-muted">{t("public.stayGate.intro")}</p>
          </div>
          {allowDismiss ? (
            <button
              type="button"
              onClick={() => onClose?.()}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600"
              aria-label={t("public.common.close")}
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-3 sm:px-6">
          {error ? (
            <div className="mb-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-900">
              {error}
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="block text-sm font-semibold text-catalog-ink">
              <span className="mb-1.5 block">
                {t("public.common.arrival")} <span className="text-catalog-coral">*</span>
              </span>
              <DateInput
                value={arrivalDate}
                min={todayYmd}
                onChange={(nextArrival) => {
                  setArrivalDate(nextArrival);
                  const minDep = getMinDepartureDate(nextArrival);
                  if (departureDate && minDep && departureDate < minDep) {
                    setDepartureDate("");
                  }
                }}
                required
                className={fieldClass}
              />
            </div>
            <div className="block text-sm font-semibold text-catalog-ink">
              <span className="mb-1.5 block">
                {t("public.common.departure")} <span className="text-catalog-coral">*</span>
              </span>
              <DateInput
                value={departureDate}
                min={getMinDepartureDate(arrivalDate) || todayYmd}
                onChange={setDepartureDate}
                required
                className={fieldClass}
              />
            </div>
          </div>

          {sameDaySelected ? (
            <p className="mt-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs font-semibold leading-relaxed text-amber-900">
              {t("public.stayGate.err.sameDay")}
            </p>
          ) : null}

          <ul className="mt-4 space-y-2 rounded-2xl border border-catalog-line bg-catalog-bg px-4 py-3 text-xs font-medium leading-relaxed text-catalog-body">
            <li>{t("public.stayGate.rule.nextDayBook")}</li>
            <li>{t("public.stayGate.rule.depNextDay")}</li>
            <li>{t("public.stayGate.rule.noTodayTomorrow", { date: earliestLabel })}</li>
            <li>{t("public.stayGate.rule.diving")}</li>
          </ul>
        </div>

        <div className="shrink-0 border-t border-catalog-line px-5 py-4 sm:px-6">
          <button
            type="submit"
            disabled={sameDaySelected}
            className="hdc-btn hdc-btn-primary w-full min-h-[3.25rem] text-sm disabled:cursor-not-allowed disabled:opacity-60"
          >
            {sameDaySelected ? t("public.stayGate.ctaBlocked") : t("public.stayGate.cta")}
          </button>
          {!allowDismiss ? (
            <p className="mt-2 text-center text-[11px] font-medium text-slate-500">{t("public.stayGate.requiredHint")}</p>
          ) : null}
        </div>
      </form>
    </div>
  );
}
