import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { publicBackPath } from "../../config/clientApp";
import { ArrowLeft, ArrowRight, CalendarDays, Info, X } from "lucide-react";
import { Sheet, SheetFooter } from "./PublicUI";
import { getEarliestBookableActivityDateYmd } from "../../utils/activityAvailableDates";
import {
  CATALOGUE_STAY_SAME_DAY_MESSAGE,
  getMinDepartureDate,
  isSameDayCatalogueStay,
  isValidCatalogueStay,
  savePublicCatalogueStay,
} from "../../utils/publicCatalogueStayStorage";

const fieldClass = "hdc-input mt-1.5";

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
  const { pathname } = useLocation();
  const backTo = publicBackPath(pathname);

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
  const sameDaySelected = isSameDayCatalogueStay({ arrivalDate, departureDate });

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
    if (isSameDayCatalogueStay(stay)) {
      setError(CATALOGUE_STAY_SAME_DAY_MESSAGE);
      return;
    }
    if (stay.arrivalDate > stay.departureDate) {
      setError("La date de départ doit être après la date d’arrivée.");
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
    <Sheet
      zClass="z-[130]"
      onClose={() => {
        if (allowDismiss) onClose?.();
      }}
      closeLabel={allowDismiss ? "Fermer" : "Dates obligatoires"}
      as="form"
      panelProps={{ onSubmit: handleSubmit }}
      labelledBy="catalogue-stay-title"
    >
      <div className="flex shrink-0 items-start justify-between gap-3 px-5 pb-3 pt-4 sm:px-6 sm:pt-6">
        <div className="min-w-0">
          <p className="hdc-eyebrow">Étape 1 · Votre séjour</p>
          <h2
            id="catalogue-stay-title"
            className="mt-1.5 flex items-center gap-2.5 font-catalog-display text-[1.625rem] font-medium leading-tight text-catalog-ink"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-catalog-raised text-catalog-sand">
              <CalendarDays className="h-5 w-5" aria-hidden />
            </span>
            Vos dates de séjour
          </h2>
          <p className="mt-2.5 text-sm leading-relaxed text-catalog-muted">
            Nous n’affichons que les dates possibles pendant votre voyage — et bloquons demain ainsi que les
            plongées trop proches du départ.
          </p>
        </div>
        {allowDismiss ? (
          <button
            type="button"
            data-press="0.9"
            onClick={() => onClose?.()}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-catalog-bg text-catalog-ink"
            aria-label="Fermer"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4 sm:px-6">
        {error ? (
          <div className="mb-3 rounded-2xl bg-catalog-coralSoft px-4 py-3 text-sm font-semibold text-catalog-coralDeep" role="alert">
            {error}
          </div>
        ) : null}

        <div data-sheet-item className="grid grid-cols-2 gap-3">
          <label className="block text-sm font-bold text-catalog-ink">
            Arrivée <span className="text-catalog-coral">*</span>
            <input
              type="date"
              value={arrivalDate}
              min={todayYmd}
              onChange={(e) => {
                const nextArrival = e.target.value;
                setArrivalDate(nextArrival);
                const minDep = getMinDepartureDate(nextArrival);
                if (departureDate && minDep && departureDate < minDep) {
                  setDepartureDate("");
                }
              }}
              required
              className={fieldClass}
            />
          </label>
          <label className="block text-sm font-bold text-catalog-ink">
            Départ <span className="text-catalog-coral">*</span>
            <input
              type="date"
              value={departureDate}
              min={getMinDepartureDate(arrivalDate) || todayYmd}
              onChange={(e) => setDepartureDate(e.target.value)}
              required
              className={fieldClass}
            />
          </label>
        </div>

        {sameDaySelected ? (
          <p className="mt-3 rounded-2xl bg-catalog-brassSoft px-4 py-3 text-xs font-semibold leading-relaxed text-catalog-ink">
            {CATALOGUE_STAY_SAME_DAY_MESSAGE}
          </p>
        ) : null}

        <ul data-sheet-item className="mt-4 space-y-2.5 rounded-[1.25rem] bg-catalog-bg px-4 py-4 text-xs leading-relaxed text-catalog-body ring-1 ring-catalog-line">
          {[
            <>Les activités se réservent à partir du <strong>lendemain de votre arrivée</strong>.</>,
            <>Le départ doit être <strong>au moins le lendemain</strong> de l’arrivée.</>,
            <>
              Pas de réservation pour <strong>aujourd’hui ni demain</strong> (premier jour possible :{" "}
              {new Date(`${earliestActivity}T12:00:00`).toLocaleDateString("fr-FR", {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
              ).
            </>,
            <>
              <strong>Plongée</strong> : au moins <strong>2 jours</strong> avant votre date de départ (sécurité
              décompression).
            </>,
          ].map((rule, i) => (
            <li key={i} className="flex gap-2.5">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-catalog-lagoon" aria-hidden />
              <span>{rule}</span>
            </li>
          ))}
        </ul>
      </div>

      <SheetFooter>
        <button
          type="submit"
          data-press
          disabled={sameDaySelected}
          className="hdc-btn hdc-btn-primary w-full min-h-[3.25rem] text-base"
        >
          {sameDaySelected ? "Indiquez votre vraie date de départ" : "Voir le catalogue avec mes dates"}
          {!sameDaySelected ? <ArrowRight className="h-4 w-4" aria-hidden /> : null}
        </button>
        {!allowDismiss ? (
          <div className="mt-2 flex items-center justify-between gap-3">
            {backTo ? (
              <Link to={backTo} data-press className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-bold text-catalog-ink">
                <ArrowLeft className="h-4 w-4" aria-hidden />
                Retour
              </Link>
            ) : null}
            <p className="text-[11px] font-semibold text-catalog-muted">Obligatoire pour continuer</p>
          </div>
        ) : null}
      </SheetFooter>
    </Sheet>
  );
}
