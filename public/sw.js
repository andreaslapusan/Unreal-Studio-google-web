/* Service worker de Unreal Studio (PWA).
 *
 * Estrategia: la NAVEGACIÓN (documento HTML) y el código (JS/CSS) van SIEMPRE a
 * la red primero. NUNCA servimos un index.html cacheado salvo que el dispositivo
 * esté sin conexión — un shell HTML viejo apunta a chunks con hash que ya no
 * existen tras un deploy → la app guardada en pantalla de inicio (iOS standalone)
 * se queda en NEGRO y nunca carga. Solo cacheamos imágenes/fuentes para offline.
 *
 * El número de versión del caché se sube en cada cambio relevante: al activar,
 * se purga cualquier caché anterior (incluida una "envenenada" con HTML viejo).
 */
const CACHE = 'unreal-pwa-v3';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

// Permite forzar la activación inmediata desde la página (auto-update).
self.addEventListener('message', (e) => { if (e.data === 'SKIP_WAITING') self.skipWaiting(); });

function isAsset(url) {
  return /\.(png|jpe?g|webp|gif|svg|ico|woff2?|ttf|otf)$/i.test(url.pathname);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // cross-origin (Supabase, fonts) sin tocar

  // NAVEGACIONES (HTML): solo red; offline → último shell cacheado si existe.
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res && res.status === 200) {
          const cache = await caches.open(CACHE);
          cache.put('/', res.clone()).catch(() => {});
        }
        return res;
      } catch {
        return (await caches.match('/')) || Response.error();
      }
    })());
    return;
  }

  // CÓDIGO (JS/CSS, etc.): network-first SIN servir versiones cacheadas viejas
  // (evita el desajuste HTML-nuevo / chunk-viejo). Offline → falla y deja que la
  // app recargue (lazyWithReload) en cuanto haya red.
  if (!isAsset(url)) {
    event.respondWith(fetch(req).catch(() => caches.match(req).then((c) => c || Response.error())));
    return;
  }

  // ASSETS estáticos (imágenes/fuentes): cache-first para velocidad y offline.
  event.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    try {
      const res = await fetch(req);
      if (res && res.status === 200 && res.type === 'basic') {
        const cache = await caches.open(CACHE);
        cache.put(req, res.clone()).catch(() => {});
      }
      return res;
    } catch {
      return Response.error();
    }
  })());
});
