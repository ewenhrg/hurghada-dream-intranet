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
 * Évite les doubles déclenchements en gérant correctement les événements tactiles et souris
 */
export const getTouchHandlers = (onClick) => {
  if (!onClick) return {};

  // Utiliser un système de debounce global pour éviter les doubles déclenchements
  // Utiliser une Map pour stocker les timestamps par handler (au cas où plusieurs boutons)
  const handlerTimestamps = new WeakMap();
  const DEBOUNCE_TIME = 300; // 300ms pour éviter les doubles clics
  
  const createDebouncedHandler = (eventType) => {
    return (e) => {
      const now = Date.now();
      const lastTime = handlerTimestamps.get(onClick) || 0;
      
      // Si un événement a été déclenché récemment, ignorer
      if (now - lastTime < DEBOUNCE_TIME) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      
      handlerTimestamps.set(onClick, now);
      onClick(e);
    };
  };

  // Pour les appareils hybrides (PC tactiles), gérer à la fois touch et click
  if (isHybridDevice()) {
    let touchStarted = false;
    const touchHandler = createDebouncedHandler('touch');
    const clickHandler = createDebouncedHandler('click');
    
    return {
      onTouchStart: () => {
        touchStarted = true;
      },
      onTouchEnd: (e) => {
        if (touchStarted) {
          e.preventDefault();
          e.stopPropagation();
          touchHandler(e);
          // Réinitialiser après un court délai pour permettre le prochain clic
          setTimeout(() => {
            touchStarted = false;
          }, 350);
        }
      },
      onClick: (e) => {
        // Sur les appareils hybrides, si un touch vient de se produire, ignorer le click
        if (touchStarted) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        clickHandler(e);
      },
    };
  }
  
  // Pour les appareils tactiles uniquement (mobiles/tablettes)
  if (isTouchDevice()) {
    const touchHandler = createDebouncedHandler('touch');
    return {
      onTouchEnd: (e) => {
        e.preventDefault();
        e.stopPropagation();
        touchHandler(e);
      },
      onClick: (e) => {
        // Sur les appareils tactiles, onClick suit souvent onTouchEnd, l'ignorer complètement
        e.preventDefault();
        e.stopPropagation();
      },
    };
  }
  
  // Pour les appareils non-tactiles (PC avec souris uniquement)
  const clickHandler = createDebouncedHandler('click');
  return {
    onClick: clickHandler,
  };
};
