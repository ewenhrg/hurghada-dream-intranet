import { useState } from "react";

/**
 * Composant pour afficher les erreurs et avertissements de validation
 */
export function ValidationPanel({ validation }) {
  const [isExpanded, setIsExpanded] = useState(true);

  if (!validation || (validation.errorCount === 0 && validation.warningCount === 0)) {
    return null;
  }

  const { errors, warnings, errorCount, warningCount } = validation;

  return (
    <div className="space-y-3">
      {/* En-tête avec compteurs */}
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        className={`flex items-center justify-between p-4 rounded-xl border-2 cursor-pointer transition-all duration-200 ${
          errorCount > 0
            ? "bg-red-50 border-red-300 hover:bg-red-100"
            : "bg-amber-50 border-amber-300 hover:bg-amber-100"
        } shadow-md hover:shadow-lg`}
      >
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-full flex items-center justify-center shadow-md ${
              errorCount > 0 ? "bg-red-500" : "bg-amber-500"
            }`}
          >
            <span className="text-xl">
              {errorCount > 0 ? "⚠️" : "💡"}
            </span>
          </div>
          <div>
            <h3 className="font-bold text-lg">
              {errorCount > 0 ? "Erreurs détectées" : "Avertissements"}
            </h3>
            <p className="text-sm opacity-80">
              {errorCount > 0 && `${errorCount} erreur${errorCount > 1 ? "s" : ""}`}
              {errorCount > 0 && warningCount > 0 && " • "}
              {warningCount > 0 && `${warningCount} avertissement${warningCount > 1 ? "s" : ""}`}
            </p>
          </div>
        </div>
        <button
          type="button"
          className="text-2xl transition-transform duration-200"
          style={{ transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)" }}
        >
          ▼
        </button>
      </div>

      {/* Liste des erreurs et avertissements */}
      {isExpanded && (
        <div className="space-y-2">
          {/* Erreurs */}
          {errors.length > 0 && (
            <div className="bg-red-50 border-2 border-red-200 rounded-xl p-4 space-y-2">
              <h4 className="font-semibold text-red-800 flex items-center gap-2">
                <span>❌</span> Erreurs ({errors.length})
              </h4>
              <ul className="space-y-2">
                {errors.map((error, idx) => (
                  <li
                    key={idx}
                    className="bg-white border border-red-200 rounded-lg p-3 text-sm"
                  >
                    <div className="flex items-start gap-2">
                      <span className="text-red-500 mt-0.5">•</span>
                      <span className="text-red-800">{error.message}</span>
                    </div>
                    {error.activity && (
                      <div className="text-xs text-red-600 mt-1 ml-4">
                        Activité #{error.index + 1}: {error.activity}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Avertissements */}
          {warnings.length > 0 && (
            <div className="bg-amber-50 border-2 border-amber-200 rounded-xl p-4 space-y-2">
              <h4 className="font-semibold text-amber-800 flex items-center gap-2">
                <span>⚠️</span> Avertissements ({warnings.length})
              </h4>
              <ul className="space-y-2">
                {warnings.map((warning, idx) => (
                  <li
                    key={idx}
                    className="bg-white border border-amber-200 rounded-lg p-3 text-sm"
                  >
                    <div className="flex items-start gap-2">
                      <span className="text-amber-500 mt-0.5">•</span>
                      <span className="text-amber-800">{warning.message}</span>
                    </div>
                    {warning.activity && (
                      <div className="text-xs text-amber-600 mt-1 ml-4">
                        Activité #{warning.index + 1}: {warning.activity}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

