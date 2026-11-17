/** Bloqueo de scroll del fondo para TODOS los pop-ups (fondo `fixed inset-0 bg-black/..`), sin tocar cada componente.
 * `overflow:hidden` en <body> no basta en iOS Safari/WKWebView (la app Capacitor): el gesto sigue moviendo la página.
 * Técnica fiable: body `position:fixed` con `top:-scrollY` mientras haya un pop-up visible, y restaurar el scroll al cerrar. */
const OVERLAY = '.fixed.inset-0[class*="bg-black/"]';

const visibleOverlay = (): boolean =>
  Array.from(document.querySelectorAll<HTMLElement>(OVERLAY)).some((el) => {
    if (!el.getClientRects().length) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.opacity !== '0' && cs.pointerEvents !== 'none';
  });

export function initModalScrollLock(): void {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return;
  const b = document.body.style;
  let lockedY: number | null = null;
  let queued = false;
  const sync = () => {
    queued = false;
    const open = visibleOverlay();
    if (open && lockedY === null) {
      lockedY = window.scrollY;
      Object.assign(b, { position: 'fixed', top: `-${lockedY}px`, left: '0', right: '0' });
      document.documentElement.classList.add('modal-open');
    } else if (!open && lockedY !== null) {
      const y = lockedY; lockedY = null;
      Object.assign(b, { position: '', top: '', left: '', right: '' });
      document.documentElement.classList.remove('modal-open');
      window.scrollTo(0, y);
    }
  };
  const schedule = () => { if (!queued) { queued = true; requestAnimationFrame(sync); } };
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });
}
