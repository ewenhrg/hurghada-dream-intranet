import { GhostBtn } from "../ui";
import { DateInput } from "../DateInput";

export function DatesSection({ client, setClient, onAutoFillDates }) {
  return (
    <div className="bg-gradient-to-br from-indigo-50/80 to-purple-50/60 rounded-2xl border border-indigo-200/60 p-5 md:p-6 lg:p-8 shadow-md backdrop-blur-sm">
      <h3 className="text-base md:text-lg font-semibold text-slate-800 mb-4 md:mb-5 flex items-center gap-2">
        <span className="text-xl">📅</span>
        Dates du séjour
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
        <div>
          <label className="block text-xs md:text-sm font-semibold text-slate-700 mb-2">Date d'arrivée</label>
          <DateInput
            value={client.arrivalDate || ""}
            onChange={(v) => setClient((c) => ({ ...c, arrivalDate: v }))}
          />
        </div>
        <div>
          <label className="block text-xs md:text-sm font-semibold text-slate-700 mb-2">Date de départ</label>
          <div className="flex gap-2">
            <DateInput
              value={client.departureDate || ""}
              onChange={(v) => setClient((c) => ({ ...c, departureDate: v }))}
              className="flex-1"
            />
            <GhostBtn
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (client.arrivalDate && client.departureDate) onAutoFillDates();
              }}
              variant="primary"
              size="sm"
              disabled={!client.arrivalDate || !client.departureDate}
              title={client.arrivalDate && client.departureDate ? "Remplir automatiquement les dates des activités avec les dates du séjour" : "Renseignez les dates d'arrivée et de départ pour activer"}
              className="whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
            >
              📅 Auto-dates
            </GhostBtn>
          </div>
        </div>
      </div>
    </div>
  );
}

