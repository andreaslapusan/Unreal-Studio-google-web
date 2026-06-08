import { useEffect } from 'react';

/**
 * Cierra un modal/overlay al pulsar Escape (accesibilidad — hallazgo de la
 * auditoría: los modales no se cerraban con teclado). Pásale el onClose y,
 * opcionalmente, si está activo (para no escuchar cuando el modal está cerrado).
 */
export function useEscapeKey(onClose: () => void, active = true): void {
  useEffect(() => {
    if (!active) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose, active]);
}
