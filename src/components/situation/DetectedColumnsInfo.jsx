import { memo } from "react";

export const DetectedColumnsInfo = memo(({ detectedColumns }) => {
  if (detectedColumns.length === 0) return null;

  return (
    <div className="bg-blue-50/50 border border-blue-200 rounded-lg p-4">
      <p className="text-sm font-semibold text-blue-900 mb-2">📊 Colonnes détectées dans le fichier Excel:</p>
      <div className="flex flex-wrap gap-2">
        {detectedColumns.map((col, idx) => (
          <span key={idx} className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-medium">
            {col}
          </span>
        ))}
      </div>
    </div>
  );
});

DetectedColumnsInfo.displayName = "DetectedColumnsInfo";

