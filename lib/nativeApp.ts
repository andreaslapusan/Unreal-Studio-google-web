/** App nativa (Capacitor): las 4 apps cargan esta web EN VIVO. Solo se activa dentro de la app
 * (window.Capacitor lo inyecta la app antes que la web); en el navegador no hace nada.
 * Plugins nativos vía window.Capacitor.Plugins (sin dependencias npm). Autocomprobación: scripts/check-native-app.ts */
type Plugins = Record<string, any>;
const cap = (): { isNativePlatform?: () => boolean; getPlatform?: () => string; Plugins?: Plugins } | undefined => (window as any).Capacitor;

export const isNativeApp = (): boolean => cap()?.isNativePlatform?.() === true;

export function initNativeApp(): void {
  if (!isNativeApp()) return;
  const c = cap()!;
  const P: Plugins = c.Plugins || {};
  document.documentElement.classList.add('native-app');

  // iOS: sin zoom al enfocar campos de <16px (login/admin usan 14px). Pellizcar ya lo desactiva Capacitor.
  const vp = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  if (c.getPlatform?.() === 'ios' && vp && !vp.content.includes('maximum-scale')) vp.content += ', maximum-scale=1';

  // Android, Atrás: cierra el pop-up/menú abierto (su X o el fondo) → si no, atrás en el historial (?view=)
  // → en la raíz del portal la app pasa a segundo plano (por defecto Capacitor no hacía nada).
  P.App?.addListener?.('backButton', ({ canGoBack }: { canGoBack: boolean }) => {
    const overlay = [...document.querySelectorAll<HTMLElement>('.fixed.inset-0')]
      .filter((el) => el.getClientRects().length > 0 && getComputedStyle(el).pointerEvents !== 'none')
      .pop();
    if (overlay) {
      const x = [...overlay.querySelectorAll<HTMLElement>('button')].find((b) =>
        b.querySelector('.material-symbols-outlined')?.textContent?.trim() === 'close'
        || /close|cerrar|închide|tutup/i.test(b.getAttribute('aria-label') || ''));
      (x || overlay).click();
    } else if (canGoBack) window.history.back();
    else void P.App.minimizeApp?.();
  });

  // Vibración ligera (plugin Haptics; sin él no hace nada) en casillas, envíos y selector de idioma. Máx. 1 cada 120 ms.
  let last = 0;
  const tick = () => { const now = Date.now(); if (now - last > 120) { last = now; void P.Haptics?.impact?.({ style: 'LIGHT' }); } };
  document.addEventListener('change', (e) => { if ((e.target as Element).matches?.('input[type="checkbox"], input[type="radio"]')) tick(); }, true);
  document.addEventListener('click', (e) => { if ((e.target as Element).closest?.('button[type="submit"], [aria-label="Language switcher"] button')) tick(); }, true);
}
