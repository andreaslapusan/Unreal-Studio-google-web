/* Service worker de Unreal Studio (PWA).
 *
 * Estrategia equilibrada (rápido + fresco):
 *  - NAVEGACIÓN (HTML): network-first → el index.html siempre fresco (referencia
 *    los chunks con hash actuales). Offline → último shell cacheado.
 *  - ASSETS (JS/CSS con hash, imágenes, fuentes): cache-first + refresco en
 *    segundo plano. Los ficheros de Vite llevan hash inmutable, así que servirlos
 *    desde caché es seguro y MUY rápido (no se re-descarga el bundle en cada
 *    arranque de la app instalada). Un deploy nuevo = hash nuevo = se baja de red.
 *
 * NO usamos clients.claim() ni recargas automáticas: provocaban una doble carga
 * (negro → blanco → recarga) en cada arranque en iOS standalone.
 */
const CACHE = 'unreal-pwa-v4';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // cross-origin (Supabase, fonts) sin tocar

  // NAVEGACIONES (HTML): siempre red; offline → shell cacheado.
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

  // ASSETS: cache-first (instantáneo) + revalidación en segundo plano.
  event.respondWith((async () => {
    const cached = await caches.match(req);
    const network = fetch(req).then((res) => {
      if (res && res.status === 200 && res.type === 'basic') {
        caches.open(CACHE).then((c) => c.put(req, res.clone())).catch(() => {});
      }
      return res;
    }).catch(() => cached);
    return cached || network;
  })());
});
