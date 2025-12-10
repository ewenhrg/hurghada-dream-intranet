import { memo } from 'react';
import { GhostBtn } from "../ui";
import { currencyNoCents } from "../../utils";

/**
 * Composant pour afficher le résumé des totaux du devis
 */
export const QuoteSummary = memo(function QuoteSummary({ computed, grandTotalCash, grandTotalCard, grandCurrency, onAddItem }) {
  return (
    <div className="bg-gradient-to-br from-purple-50 via-pink-50 to-rose-50 rounded-2xl border-2 border-purple-200/60 shadow-xl backdrop-blur-sm p-6 md:p-8 animate-scale-in">
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
        <GhostBtn 
          type="button" 
          onClick={onAddItem} 
          variant="primary" 
          className="w-full lg:w-auto shadow-lg hover:shadow-xl transition-all transform hover:-translate-y-0.5"
        >
          ➕ Ajouter une activité
        </GhostBtn>
        <div className="w-full lg:w-auto bg-white/90 backdrop-blur-sm rounded-2xl p-6 md:p-8 border-2 border-purple-200/60 shadow-lg">
          <div className="flex items-center gap-2 mb-4 pb-3 border-b-2 border-purple-100">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
              <span className="text-white text-sm">💰</span>
            </div>
            <p className="text-xs font-bold text-purple-700 uppercase tracking-wider">Total du devis</p>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between lg:justify-end gap-4 p-3 bg-gradient-to-r from-emerald-50 to-teal-50 rounded-xl border border-emerald-200/60">
              <div className="flex items-center gap-2">
                <span className="text-lg">💵</span>
                <span className="text-sm font-semibold text-slate-700">Espèces:</span>
              </div>
              <p className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-emerald-700 to-teal-700 bg-clip-text text-transparent">
                {currencyNoCents(grandTotalCash, grandCurrency)}
              </p>
            </div>
            <div className="flex items-center justify-between lg:justify-end gap-4 p-3 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-200/60">
              <div className="flex items-center gap-2">
                <span className="text-lg">💳</span>
                <span className="text-sm font-semibold text-slate-700">Carte:</span>
              </div>
              <p className="text-xl md:text-2xl font-bold bg-gradient-to-r from-blue-700 to-indigo-700 bg-clip-text text-transparent">
                {currencyNoCents(grandTotalCard, grandCurrency)}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

