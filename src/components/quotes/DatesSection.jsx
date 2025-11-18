import { TextInput, GhostBtn } from "../ui";

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
          <TextInput 
            type="date" 
            value={client.arrivalDate || ""} 
            onChange={(e) => setClient((c) => ({ ...c, arrivalDate: e.target.value }))} 
          />
        </div>
        <div>
          <label className="block text-xs md:text-sm font-semibold text-slate-700 mb-2">Date de départ</label>
          <div className="flex gap-2">
            <TextInput 
              type="date" 
              value={client.departureDate || ""} 
              onChange={(e) => setClient((c) => ({ ...c, departureDate: e.target.value }))} 
              className="flex-1"
            />
            {client.arrivalDate && client.departureDate && (
              <GhostBtn
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onAutoFillDates();
                }}
                variant="primary"
                size="sm"
                title="Remplir automatiquement les dates des activités avec les dates du séjour"
                className="whitespace-nowrap"
              >
                📅 Auto-dates
              </GhostBtn>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

