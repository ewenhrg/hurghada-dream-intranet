import { NumberInput } from "../ui";

export function GlobalAdultsSection({ globalAdults, setGlobalAdults, onUpdateAllActivities }) {
  return (
    <div className="mb-4 md:mb-6 p-5 md:p-6 bg-gradient-to-br from-emerald-50/90 to-teal-50/80 rounded-2xl border-2 border-emerald-300/60 shadow-lg">
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div className="flex-1">
          <label className="block text-sm md:text-base font-bold text-slate-800 mb-3 flex items-center gap-2">
            <span className="text-2xl">👥</span>
            Nombre d'adultes global
          </label>
          <p className="text-xs md:text-sm text-slate-600 mb-3 font-medium">
            Remplit automatiquement toutes les activités ci-dessous
          </p>
          <NumberInput
            value={globalAdults}
            onChange={(e) => {
              const value = e.target.value === "" ? "" : e.target.value;
              setGlobalAdults(value);
              onUpdateAllActivities(value);
            }}
            placeholder="Ex: 2"
            className="max-w-xs text-base font-semibold"
          />
          <p className="text-xs text-slate-500 mt-2 italic">
            💡 Vous pouvez toujours modifier individuellement le nombre d'adultes pour chaque activité
          </p>
        </div>
      </div>
    </div>
  );
}

