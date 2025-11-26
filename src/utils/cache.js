// Système de cache simple pour optimiser les requêtes Supabase
class SimpleCache {
  constructor(defaultTTL = 5 * 60 * 1000) { // 5 minutes par défaut
    this.cache = new Map();
    this.defaultTTL = defaultTTL;
  }

  get(key) {
    const item = this.cache.get(key);
    if (!item) return null;
    
    if (Date.now() > item.expiry) {
      this.cache.delete(key);
      return null;
    }
    
    return item.value;
  }

  set(key, value, ttl = this.defaultTTL) {
    this.cache.set(key, {
      value,
      expiry: Date.now() + ttl
    });
  }

  delete(key) {
    this.cache.delete(key);
  }

  clear() {
    this.cache.clear();
  }

  // Invalider toutes les clés qui commencent par un préfixe
  invalidatePrefix(prefix) {
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }
  }
}

// Cache global pour l'application
export const appCache = new SimpleCache(5 * 60 * 1000); // 5 minutes

// Cache pour les activités (TTL plus long car elles changent rarement)
export const activitiesCache = new SimpleCache(10 * 60 * 1000); // 10 minutes

// Cache pour les stop sales et push sales (TTL court car ils changent souvent)
export const salesCache = new SimpleCache(2 * 60 * 1000); // 2 minutes

// Helper pour créer une clé de cache
export function createCacheKey(prefix, ...args) {
  return `${prefix}_${args.join('_')}`;
}

