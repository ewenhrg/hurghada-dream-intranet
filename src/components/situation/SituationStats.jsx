import { memo } from "react";

export const SituationStats = memo(({ stats }) => {
  if (stats.total === 0) return null;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
      <div className="bg-white/95 border-2 border-slate-300 rounded-xl p-5 md:p-6 shadow-lg hover:shadow-xl transition-shadow">
        <p className="text-sm md:text-base text-slate-600 mb-2 font-semibold">📊 Total lignes</p>
        <p className="text-3xl md:text-4xl font-bold text-slate-900">{stats.total}</p>
      </div>
      <div className="bg-gradient-to-br from-blue-50 to-blue-100/50 border-2 border-blue-300 rounded-xl p-5 md:p-6 shadow-lg hover:shadow-xl transition-shadow">
        <p className="text-sm md:text-base text-slate-700 mb-2 font-semibold">📱 Avec téléphone</p>
        <p className="text-3xl md:text-4xl font-bold text-blue-600">{stats.withPhone}</p>
      </div>
      <div className="bg-gradient-to-br from-amber-50 to-amber-100/50 border-2 border-amber-300 rounded-xl p-5 md:p-6 shadow-lg hover:shadow-xl transition-shadow">
        <p className="text-sm md:text-base text-slate-700 mb-2 font-semibold">⚠️ Sans téléphone</p>
        <p className="text-3xl md:text-4xl font-bold text-amber-600">{stats.withoutPhone}</p>
        {stats.invalidPhones > 0 && (
          <p className="text-xs md:text-sm text-red-600 mt-2 font-bold bg-red-50 px-2 py-1 rounded-lg inline-block">
            ⚠️ {stats.invalidPhones} invalide(s)
          </p>
        )}
      </div>
      <div className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 border-2 border-emerald-300 rounded-xl p-5 md:p-6 shadow-lg hover:shadow-xl transition-shadow">
        <p className="text-sm md:text-base text-slate-700 mb-2 font-semibold">✅ Messages envoyés</p>
        <p className="text-3xl md:text-4xl font-bold text-emerald-600">{stats.sent}</p>
      </div>
    </div>
  );
});

SituationStats.displayName = "SituationStats";
