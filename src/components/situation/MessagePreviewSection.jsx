import { memo } from "react";
import { GhostBtn } from "../ui";

export const MessagePreviewSection = memo(({ previewMessages, onMessageChange, onClose }) => {
  if (!previewMessages || previewMessages.length === 0) return null;

  return (
    <div className="border border-blue-200 rounded-xl p-6 bg-blue-50/30">
      <h3 className="text-lg font-semibold text-slate-900 mb-4">Prévisualisation des messages</h3>
      <div className="space-y-4 max-h-96 overflow-y-auto">
        {previewMessages.map((msg, index) => (
          <div
            key={msg.id}
            className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm"
          >
            <div className="flex items-start justify-between mb-2">
              <div>
                <p className="font-medium text-sm text-slate-900">{msg.name}</p>
                <p className="text-xs text-slate-500">
                  {msg.trip} • {msg.date} à {msg.time}
                </p>
              </div>
              {msg.phone ? (
                <span className="text-xs text-blue-600 font-medium">{msg.phone}</span>
              ) : (
                <span className="text-xs text-amber-600">⚠️ Pas de téléphone</span>
              )}
            </div>
            <textarea
              value={msg.message}
              onChange={(e) => onMessageChange(index, e.target.value)}
              className="w-full text-xs text-slate-700 bg-slate-50 p-3 rounded border border-slate-200 whitespace-pre-wrap font-sans resize-y min-h-[100px]"
              rows={6}
            />
          </div>
        ))}
      </div>
      <div className="mt-4 flex justify-end">
        <GhostBtn onClick={onClose}>Fermer</GhostBtn>
      </div>
    </div>
  );
});

MessagePreviewSection.displayName = "MessagePreviewSection";

