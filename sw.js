// Lumaby Baby Tracker — Service Worker
// Bump APP_VERSION on every deploy that changes precached files so old
// caches are deleted on activate.

const APP_VERSION = '1.0.4';
const CACHE_NAME = `lumaby-v${APP_VERSION}`;
const OFFLINE_URL = '/index.html';

// Files to cache for offline use
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;1,400&family=DM+Sans:wght@300;400;500&display=swap',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4',
];

// ── Install: pre-cache core files ──
self.addEventListener('install', event => {
  console.log('[Lumaby SW] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[Lumaby SW] Pre-caching files');
      // Cache what we can, don't fail on font errors
      return Promise.allSettled(
        PRECACHE_URLS.map(url => cache.add(url).catch(e => console.warn('[Lumaby SW] Failed to cache:', url, e)))
      );
    }).then(() => self.skipWaiting())
  );
});

// ── Activate: clean old caches ──
self.addEventListener('activate', event => {
  console.log('[Lumaby SW] Activating...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => {
            console.log('[Lumaby SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    }).then(() => self.clients.claim())
  );
});

// ── Fetch: serve from cache, fall back to network ──
// Helper: check if request is to a CDN (opaque responses)
function isCDNRequest(url) {
  return url.includes('cdn.jsdelivr.net') ||
         url.includes('fonts.googleapis.com') ||
         url.includes('fonts.gstatic.com');
}

// Only cache successful, non-opaque responses. Netlify's SPA fallback answers
// missing files with index.html and a 200, so an HTML body for a non-navigation
// request (an image, script, etc.) is a missing file, not the asset.
function isCacheable(response) {
  if (!response || response.status !== 200 || response.type === 'opaque') return false;
  const type = response.headers.get('content-type') || '';
  return !type.includes('text/html');
}

self.addEventListener('fetch', event => {
  // Skip non-GET and browser extension requests
  if (event.request.method !== 'GET') return;
  if (!event.request.url.startsWith('http')) return;

  // Only handle the app's own static files and the font/library CDNs.
  // Everything else (Supabase database and auth, Netlify functions, Lemon
  // Squeezy) must always go to the network: caching it served stale data,
  // e.g. an old "no subscription" answer after someone had paid.
  const url = new URL(event.request.url);
  const sameOrigin = url.origin === self.location.origin;
  if (sameOrigin && url.pathname.startsWith('/.netlify/')) return;
  if (!sameOrigin && !isCDNRequest(event.request.url)) return;

  // For navigation requests (HTML pages), use network-first
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // Cache the fresh page
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        })
        .catch(() => {
          // Offline: serve cached page
          return caches.match(OFFLINE_URL);
        })
    );
    return;
  }

  // For all other requests: stale-while-revalidate. Serve the cached copy
  // straight away, and refresh the cache from the network in the background
  // so changed assets are picked up on the next load.
  event.respondWith(
    caches.match(event.request).then(cached => {
      const network = fetch(event.request).then(response => {
        if (isCacheable(response)) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => cached || new Response('', { status: 408, statusText: 'Offline' }));

      if (cached) {
        event.waitUntil(network.catch(() => {}));
        return cached;
      }
      return network;
    })
  );
});

// ── Background Sync: save logs when offline ──
self.addEventListener('sync', event => {
  if (event.tag === 'sync-logs') {
    console.log('[Lumaby SW] Background sync: logs');
    // When you add a backend, sync queued offline logs here
  }
});

// ── Push Notifications ──
self.addEventListener('push', event => {
  if (!event.data) return;

  const data = event.data.json();
  const options = {
    body: data.body || 'Time to check on baby 🌸',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-72.png',
    vibrate: [100, 50, 100],
    data: { url: data.url || '/' },
    actions: [
      { action: 'log', title: '📝 Log now' },
      { action: 'dismiss', title: 'Dismiss' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'Lumaby', options)
  );
});

// Handle notification clicks
self.addEventListener('notificationclick', event => {
  event.notification.close();

  if (event.action === 'log') {
    event.waitUntil(
      clients.openWindow(event.notification.data.url || '/')
    );
  }
});
