import { useState } from "react";

/**
 * Composant Accordion réutilisable pour créer des sections collapsibles
 * Style inspiré d'Airbnb et Stripe
 */
export function Accordion({ 
  title, 
  icon, 
  children, 
  defaultOpen = false, 
  onToggle,
  className = "",
  headerClassName = "",
  contentClassName = ""
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  const handleToggle = () => {
    const newState = !isOpen;
    setIsOpen(newState);
    if (onToggle) {
      onToggle(newState);
    }
  };

  return (
    <div className={`bg-white rounded-xl border border-slate-200/80 shadow-sm hover:shadow-md transition-all duration-300 ${className}`}>
      <button
        type="button"
        onClick={handleToggle}
        className={`w-full flex items-center justify-between p-5 md:p-6 text-left hover:bg-slate-50/50 transition-colors duration-200 rounded-t-xl ${isOpen ? 'rounded-b-none' : 'rounded-b-xl'} ${headerClassName}`}
      >
        <div className="flex items-center gap-3 md:gap-4">
          {icon && (
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-sm flex-shrink-0">
              <span className="text-xl">{icon}</span>
            </div>
          )}
          <div>
            <h2 className="text-lg md:text-xl font-bold text-slate-900">{title}</h2>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <svg
            className={`w-5 h-5 text-slate-500 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>
      {isOpen && (
        <div className={`border-t border-slate-200/80 ${contentClassName}`}>
          <div className="p-5 md:p-6 animate-fade-in">
            {children}
          </div>
        </div>
      )}
    </div>
  );
}

