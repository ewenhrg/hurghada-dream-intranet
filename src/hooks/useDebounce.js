import { useState, useEffect } from 'react';

/**
 * Hook pour debounce une valeur
 * @param {any} value - La valeur à debounce
 * @param {number} delay - Délai en millisecondes
 * @returns {any} La valeur debouncée
 */
export function useDebounce(value, delay = 300) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

