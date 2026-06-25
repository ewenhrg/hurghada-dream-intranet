import { memo } from "react";
import { TextInput } from "../ui";

export const TransferClientsTable = memo(({ rows, data }) => {
  const {
    editingCell,
    setEditingCell,
    handleCellEdit,
    handleToggleMarina,
    rowsWithMarina,
    handleSendSingleMessage,
    handleOpenMessagePreview,
    messageOverrides,
  } = data;

  if (!rows?.length) return null;

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full min-w-[900px] border-collapse text-xs">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-600">
            <th className="px-2 py-1.5 w-8">St</th>
            <th className="px-2 py-1.5">Nom</th>
            <th className="px-2 py-1.5">Téléphone</th>
            <th className="px-2 py-1.5">Activité</th>
            <th className="px-2 py-1.5">Heure</th>
            <th className="px-2 py-1.5">Hôtel</th>
            <th className="px-2 py-1.5 w-12">Ch.</th>
            <th className="px-2 py-1.5 w-14 text-center">Marina</th>
            <th className="px-2 py-1.5 w-28 text-center">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const isEditingPhone =
              editingCell?.rowId === row.id && editingCell?.field === "phone";
            const marina = rowsWithMarina.has(row.id);
            const hasCustomMessage = messageOverrides?.[row.id] != null;

            let rowClass = "border-b border-slate-100 hover:bg-slate-50/80";
            if (row.messageSent) rowClass += " bg-emerald-50/60";
            else if (!row.phoneValid) rowClass += " bg-amber-50/50";

            return (
              <tr key={row.id} className={rowClass}>
                <td className="px-2 py-1 align-middle">
                  {row.messageSent ? (
                    <span className="text-emerald-600" title="Envoyé">
                      ✓
                    </span>
                  ) : !row.phoneValid ? (
                    <span className="text-amber-600" title="À corriger">
                      !
                    </span>
                  ) : (
                    <span className="text-slate-400">·</span>
                  )}
                </td>
                <td className="px-2 py-1 align-middle font-medium text-slate-900 max-w-[120px] truncate">
                  {row.name || "—"}
                </td>
                <td className="px-2 py-1 align-middle max-w-[130px]">
                  {isEditingPhone ? (
                    <TextInput
                      value={row.phone ?? ""}
                      onChange={(e) => handleCellEdit(row.id, "phone", e.target.value)}
                      onBlur={() => setEditingCell(null)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") setEditingCell(null);
                      }}
                      className="w-full py-0.5 text-xs"
                      autoFocus
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setEditingCell({ rowId: row.id, field: "phone" })}
                      className={`truncate text-left font-semibold underline-offset-2 hover:underline ${
                        !row.phone
                          ? "text-amber-700"
                          : row.phoneValid
                            ? "text-blue-700"
                            : "text-red-700"
                      }`}
                      title="Modifier le téléphone"
                    >
                      {row.phone || "⚠ manquant"}
                    </button>
                  )}
                </td>
                <td className="px-2 py-1 align-middle text-slate-700 max-w-[140px] truncate">
                  {row.trip || "—"}
                </td>
                <td className="px-2 py-1 align-middle text-slate-700 whitespace-nowrap">
                  {marina ? "—" : row.time || "—"}
                </td>
                <td className="px-2 py-1 align-middle text-slate-700 max-w-[140px] truncate">
                  {row.hotel || "—"}
                </td>
                <td className="px-2 py-1 align-middle text-slate-600 text-center">
                  {row.roomNo || "—"}
                </td>
                <td className="px-2 py-1 align-middle text-center">
                  <input
                    type="checkbox"
                    checked={marina}
                    onChange={() => handleToggleMarina(row.id)}
                    className="h-3.5 w-3.5 cursor-pointer"
                    title="Bateau à la marina"
                  />
                </td>
                <td className="px-2 py-1 align-middle">
                  <div className="flex items-center justify-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleOpenMessagePreview(row)}
                      className={`rounded border px-2 py-0.5 text-[11px] font-medium ${
                        hasCustomMessage
                          ? "border-violet-300 bg-violet-50 text-violet-800"
                          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                      title="Prévisualiser et modifier le message"
                    >
                      Message{hasCustomMessage ? " *" : ""}
                    </button>
                    {row.phone && row.phoneValid && !row.messageSent && (
                      <button
                        type="button"
                        onClick={() => handleSendSingleMessage(row)}
                        className="rounded bg-[#25D366] px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-[#1da851]"
                        title="Ouvrir WhatsApp"
                      >
                        WA
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
});

TransferClientsTable.displayName = "TransferClientsTable";
