// ViVuTraVinh Service Worker
// Version 2.9.0 - Partitioned Caches & Atomic Precache

const VERSION = '2.9.0';
const CACHE_SHELL = `vivutravinh-shell-v${VERSION}`;
const CACHE_DATA = `vivutravinh-data-v${VERSION}`;
const CACHE_IMAGES = `vivutravinh-images-v${VERSION}`;
const CURRENT_CACHES = [CACHE_SHELL, CACHE_DATA, CACHE_IMAGES];

const MAX_IMAGE_ENTRIES = 30;

const APP_SHELL_URLS = [
  './',
  './index.html',
  './manifest.json',
  './css/tailwind.css',
  './vendor/leaflet/leaflet.css',
  './vendor/leaflet/leaflet.js',
  './vendor/leaflet/images/marker-icon.png',
  './vendor/leaflet/images/marker-shadow.png',
  './vendor/fonts/material-symbols.css',
  './vendor/fonts/material-symbols-outlined.woff2',
  './icons/icon.svg',
  './icons/favicon-32x32.png',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png',
  './js/config.js',
  './js/data.js',
  './js/festivals-data.js',
  './js/articles-data.js',
  './js/comments.js',
  './js/offline-sync.js',
  './js/telemetry.js',
  './js/ui.js',
  './js/app.js'
];

const DATA_URLS = [
  './data/data-fallback.json',
  './data/data-fixture.json'
];

const OFFLINE_IMAGE = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect fill="#f1f5f9" width="400" height="300"/><text x="50%" y="50%" fill="#94a3b8" font-size="16" text-anchor="middle">Offline</text></svg>';

self.addEventListener('install', (event) => {
  console.log(`[Service Worker] Installing version ${VERSION} (Atomic Precache)...`);
  // PRECACHE NGUYÊN TỬ: KHÔNG nuốt lỗi.
  // Nếu bất kỳ URL nào trả về 404 hoặc lỗi mạng, Promise bị reject,
  // worker mới KHÔNG activate, worker cũ và cache cũ tiếp tục chạy an toàn.
  event.waitUntil(
    Promise.all([
      caches.open(CACHE_SHELL).then((cache) => cache.addAll(APP_SHELL_URLS)),
      caches.open(CACHE_DATA).then((cache) => cache.addAll(DATA_URLS))
    ])
  );
});

self.addEventListener('activate', (event) => {
  console.log(`[Service Worker] Activating version ${VERSION}...`);
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => Promise.all(
        cacheNames
          .filter((name) => name.startsWith('vivutravinh-') && !CURRENT_CACHES.includes(name))
          .map((name) => {
            console.log('[Service Worker] Deleting legacy cache:', name);
            return caches.delete(name);
          })
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (!event.request.url.startsWith('http')) return;

  const url = new URL(event.request.url);

  // 1. TUYỆT ĐỐI KHÔNG CACHE CÁC ENDPOINT API: comments, admin, import, Supabase REST
  const isApiRequest = url.pathname.startsWith('/api/') || 
                       url.pathname.includes('/rest/v1/') || 
                       url.hostname.includes('supabase.co');
  if (isApiRequest) {
    return; // Pass through trực tiếp, không can thiệp cache
  }

  event.respondWith(handlePartitionedRequest(event.request));
});

async function handlePartitionedRequest(request) {
  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;
  const isScriptOrDoc = request.mode === 'navigate' || url.pathname.endsWith('.html') || (sameOrigin && url.pathname.endsWith('.js'));
  const isDataRequest = url.pathname.endsWith('.json');
  const isImageRequest = request.destination === 'image' || /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(url.pathname);

  // A. Phân vùng App Shell (HTML & JS modules): Network-First
  if (isScriptOrDoc) {
    try {
      const networkResponse = await fetch(request);
      if (networkResponse && networkResponse.status === 200) {
        const cache = await caches.open(CACHE_SHELL);
        cache.put(request, networkResponse.clone());
      }
      return networkResponse;
    } catch (netErr) {
      console.warn('[Service Worker] Shell fallback to cache for:', url.pathname);
      const cached = await caches.match(request, { ignoreSearch: true });
      if (cached) return cached;
      if (request.mode === 'navigate') {
        const offlinePage = await caches.match('./index.html');
        if (offlinePage) return offlinePage;
      }
      throw netErr;
    }
  }

  // B. Phân vùng Public Data (JSON): Versioned Snapshot Cache (Cache-First, làm mới khi nâng phiên bản Service Worker)
  if (isDataRequest) {
    const dataCache = await caches.open(CACHE_DATA);
    const cached = await dataCache.match(request, { ignoreSearch: true });
    if (cached) return cached;

    try {
      const networkResponse = await fetch(request);
      if (networkResponse && networkResponse.status === 200) {
        dataCache.put(request, networkResponse.clone());
      }
      return networkResponse;
    } catch (err) {
      if (cached) return cached;
      throw err;
    }
  }

  // C. Phân vùng Images (Ảnh chụp JPG/PNG): Runtime Cache có giới hạn FIFO tối đa 30 entries
  if (isImageRequest) {
    const imgCache = await caches.open(CACHE_IMAGES);
    const cached = await imgCache.match(request);
    if (cached) return cached;

    try {
      const networkResponse = await fetch(request);
      if (networkResponse && networkResponse.status === 200) {
        imgCache.put(request, networkResponse.clone());
        limitCacheEntries(CACHE_IMAGES, MAX_IMAGE_ENTRIES);
      }
      return networkResponse;
    } catch (err) {
      return new Response(OFFLINE_IMAGE, {
        headers: { 'Content-Type': 'image/svg+xml' }
      });
    }
  }

  // D. Tài nguyên tĩnh khác (CSS, font, vendor): Cache-First trong SHELL_CACHE
  const shellCache = await caches.open(CACHE_SHELL);
  const cached = await shellCache.match(request, { ignoreSearch: true });
  if (cached) return cached;

  try {
    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.status === 200 && sameOrigin) {
      shellCache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (err) {
    return new Response('Offline', {
      status: 503,
      statusText: 'Service Unavailable',
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
}

async function limitCacheEntries(cacheName, maxEntries) {
  try {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    if (keys.length > maxEntries) {
      const toDelete = keys.slice(0, keys.length - maxEntries);
      await Promise.all(toDelete.map((k) => cache.delete(k)));
    }
  } catch (e) {
    console.warn('[Service Worker] Lỗi giới hạn cache entries:', e);
  }
}

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('[Service Worker] Nhận lệnh SKIP_WAITING an toàn từ người dùng.');
    self.skipWaiting();
  }

  if (event.data && event.data.type === 'CLEAR_CACHE') {
    caches.delete(CACHE_SHELL);
    caches.delete(CACHE_DATA);
    caches.delete(CACHE_IMAGES);
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

console.log(`[Service Worker] Loaded and ready (v${VERSION})`);
