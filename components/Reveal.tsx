/**
 * Reveal — micro-animación de entrada al hacer scroll (fade + subida sutil),
 * al estilo de las webs de arquitectura top. Progressive enhancement:
 *  - La web es un SPA (necesita JS para pintar nada), así que esto NO afecta a
 *    SEO: el contenido siempre está en el DOM, solo transiciona visualmente.
 *  - Respeta `prefers-reduced-motion` (si el usuario lo pide, aparece directo).
 *  - IntersectionObserver: revela cuando entra en viewport y se desconecta.
 *  - `delay` permite escalonar (stagger) varios elementos por índice.
 */
import React, { useLayoutEffect, useRef, useState } from 'react';

interface RevealProps {
  children: React.ReactNode;
  className?: string;
  delay?: number; // ms
  /** HTML tag a renderizar (por defecto div). */
  as?: 'div' | 'li' | 'section';
}

const Reveal: React.FC<RevealProps> = ({ children, className = '', delay = 0, as = 'div' }) => {
  const ref = useRef<HTMLElement>(null);
  const [shown, setShown] = useState(false);

  // useLayoutEffect: corre ANTES del paint. Así, si el elemento ya está en
  // viewport al montar (contenido above-the-fold), lo mostramos YA — sin el
  // flash de opacity-0→fade que daba sensación de "las animaciones no cargan
  // bien" al entrar. Las animaciones de scroll se mantienen SOLO para lo que
  // está fuera de pantalla.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Respetar reduced-motion: aparecer directamente, sin animación.
    if (typeof window !== 'undefined' && window.matchMedia &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setShown(true);
      return;
    }
    // Ya visible al montar → mostrar inmediatamente (evita el parpadeo inicial).
    const rect = el.getBoundingClientRect();
    const vh = window.innerHeight || document.documentElement.clientHeight;
    if (rect.top < vh * 0.92 && rect.bottom > 0) { setShown(true); return; }
    if (typeof IntersectionObserver === 'undefined') { setShown(true); return; }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) { setShown(true); io.disconnect(); }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const Tag = as as any;
  return (
    <Tag
      ref={ref}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
      className={`transition-all duration-700 ease-out will-change-[opacity,transform] ${shown ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'} ${className}`}
    >
      {children}
    </Tag>
  );
};

export default Reveal;
