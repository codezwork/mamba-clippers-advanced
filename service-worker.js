// Change the version name completely to isolate the beta cache
const CACHE_NAME = 'elite-mamba-clippers'; 

const ASSETS = [
  '/',
  '/index.html',
  '/styles.css',
  '/script.js',
  '/smm-script.js', // Make sure to explicitly cache your new SMM script!
  '/manifest.json'
];

// Install Service Worker
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
});

// Activate Event - cleanup old caches
self.addEventListener('activate', (e) => {
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

// Fetch Request Strategy
self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((response) => {
      return response || fetch(e.request);
    })
  );
});