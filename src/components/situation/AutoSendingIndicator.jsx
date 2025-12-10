import { memo } from "react";
import { GhostBtn } from "../ui";

export const AutoSendingIndicator = memo(({ currentIndex, remainingCount, onStop }) => {
  return (
    <div className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-lg p-4 shadow-lg">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-semibold text-lg mb-1">🔄 Envoi automatique en cours...</p>
          <p className="text-sm opacity-90">
            Message {currentIndex} sur {currentIndex + remainingCount} • {remainingCount} restant(s)
          </p>
        </div>
        <GhostBtn 
          onClick={onStop}
          className="bg-white/20 hover:bg-white/30 text-white border-white/30"
        >
          ⏹️ Arrêter
        </GhostBtn>
      </div>
    </div>
  );
});

AutoSendingIndicator.displayName = "AutoSendingIndicator";

