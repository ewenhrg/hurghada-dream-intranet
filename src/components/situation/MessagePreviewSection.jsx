import { memo, useState, useMemo, useEffect } from "react";
import { GhostBtn, TextInput } from "../ui";

export const MessagePreviewSection = memo(({ previewMessages, onMessageChange, onClose }) => {
  const [searchTerm, setSearchTerm] = useState("");
  
  // Filtrer les messages selon la recherche
  const filteredMessages = useMemo(() => {
    if (!searchTerm.trim()) return previewMessages;
    
    const term = searchTerm.toLowerCase();
    return previewMessages.filter((msg) => {
      return (
        msg.name?.toLowerCase().includes(term) ||
        msg.phone?.includes(term) ||
        msg.trip?.toLowerCase().includes(term) ||
        msg.message?.toLowerCase().includes(term) ||
        msg.hotel?.toLowerCase().includes(term)
      );
    });
  }, [previewMessages, searchTerm]);

  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEscape);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  if (!previewMessages || previewMessages.length === 0) return null;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-slate-900/70 backdrop-blur-sm">
      <div className="flex min-h-0 flex-1 flex-col bg-white shadow-2xl">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 px-4 py-4 md:px-6 md:py-5 text-white">
          <div>
            <h3 className="text-xl md:text-2xl font-bold">📝 Prévisualisation des messages</h3>
            <p className="text-sm md:text-base opacity-90">
              {filteredMessages.length} message{filteredMessages.length > 1 ? "s" : ""} sur {previewMessages.length} total
            </p>
          </div>
          <GhostBtn onClick={onClose} className="text-base px-5 py-2.5 bg-white/15 text-white hover:bg-white/25 border-white/30">
            ✕ Fermer
          </GhostBtn>
        </div>

        <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 md:px-6">
          <TextInput
            type="text"
            placeholder="🔍 Rechercher par nom, téléphone, hôtel, trip ou message..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full text-base px-4 py-3 border-2 border-blue-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-200 rounded-xl shadow-sm"
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-slate-100 px-3 py-4 md:px-6 md:py-5 custom-scrollbar">
          {filteredMessages.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-xl border-2 border-slate-200">
              <p className="text-lg font-semibold text-slate-600">Aucun message trouvé</p>
              <p className="text-sm text-slate-500 mt-2">Essayez de modifier votre recherche</p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredMessages.map((msg) => {
                const originalIndex = previewMessages.findIndex((m) => m.id === msg.id);

                return (
                  <div
                    key={msg.id}
                    className="rounded-xl border-2 border-slate-200 bg-white shadow-md overflow-hidden"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3 md:px-5">
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-lg text-slate-900 truncate">
                          {msg.name || "Sans nom"}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-600">
                          {msg.trip && <span className="font-semibold text-indigo-600">✈️ {msg.trip}</span>}
                          {msg.date && <span>📅 {msg.date}</span>}
                          {msg.time && <span>🕐 {msg.time}</span>}
                          {msg.hotel && <span className="text-blue-600">🏨 {msg.hotel}</span>}
                        </div>
                      </div>
                      {msg.phone ? (
                        <span className="text-base font-bold text-blue-600 bg-blue-50 px-3 py-2 rounded-lg border border-blue-200">
                          📞 {msg.phone}
                        </span>
                      ) : (
                        <span className="text-base font-semibold text-amber-600 bg-amber-50 px-3 py-2 rounded-lg border border-amber-200">
                          ⚠️ Pas de téléphone
                        </span>
                      )}
                    </div>
                    <div className="px-4 py-4 md:px-5 md:py-5">
                      <label className="mb-2 block text-sm font-semibold text-slate-700">
                        Message à envoyer :
                      </label>
                      <textarea
                        value={msg.message}
                        onChange={(e) => onMessageChange(originalIndex, e.target.value)}
                        className="min-h-[140px] w-full resize-y rounded-lg border-2 border-slate-300 bg-white p-4 text-base leading-relaxed text-slate-800 shadow-inner focus:border-blue-400 focus:ring-2 focus:ring-blue-200 whitespace-pre-wrap font-sans"
                        rows={6}
                        placeholder="Le message apparaîtra ici..."
                      />
                      <div className="mt-2 flex items-center justify-between text-sm text-slate-500">
                        <span>{msg.message.length} caractères</span>
                        <span className="font-medium text-blue-600">✏️ Modifiable</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

MessagePreviewSection.displayName = "MessagePreviewSection";
