// ViVuTraVinh Service Worker
// Version 2.7.0

const CACHE_NAME = 'vivutravinh-v2.7.0';
const APP_SHELL_URLS = [
  './',
  './index.html',
  './manifest.json',
  './js/config.js',
  './js/data.js',
  './js/festivals-data.js',
  './js/articles-data.js',
  './js/comments.js',
  './js/offline-sync.js',
  './js/ui.js',
  './js/app.js',
  './data/data-fallback.json',
  './data/data-fixture.json',
  './ao bà om.jpg',
  './biển ba động.jpg',
  './chùa hang.jpg',
  './chùa vamray.jpg',
  './chùa âng.jpg',
  './cù lao tân qui.jpg',
  './cồn chim.jpg',
  './nhà cổ huỳnh kỳ.jpg',
  './đền thờ Bác.jpg'
];

const OFFLINE_IMAGE = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect fill="#f1f5f9" width="400" height="300"/><text x="50%" y="50%" fill="#94a3b8" font-size="16" text-anchor="middle">Offline</text></svg>';

self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installing version 2.7.0...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL_URLS))
      .then(() => self.skipWaiting())
      .catch((error) => {
        console.error('[Service Worker] Installation failed:', error);
      })
  );
});

self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activating version 2.7.0...');
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => Promise.all(
        cacheNames
          .filter((cacheName) => cacheName.startsWith('vivutravinh-') && cacheName !== CACHE_NAME)
          .map((cacheName) => {
            console.log('[Service Worker] Deleting legacy cache:', cacheName);
            return caches.delete(cacheName);
          })
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (!event.request.url.startsWith('http')) return;

  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;
  const isScriptOrDoc = request.mode === 'navigate' || url.pathname.endsWith('.html') || (sameOrigin && url.pathname.endsWith('.js'));

  // Network-First cho HTML và JS modules: luôn nạp mã nguồn mới nhất khi có kết nối
  if (isScriptOrDoc) {
    try {
      const networkResponse = await fetch(request);
      if (networkResponse && networkResponse.status === 200) {
        const cache = await caches.open(CACHE_NAME);
        cache.put(request, networkResponse.clone());
      }
      return networkResponse;
    } catch (netErr) {
      console.warn('[Service Worker] Network-first fallback to cache for:', url.pathname);
      const cached = await caches.match(request);
      if (cached) return cached;
      if (request.mode === 'navigate') {
        const offlinePage = await caches.match('./index.html');
        if (offlinePage) return offlinePage;
      }
      throw netErr;
    }
  }

  // Cache-First cho tài nguyên tĩnh (ảnh, css, fonts, dữ liệu fallback json)
  const cachedResponse = await caches.match(request);
  if (cachedResponse) return cachedResponse;

  try {
    const networkResponse = await fetch(request);

    if (shouldCache(request, networkResponse)) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch (error) {
    console.error('[Service Worker] Fetch failed:', error);

    if (request.destination === 'image') {
      return new Response(OFFLINE_IMAGE, {
        headers: { 'Content-Type': 'image/svg+xml' }
      });
    }

    const offlinePage = await caches.match('./index.html');
    if (request.mode === 'navigate' && offlinePage) {
      return offlinePage;
    }

    return new Response('Offline', {
      status: 503,
      statusText: 'Service Unavailable',
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
}

function shouldCache(request, response) {
  if (!response || response.status !== 200) return false;

  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;
  const cacheableExtension = /\.(jpg|jpeg|png|gif|webp|svg|css|js|json)$/i.test(url.pathname);

  return sameOrigin && cacheableExtension;
}

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data && event.data.type === 'CLEAR_CACHE') {
    caches.delete(CACHE_NAME);
  }
});

// Background Sync API Handler
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-pending-reviews') {
    event.waitUntil(
      self.clients.matchAll({ includeUncontrolled: true, type: 'window' }).then((clients) => {
        clients.forEach((client) => {
          client.postMessage({ type: 'TRIGGER_OFFLINE_SYNC' });
        });
      })
    );
  }
});

console.log('[Service Worker] Loaded and ready');
