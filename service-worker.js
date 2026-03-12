// Bumped to v2 to force clear the old stubborn cache
const CACHE_NAME = 'elite-mamba-clippers-v2'; 

const ASSETS = [
  '/',
  '/index.html',
  '/styles.css',
  '/script.js',
  '/smm-script.js', 
  '/manifest.json'
];

// Install Service Worker
self.addEventListener('install', (e) => {
  self.skipWaiting(); // NEW: Forces the new service worker to activate immediately without waiting for the app to close
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
});

// Activate Event - cleanup old caches
self.addEventListener('activate', (e) => {
  e.waitUntil(clients.claim()); // NEW: Takes immediate control of the page
  e.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(keyList.map((key) => {
        if (key !== CACHE_NAME) {
          return caches.delete(key);
        }
      }));
    })
  );
});

// NEW Fetch Strategy: NETWORK FIRST, FALLBACK TO CACHE
self.addEventListener('fetch', (e) => {
  // We only want to handle GET requests
  if (e.request.method !== 'GET') return;

  e.respondWith(
    fetch(e.request)
      .then((networkResponse) => {
        // If the network request succeeds, save a fresh copy to the cache
        return caches.open(CACHE_NAME).then((cache) => {
          cache.put(e.request, networkResponse.clone());
          return networkResponse;
        });
      })
      .catch(() => {
        // If the network fails (user is offline), serve the cached version
        return caches.match(e.request);
      })
  );
});
