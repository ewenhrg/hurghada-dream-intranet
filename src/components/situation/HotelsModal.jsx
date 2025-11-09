import { PrimaryBtn, GhostBtn, TextInput } from "../ui";

export default function HotelsModal({
  exteriorHotels = [],
  newHotel,
  onChangeNewHotel,
  onAddHotel,
  onDeleteHotel,
  onToggleBeachBoats,
  onClose,
}) {
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="bg-gradient-to-r from-green-600 via-emerald-600 to-teal-600 text-white p-6 flex items-center justify-between">
          <div>
            <h3 className="text-xl font-bold">🏨 Hôtels avec RDV à l&apos;extérieur</h3>
            <p className="text-sm opacity-90 mt-1">
              Liste des hôtels où les clients doivent attendre à l&apos;extérieur
            </p>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white text-2xl font-bold">
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div className="flex gap-2">
            <TextInput
              placeholder="Nom de l'hôtel (ex: Hilton Hurghada Resort)"
              value={newHotel}
              onChange={(e) => onChangeNewHotel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  onAddHotel();
                }
              }}
              className="flex-1"
            />
            <PrimaryBtn onClick={onAddHotel}>➕ Ajouter</PrimaryBtn>
          </div>

          {exteriorHotels.length > 0 ? (
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-slate-700 mb-3">
                Liste des hôtels ({exteriorHotels.length})
              </h4>
              {exteriorHotels.map((hotel, index) => {
                const hotelName = typeof hotel === "string" ? hotel : hotel.name;
                const hasBeachBoats =
                  typeof hotel === "string" ? false : Boolean(hotel.hasBeachBoats);

                return (
                  <div
                    key={`${hotelName}-${index}`}
                    className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200 hover:bg-slate-100 transition-colors"
                  >
                    <div className="flex items-center gap-3 flex-1">
                      <span className="text-sm font-medium text-slate-900 flex-1">{hotelName}</span>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={hasBeachBoats}
                          onChange={() => onToggleBeachBoats(hotelName)}
                          className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                        />
                        <span className="text-xs text-slate-600">🚤 Bateaux sur la plage</span>
                      </label>
                    </div>
                    <button
                      onClick={() => onDeleteHotel(hotelName)}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50 px-3 py-1 rounded-lg text-sm font-medium transition-colors ml-2"
                    >
                      🗑️ Supprimer
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 text-slate-500">
              <p className="text-sm">Aucun hôtel dans la liste</p>
              <p className="text-xs mt-2">
                Les clients auront le message &quot;RDV devant la réception&quot; par défaut
              </p>
            </div>
          )}

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-4">
            <p className="text-xs text-blue-900">
              <strong>ℹ️ Information :</strong> Pour les hôtels dans cette liste, le message
              &quot;📍 Rendez-vous à l&apos;extérieur de l&apos;hôtel.&quot; sera automatiquement
              ajouté à tous les messages. Pour les autres hôtels, ce sera &quot;📍 Rendez-vous
              devant la réception de l&apos;hôtel.&quot;
            </p>
          </div>
        </div>

        <div className="border-t border-slate-200 p-4 flex justify-end">
          <GhostBtn onClick={onClose}>Fermer</GhostBtn>
        </div>
      </div>
    </div>
  );
}

