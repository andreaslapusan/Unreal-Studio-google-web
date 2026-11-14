/** Franja "Aparecemos en": logos de medios/perfiles donde sale Unreal Studio Bali (datos en public/featured/featured.json).
 *  Si un juego de logos cabe en el ancho → fila estática centrada (sin bucle: con <~8 medios en escritorio el
 *  marquee repetía Issuu dos veces a la vista). Si no cabe → marquee con copia duplicada, arrastrable
 *  (dedo en móvil, clic-y-arrastrar en escritorio), pausa al pasar el ratón y se reanuda al soltar. */
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

type Featured = { outlet: string; url: string; logo: string };
/** A = encima del buscador (escritorio) / bajo la tarjeta destacada (móvil) · B = banda al final del hero · C = tras la rejilla de proyectos */
export type FeaturedVariant = 'A' | 'B' | 'C';

const SPEED = 40; // px/s
const DRAG_THRESHOLD = 5; // px: por debajo es un clic en el logo, no un arrastre

const WRAP: Record<FeaturedVariant, string> = {
  A: 'px-6 md:px-12 -mt-12 md:-mt-16 pb-10 md:pb-12 max-w-7xl mx-auto',
  B: 'lg:col-span-2 w-full -mb-12 md:mb-0 bg-white/60 backdrop-blur-sm border border-primary/5 rounded-3xl md:rounded-[2rem] px-4 md:px-10 py-5 md:py-6 shadow-sm',
  C: 'px-6 md:px-12 pt-4 pb-12 md:pb-16 max-w-7xl mx-auto',
};

export default function FeaturedStrip({ variant = 'A' }: { variant?: FeaturedVariant }) {
  const { t } = useTranslation();
  const [items, setItems] = useState<Featured[]>([]);
  const [marquee, setMarquee] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const st = useRef({ x: 0, paused: false, down: false, dragging: false, startX: 0, startOffset: 0, moved: false });

  useEffect(() => {
    fetch('/featured/featured.json')
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setItems(Array.isArray(d) ? d.filter((x) => x?.outlet && /^https:\/\//.test(x.url) && x.logo) : []))
      .catch(() => setItems([]));
  }, []);

  // ¿Cabe un juego de logos? (los logos cargan tarde y cambian el ancho → ResizeObserver)
  useLayoutEffect(() => {
    const wrap = wrapRef.current, list = listRef.current;
    if (!wrap || !list) return;
    const check = () => setMarquee(list.scrollWidth > wrap.clientWidth + 1);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(wrap); ro.observe(list);
    return () => ro.disconnect();
  }, [items.length]);

  useEffect(() => {
    const track = trackRef.current, list = listRef.current;
    if (!marquee || !track || !list) { if (track) track.style.transform = ''; return; }
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const s = st.current;
    let raf = 0, last = performance.now();
    const tick = (now: number) => {
      const w = list.offsetWidth; // ancho de un juego (incluye el padding-right del bucle)
      if (!s.paused && !s.dragging && !reduce) s.x -= (SPEED * (now - last)) / 1000;
      last = now;
      if (w > 0) s.x = (((s.x % w) + w) % w) - w; // mantener en [-w, 0) → bucle sin salto
      track.style.transform = `translate3d(${s.x}px,0,0)`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [marquee]);

  if (items.length < 3) return null;

  const s = st.current;
  const onDown = (e: React.PointerEvent) => {
    if (!marquee || e.button > 0) return;
    Object.assign(s, { down: true, dragging: false, moved: false, startX: e.clientX, startOffset: s.x });
  };
  const onMove = (e: React.PointerEvent) => {
    if (!s.down) return;
    const dx = e.clientX - s.startX;
    if (!s.dragging && Math.abs(dx) > DRAG_THRESHOLD) {
      // capturar solo al superar el umbral: capturar antes desviaría el clic del enlace al contenedor
      s.dragging = s.moved = true;
      wrapRef.current?.setPointerCapture(e.pointerId);
    }
    if (s.dragging) s.x = s.startOffset + dx;
  };
  const onUp = () => { s.down = false; s.dragging = false; };
  const onClickCapture = (e: React.MouseEvent) => { if (s.moved) { e.preventDefault(); e.stopPropagation(); s.moved = false; } };

  const label = t('home.featuredIn');
  const list = (dup: boolean) => (
    <ul ref={dup ? undefined : listRef} className="featured-marquee__list" aria-hidden={dup || undefined}>
      {items.map((it) => (
        <li key={it.url}>
          <a href={it.url} target="_blank" rel="noopener noreferrer" tabIndex={dup ? -1 : undefined} title={it.outlet} draggable={false}>
            <img src={it.logo} alt={dup ? '' : it.outlet} loading="lazy" decoding="async" draggable={false} />
          </a>
        </li>
      ))}
    </ul>
  );

  return (
    <section aria-label={label} className={WRAP[variant]} data-featured-variant={variant}>
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary/40 mb-4 text-center">{label}</p>
      <div
        ref={wrapRef}
        className={`featured-marquee${marquee ? ' is-marquee' : ''}`}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onPointerEnter={(e) => { if (e.pointerType === 'mouse') s.paused = true; }}
        onPointerLeave={(e) => { if (e.pointerType === 'mouse') s.paused = false; }}
        onFocus={() => { s.paused = true; }}
        onBlur={() => { s.paused = false; }}
        onClickCapture={onClickCapture}
      >
        <div ref={trackRef} className="featured-marquee__track">
          {list(false)}
          {marquee && list(true)}
        </div>
      </div>
    </section>
  );
}
