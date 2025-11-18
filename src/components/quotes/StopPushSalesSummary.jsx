import { useState, useMemo, memo } from "react";

export const StopPushSalesSummary = memo(function StopPushSalesSummary({ stopSales, pushSales, activities }) {
  const [expanded, setExpanded] = useState(false);
  const totalCount = stopSales.length + pushSales.length;

  // Grouper par date pour un affichage plus compact
  const stopSalesByDate = useMemo(() => {
    const grouped = {};
    stopSales.forEach((stop) => {
      if (!grouped[stop.date]) {
        grouped[stop.date] = [];
      }
      grouped[stop.date].push(stop);
    });
    return grouped;
  }, [stopSales]);

  const pushSalesByDate = useMemo(() => {
    const grouped = {};
    pushSales.forEach((push) => {
      if (!grouped[push.date]) {
        grouped[push.date] = [];
      }
      grouped[push.date].push(push);
    });
    return grouped;
  }, [pushSales]);

  if (totalCount === 0) return null;

  return (
    <div className="bg-gradient-to-r from-red-50 via-amber-50 to-green-50 border-2 border-red-400 rounded-xl p-4 shadow-lg">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between gap-3 text-left hover:opacity-90 transition-opacity"
      >
        <div className="flex items-center gap-4 flex-1">
          <div className="flex items-center gap-2 bg-red-500/10 px-3 py-2 rounded-lg border-2 border-red-400">
            <span className="text-2xl">🛑</span>
            {stopSales.length > 0 && (
              <span className="text-sm font-bold bg-red-600 text-white px-3 py-1 rounded-full shadow-md">
                {stopSales.length}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 bg-green-500/10 px-3 py-2 rounded-lg border-2 border-green-400">
            <span className="text-2xl">✅</span>
            {pushSales.length > 0 && (
              <span className="text-sm font-bold bg-green-600 text-white px-3 py-1 rounded-full shadow-md">
                {pushSales.length}
              </span>
            )}
          </div>
          <span className="text-base font-bold text-gray-800">
            {totalCount} activité{totalCount > 1 ? "s" : ""} en Stop/Push Sale
          </span>
        </div>
        <span className="text-gray-600 text-sm font-semibold bg-white/80 px-3 py-2 rounded-lg border border-gray-300">
          {expanded ? "▼ Réduire" : "▶ Voir les détails"}
        </span>
      </button>

      {expanded && (
        <div className="mt-3 space-y-3 pt-3 border-t border-red-200/50">
          {/* Stop Sales */}
          {stopSales.length > 0 && (
            <div>
              <h4 className="text-base font-bold text-red-900 mb-3 flex items-center gap-2 bg-red-100 px-3 py-2 rounded-lg border-2 border-red-400">
                <span className="text-xl">🛑</span> Stop Sales ({stopSales.length})
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[300px] overflow-y-auto">
                {Object.entries(stopSalesByDate)
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([date, stops]) => (
                    <div key={date} className="bg-white/95 backdrop-blur-sm rounded-lg p-3 border-2 border-red-300 shadow-md hover:shadow-lg transition-all duration-200">
                      <p className="text-sm font-bold text-red-900 mb-2">
                        {new Date(date + "T12:00:00").toLocaleDateString("fr-FR", {
                          weekday: "short",
                          day: "numeric",
                          month: "short",
                        })}
                      </p>
                      <div className="space-y-1.5">
                        {stops.map((stop, idx) => (
                          <p key={idx} className="text-xs font-medium text-red-800 truncate" title={stop.activityName}>
                            • {stop.activityName}
                          </p>
                        ))}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Push Sales */}
          {pushSales.length > 0 && (
            <div>
              <h4 className="text-base font-bold text-green-900 mb-3 flex items-center gap-2 bg-green-100 px-3 py-2 rounded-lg border-2 border-green-400">
                <span className="text-xl">✅</span> Push Sales ({pushSales.length})
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[300px] overflow-y-auto">
                {Object.entries(pushSalesByDate)
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([date, pushes]) => (
                    <div key={date} className="bg-white/95 backdrop-blur-sm rounded-lg p-3 border-2 border-green-300 shadow-md hover:shadow-lg transition-all duration-200">
                      <p className="text-sm font-bold text-green-900 mb-2">
                        {new Date(date + "T12:00:00").toLocaleDateString("fr-FR", {
                          weekday: "short",
                          day: "numeric",
                          month: "short",
                        })}
                      </p>
                      <div className="space-y-1.5">
                        {pushes.map((push, idx) => (
                          <p key={idx} className="text-xs font-medium text-green-800 truncate" title={push.activityName}>
                            • {push.activityName}
                          </p>
                        ))}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
});

