import { memo } from "react";
import { TextInput } from "../ui";

export const CARD_HEIGHT = 132;

export const TransferClientCard = memo(({ row, style, data }) => {
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
    ? "border-emerald-300 bg-emerald-50"
    : !row.phoneValid
    ? "border-amber-300 bg-amber-50"
    : "border-slate-200 bg-white";

  return (
    <div
      style={style}
      className={`absolute left-0 right-0 mx-1 rounded-xl border-2 px-4 py-3 shadow-sm ${borderClass}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-bold text-slate-900">
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
              className="mt-1 w-full max-w-xs text-lg font-semibold"
              autoFocus
            />
          ) : (
            <button
              type="button"
              onClick={() => setEditingCell({ rowId: row.id, field: "phone" })}
              className={`mt-1 block text-left text-xl font-bold ${
                !row.phone
                  ? "text-amber-600"
                  : row.phoneValid
                  ? "text-blue-700"
                  : "text-red-600"
              }`}
              title="Cliquer pour modifier le téléphone"
            >
              {row.phone || "⚠ Pas de téléphone"}
            </button>
          )}

          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-base text-slate-600">
            {row.time && (
              <span>
                <strong className="text-slate-800">Heure :</strong> {row.time}
              </span>
            )}
            {row.trip && (
              <span>
                <strong className="text-slate-800">Activité :</strong> {row.trip}
              </span>
            )}
            {row.hotel && (
              <span>
                <strong className="text-slate-800">Hôtel :</strong> {row.hotel}
                {row.roomNo ? ` · ch. ${row.roomNo}` : ""}
              </span>
            )}
            {row.date && (
              <span>
                <strong className="text-slate-800">Date :</strong> {row.date}
              </span>
            )}
          </div>

          <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm text-slate-500">
            <input
              type="checkbox"
              checked={rowsWithMarina.has(row.id)}
              onChange={() => handleToggleMarina(row.id)}
              className="h-4 w-4 rounded border-slate-300"
            />
            Bateau à la marina
          </label>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          {row.messageSent ? (
            <span className="rounded-lg bg-emerald-600 px-3 py-1 text-sm font-bold text-white">
              ✓ Envoyé
            </span>
          ) : !row.phoneValid ? (
            <span className="rounded-lg bg-amber-500 px-3 py-1 text-sm font-bold text-white">
              À corriger
            </span>
          ) : (
            <span className="rounded-lg bg-slate-200 px-3 py-1 text-sm font-semibold text-slate-700">
              Prêt
            </span>
          )}

          {row.phone && row.phoneValid && !row.messageSent && (
            <button
              type="button"
              onClick={() => handleSendSingleMessage(row)}
              className="rounded-lg bg-[#25D366] px-4 py-2 text-base font-bold text-white shadow hover:bg-[#1da851]"
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
