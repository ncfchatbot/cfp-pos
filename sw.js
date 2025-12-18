// sw.js - Optimized for SPA Reliability
const CACHE_NAME = 'coffee-please-pos-v1.2';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Network-First with strict Error Handling
self.addEventListener('fetch', (event) => {
  if (!event.request.url.startsWith(self.location.origin)) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // ONLY cache valid responses. 
        // 404s and errors should NEVER be cached to prevent persistent broken state.
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }

        const resClone = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, resClone);
        });
        return response;
      })
      .catch(() => {
        // If offline or network error, fallback to cache
        return caches.match(event.request).then(cachedResponse => {
           if (cachedResponse) return cachedResponse;
           // If it's a navigation request and we have no cache, return index.html
           if (event.request.mode === 'navigate') {
             return caches.match('/index.html');
           }
        });
      })
  );
});