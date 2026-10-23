// Service worker aplikace VVJŘ PID.
// Stránku a ikony bere vždy nejdřív z internetu (aby se nová verze projevila hned),
// bez signálu použije uloženou kopii. Data (turnusy, GTFS, Golemio) neukládá – ty řeší aplikace sama.
const CACHE = 'vvjr-v1';
const SOUBORY = ['./vvjr.html', './manifest.webmanifest', './icon-192.png', './icon-512.png',
  './icon-maskable-512.png', './apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SOUBORY)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((k) => Promise.all(k.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;   // cizí weby (GitHub, PID, Golemio) neřešit
  if (url.pathname.endsWith('.json')) return;                                  // turnusy.json apod. vždy živě
  e.respondWith(
    fetch(e.request).then((r) => {
      if (r.ok) { const kopie = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, kopie)); }
      return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: true })
      .then((r) => r || (e.request.mode === 'navigate' ? caches.match('./vvjr.html') : undefined)))
  );
});
