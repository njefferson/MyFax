// Cache name carries the release triplet — bump it together with CHANGELOG.md.
const CACHE = 'fax-relay-1.0.0';
const SHELL = ['./', './index.html', './app.js', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-maskable.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Shell only. API calls always go to the network — a cached fax status is a lie.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.pathname.startsWith('/api/')) return;
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      if (res.ok && url.origin === self.location.origin) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
      }
      return res;
    }).catch(() => (e.request.mode === 'navigate' ? caches.match('./index.html') : Response.error())))
  );
});

// Wakes the page so it can drain its own IndexedDB queue.
self.addEventListener('sync', (e) => {
  if (e.tag !== 'drain-fax-queue') return;
  e.waitUntil(
    self.clients.matchAll({ includeUncontrolled: true }).then((clients) => {
      if (clients.length) return clients.forEach((c) => c.postMessage({ type: 'drain-queue' }));
      // Only if the user has granted notifications; the app never begs for them.
      if (self.Notification?.permission === 'granted') {
        return self.registration.showNotification('Fax Relay', {
          body: 'A queued fax is ready to send. Open the app to release it.',
          icon: './icon-192.png',
        });
      }
    })
  );
});
