import { memo } from "react";

export const SendLogSection = memo(({ sendLog }) => {
  if (!sendLog || sendLog.length === 0) return null;

  return (
    <div className="border border-slate-200 rounded-xl p-6 bg-slate-50/50">
      <h3 className="text-lg font-semibold text-slate-900 mb-4">📊 Log d'envoi</h3>
      <div className="space-y-2 max-h-64 overflow-y-auto">
        {sendLog.map((log, index) => (
          <div
            key={index}
            className={`flex items-center justify-between p-3 rounded-lg ${
              log.status === "success"
                ? "bg-emerald-50 border border-emerald-200"
                : "bg-red-50 border border-red-200"
            }`}
          >
            <div className="flex-1">
              <p className="text-sm font-medium text-slate-900">{log.name}</p>
              <p className="text-xs text-slate-600">
                {log.phone} • {log.trip} • {log.time}
              </p>
            </div>
            <div className="text-right">
              {log.status === "success" ? (
                <span className="text-emerald-700 text-xs font-medium">✓ Succès</span>
              ) : (
                <span className="text-red-700 text-xs font-medium">✗ Erreur</span>
              )}
              <p className="text-[10px] text-slate-500 mt-1">
                {new Date(log.sentAt).toLocaleTimeString("fr-FR")}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});

SendLogSection.displayName = "SendLogSection";

