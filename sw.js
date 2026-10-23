// Service worker aplikace VVJŘ PID.
// Stránku a ikony bere vždy nejdřív z internetu (aby se nová verze projevila hned),
// bez signálu použije uloženou kopii. Data (turnusy, GTFS, Golemio) neukládá – ty řeší aplikace sama.
const CACHE = 'vvjr-v3';
const VLASTNI = 'vvjr-vlastni';   // verze aplikace nahraná ručně v aplikaci (Nastavení → Nahrát novou verzi)
const SOUBORY = ['./vvjr.html', './manifest.webmanifest', './icon-192.png', './icon-512.png',
  './icon-maskable-512.png', './apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SOUBORY)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((k) => Promise.all(k.filter((n) => n !== CACHE && n !== VLASTNI).map((n) => caches.delete(n))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;   // cizí weby (GitHub, PID, Golemio) neřešit
  if (url.pathname.endsWith('.json')) return;                                  // turnusy.json apod. vždy živě
  // stránka aplikace: přednost má ručně nahraná verze (?puvodni=1 ji obejde, kdyby nahraná nefungovala)
  const jeStranka = e.request.mode === 'navigate' || url.pathname.endsWith('/vvjr.html');
  if (jeStranka && !url.searchParams.has('puvodni') && !url.searchParams.has('kontrola')) {
    e.respondWith(caches.open(VLASTNI).then((c) => c.match('vlastni.html')).then((r) => r || sit(e.request)));
    return;
  }
  e.respondWith(sit(e.request));
});

function sit(req) {
  return (
    fetch(req).then((r) => {
      if (r.ok) { const kopie = r.clone(); caches.open(CACHE).then((c) => c.put(req, kopie)); }
      return r;
    }).catch(() => caches.match(req, { ignoreSearch: true, cacheName: CACHE })
      .then((r) => r || (req.mode === 'navigate' ? caches.match('./vvjr.html', { cacheName: CACHE }) : undefined)))
  );
}
