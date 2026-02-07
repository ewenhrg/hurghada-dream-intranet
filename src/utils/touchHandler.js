/**
 * Utilitaire pour gérer les événements tactiles et souris de manière unifiée
 * Résout les problèmes de compatibilité entre PC tactiles et appareils mobiles
 */

/**
 * Détecte si l'appareil supporte le tactile
 */
export const isTouchDevice = () => {
  return (
    'ontouchstart' in window ||
    navigator.maxTouchPoints > 0 ||
    navigator.msMaxTouchPoints > 0
  );
};

/**
 * Détecte si l'appareil a un pointeur fin (souris) et un pointeur grossier (tactile)
 * C'est le cas des PC tactiles
 */
export const isHybridDevice = () => {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(pointer: fine)').matches && 
         (window.matchMedia('(pointer: coarse)').matches || isTouchDevice());
};

/**
 * Crée un gestionnaire d'événements qui fonctionne à la fois avec la souris et le tactile
 * Évite les doubles déclenchements sur les appareils hybrides
 */
export const createUnifiedHandler = (handler) => {
  let touchHandled = false;
  let mouseHandled = false;
  let touchTimeout = null;

  const handleTouch = (e) => {
    if (touchHandled) return;
    touchHandled = true;
    mouseHandled = false;
    
    // Empêcher le clic de souris qui suit le touch
    if (touchTimeout) clearTimeout(touchTimeout);
    touchTimeout = setTimeout(() => {
      touchHandled = false;
    }, 300);

    handler(e);
    
    // Empêcher le comportement par défaut si nécessaire
    if (e.cancelable) {
      e.preventDefault();
    }
  };

  const handleMouse = (e) => {
    // Sur un appareil hybride, ignorer les clics de souris qui suivent un touch
    if (touchHandled && isHybridDevice()) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    
    if (mouseHandled) return;
    mouseHandled = true;
    
    handler(e);
  };

  return {
    onTouchStart: handleTouch,
    onMouseDown: handleMouse,
    onClick: handleMouse,
  };
};

/**
 * Wrapper pour les boutons qui garantit le fonctionnement tactile
 * À utiliser dans les composants React pour obtenir les gestionnaires d'événements
 */
export const getTouchHandlers = (onClick) => {
  if (!onClick) return {};

  const unified = createUnifiedHandler(onClick);
  
  return {
    ...unified,
    // S'assurer que le tactile fonctionne même si onClick seul ne suffit pas
    onTouchEnd: (e) => {
      e.preventDefault();
      e.stopPropagation();
      onClick(e);
    },
  };
};
