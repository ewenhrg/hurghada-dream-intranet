import { memo } from "react";

export const ConfirmDialog = memo(({ isOpen, onClose, onConfirm, title, message, confirmText = "Confirmer", cancelText = "Annuler", type = "warning" }) => {
  if (!isOpen) return null;

  const bgColors = {
    warning: "bg-amber-50 border-amber-300",
    danger: "bg-red-50 border-red-300",
    info: "bg-blue-50 border-blue-300",
  };

  const btnColors = {
    warning: "bg-amber-600 hover:bg-amber-700",
    danger: "bg-red-600 hover:bg-red-700",
    info: "bg-blue-600 hover:bg-blue-700",
  };

  const icons = {
    warning: "⚠️",
    danger: "🗑️",
    info: "ℹ️",
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-3 md:p-4" style={{ WebkitOverflowScrolling: 'touch' }}>
      <div className={`rounded-xl md:rounded-2xl border-2 shadow-2xl p-4 md:p-6 max-w-md w-full max-h-[90vh] overflow-y-auto ${bgColors[type]}`} style={{ WebkitOverflowScrolling: 'touch' }}>
        <div className="flex items-start gap-3 md:gap-4 mb-4">
          <span className="text-3xl md:text-4xl flex-shrink-0">{icons[type]}</span>
          <div className="flex-1 min-w-0">
            <h3 className="text-base md:text-lg font-bold mb-2">{title}</h3>
            <p className="text-sm md:text-base text-gray-700 whitespace-pre-line break-words">{message}</p>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 md:gap-3 justify-end">
          <button
            onClick={onClose}
            className="px-5 py-3 md:py-2 rounded-lg border border-gray-300 bg-white text-gray-700 font-medium hover:bg-gray-50 transition-colors min-h-[44px] touch-manipulation order-2 sm:order-1"
          >
            {cancelText}
          </button>
          <button
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className={`px-5 py-3 md:py-2 rounded-lg text-white font-medium transition-colors min-h-[44px] touch-manipulation ${btnColors[type]} order-1 sm:order-2`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
});

ConfirmDialog.displayName = "ConfirmDialog";

