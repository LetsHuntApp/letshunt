const CACHE_NAME = 'letshunt-v12';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './splash-logo-1024.png',
  './icon-192-v7.png',
  './icon-512-v7.png',
  './apple-touch-icon-v7.png',
  './push-icon-192.png',
  './push-badge-96.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE).catch((err) => {
        console.warn('Failed to pre-cache some assets during SW install:', err);
      });
    })
  );
  self.skipWaiting();
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

// Push notifications: LetsHunt currently schedules alerts locally from the app
// (see src/services/notificationService.ts). These handlers make the service
// worker ready for server-sent pushes if a push backend is added later.
self.addEventListener('push', (event) => {
  let title = 'LetsHunt';
  let body = 'A weather alert is brewing for your hunting grounds.';
  let url = './';
  let tag = 'letshunt-alert';
  try {
    if (event.data) {
      const data = event.data.json();
      title = data.title || title;
      body = data.body || body;
      url = data.url || url;
      tag = data.tag || tag;
    }
  } catch (err) {
    if (event.data) body = event.data.text() || body;
  }
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: './push-icon-192.png',
      badge: './push-badge-96.png',
      tag,
      data: { url },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || './';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if ('focus' in client) {
          client.focus();
          return;
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  // Page navigations are NETWORK-FIRST: the app shell (index.html) must always
  // come from the server so users never get stuck on a stale cached build
  // (e.g. missing the latest feature). Only offline falls back to cache.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache));
          }
          return networkResponse;
        })
        .catch(() =>
          caches.match('./index.html').then((cached) => cached || caches.match('./') || Response.error())
        )
    );
    return;
  }

  // Everything else (hashed assets, tiles, API JSON): stale-while-revalidate.
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Fetch background update for cache
        fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkResponse));
          }
        }).catch(() => {});
        return cachedResponse;
      }

      return fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && event.request.url.startsWith('http')) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache));
        }
        return networkResponse;
      });
    })
  );
});
