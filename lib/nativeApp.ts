/** App nativa (Capacitor): las 4 apps cargan esta web EN VIVO. Solo se activa dentro de la app
 * (window.Capacitor lo inyecta la app antes que la web); en el navegador no hace nada.
 * Plugins nativos vía window.Capacitor.Plugins (sin dependencias npm). Autocomprobación: scripts/check-native-app.ts */
type Plugins = Record<string, any>;
const cap = (): { isNativePlatform?: () => boolean; getPlatform?: () => string; Plugins?: Plugins } | undefined => (window as any).Capacitor;

export const isNativeApp = (): boolean => cap()?.isNativePlatform?.() === true;

// Pop-up/menú a pantalla completa abierto, SOLO en la app (navegador y PWA: siempre false, sin tocar el DOM).
export const nativeOverlayOpen = (): boolean => isNativeApp() && !!document.querySelector('.fixed.inset-0');

// Color CSS (rgb/rgba) oscuro → iconos claros en la barra de estado. Exportado para scripts/check-native-app.ts.
export const isDarkColor = (c: string): boolean => {
  const [r, g, b] = (c.match(/[\d.]+/g) || []).map(Number);
  return r * 0.299 + g * 0.587 + b * 0.114 < 140;
};

// Fondo opaco del elemento en (x, y) o de sus padres (sin llegar a <body>/<html>); null si no hay.
const bgAt = (x: number, y: number): { color: string; pinned: boolean } | null => {
  let pinned = false;
  for (let e = document.elementFromPoint(x, y); e && e !== document.body && e !== document.documentElement; e = e.parentElement) {
    const cs = getComputedStyle(e);
    if (cs.position === 'fixed' || cs.position === 'sticky') pinned = true;
    const a = cs.backgroundColor.match(/[\d.]+/g);
    if (a && (a.length < 4 || Number(a[3]) >= 0.5)) {
      for (let p = e.parentElement; !pinned && p; p = p.parentElement) { const q = getComputedStyle(p).position; pinned = q === 'fixed' || q === 'sticky'; }
      return { color: cs.backgroundColor, pinned };
    }
  }
  return null;
};

// Pantalla completa: la franja de la barra de estado toma el color de la cabecera, el fondo del body el de la página
// (sin franjas crema al hacer rebote o al final) y los iconos de estado claros/oscuros según lo que haya detrás.
function syncSystemBars(P: Plugins): void {
  const root = document.documentElement;
  let style = '';
  const tick = () => {
    if (document.hidden) return;
    // Cabecera sticky de página: solo si se desplaza con la pantalla (sin overflow en sus padres); dentro de un
    // contenedor con overflow no se pega y moverla dejaría un hueco.
    document.querySelectorAll<HTMLElement>('.sticky.top-0:is(header, .z-30, .z-40)').forEach((el) => {
      let pin = true;
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) { const cs = getComputedStyle(p); if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') { pin = false; break; } }
      el.classList.toggle('native-pin', pin);
    });
    const sat = parseFloat(getComputedStyle(document.body).paddingTop) || 0;
    const x = innerWidth / 2;
    const head = bgAt(x, sat + 1);
    // Solo cabeceras fijas/sticky (o arriba del todo): el contenido que pasa por debajo no cambia el color.
    if (head && (head.pinned || scrollY < 4) && !nativeOverlayOpen()) root.style.setProperty('--native-bar', head.color);
    const page = nativeOverlayOpen() ? null : bgAt(1, innerHeight - (parseFloat(getComputedStyle(document.body).paddingBottom) || 0) - 2);
    // x=1: el fondo de la página (las tarjetas llevan margen lateral), no el de una tarjeta.
    if (page && !page.pinned) root.style.setProperty('--native-page', page.color);
    // Con un pop-up abierto manda su fondo (oscuro) sobre la barra.
    const shown = nativeOverlayOpen() ? (bgAt(x, sat + 1)?.color ?? '') : getComputedStyle(root).getPropertyValue('--native-bar').trim() || 'rgb(243,229,216)';
    const next = isDarkColor(shown) ? 'DARK' : 'LIGHT'; // DARK = iconos claros (fondo oscuro)
    if (next !== style) { style = next; void (P.SystemBars ? P.SystemBars.setStyle?.({ style }) : P.StatusBar?.setStyle?.({ style })); }
  };
  window.setInterval?.(tick, 400);
}

export function initNativeApp(): void {
  if (!isNativeApp()) return;
  const c = cap()!;
  const P: Plugins = c.Plugins || {};
  document.documentElement.classList.add('native-app');
  syncSystemBars(P);

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
