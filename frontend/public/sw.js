// SARVYA Mobile PWA Network-First Service Worker
const CACHE_NAME = 'sarvya-cache-v1';
const PRECACHE_ASSETS = [
  '/',
  '/favicon.svg',
  '/manifest.webmanifest'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // STRICT BYPASS: Only intercept same-origin requests; never intercept cross-origin font/CDN/API requests
  if (url.origin !== self.location.origin) {
    return;
  }

  // STRICT BYPASS: Never intercept or cache API endpoints, Meta Webhooks, SSE streams, or dynamic uploads
  if (
    url.pathname.startsWith('/api') ||
    url.pathname.startsWith('/webhook') ||
    url.pathname.startsWith('/webhooks') ||
    url.pathname.startsWith('/uploads') ||
    url.pathname.startsWith('/flows') ||
    url.pathname.includes('/stream') ||
    url.pathname.includes('/events') ||
    event.request.method !== 'GET'
  ) {
    return;
  }

  // Network-first strategy for app navigation & static assets
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(async () => {
        const cachedResponse = await caches.match(event.request);
        if (cachedResponse) return cachedResponse;
        if (event.request.headers.get('accept')?.includes('text/html')) {
          const rootCached = await caches.match('/');
          if (rootCached) return rootCached;
        }
        return new Response('Offline or Network Error', {
          status: 503,
          statusText: 'Service Unavailable',
          headers: { 'Content-Type': 'text/plain' }
        });
      })
  );
});

