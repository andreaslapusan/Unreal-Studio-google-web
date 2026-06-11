/**
 * PullToRefresh — gesto "tirar para refrescar" SOLO en modo app instalada
 * (standalone). iOS, cuando la web está guardada en la pantalla de inicio, no
 * tiene el pull-to-refresh nativo del navegador, así que lo añadimos nosotros:
 * al arrastrar hacia abajo desde lo más arriba de la página, recarga.
 *
 * En el navegador normal NO se activa (ya existe el gesto nativo).
 */
import React, { useEffect, useRef, useState } from 'react';

const THRESHOLD = 70; // px de arrastre (con resistencia) para disparar recarga
const MAX = 110;

export default function PullToRefresh() {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);
  const active = useRef(false);
  const pullRef = useRef(0);

  useEffect(() => {
    const standalone =
      (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches) ||
      (navigator as unknown as { standalone?: boolean }).standalone === true;
    if (!standalone) return;

    const setP = (v: number) => { pullRef.current = v; setPull(v); };

    const onStart = (e: TouchEvent) => {
      if (window.scrollY > 0 || refreshing) { active.current = false; return; }
      startY.current = e.touches[0].clientY;
      active.current = true;
    };
    const onMove = (e: TouchEvent) => {
      if (!active.current || startY.current == null) return;
      const dy = e.touches[0].clientY - startY.current;
      if (dy <= 0) { setP(0); return; }
      setP(Math.min(MAX, dy * 0.5)); // resistencia
    };
    const onEnd = () => {
      if (active.current && pullRef.current >= THRESHOLD && !refreshing) {
        setRefreshing(true);
        setP(THRESHOLD);
        window.location.reload();
      } else {
        setP(0);
      }
      active.current = false;
      startY.current = null;
    };

    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onEnd, { passive: true });
    window.addEventListener('touchcancel', onEnd, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', onEnd);
    };
  }, [refreshing]);

  if (pull <= 0 && !refreshing) return null;
  const ready = pull >= THRESHOLD || refreshing;
  return (
    <div
      className="fixed left-0 right-0 top-0 z-[300] flex justify-center pointer-events-none"
      style={{ transform: `translateY(${Math.max(0, pull - 16)}px)`, transition: active.current ? 'none' : 'transform .2s ease' }}
    >
      <div className="mt-2 w-9 h-9 rounded-full bg-white shadow-md border border-primary/10 flex items-center justify-center">
        <span
          className={`material-symbols-outlined text-[20px] text-primary ${refreshing ? 'animate-spin' : ''}`}
          style={{ transform: refreshing ? undefined : `rotate(${Math.min(180, pull * 2)}deg)`, opacity: ready ? 1 : 0.5 }}
        >
          {refreshing ? 'progress_activity' : 'arrow_downward'}
        </span>
      </div>
    </div>
  );
}
