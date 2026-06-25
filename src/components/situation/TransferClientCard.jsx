import { memo } from "react";
import { TextInput } from "../ui";

export const TransferClientCard = memo(({ row, data }) => {
  const {
    editingCell,
    setEditingCell,
    handleCellEdit,
    handleToggleMarina,
    rowsWithMarina,
    handleSendSingleMessage,
  } = data;

  if (!row) return null;

  const isEditingPhone =
    editingCell?.rowId === row.id && editingCell?.field === "phone";

  const borderClass = row.messageSent
    ? "border-emerald-400 bg-emerald-50"
    : !row.phoneValid
    ? "border-amber-400 bg-amber-50"
    : "border-slate-300 bg-white";

  return (
    <div className={`mb-3 rounded-xl border-2 px-4 py-4 shadow-sm ${borderClass}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xl font-bold text-gray-900">
            {row.name || "Sans nom"}
          </p>

          {isEditingPhone ? (
            <TextInput
              value={row.phone ?? ""}
              onChange={(e) => handleCellEdit(row.id, "phone", e.target.value)}
              onBlur={() => setEditingCell(null)}
              onKeyDown={(e) => {
                if (e.key === "Enter") setEditingCell(null);
              }}
              className="mt-2 w-full max-w-xs text-xl font-bold text-gray-900"
              autoFocus
            />
          ) : (
            <button
              type="button"
              onClick={() => setEditingCell({ rowId: row.id, field: "phone" })}
              className={`mt-2 block text-left text-2xl font-bold ${
                !row.phone
                  ? "text-amber-700"
                  : row.phoneValid
                  ? "text-blue-800"
                  : "text-red-700"
              }`}
              title="Cliquer pour modifier le téléphone"
            >
              {row.phone || "⚠ Pas de téléphone"}
            </button>
          )}

          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-base text-gray-800">
            {row.time && !rowsWithMarina.has(row.id) && (
              <span>
                <strong className="text-gray-900">Heure :</strong> {row.time}
              </span>
            )}
            {row.trip && (
              <span>
                <strong className="text-gray-900">Activité :</strong> {row.trip}
              </span>
            )}
            {row.hotel && (
              <span>
                <strong className="text-gray-900">Hôtel :</strong> {row.hotel}
                {row.roomNo ? ` · ch. ${row.roomNo}` : ""}
              </span>
            )}
            {row.date && (
              <span>
                <strong className="text-gray-900">Date :</strong> {row.date}
              </span>
            )}
          </div>

          <label className="mt-3 flex cursor-pointer items-center gap-2 text-base font-medium text-gray-800">
            <input
              type="checkbox"
              checked={rowsWithMarina.has(row.id)}
              onChange={() => handleToggleMarina(row.id)}
              className="h-5 w-5 rounded border-gray-400"
            />
            Bateau à la marina
          </label>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          {row.messageSent ? (
            <span className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-bold text-white">
              ✓ Envoyé
            </span>
          ) : !row.phoneValid ? (
            <span className="rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-bold text-white">
              À corriger
            </span>
          ) : (
            <span className="rounded-lg bg-gray-800 px-3 py-1.5 text-sm font-bold text-white">
              Prêt
            </span>
          )}

          {row.phone && row.phoneValid && !row.messageSent && (
            <button
              type="button"
              onClick={() => handleSendSingleMessage(row)}
              className="rounded-lg bg-[#25D366] px-5 py-2.5 text-base font-bold text-white shadow hover:bg-[#1da851]"
            >
              Envoyer WhatsApp
            </button>
          )}
        </div>
      </div>
    </div>
  );
});

TransferClientCard.displayName = "TransferClientCard";
