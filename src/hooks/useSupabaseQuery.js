import { useState, useEffect, useCallback, useRef } from 'react';
import { activitiesCache, salesCache, appCache, createCacheKey } from '../utils/cache';

/**
 * Hook optimisé pour les requêtes Supabase avec cache
 * @param {Function} queryFn - Fonction qui retourne une promesse Supabase
 * @param {Array} dependencies - Dépendances pour recharger la requête
 * @param {Object} options - Options de cache
 * @returns {Object} { data, loading, error, refetch }
 */
export function useSupabaseQuery(queryFn, dependencies = [], options = {}) {
  const {
    cacheKey = null,
    cache = appCache,
    enabled = true,
    refetchInterval = null,
  } = options;

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const queryRef = useRef(null);
  const intervalRef = useRef(null);

  const fetchData = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    // Vérifier le cache si une clé est fournie
    if (cacheKey) {
      const cached = cache.get(cacheKey);
      if (cached) {
        setData(cached);
        setLoading(false);
        setError(null);
        return;
      }
    }

    setLoading(true);
    setError(null);

    try {
      const result = await queryFn();
      
      if (result.error) {
        setError(result.error);
        setData(null);
      } else {
        setData(result.data);
        // Mettre en cache si une clé est fournie
        if (cacheKey && result.data) {
          cache.set(cacheKey, result.data);
        }
      }
    } catch (err) {
      setError(err);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [queryFn, cacheKey, cache, enabled]);

  useEffect(() => {
    // Annuler la requête précédente si elle est en cours
    if (queryRef.current) {
      queryRef.current = null;
    }

    queryRef.current = true;
    fetchData();

    return () => {
      queryRef.current = null;
    };
  }, [fetchData, ...dependencies]);

  // Refetch interval
  useEffect(() => {
    if (refetchInterval && enabled) {
      intervalRef.current = setInterval(() => {
        fetchData();
      }, refetchInterval);

      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
        }
      };
    }
  }, [refetchInterval, enabled, fetchData]);

  const refetch = useCallback(() => {
    if (cacheKey) {
      cache.delete(cacheKey);
    }
    fetchData();
  }, [fetchData, cacheKey, cache]);

  return { data, loading, error, refetch };
}

