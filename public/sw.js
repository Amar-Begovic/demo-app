// Service worker scoped to /m/ — enables PWA install for scanner only
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((key) => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

// Pass through all fetch requests — no caching
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
