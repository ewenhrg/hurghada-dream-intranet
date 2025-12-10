import { memo } from 'react';
import { currencyNoCents } from "../../utils";

/**
 * Composant pour afficher le résumé dynamique du devis dans un panneau sticky
 * Style inspiré d'Airbnb et Stripe
 */
export const QuoteSummarySidebar = memo(function QuoteSummarySidebar({ 
  client, 
  computed, 
  grandTotalCash, 
  grandTotalCard, 
  grandCurrency 
}) {
  const validActivities = computed.filter((c) => c.act && c.act.id);
  const activityCount = validActivities.length;
  
  // Formater les dates
  const formatDate = (dateString) => {
    if (!dateString) return "—";
    try {
      const date = new Date(dateString + "T12:00:00");
      return date.toLocaleDateString("fr-FR", { 
        day: "numeric", 
        month: "short",
        year: "numeric"
      });
    } catch {
      return dateString;
    }
  };

  return (
    <div className="sticky top-6 bg-white rounded-xl border border-slate-200/80 shadow-lg p-5 md:p-6 space-y-5 animate-fade-in">
      <div className="flex items-center gap-3 pb-4 border-b border-slate-200">
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-sm">
          <span className="text-lg">📋</span>
        </div>
        <h3 className="text-lg font-bold text-slate-900">Résumé du devis</h3>
      </div>

      <div className="space-y-4">
        {/* Informations client */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Client</p>
          <div className="space-y-1">
            {client.name ? (
              <p className="text-sm font-semibold text-slate-900">{client.name}</p>
            ) : (
              <p className="text-sm text-slate-400 italic">Nom non renseigné</p>
            )}
            {client.phone && (
              <p className="text-xs text-slate-600">{client.phone}</p>
            )}
            {client.hotel && (
              <p className="text-xs text-slate-600">🏨 {client.hotel}</p>
            )}
          </div>
        </div>

        {/* Dates du séjour */}
        {(client.arrivalDate || client.departureDate) && (
          <div className="space-y-2 pt-3 border-t border-slate-100">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Dates du séjour</p>
            <div className="space-y-1">
              <p className="text-xs text-slate-600">
                <span className="font-medium">Arrivée:</span> {formatDate(client.arrivalDate)}
              </p>
              <p className="text-xs text-slate-600">
                <span className="font-medium">Départ:</span> {formatDate(client.departureDate)}
              </p>
            </div>
          </div>
        )}

        {/* Nombre d'activités */}
        <div className="space-y-2 pt-3 border-t border-slate-100">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Activités</p>
          <p className="text-sm font-bold text-slate-900">
            {activityCount} {activityCount > 1 ? 'activités' : 'activité'}
          </p>
        </div>

        {/* Total estimé */}
        {validActivities.length > 0 && (
          <div className="pt-4 border-t-2 border-slate-200 space-y-3">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total estimé</p>
            <div className="space-y-2">
              <div className="flex items-center justify-between p-3 bg-gradient-to-r from-emerald-50 to-teal-50 rounded-lg border border-emerald-200/60">
                <span className="text-xs font-semibold text-slate-700">Espèces:</span>
                <span className="text-lg font-bold text-emerald-700">
                  {currencyNoCents(grandTotalCash, grandCurrency)}
                </span>
              </div>
              <div className="flex items-center justify-between p-3 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-200/60">
                <span className="text-xs font-semibold text-slate-700">Carte:</span>
                <span className="text-base font-bold text-blue-700">
                  {currencyNoCents(grandTotalCard, grandCurrency)}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {validActivities.length === 0 && (
        <div className="pt-4 border-t border-slate-200">
          <p className="text-xs text-slate-400 text-center italic">
            Ajoutez des activités pour voir le total
          </p>
        </div>
      )}
    </div>
  );
});

