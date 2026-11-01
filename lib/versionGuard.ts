/**
 * Guard de versión — asegura que las apps PWA instaladas (sobre todo iOS, que
 * reanudan la página en memoria sin re-navegar) reciban SIEMPRE el último deploy.
 *
 * Cómo: compara la versión embebida en el bundle (APP_VERSION) con /version.json
 * (servido SIN caché por el service worker). Si difieren → hay un deploy nuevo →
 * actualiza el SW y recarga UNA vez (con guardia anti-bucle por versión). La
 * recarga dispara una navegación → el SW trae el index.html fresco → bundle nuevo.
 *
 * Esto es lo que evita el problema recurrente de "lo arreglé pero en el móvil
 * sigue viéndose viejo" (traducciones, etc.).
 */
import { APP_VERSION } from './version';

export function initVersionGuard(): void {
  if (typeof window === 'undefined') return;

  const check = async () => {
    try {
      const r = await fetch('/version.json', { cache: 'no-store' });
      if (!r.ok) return;
      const data = await r.json();
      const latest = data?.version;
      if (!latest || latest === APP_VERSION) return;
      const key = `unreal_reloaded_${latest}`;
      if (sessionStorage.getItem(key)) return; // ya recargamos para esta versión
      sessionStorage.setItem(key, '1');
      try {
        const reg = await navigator.serviceWorker?.getRegistration();
        await reg?.update();
      } catch { /* ignore */ }
      // Borra el shell HTML ('/') cacheado por el SW antes de recargar. En 4G lento
      // el SW servía el '/' viejo por su timeout de 3 s → la recarga volvía a cargar
      // el bundle antiguo y, como solo reintentamos 1 vez por versión, se quedaba
      // atascado en la versión vieja (menús Contactos/Raspberry desaparecidos). Al
      // borrarlo, la recarga no tiene fallback y espera la red → index.html fresco.
      try {
        const names = await caches.keys();
        await Promise.all(names.map((n) => caches.open(n).then((c) => c.delete('/')).catch(() => {})));
      } catch { /* ignore */ }
      window.location.reload();
    } catch { /* offline o sin red → no hacer nada */ }
  };

  // Al cargar y cada vez que la app vuelve a primer plano (reanudar PWA iOS).
  void check();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void check();
  });
}
