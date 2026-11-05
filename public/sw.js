/* Service worker de Unreal Studio (PWA).
 *
 * Estrategia (rápido + fresco, y AUTO-SANADO):
 *  - NAVEGACIÓN (HTML): network-first de verdad. Solo si la red FALLA (offline)
 *    se sirve el último shell cacheado. Antes hacíamos una carrera a 3 s que
 *    servía el '/' cacheado en redes lentas-pero-vivas → la app quedaba clavada
 *    en el index viejo, cuyo bundle con hash ya no existe en el servidor tras un
 *    deploy → 404 → pantalla "cargando" eterna. Eliminado: con red viva SIEMPRE
 *    se baja el HTML fresco (que referencia los chunks con hash actuales).
 *  - ASSETS (JS/CSS con hash, imágenes, fuentes): cache-first + refresco en
 *    segundo plano. Los ficheros de Vite llevan hash inmutable → caché seguro.
 *
 * AUTO-SANADO: al activarse una versión NUEVA de este SW (el navegador lo baja
 * siempre fresco, updateViaCache:'none') se BORRA toda la caché vieja y se recarga
 * cada pestaña abierta UNA vez. Así una app instalada atascada en un bundle muerto
 * se arregla sola al abrirla, sin que el usuario borre nada ni reinstale.
 */
const CACHE = 'unreal-pwa-v7';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Borra TODA caché previa (incl. bundles muertos que dejaban la app clavada).
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
    await self.clients.claim();
    // Solo si había caché vieja (= app potencialmente atascada en bundle muerto)
    // recargamos cada pestaña una vez. En la primera visita (sin caché) no se
    // recarga → sin doble carga para visitantes nuevos.
    if (keys.length) {
      const clients = await self.clients.matchAll({ type: 'window' });
      await Promise.all(clients.map((c) => c.navigate(c.url).catch(() => {})));
    }
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // cross-origin (Supabase, fonts) sin tocar

  // version.json: SIEMPRE de red, NUNCA cache → el guard de versión detecta deploys.
  if (url.pathname === '/version.json') {
    event.respondWith(fetch(req, { cache: 'no-store' }).catch(() => caches.match(req)));
    return;
  }

  // NAVEGACIONES (HTML): red primero; SOLO offline → shell cacheado.
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res && res.status === 200) {
          caches.open(CACHE).then((c) => c.put('/', res.clone())).catch(() => {});
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
