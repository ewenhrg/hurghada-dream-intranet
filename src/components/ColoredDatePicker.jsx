import { useState, useMemo, useEffect, useCallback } from "react";
import { TextInput } from "./ui";
import { toast } from "../utils/toast.js";
import { logger } from "../utils/logger";

// Composant calendrier personnalisé avec jours colorés
export function ColoredDatePicker({ value, onChange, activity, stopSales = [], pushSales = [] }) {
  const [showCalendar, setShowCalendar] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(() => {
    const date = value ? new Date(value + "T12:00:00") : new Date();
    return new Date(date.getFullYear(), date.getMonth(), 1);
  });

  // Mettre à jour le mois affiché quand la valeur change
  useEffect(() => {
    if (value) {
      const date = new Date(value + "T12:00:00");
      setCurrentMonth(new Date(date.getFullYear(), date.getMonth(), 1));
    }
  }, [value]);

  // Convertir YYYY-MM-DD vers DD/MM/YYYY pour l'affichage
  const formatDateForDisplay = (dateStr) => {
    if (!dateStr) return "";
    const [year, month, day] = dateStr.split("-");
    return `${day}/${month}/${year}`;
  };

  // Convertir DD/MM/YYYY vers YYYY-MM-DD pour le stockage
  const parseDateFromDisplay = (dateStr) => {
    if (!dateStr) return "";
    // Supprimer les espaces et séparateurs multiples
    const cleaned = dateStr.trim().replace(/[\/\s-]+/g, "/");
    const parts = cleaned.split("/");
    
    if (parts.length === 3) {
      const day = parts[0].padStart(2, '0');
      const month = parts[1].padStart(2, '0');
      const year = parts[2];
      // Vérifier que c'est une date valide
      if (day && month && year && day.length <= 2 && month.length <= 2 && year.length === 4) {
        return `${year}-${month}-${day}`;
      }
    }
    return dateStr; // Retourner tel quel si le format n'est pas valide
  };

  const getDayStatus = useCallback((date) => {
    if (!activity) return null; // Pas d'activité sélectionnée
    
    // Utiliser une méthode qui ne dépend pas du fuseau horaire
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;
    
    const weekday = date.getDay();
    const baseAvailable = activity.availableDays?.[weekday] === true;
    
    // Vérifier stop sales et push sales
    // Vérifier avec l'ID local (id) et l'ID Supabase (supabase_id) car les stop/push sales peuvent utiliser l'un ou l'autre
    // Convertir les IDs en string pour la comparaison car ils peuvent être de types différents
    const activityIdStr = String(activity.id || '');
    const activitySupabaseIdStr = activity.supabase_id ? String(activity.supabase_id) : null;
    
    // Log de débogage temporaire pour voir ce qui est reçu
    if (dateStr === '2025-12-11') {
      logger.log('Vérification push sale pour le 11/12:', {
        dateStr,
        activityIdStr,
        activitySupabaseIdStr,
        activityName: activity.name,
        pushSalesCount: pushSales.length,
        pushSales: pushSales.map(p => ({ activity_id: p.activity_id, date: p.date }))
      });
    }
    
    const isStopSale = stopSales.some(s => {
      const stopActivityIdStr = String(s.activity_id || '');
      return (stopActivityIdStr === activityIdStr || (activitySupabaseIdStr && stopActivityIdStr === activitySupabaseIdStr)) && 
             s.date === dateStr;
    });
    
    const isPushSale = pushSales.some(p => {
      const pushActivityIdStr = String(p.activity_id || '');
      const matches = (pushActivityIdStr === activityIdStr || (activitySupabaseIdStr && pushActivityIdStr === activitySupabaseIdStr)) && 
                      p.date === dateStr;
      // Log de débogage temporaire pour le 11 décembre
      if (dateStr === '2025-12-11' && matches) {
        logger.log('Push sale détecté pour le 11/12:', {
          dateStr,
          pushActivityIdStr,
          activityIdStr,
          activitySupabaseIdStr,
          pushDate: p.date,
          activityName: activity.name
        });
      }
      return matches;
    });
    
    if (isStopSale) return 'stop-sale';
    if (isPushSale) return 'push-sale';
    if (baseAvailable) return 'available';
    return 'unavailable';
  }, [activity, stopSales, pushSales]);

  const getDaysInMonth = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();
    
    const days = [];
    
    // Jours du mois précédent (pour compléter la première semaine)
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    for (let i = startingDayOfWeek - 1; i >= 0; i--) {
      days.push({
        date: new Date(year, month - 1, prevMonthLastDay - i),
        isCurrentMonth: false
      });
    }
    
    // Jours du mois actuel
    for (let day = 1; day <= daysInMonth; day++) {
      days.push({
        date: new Date(year, month, day),
        isCurrentMonth: true
      });
    }
    
    // Jours du mois suivant (pour compléter la dernière semaine)
    const remainingDays = 42 - days.length; // 6 semaines * 7 jours
    for (let day = 1; day <= remainingDays; day++) {
      days.push({
        date: new Date(year, month + 1, day),
        isCurrentMonth: false
      });
    }
    
    return days;
  };

  const days = useMemo(() => getDaysInMonth(currentMonth), [currentMonth]);
  const monthNames = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
  const dayNames = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];

  // Fonction pour vérifier si une date est dans le passé ou aujourd'hui
  const isDateInPastOrToday = (date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const checkDate = new Date(date);
    checkDate.setHours(0, 0, 0, 0);
    return checkDate <= today;
  };

  const handleDateClick = (date, e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (!activity) {
      toast.warning("Veuillez d'abord sélectionner une activité");
      return;
    }
    
    // Vérifier si la date est dans le passé ou aujourd'hui
    if (isDateInPastOrToday(date)) {
      toast.warning("Les activités ne peuvent pas être programmées avant demain.");
      return;
    }
    
    // Utiliser une méthode qui ne dépend pas du fuseau horaire
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;
    onChange(dateStr);
    setShowCalendar(false);
  };

  const prevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };

  const getDayClassName = (day, status) => {
    const baseClasses = "w-10 h-10 flex items-center justify-center text-sm font-medium rounded-lg transition-all ";
    const today = new Date();
    const isToday = day.date.toDateString() === today.toDateString();
    // Comparer les dates sans dépendre du fuseau horaire
    const year = day.date.getFullYear();
    const month = String(day.date.getMonth() + 1).padStart(2, '0');
    const dayNum = String(day.date.getDate()).padStart(2, '0');
    const dayDateStr = `${year}-${month}-${dayNum}`;
    const isSelected = value && dayDateStr === value;
    const isPastOrToday = isDateInPastOrToday(day.date);
    
    if (!day.isCurrentMonth) {
      return baseClasses + "text-gray-300 cursor-not-allowed";
    }
    
    // Si la date est dans le passé ou aujourd'hui, la désactiver
    if (isPastOrToday) {
      return baseClasses + "bg-gray-200 text-gray-400 border border-gray-300 cursor-not-allowed opacity-50";
    }
    
    // Ajouter les classes de hover et cursor seulement si la date n'est pas passée
    const interactiveClasses = "cursor-pointer hover:scale-110 ";
    
    let colorClasses = "";
    switch (status) {
      case 'available':
        colorClasses = "bg-green-100 text-green-800 border-2 border-green-400 hover:bg-green-200";
        break;
      case 'unavailable':
        colorClasses = "bg-red-100 text-red-800 border-2 border-red-400 hover:bg-red-200";
        break;
      case 'stop-sale':
        colorClasses = "bg-red-500 text-white border-2 border-red-600 hover:bg-red-600 animate-pulse shadow-lg shadow-red-500/80 ring-2 ring-red-400 ring-offset-1 font-bold";
        break;
      case 'push-sale':
        colorClasses = "bg-green-500 text-white border-2 border-green-600 hover:bg-green-600 shadow-lg shadow-green-500/80 ring-2 ring-green-400 ring-offset-1 font-bold";
        break;
      default:
        colorClasses = "bg-gray-100 text-gray-600 border border-gray-300 hover:bg-gray-200";
    }
    
    if (isSelected) {
      colorClasses += " ring-4 ring-blue-400 ring-offset-2";
    }
    
    if (isToday) {
      colorClasses += " font-bold";
    }
    
    return baseClasses + interactiveClasses + colorClasses;
  };

  return (
    <div className="relative">
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <TextInput
            type="text"
            value={formatDateForDisplay(value)}
            onChange={(e) => {
              const parsed = parseDateFromDisplay(e.target.value);
              // Valider la date avant de l'accepter
              if (parsed) {
                const dateObj = new Date(parsed + "T12:00:00");
                if (isDateInPastOrToday(dateObj)) {
                  toast.warning("Les activités ne peuvent pas être programmées avant demain.");
                  return;
                }
              }
              onChange(parsed);
            }}
            onFocus={() => activity && setShowCalendar(true)}
            placeholder="JJ/MM/AAAA"
            className="w-full"
          />
          {/* Masquer le picker natif en utilisant un input text au lieu de date */}
        </div>
        {activity && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setShowCalendar(!showCalendar);
            }}
            className="px-4 py-2 bg-blue-500 text-white rounded-xl hover:bg-blue-600 transition-colors font-semibold min-h-[44px] min-w-[44px] touch-manipulation"
            title="Ouvrir le calendrier avec disponibilités"
          >
            📅
          </button>
        )}
      </div>
      
      {showCalendar && activity && (
        <>
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setShowCalendar(false)}
          />
          <div className="absolute z-50 mt-2 bg-white rounded-xl shadow-2xl border-2 border-gray-200 p-3 md:p-4 w-[calc(100vw-2rem)] max-w-[320px] md:w-[320px]">
            <div className="flex items-center justify-between mb-4">
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  prevMonth();
                }}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors min-h-[44px] min-w-[44px] touch-manipulation"
              >
                ‹
              </button>
              <h3 className="text-lg font-bold text-gray-800">
                {monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}
              </h3>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  nextMonth();
                }}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors min-h-[44px] min-w-[44px] touch-manipulation"
              >
                ›
              </button>
            </div>
            
            <div className="grid grid-cols-7 gap-1 mb-2">
              {dayNames.map(day => (
                <div key={day} className="text-center text-xs font-semibold text-gray-600 py-1">
                  {day}
                </div>
              ))}
            </div>
            
            <div className="grid grid-cols-7 gap-1">
              {days.map((day, idx) => {
                const status = getDayStatus(day.date);
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (day.isCurrentMonth && !isDateInPastOrToday(day.date)) {
                        handleDateClick(day.date, e);
                      }
                    }}
                    className={getDayClassName(day, status) + " touch-manipulation"}
                    disabled={!day.isCurrentMonth || isDateInPastOrToday(day.date)}
                    style={{ minHeight: '44px', minWidth: '44px' }}
                    title={
                      !day.isCurrentMonth ? "" :
                      status === 'available' ? "Disponible" :
                      status === 'unavailable' ? "Non disponible" :
                      status === 'stop-sale' ? "STOP SALE" :
                      status === 'push-sale' ? "PUSH SALE" : ""
                    }
                  >
                    {day.date.getDate()}
                  </button>
                );
              })}
            </div>
            
            <div className="mt-4 pt-4 border-t border-gray-200 space-y-2 text-xs">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-green-100 border-2 border-green-400 rounded"></div>
                <span>Disponible</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-red-100 border-2 border-red-400 rounded"></div>
                <span>Non disponible</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-red-500 border-2 border-red-600 rounded animate-pulse shadow-md shadow-red-500/70 ring-1 ring-red-400"></div>
                <span className="font-bold text-red-600 uppercase tracking-wide">STOP SALE</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-green-500 border-2 border-green-600 rounded shadow-md shadow-green-500/70 ring-1 ring-green-400"></div>
                <span className="font-bold text-green-600 uppercase tracking-wide">PUSH SALE</span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

