import { useEffect, useState } from "react";
import { CalendarDays } from "lucide-react";
import { getEarliestBookableActivityDateYmd } from "../../utils/activityAvailableDates";
import {
  isValidCatalogueStay,
  savePublicCatalogueStay,
} from "../../utils/publicCatalogueStayStorage";

const fieldClass =
  "mt-1.5 w-full rounded-2xl border-2 border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-400/25";

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

  const todayYmd = (() => {
    const t = new Date();
    const y = t.getFullYear();
    const m = String(t.getMonth() + 1).padStart(2, "0");
    const d = String(t.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  })();
  const earliestActivity = getEarliestBookableActivityDateYmd();

  function handleSubmit(e) {
    e.preventDefault();
    setError("");
    const stay = {
      arrivalDate: String(arrivalDate || "").trim(),
      departureDate: String(departureDate || "").trim(),
    };
    if (!stay.arrivalDate || !stay.departureDate) {
      setError("Indiquez vos dates d’arrivée et de départ.");
      return;
    }
    if (stay.arrivalDate > stay.departureDate) {
      setError("La date de départ doit être le même jour ou après l’arrivée.");
      return;
    }
    if (!isValidCatalogueStay(stay)) {
      setError("Dates de séjour invalides.");
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
      <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-[2px]" aria-hidden />
      {allowDismiss ? (
        <button
          type="button"
          className="absolute inset-0 cursor-default"
          aria-label="Fermer"
          onClick={() => onClose?.()}
        />
      ) : null}

      <form
        onSubmit={handleSubmit}
        className="relative z-10 flex max-h-[94dvh] w-full max-w-lg flex-col rounded-t-[1.75rem] border border-violet-200/80 bg-white shadow-2xl sm:max-h-[90vh] sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-slate-200 sm:hidden" aria-hidden />
        <div className="flex items-start justify-between gap-3 px-5 pb-2 pt-4 sm:px-6 sm:pt-6">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-violet-700">
              Étape 1 · Votre séjour
            </p>
            <h2
              id="catalogue-stay-title"
              className="mt-1 flex items-center gap-2 font-catalog-display text-xl font-semibold text-catalog-ink sm:text-2xl"
            >
              <CalendarDays className="h-6 w-6 shrink-0 text-violet-600" aria-hidden />
              Dates de séjour
            </h2>
            <p className="mt-2 text-sm font-medium leading-relaxed text-slate-600">
              Pour afficher uniquement les dates possibles pendant votre voyage — et bloquer demain ainsi
              que les plongées trop proches du départ.
            </p>
          </div>
          {allowDismiss ? (
            <button
              type="button"
              onClick={() => onClose?.()}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600"
              aria-label="Fermer"
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
            <label className="block text-sm font-semibold text-catalog-ink">
              Arrivée <span className="text-orange-500">*</span>
              <input
                type="date"
                value={arrivalDate}
                min={todayYmd}
                onChange={(e) => setArrivalDate(e.target.value)}
                required
                className={fieldClass}
              />
            </label>
            <label className="block text-sm font-semibold text-catalog-ink">
              Départ <span className="text-orange-500">*</span>
              <input
                type="date"
                value={departureDate}
                min={arrivalDate || todayYmd}
                onChange={(e) => setDepartureDate(e.target.value)}
                required
                className={fieldClass}
              />
            </label>
          </div>

          <ul className="mt-4 space-y-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-medium leading-relaxed text-slate-700">
            <li>Les activités se réservent à partir du <strong>lendemain de votre arrivée</strong>.</li>
            <li>
              Pas de réservation pour <strong>aujourd’hui ni demain</strong> (premier jour possible :{" "}
              {new Date(`${earliestActivity}T12:00:00`).toLocaleDateString("fr-FR", {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
              ).
            </li>
            <li>
              <strong>Plongée</strong> : au moins <strong>2 jours</strong> avant votre date de départ
              (sécurité décompression).
            </li>
          </ul>
        </div>

        <div className="shrink-0 border-t border-slate-100 px-5 py-4 sm:px-6">
          <button
            type="submit"
            className="inline-flex w-full items-center justify-center rounded-2xl bg-gradient-to-r from-violet-800 to-orange-600 px-4 py-3.5 text-sm font-bold text-white shadow-lg shadow-violet-900/25 transition hover:from-violet-900 hover:to-orange-500"
          >
            Voir le catalogue avec mes dates
          </button>
          {!allowDismiss ? (
            <p className="mt-2 text-center text-[11px] font-medium text-slate-500">
              Obligatoire pour continuer
            </p>
          ) : null}
        </div>
      </form>
    </div>
  );
}
