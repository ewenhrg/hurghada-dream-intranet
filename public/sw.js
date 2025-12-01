// Service Worker pour PWA
const CACHE_NAME = 'hurghada-dream-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/logo.png',
  '/manifest.json'
];

// Installation du service worker
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Service Worker: Cache ouvert');
        return cache.addAll(urlsToCache);
      })
      .catch((err) => {
        console.error('Service Worker: Erreur lors de la mise en cache', err);
      })
  );
  // Forcer l'activation immédiate
  self.skipWaiting();
});

// Activation du service worker
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Service Worker: Suppression de l\'ancien cache', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  // Prendre le contrôle immédiatement
  return self.clients.claim();
});

// Stratégie de cache: Network First, puis Cache
self.addEventListener('fetch', (event) => {
  // Ne pas mettre en cache les requêtes Supabase et autres APIs externes
  if (
    event.request.url.includes('supabase.co') ||
    event.request.url.includes('googleapis.com') ||
    event.request.url.includes('gstatic.com') ||
    event.request.url.includes('whatsapp.com')
  ) {
    // Pour les APIs, utiliser network only
    event.respondWith(fetch(event.request));
    return;
  }

  // Pour les autres ressources, utiliser network first
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Vérifier si la réponse est valide
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }

        // Cloner la réponse pour la mettre en cache
        const responseToCache = response.clone();

        caches.open(CACHE_NAME)
          .then((cache) => {
            cache.put(event.request, responseToCache);
          });

        return response;
      })
      .catch(() => {
        // Si le réseau échoue, essayer le cache
        return caches.match(event.request)
          .then((response) => {
            if (response) {
              return response;
            }
            // Si pas dans le cache, retourner une page d'erreur pour les navigations
            if (event.request.mode === 'navigate') {
              return caches.match('/index.html');
            }
          });
      })
  );
});

// Gestion des messages depuis l'application
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

