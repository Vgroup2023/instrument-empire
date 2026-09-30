// Minimal service worker: exists only to satisfy browsers' installability
// requirement (a registered service worker with a fetch handler) so the app
// can be added to the home screen on phones and tablets. It deliberately
// caches nothing — every request still goes straight to the network — since
// this app shows live financial data and a stale cached response would be
// actively wrong, not just inconvenient.
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
