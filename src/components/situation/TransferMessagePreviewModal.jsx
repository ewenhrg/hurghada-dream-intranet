import { memo, useEffect, useState } from "react";
import { GhostBtn, PrimaryBtn } from "../ui";

export const TransferMessagePreviewModal = memo(
  ({ row, initialMessage, onSave, onReset, onSendWhatsApp, onClose }) => {
    const [draft, setDraft] = useState(initialMessage || "");

    useEffect(() => {
      setDraft(initialMessage || "");
    }, [initialMessage, row?.id]);

    useEffect(() => {
      const onKey = (e) => {
        if (e.key === "Escape") onClose();
      };
      document.addEventListener("keydown", onKey);
      return () => document.removeEventListener("keydown", onKey);
    }, [onClose]);

    if (!row) return null;

    return (
      <div
        className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/50 p-3"
        onClick={onClose}
      >
        <div
          className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-xl border border-slate-200 bg-white shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-2 border-b border-slate-100 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-slate-900">{row.name || "Sans nom"}</p>
              <p className="text-xs text-slate-600">
                {row.trip || "—"} · {row.phone || "pas de tél."}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded p-1 text-slate-500 hover:bg-slate-100"
              aria-label="Fermer"
            >
              ✕
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <label className="mb-1 block text-xs font-semibold text-slate-700">Message WhatsApp</label>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="min-h-[200px] w-full resize-y rounded-lg border border-slate-300 p-3 text-sm leading-relaxed text-slate-800 focus:border-blue-400 focus:ring-1 focus:ring-blue-300"
              rows={10}
            />
            <p className="mt-1 text-[11px] text-slate-500">{draft.length} caractères · modifiable avant envoi</p>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 px-4 py-3">
            <GhostBtn type="button" onClick={() => onReset?.()} className="text-xs px-3 py-1.5">
              Réinitialiser
            </GhostBtn>
            <GhostBtn type="button" onClick={onClose} className="text-xs px-3 py-1.5">
              Annuler
            </GhostBtn>
            <PrimaryBtn
              type="button"
              onClick={() => onSave(draft)}
              className="text-xs px-3 py-1.5"
            >
              Enregistrer
            </PrimaryBtn>
            {row.phone && row.phoneValid && !row.messageSent && onSendWhatsApp && (
              <button
                type="button"
                onClick={() => onSendWhatsApp(draft)}
                className="rounded-lg bg-[#25D366] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#1da851]"
              >
                Envoyer
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }
);

TransferMessagePreviewModal.displayName = "TransferMessagePreviewModal";
