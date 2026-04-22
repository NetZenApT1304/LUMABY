// Lumaby Baby Tracker — Service Worker
// Version: 1.0.0

const APP_VERSION = '1.0.2';
const CACHE_NAME = `lumaby-v${APP_VERSION}`;
const OFFLINE_URL = '/index.html';

// Files to cache for offline use
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/sw.js',
  'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;1,400&family=DM+Sans:wght@300;400;500&display=swap',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
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

self.addEventListener('fetch', event => {
  // Skip non-GET and browser extension requests
  if (event.request.method !== 'GET') return;
  if (!event.request.url.startsWith('http')) return;

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

  // For all other requests: cache-first strategy
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;

      // Not cached — fetch from network and cache it
      return fetch(event.request).then(response => {
        // Only cache valid responses
        if (!response || response.status !== 200 || response.type === 'opaque') {
          return response;
        }
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return response;
      }).catch(() => {
        // Return nothing gracefully for non-critical assets
        return new Response('', { status: 408, statusText: 'Offline' });
      });
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
