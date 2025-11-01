export function ConfirmDialog({ isOpen, onClose, onConfirm, title, message, confirmText = "Confirmer", cancelText = "Annuler", type = "warning" }) {
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className={`rounded-2xl border-2 shadow-2xl p-6 max-w-md w-full ${bgColors[type]}`}>
        <div className="flex items-start gap-4 mb-4">
          <span className="text-4xl flex-shrink-0">{icons[type]}</span>
          <div className="flex-1">
            <h3 className="text-lg font-bold mb-2">{title}</h3>
            <p className="text-sm text-gray-700">{message}</p>
          </div>
        </div>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 font-medium hover:bg-gray-50 transition-colors"
          >
            {cancelText}
          </button>
          <button
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className={`px-4 py-2 rounded-lg text-white font-medium transition-colors ${btnColors[type]}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

