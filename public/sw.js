/* Service worker de Unreal Studio (PWA). Estrategia network-first: siempre
   intenta la red (para que la app se auto-actualice al desplegar), y cae a la
   caché solo si no hay conexión (offline). No toca peticiones cross-origin
   (Supabase, Google Fonts, etc.). */
const CACHE = 'unreal-pwa-v2';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // deja pasar cross-origin tal cual

  event.respondWith((async () => {
    try {
      const res = await fetch(req);
      // cachea copias de respuestas OK del propio sitio para el modo offline
      if (res && res.status === 200 && res.type === 'basic') {
        const cache = await caches.open(CACHE);
        cache.put(req, res.clone()).catch(() => {});
      }
      return res;
    } catch {
      const cached = await caches.match(req);
      if (cached) return cached;
      if (req.mode === 'navigate') {
        const idx = await caches.match('/');
        if (idx) return idx;
      }
      throw new Error('offline');
    }
  })());
});
