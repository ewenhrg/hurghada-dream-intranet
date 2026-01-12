import { memo } from "react";

export const DetectedColumnsInfo = memo(({ detectedColumns }) => {
  if (detectedColumns.length === 0) return null;

  return (
    <div className="bg-gradient-to-r from-blue-50/80 to-indigo-50/60 border-2 border-blue-300 rounded-xl p-5 md:p-6 shadow-lg">
      <p className="text-base md:text-lg font-bold text-blue-900 mb-3 flex items-center gap-2">
        <span className="text-2xl">📊</span>
        <span>Colonnes détectées dans le fichier Excel</span>
      </p>
      <div className="flex flex-wrap gap-2 md:gap-3">
        {detectedColumns.map((col, idx) => (
          <span 
            key={idx} 
            className="px-3 py-1.5 md:px-4 md:py-2 bg-blue-100 text-blue-800 rounded-lg text-sm md:text-base font-semibold border border-blue-200 shadow-sm"
          >
            {col}
          </span>
        ))}
      </div>
    </div>
  );
});

DetectedColumnsInfo.displayName = "DetectedColumnsInfo";
