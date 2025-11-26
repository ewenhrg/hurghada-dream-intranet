import { memo } from 'react';
import { GhostBtn } from "../ui";
import { currencyNoCents } from "../../utils";

/**
 * Composant pour afficher le résumé des totaux du devis
 */
export const QuoteSummary = memo(function QuoteSummary({ computed, grandTotalCash, grandTotalCard, grandCurrency, onAddItem }) {
  return (
    <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl border border-purple-200 shadow-sm p-6 md:p-8">
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
        <GhostBtn 
          type="button" 
          onClick={onAddItem} 
          variant="primary" 
          className="w-full lg:w-auto"
        >
          ➕ Ajouter une activité
        </GhostBtn>
        <div className="w-full lg:w-auto bg-white rounded-lg p-6 border border-purple-200 shadow-sm">
          <p className="text-xs font-medium text-purple-700 mb-4 uppercase tracking-wide">Total du devis</p>
          <div className="space-y-3">
            <div className="flex items-center justify-between lg:justify-end gap-4">
              <span className="text-sm font-medium text-slate-600">Espèces:</span>
              <p className="text-2xl md:text-3xl font-bold text-slate-900">
                {currencyNoCents(grandTotalCash, grandCurrency)}
              </p>
            </div>
            <div className="flex items-center justify-between lg:justify-end gap-4 pt-3 border-t border-slate-200">
              <span className="text-sm font-medium text-slate-600">Carte:</span>
              <p className="text-xl md:text-2xl font-bold text-slate-700">
                {currencyNoCents(grandTotalCard, grandCurrency)}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

