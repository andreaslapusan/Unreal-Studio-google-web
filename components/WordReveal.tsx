/**
 * WordReveal — frase manifiesto que se "entinta" palabra a palabra al cruzar
 * la línea media del viewport (IntersectionObserver por palabra, sin listener
 * de scroll). Con reduced-motion o sin IO, el texto aparece entero.
 */
import React, { useEffect, useRef } from 'react';

interface Props { text: string; className?: string; mutedClass?: string; as?: 'p' | 'h2' }

const WordReveal: React.FC<Props> = ({ text, className = '', mutedClass = 'opacity-25', as = 'p' }) => {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const words = Array.from(root.querySelectorAll<HTMLElement>('[data-w]'));
    const on = (el: HTMLElement) => el.classList.remove(...mutedClass.split(' '));
    if (typeof IntersectionObserver === 'undefined' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      words.forEach(on); return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { on(e.target as HTMLElement); io.unobserve(e.target as Element); } });
    }, { rootMargin: '0px 0px -38% 0px', threshold: 1 });
    words.forEach((w) => io.observe(w));
    return () => io.disconnect();
  }, [text, mutedClass]);
  const Tag = as as any;
  return (
    <Tag ref={ref} className={className}>
      {text.split(/\s+/).filter(Boolean).map((w, i) => (
        <React.Fragment key={i}><span data-w className={`us-word inline-block ${mutedClass}`}>{w}</span>{' '}</React.Fragment>
      ))}
    </Tag>
  );
};

export default WordReveal;
