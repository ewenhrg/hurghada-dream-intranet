import { TextInput } from "../ui";
import { NEIGHBORHOODS } from "../../constants";
import { cleanPhoneNumber } from "../../utils";

export function ClientInfoSection({ client, setClient }) {
  return (
    <div className="bg-gradient-to-br from-slate-50/80 to-blue-50/60 rounded-2xl border border-slate-200/60 p-5 md:p-6 lg:p-8 shadow-md backdrop-blur-sm">
      <h3 className="text-base md:text-lg font-semibold text-slate-800 mb-4 md:mb-5 flex items-center gap-2">
        <span className="text-xl">👤</span>
        Informations client
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 md:gap-5">
        <div>
          <label className="block text-xs md:text-sm font-semibold text-slate-700 mb-2">Nom du client</label>
          <TextInput value={client.name} onChange={(e) => setClient((c) => ({ ...c, name: e.target.value }))} placeholder="Nom complet" />
        </div>
        <div>
          <label className="block text-xs md:text-sm font-semibold text-slate-700 mb-2">Téléphone</label>
          <TextInput 
            value={client.phone} 
            onChange={(e) => {
              const cleaned = cleanPhoneNumber(e.target.value);
              setClient((c) => ({ ...c, phone: cleaned }));
            }} 
            placeholder="06 12 34 56 78"
          />
        </div>
        <div>
          <label className="block text-xs md:text-sm font-semibold text-slate-700 mb-2">Email</label>
          <TextInput 
            type="email"
            value={client.email || ""} 
            onChange={(e) => setClient((c) => ({ ...c, email: e.target.value }))} 
            placeholder="email@exemple.com"
          />
        </div>
        <div>
          <label className="block text-xs md:text-sm font-semibold text-slate-700 mb-2">Hôtel</label>
          <TextInput value={client.hotel} onChange={(e) => setClient((c) => ({ ...c, hotel: e.target.value }))} placeholder="Nom de l'hôtel" />
        </div>
        <div>
          <label className="block text-xs md:text-sm font-semibold text-slate-700 mb-2">Chambre</label>
          <TextInput value={client.room} onChange={(e) => setClient((c) => ({ ...c, room: e.target.value }))} placeholder="N° chambre" />
        </div>
        <div className="sm:col-span-2 md:col-span-3 lg:col-span-1">
          <label className="block text-xs md:text-sm font-semibold text-slate-700 mb-2">Quartier</label>
          <select
            value={client.neighborhood}
            onChange={(e) => setClient((c) => ({ ...c, neighborhood: e.target.value }))}
            className="w-full rounded-xl border border-blue-200/50 bg-white/95 backdrop-blur-sm px-3 py-2.5 text-sm shadow-sm font-medium text-slate-700 focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all"
          >
            <option value="">— Choisir un quartier —</option>
            {NEIGHBORHOODS.map((n) => (
              <option key={n.key} value={n.key}>
                {n.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}

