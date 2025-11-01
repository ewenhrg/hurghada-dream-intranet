import { useRef, useCallback } from 'react';

/**
 * Hook pour créer une fonction callback debouncée
 * @param {Function} callback - La fonction à debounce
 * @param {number} delay - Délai en millisecondes
 * @returns {Function} La fonction debouncée
 */
export function useDebouncedCallback(callback, delay = 300) {
  const timeoutRef = useRef(null);

  const debouncedCallback = useCallback(
    (...args) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        callback(...args);
      }, delay);
    },
    [callback, delay]
  );

  return debouncedCallback;
}

