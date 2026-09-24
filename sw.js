// Service worker: cache del app shell para uso offline y notificaciones del descanso.
const VERSION = 'v1.1.0';
const CACHE = `2sets-${VERSION}`;
const SHELL = [
  './', './index.html', './manifest.webmanifest',
  './css/tokens.css', './css/app.css',
  './js/app.js', './js/ui.js', './js/db.js', './js/model.js', './js/templates.js', './js/timer.js',
  './js/charts.js', './js/quotes.js', './js/setrow.js', './js/backfill.js',
  './js/screens/home.js', './js/screens/session.js', './js/screens/history.js', './js/screens/progress.js', './js/screens/settings.js',
  './assets/icons/icon.svg', './assets/icons/icon-192.png', './assets/icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    e.respondWith(caches.match(req, { ignoreSearch: true }).then((r) => r || fetch(req)));
    return;
  }
  // Fuentes y otros recursos externos: red primero, cache como respaldo.
  e.respondWith(
    fetch(req).then((r) => {
      const copy = r.clone();
      caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
      return r;
    }).catch(() => caches.match(req)),
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => (cs[0] ? cs[0].focus() : self.clients.openWindow('./'))));
});
