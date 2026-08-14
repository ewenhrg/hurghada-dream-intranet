import { useEffect, useState } from "react";
import { BedDouble, X } from "lucide-react";
import { TextInput, PrimaryBtn, GhostBtn } from "../ui";
import { DateInput } from "../DateInput";
import { toast } from "../../utils/toast.js";
import { pickSecondHotelFields } from "../../utils/clientSecondHotel.js";

/**
 * Petite fiche « Double hôtel » : dates du 2e séjour + quartier (+ hôtel/chambre).
 */
export function DoubleHotelModal({
  open,
  initial,
  neighborhoodsOptions = [],
  stayArrivalDate = "",
  stayDepartureDate = "",
  hotels = [],
  onClose,
  onSave,
}) {
  const [secondHotel, setSecondHotel] = useState("");
  const [secondRoom, setSecondRoom] = useState("");
  const [secondNeighborhood, setSecondNeighborhood] = useState("");
  const [secondArrivalDate, setSecondArrivalDate] = useState("");
  const [secondDepartureDate, setSecondDepartureDate] = useState("");

  useEffect(() => {
    if (!open) return;
    const s = pickSecondHotelFields(initial || {});
    setSecondHotel(s.secondHotel);
    setSecondRoom(s.secondRoom);
    setSecondNeighborhood(s.secondNeighborhood);
    setSecondArrivalDate(s.secondArrivalDate);
    setSecondDepartureDate(s.secondDepartureDate);
  }, [open, initial]);

  useEffect(() => {
    if (!open) return undefined;
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

  if (!open) return null;

  const detectNeighborhood = (hotelName) => {
    const name = String(hotelName || "").trim().toLowerCase();
    if (name.length < 3 || !Array.isArray(hotels) || hotels.length === 0) return;
    const found = hotels.find((h) => String(h.name || "").toLowerCase().trim() === name);
    if (found?.neighborhood_key) {
      setSecondNeighborhood(found.neighborhood_key);
    }
  };

  const handleSave = () => {
    if (!secondArrivalDate || !secondDepartureDate) {
      toast.warning("Indiquez les dates du 2e hôtel (du → au).");
      return;
    }
    if (secondDepartureDate < secondArrivalDate) {
      toast.warning("La date de fin doit être après (ou égale à) la date de début.");
      return;
    }
    if (stayArrivalDate && secondArrivalDate < stayArrivalDate) {
      toast.warning("Le 2e hôtel ne peut pas commencer avant l’arrivée du séjour.");
      return;
    }
    if (stayDepartureDate && secondDepartureDate > stayDepartureDate) {
      toast.warning("Le 2e hôtel ne peut pas dépasser le départ du séjour.");
      return;
    }
    if (!secondNeighborhood) {
      toast.warning("Sélectionnez le quartier du 2e hôtel.");
      return;
    }

    onSave?.({
      hasSecondHotel: true,
      secondHotel: String(secondHotel || "").trim(),
      secondRoom: String(secondRoom || "").trim(),
      secondNeighborhood,
      secondArrivalDate,
      secondDepartureDate,
    });
    onClose?.();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-3 backdrop-blur-[2px] md:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="double-hotel-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div className="max-h-[95vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-indigo-100/80 bg-white shadow-[0_24px_60px_-28px_rgba(79,70,229,0.55)]">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-slate-200/80 bg-white/95 px-4 py-3.5 backdrop-blur-md md:px-5">
          <div className="min-w-0">
            <p className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-indigo-600">
              <BedDouble className="size-3.5" aria-hidden />
              Double hôtel
            </p>
            <h3 id="double-hotel-title" className="mt-0.5 text-base font-semibold text-slate-900 md:text-lg">
              2e établissement
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Un seul devis : indiquez où le client dort sur une partie du séjour (quartier + dates).
            </p>
          </div>
          <button
            type="button"
            onClick={() => onClose?.()}
            aria-label="Fermer"
            className="grid size-10 shrink-0 place-items-center rounded-xl text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/50"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>

        <div className="space-y-4 px-4 py-4 md:px-5">
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-slate-600">Nom du 2e hôtel</span>
            <TextInput
              value={secondHotel}
              onChange={(e) => setSecondHotel(e.target.value)}
              onBlur={(e) => detectNeighborhood(e.target.value)}
              placeholder="Ex. Steigenberger Aldau"
              className="!py-2.5"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-slate-600">Chambre (optionnel)</span>
            <TextInput
              value={secondRoom}
              onChange={(e) => setSecondRoom(e.target.value)}
              placeholder="Ex. 312"
              className="!py-2.5"
            />
          </label>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-slate-600">Du *</span>
              <DateInput value={secondArrivalDate} onChange={setSecondArrivalDate} />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-slate-600">Au *</span>
              <DateInput value={secondDepartureDate} onChange={setSecondDepartureDate} />
            </label>
          </div>

          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-slate-600">Quartier du 2e hôtel *</span>
            <select
              value={secondNeighborhood}
              onChange={(e) => setSecondNeighborhood(e.target.value)}
              className="w-full rounded-xl border border-[rgba(148,163,184,0.35)] bg-[var(--hd-surface-input)] px-4 py-2.5 text-base text-slate-800 outline-none transition-all focus:border-[rgba(79,70,229,0.7)] focus:ring-2 focus:ring-[rgba(79,70,229,0.3)]"
            >
              <option value="">— Sélectionner un quartier —</option>
              {neighborhoodsOptions.map((n) => (
                <option key={n.key} value={n.key}>
                  {n.label}
                </option>
              ))}
            </select>
          </label>

          <p className="rounded-xl border border-sky-200/80 bg-sky-50 px-3 py-2 text-xs text-sky-900">
            Les activités dont la date tombe dans cette plage utiliseront automatiquement ce quartier
            (créneaux / suppléments transfert) — plus besoin d’un second devis.
          </p>
        </div>

        <div className="sticky bottom-0 flex flex-wrap items-center justify-end gap-2 border-t border-slate-200/80 bg-white/95 px-4 py-3 backdrop-blur-md md:px-5">
          <GhostBtn type="button" onClick={() => onClose?.()}>
            Annuler
          </GhostBtn>
          <PrimaryBtn type="button" onClick={handleSave}>
            Enregistrer
          </PrimaryBtn>
        </div>
      </div>
    </div>
  );
}
