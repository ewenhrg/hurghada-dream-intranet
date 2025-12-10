import { memo } from "react";

/**
 * Composant Skeleton pour afficher des placeholders de chargement
 */
export const Skeleton = memo(({ 
  className = "", 
  width = "100%", 
  height = "1rem",
  rounded = "md",
  animate = true 
}) => {
  return (
    <div
      className={`bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 bg-[length:200%_100%] ${
        animate ? "animate-shimmer" : ""
      } ${className}`}
      style={{
        width: typeof width === "number" ? `${width}px` : width,
        height: typeof height === "number" ? `${height}px` : height,
        borderRadius: rounded === "md" ? "0.375rem" : rounded === "lg" ? "0.5rem" : rounded === "full" ? "9999px" : rounded,
      }}
    />
  );
});

Skeleton.displayName = "Skeleton";

/**
 * Skeleton pour les cartes de devis
 */
export const QuoteCardSkeleton = memo(() => {
  return (
    <div className="rounded-xl border-2 border-white/80 bg-white/95 backdrop-blur-sm p-4 md:p-5 shadow-lg animate-fade-in">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <Skeleton width="120px" height="24px" />
          <Skeleton width="80px" height="20px" rounded="lg" />
        </div>
        <div className="space-y-2">
          <Skeleton width="100%" height="16px" />
          <Skeleton width="80%" height="16px" />
          <Skeleton width="60%" height="16px" />
        </div>
        <div className="flex gap-2">
          <Skeleton width="100px" height="32px" rounded="lg" />
          <Skeleton width="100px" height="32px" rounded="lg" />
        </div>
      </div>
    </div>
  );
});

QuoteCardSkeleton.displayName = "QuoteCardSkeleton";

/**
 * Skeleton pour les lignes de tableau
 */
export const TableRowSkeleton = memo(({ columns = 5 }) => {
  return (
    <tr className="animate-fade-in">
      {Array.from({ length: columns }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <Skeleton width="100%" height="20px" />
        </td>
      ))}
    </tr>
  );
});

TableRowSkeleton.displayName = "TableRowSkeleton";

/**
 * Skeleton pour les formulaires
 */
export const FormFieldSkeleton = memo(() => {
  return (
    <div className="space-y-2 animate-fade-in">
      <Skeleton width="120px" height="16px" />
      <Skeleton width="100%" height="40px" rounded="lg" />
    </div>
  );
});

FormFieldSkeleton.displayName = "FormFieldSkeleton";

/**
 * Skeleton pour les listes d'activités
 */
export const ActivityCardSkeleton = memo(() => {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm animate-fade-in">
      <div className="space-y-3">
        <Skeleton width="60%" height="24px" />
        <div className="flex gap-2">
          <Skeleton width="80px" height="20px" rounded="full" />
          <Skeleton width="80px" height="20px" rounded="full" />
        </div>
        <div className="space-y-2">
          <Skeleton width="100%" height="16px" />
          <Skeleton width="70%" height="16px" />
        </div>
        <div className="flex gap-2 justify-end">
          <Skeleton width="60px" height="32px" rounded="lg" />
          <Skeleton width="60px" height="32px" rounded="lg" />
        </div>
      </div>
    </div>
  );
});

ActivityCardSkeleton.displayName = "ActivityCardSkeleton";

