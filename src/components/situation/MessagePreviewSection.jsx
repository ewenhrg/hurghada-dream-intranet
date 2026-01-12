import { memo, useState, useMemo } from "react";
import { GhostBtn, TextInput } from "../ui";

export const MessagePreviewSection = memo(({ previewMessages, onMessageChange, onClose }) => {
  const [expandedItems, setExpandedItems] = useState(new Set());
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

  const toggleExpand = (index) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedItems(newExpanded);
  };

  const expandAll = () => {
    setExpandedItems(new Set(filteredMessages.map((_, idx) => idx)));
  };

  const collapseAll = () => {
    setExpandedItems(new Set());
  };

  if (!previewMessages || previewMessages.length === 0) return null;

  return (
    <div className="border-2 border-blue-300 rounded-2xl p-6 md:p-8 bg-gradient-to-br from-blue-50/50 via-white to-indigo-50/30 shadow-xl">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <div>
          <h3 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent mb-2">
            📝 Prévisualisation des messages
          </h3>
          <p className="text-sm md:text-base text-slate-600 font-medium">
            {filteredMessages.length} message{filteredMessages.length > 1 ? 's' : ''} sur {previewMessages.length} total
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <GhostBtn 
            onClick={expandAll} 
            variant="info"
            className="text-sm px-4 py-2"
          >
            📖 Tout développer
          </GhostBtn>
          <GhostBtn 
            onClick={collapseAll} 
            variant="info"
            className="text-sm px-4 py-2"
          >
            📕 Tout réduire
          </GhostBtn>
        </div>
      </div>

      {/* Barre de recherche */}
      <div className="mb-6">
        <TextInput
          type="text"
          placeholder="🔍 Rechercher par nom, téléphone, hôtel, trip ou message..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full text-base md:text-lg px-4 py-3 border-2 border-blue-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-200 rounded-xl shadow-sm"
        />
      </div>

      {/* Liste des messages avec accordéon */}
      <div className="space-y-3 max-h-[calc(100vh-400px)] overflow-y-auto pr-2 custom-scrollbar">
        {filteredMessages.length === 0 ? (
          <div className="text-center py-12 bg-white/80 rounded-xl border-2 border-slate-200">
            <p className="text-lg font-semibold text-slate-600">Aucun message trouvé</p>
            <p className="text-sm text-slate-500 mt-2">Essayez de modifier votre recherche</p>
          </div>
        ) : (
          filteredMessages.map((msg, index) => {
            const isExpanded = expandedItems.has(index);
            const originalIndex = previewMessages.findIndex((m) => m.id === msg.id);
            
            return (
              <div
                key={msg.id}
                className="bg-white rounded-xl border-2 border-slate-200 shadow-lg hover:shadow-xl transition-all duration-200 overflow-hidden"
              >
                {/* En-tête cliquable */}
                <button
                  onClick={() => toggleExpand(index)}
                  className="w-full flex items-center justify-between p-4 md:p-5 hover:bg-slate-50 transition-colors text-left"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 md:gap-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-2xl flex-shrink-0">
                          {isExpanded ? "📂" : "📁"}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-base md:text-lg text-slate-900 truncate">
                            {msg.name || "Sans nom"}
                          </p>
                          <div className="flex flex-wrap items-center gap-2 md:gap-3 mt-1">
                            {msg.trip && (
                              <span className="text-xs md:text-sm text-indigo-600 font-semibold bg-indigo-50 px-2 py-1 rounded-lg">
                                ✈️ {msg.trip}
                              </span>
                            )}
                            {msg.date && (
                              <span className="text-xs md:text-sm text-slate-600 font-medium">
                                📅 {msg.date}
                              </span>
                            )}
                            {msg.time && (
                              <span className="text-xs md:text-sm text-slate-600 font-medium">
                                🕐 {msg.time}
                              </span>
                            )}
                            {msg.hotel && (
                              <span className="text-xs md:text-sm text-blue-600 font-medium bg-blue-50 px-2 py-1 rounded-lg">
                                🏨 {msg.hotel}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        {msg.phone ? (
                          <span className="text-sm md:text-base text-blue-600 font-bold bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-200">
                            📞 {msg.phone}
                          </span>
                        ) : (
                          <span className="text-sm md:text-base text-amber-600 font-semibold bg-amber-50 px-3 py-1.5 rounded-lg border border-amber-200">
                            ⚠️ Pas de téléphone
                          </span>
                        )}
                        <span className="text-xl md:text-2xl transition-transform duration-200" style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>
                          ▶
                        </span>
                      </div>
                    </div>
                  </div>
                </button>

                {/* Contenu du message (affiché si développé) */}
                {isExpanded && (
                  <div className="px-4 md:px-5 pb-4 md:pb-5 border-t border-slate-200 bg-gradient-to-br from-slate-50/50 to-blue-50/30">
                    <div className="pt-4">
                      <label className="block text-sm md:text-base font-semibold text-slate-700 mb-2">
                        Message à envoyer :
                      </label>
                      <textarea
                        value={msg.message}
                        onChange={(e) => onMessageChange(originalIndex, e.target.value)}
                        className="w-full text-sm md:text-base text-slate-800 bg-white p-4 rounded-lg border-2 border-slate-300 focus:border-blue-400 focus:ring-2 focus:ring-blue-200 whitespace-pre-wrap font-sans resize-y min-h-[150px] md:min-h-[180px] leading-relaxed shadow-inner"
                        rows={8}
                        placeholder="Le message apparaîtra ici..."
                      />
                      <div className="mt-3 flex items-center justify-between text-xs md:text-sm text-slate-500">
                        <span>{msg.message.length} caractères</span>
                        <span className="text-blue-600 font-medium">✏️ Modifiable</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Actions */}
      <div className="mt-6 pt-6 border-t-2 border-slate-200 flex flex-col sm:flex-row justify-end gap-3">
        <GhostBtn 
          onClick={onClose}
          className="text-base md:text-lg px-6 py-3"
        >
          ✕ Fermer
        </GhostBtn>
      </div>
    </div>
  );
});

MessagePreviewSection.displayName = "MessagePreviewSection";
