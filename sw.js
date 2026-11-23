// Never Twice service worker: offline app shell. Bump VERSION on every release, or phones keep the old copy.
const VERSION = '2026-11-23.1';
const SHELL = `nevertwice-shell-${VERSION}`;
const FILES = ['./', 'index.html', 'download.html', 'styles.css', 'app.js', 'manifest.json', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-512-maskable.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('nevertwice-shell-') && k !== SHELL).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
// Network first so updates arrive; cache when offline.
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(fetch(req).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(SHELL).then(c => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('index.html'))));
});
