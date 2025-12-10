import { memo } from "react";

export const SituationStats = memo(({ stats }) => {
  if (stats.total === 0) return null;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div className="bg-white/90 border border-slate-200 rounded-lg p-4">
        <p className="text-xs text-slate-600 mb-1">Total lignes</p>
        <p className="text-2xl font-bold text-slate-900">{stats.total}</p>
      </div>
      <div className="bg-blue-50/50 border border-blue-200 rounded-lg p-4">
        <p className="text-xs text-slate-600 mb-1">Avec téléphone</p>
        <p className="text-2xl font-bold text-blue-600">{stats.withPhone}</p>
      </div>
      <div className="bg-amber-50/50 border border-amber-200 rounded-lg p-4">
        <p className="text-xs text-slate-600 mb-1">Sans téléphone</p>
        <p className="text-2xl font-bold text-amber-600">{stats.withoutPhone}</p>
        {stats.invalidPhones > 0 && (
          <p className="text-[11px] text-[#dc2626] mt-1 font-semibold">⚠️ {stats.invalidPhones} invalide(s)</p>
        )}
      </div>
      <div className="bg-emerald-50/50 border border-emerald-200 rounded-lg p-4">
        <p className="text-xs text-slate-600 mb-1">Messages envoyés</p>
        <p className="text-2xl font-bold text-emerald-600">{stats.sent}</p>
      </div>
    </div>
  );
});

SituationStats.displayName = "SituationStats";

