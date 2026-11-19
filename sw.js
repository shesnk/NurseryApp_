/* Service worker pembungkus Nursery App.
 * Menyimpan cangkang pembungkus + formulir "Catat tanpa sinyal" (file di repository ini) agar bisa dibuka tanpa sinyal.
 * Aplikasi Apps Script (script.google.com / googleusercontent.com) TIDAK PERNAH disentuh/di-cache, sehingga selalu versi terbaru.
 * Bila file pembungkus diubah, naikkan VERSI agar perangkat memperbarui diri. */
const VERSI = 'nurseryapp-pwa-v4';
const CANGKANG = ['./', './index.html', './offline.js', './offline.css', './alamat.js', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-maskable-512.png', './apple-touch-icon.png', './favicon-32.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSI).then(c => c.addAll(CANGKANG)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSI).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
/* Jaringan dulu (selalu versi terbaru bila ada sinyal), cadangan dari cache saat tanpa sinyal. */
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;   // Apps Script & domain lain: dibiarkan ke jaringan
  const kunci = req.mode === 'navigate' ? './index.html' : req;
  e.respondWith(fetch(req).then(res => {
    if (res.ok) { const salin = res.clone(); caches.open(VERSI).then(c => c.put(kunci, salin)); }
    return res;
  }).catch(() => caches.match(kunci, { ignoreSearch: true }).then(r => r || caches.match('./'))));
});
