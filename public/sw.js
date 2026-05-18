// QDQ — Service Worker
const CACHE = 'qdq-v4';

// Ressources à mettre en cache pour le mode hors-ligne
// Seuls les assets locaux sont mis en cache — les CDN cross-origin échouent à addAll
const ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
];

// Installation : mise en cache des ressources statiques
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(cache => {
      return cache.addAll(ASSETS).catch(() => {});
    })
  );
  self.skipWaiting();
});

// Activation : nettoyage des anciens caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch : cache-first pour les assets, network-first pour l'API Supabase
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Toujours aller chercher Supabase sur le réseau
  if (url.hostname.includes('supabase.co')) {
    return; // laisse passer sans interception
  }

  // Cache-first pour tout le reste
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (res && res.status === 200 && e.request.method === 'GET') {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(() => caches.match('/index.html'));
    })
  );
});
