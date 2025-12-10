import { memo } from "react";
import { Skeleton, QuoteCardSkeleton, ActivityCardSkeleton, FormFieldSkeleton } from "./Skeleton";

/**
 * État de chargement pour les listes de devis
 */
export const QuotesLoadingState = memo(({ count = 3 }) => {
  return (
    <div className="space-y-4 animate-fade-in">
      {Array.from({ length: count }).map((_, i) => (
        <QuoteCardSkeleton key={i} />
      ))}
    </div>
  );
});

QuotesLoadingState.displayName = "QuotesLoadingState";

/**
 * État de chargement pour les listes d'activités
 */
export const ActivitiesLoadingState = memo(({ count = 6 }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-fade-in">
      {Array.from({ length: count }).map((_, i) => (
        <ActivityCardSkeleton key={i} />
      ))}
    </div>
  );
});

ActivitiesLoadingState.displayName = "ActivitiesLoadingState";

/**
 * État de chargement pour les formulaires
 */
export const FormLoadingState = memo(({ fields = 5 }) => {
  return (
    <div className="space-y-4 animate-fade-in">
      {Array.from({ length: fields }).map((_, i) => (
        <FormFieldSkeleton key={i} />
      ))}
    </div>
  );
});

FormLoadingState.displayName = "FormLoadingState";

/**
 * État de chargement pour les tableaux
 */
export const TableLoadingState = memo(({ rows = 5, columns = 5 }) => {
  return (
    <div className="overflow-x-auto animate-fade-in">
      <table className="w-full">
        <thead>
          <tr>
            {Array.from({ length: columns }).map((_, i) => (
              <th key={i} className="px-4 py-3">
                <Skeleton width="100%" height="20px" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, i) => (
            <tr key={i}>
              {Array.from({ length: columns }).map((_, j) => (
                <td key={j} className="px-4 py-3">
                  <Skeleton width="100%" height="20px" />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});

TableLoadingState.displayName = "TableLoadingState";

/**
 * Spinner de chargement simple
 */
export const LoadingSpinner = memo(({ size = "md", className = "" }) => {
  const sizeClasses = {
    sm: "h-4 w-4",
    md: "h-8 w-8",
    lg: "h-12 w-12",
  };

  return (
    <div className={`flex items-center justify-center ${className}`}>
      <div
        className={`${sizeClasses[size]} border-4 border-slate-200 border-t-indigo-600 rounded-full animate-spin`}
      />
    </div>
  );
});

LoadingSpinner.displayName = "LoadingSpinner";

/**
 * Overlay de chargement plein écran
 */
export const LoadingOverlay = memo(({ message = "Chargement..." }) => {
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center animate-fade-in">
      <div className="bg-white rounded-xl p-6 shadow-xl flex flex-col items-center gap-4">
        <LoadingSpinner size="lg" />
        <p className="text-slate-700 font-medium">{message}</p>
      </div>
    </div>
  );
});

LoadingOverlay.displayName = "LoadingOverlay";

