const CACHE_NAME = 'admirals-hockey-v1';
const CACHE_URLS = [
  '/index.html',
  '/manifest.json',
  '/assets/css/styles.css',
  '/assets/css/home-styles.css',
  '/assets/images/admiral-logo.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CACHE_URLS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => Promise.all(
      names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))
    ))
  );
  self.clients.claim();
});

// Network-first strategy: always try network, fall back to cache when offline.
// Firebase/Firestore API calls are explicitly excluded — they're dynamic, per-query
// data (not cacheable static assets), have their own sophisticated internal caching
// already, and wrapping every single one in an extra Cache Storage open+write adds
// real overhead on mobile devices with slower local storage I/O, especially when a
// page fires off many parallel Firestore requests at once.
const SKIP_CACHE_HOSTS = [
  'firestore.googleapis.com',
  'firebasestorage.googleapis.com',
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com',
  'firebaseinstallations.googleapis.com',
  'fcmregistrations.googleapis.com',
];

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (SKIP_CACHE_HOSTS.some((host) => url.hostname === host)) {
    // Let the browser handle these natively — no caching wrapper at all.
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone)).catch(() => {});
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
