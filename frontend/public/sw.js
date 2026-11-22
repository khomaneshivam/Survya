// SARVYA Mobile PWA Network-First Service Worker
const CACHE_NAME = 'sarvya-cache-v2';
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

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING' || event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
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

  // 1. Static hashed assets (/assets/): Network first, fall back to matching asset cache; NEVER return HTML on 404
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200 && response.type === 'basic') {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(event.request);
          if (cached) return cached;
          return new Response('Asset not found or network offline', {
            status: 404,
            statusText: 'Not Found',
            headers: { 'Content-Type': 'text/plain' }
          });
        })
    );
    return;
  }

  // 2. HTML navigation requests: Always fetch fresh from network with no-cache so latest build hashes are retrieved
  if (event.request.mode === 'navigate' || event.request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(event.request, { cache: 'no-cache' })
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
          const cachedResponse = await caches.match(event.request) || await caches.match('/');
          if (cachedResponse) return cachedResponse;
          return new Response('Offline or Network Error', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: { 'Content-Type': 'text/plain' }
          });
        })
    );
    return;
  }

  // 3. General static files (favicon, manifest, etc.)
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
        return new Response('Offline or Network Error', {
          status: 503,
          statusText: 'Service Unavailable',
          headers: { 'Content-Type': 'text/plain' }
        });
      })
  );
});
