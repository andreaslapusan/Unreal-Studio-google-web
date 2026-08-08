/**
 * DemoPortal — /demo
 * Demo PÚBLICA del portal de cliente para PROSPECTOS (aún no clientes). Datos 100% ficticios.
 * Deja que el prospecto viva la experiencia (obra en vivo, pagos, recibo) ANTES de comprar.
 * Página aislada: no toca el portal real ni datos reales. Reutiliza el lenguaje visual de la marca.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getImageUrl } from '../lib/supabase';

// Número único de la web: +34 625710770 (Andreas 2026-08-09, quitado el +62).
const WA = 'https://wa.me/34625710770?text=' + encodeURIComponent('Hola, he visto la demo del portal y me interesa reservar una unidad en Unreal Studio.');

// Imágenes reales de marketing (proyecto Deseo) para que la demo se vea auténtica.
const HERO = 'projects/1773625025637-jazay02l7.webp';
const SHOTS = [
  'projects/1773625033241-uwo7i0ba3.webp',
  'projects/1773625037537-0uyptxsm5.webp',
  'projects/1773625041950-bzjfdfbuz.webp',
  'projects/1773625045719-w8o74ofs6.webp',
  'projects/1773625049985-c7h76dv34.webp',
];

const money = (n: number) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);

const UPDATES = [
  { date: '15 May 2026', title: 'Cimentación completada', progress: 20, shots: [SHOTS[0], SHOTS[1]], note: 'Estructura de cimientos y replanteo terminados. Obra iniciada en plazo.' },
  { date: '20 Jun 2026', title: 'Estructura planta baja', progress: 35, shots: [SHOTS[2]], note: 'Pilares y forjado de planta baja levantados.' },
  { date: '18 Jul 2026', title: 'Estructura primera planta', progress: 45, shots: [SHOTS[3], SHOTS[4]], note: 'Muros de la primera planta en curso. Avance según calendario.' },
];

const PAYMENTS = [
  { n: 1, label: 'Reserva', amount: 9250, due: '01 Mar 2026', paid: true },
  { n: 2, label: 'Firma de contrato (25%)', amount: 46250, due: '15 Abr 2026', paid: true },
  { n: 3, label: 'Inicio de obra (25%)', amount: 46250, due: '01 Ago 2026', paid: false },
  { n: 4, label: 'Estructura completada (25%)', amount: 46250, due: '15 Ene 2027', paid: false },
  { n: 5, label: 'Entrega (20%)', amount: 37000, due: '01 Jul 2027', paid: false },
];

const PROGRESS = 45;

function Bar({ pct }: { pct: number }) {
  return (
    <div className="h-2 w-full rounded-full bg-primary/10 overflow-hidden">
      <div className="h-full rounded-full bg-primary transition-all duration-700" style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function DemoPortal() {
  const [lightbox, setLightbox] = useState<string | null>(null);
  useEffect(() => {
    document.title = 'Demo del portal · Unreal Studio';
    // Oculta la demo del público: no indexar en buscadores (solo review interno por ahora).
    const m = document.createElement('meta');
    m.name = 'robots'; m.content = 'noindex, nofollow';
    document.head.appendChild(m);
    return () => { document.head.removeChild(m); };
  }, []);
  const paid = useMemo(() => PAYMENTS.filter(p => p.paid).reduce((s, p) => s + p.amount, 0), []);
  const total = useMemo(() => PAYMENTS.reduce((s, p) => s + p.amount, 0), []);

  return (
    <div className="min-h-screen bg-[#f7f3ee] text-[#2b2420]">
      {/* Aviso DEMO */}
      <div className="sticky top-0 z-40 bg-primary text-white text-center text-xs sm:text-sm font-bold py-2 px-4">
        DEMO · Datos de ejemplo. Así verás TU propiedad como cliente de Unreal.
      </div>

      {/* Cabecera */}
      <header className="max-w-4xl mx-auto px-5 pt-6 pb-2 flex items-center justify-between">
        <span className="font-serif text-lg sm:text-xl font-bold text-primary tracking-wide">Unreal Studio</span>
        <span className="text-[10px] uppercase tracking-widest text-primary/40 font-black border border-primary/20 rounded-full px-3 py-1">Portal cliente · Demo</span>
      </header>

      <main className="max-w-4xl mx-auto px-5 pb-28">
        {/* Hero villa */}
        <section className="mt-3 rounded-3xl overflow-hidden shadow-lg bg-white">
          <div className="relative h-56 sm:h-72">
            <img src={getImageUrl(HERO)} alt="Villa Deseo" className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
            <div className="absolute bottom-0 p-5 text-white">
              <span className="inline-block text-[10px] font-black uppercase tracking-widest bg-white/20 backdrop-blur rounded-full px-3 py-1 mb-2">En construcción</span>
              <h1 className="font-serif text-2xl sm:text-3xl leading-tight">Villa Deseo — Demo</h1>
              <p className="text-sm opacity-90 flex items-center gap-1 mt-1"><span className="material-symbols-outlined text-base leading-none">location_on</span>Melasti, Uluwatu · Bali</p>
            </div>
          </div>
          <div className="p-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-bold text-primary">Avance de obra</span>
              <span className="text-sm font-black text-primary">{PROGRESS}%</span>
            </div>
            <Bar pct={PROGRESS} />
            <div className="grid grid-cols-2 gap-3 mt-4 text-center">
              <div className="rounded-2xl bg-[#f7f3ee] py-3">
                <div className="text-[10px] uppercase tracking-widest text-primary/40 font-black">Entrega estimada</div>
                <div className="font-serif text-lg text-primary">Jul 2027</div>
              </div>
              <div className="rounded-2xl bg-[#f7f3ee] py-3">
                <div className="text-[10px] uppercase tracking-widest text-primary/40 font-black">Tipo</div>
                <div className="font-serif text-lg text-primary">Villa · 2 dorm.</div>
              </div>
            </div>
          </div>
        </section>

        {/* Obra en vivo */}
        <section className="mt-8">
          <h2 className="font-serif text-xl text-primary mb-1">Obra en vivo</h2>
          <p className="text-sm text-gray-500 mb-4">Fotos reales fechadas de tu construcción. Transparencia total, sin sorpresas.</p>
          <div className="space-y-4">
            {UPDATES.map((u, i) => (
              <article key={i} className="rounded-3xl bg-white shadow-sm p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="text-sm font-bold text-primary">{u.title}</div>
                    <div className="text-xs text-gray-400">{u.date}</div>
                  </div>
                  <span className="text-xs font-black text-primary bg-primary/5 rounded-full px-3 py-1">{u.progress}%</span>
                </div>
                <div className={`grid gap-2 ${u.shots.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                  {u.shots.map((s, j) => (
                    <button key={j} onClick={() => setLightbox(getImageUrl(s))} className="block rounded-2xl overflow-hidden aspect-[4/3] bg-gray-100">
                      <img src={getImageUrl(s)} alt={u.title} className="w-full h-full object-cover hover:scale-105 transition duration-500" loading="lazy" />
                    </button>
                  ))}
                </div>
                <p className="text-sm text-gray-500 mt-3">{u.note}</p>
              </article>
            ))}
          </div>
        </section>

        {/* Calendario de pagos */}
        <section className="mt-8">
          <h2 className="font-serif text-xl text-primary mb-1">Tu calendario de pagos</h2>
          <p className="text-sm text-gray-500 mb-4">Siempre sabes qué has pagado y qué falta. Cero letra pequeña.</p>
          <div className="rounded-3xl bg-white shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-primary/40 font-black">Pagado</div>
                <div className="font-serif text-xl text-primary">{money(paid)}</div>
              </div>
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-widest text-primary/40 font-black">Total</div>
                <div className="font-serif text-xl text-primary">{money(total)}</div>
              </div>
            </div>
            <Bar pct={Math.round((paid / total) * 100)} />
            <div className="mt-5 divide-y divide-gray-50">
              {PAYMENTS.map((p) => (
                <div key={p.n} className="py-3 flex items-center gap-3">
                  <span className={`material-symbols-outlined text-xl leading-none ${p.paid ? 'text-green-600' : 'text-gray-300'}`}>{p.paid ? 'check_circle' : 'schedule'}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-primary">{p.label}</div>
                    <div className="text-xs text-gray-400">Vence {p.due}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-black text-primary">{money(p.amount)}</div>
                    <div className={`text-[10px] font-black uppercase ${p.paid ? 'text-green-600' : 'text-gray-400'}`}>{p.paid ? 'Recibido' : 'Pendiente'}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Recibo */}
        <section className="mt-8">
          <h2 className="font-serif text-xl text-primary mb-1">Recibos al instante</h2>
          <p className="text-sm text-gray-500 mb-4">Cada pago genera su recibo oficial (kwitansi), descargable al momento.</p>
          <div className="rounded-3xl bg-white shadow-sm p-5 flex items-center gap-4">
            <div className="w-14 h-16 rounded-xl bg-primary/5 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-primary text-3xl">receipt_long</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold text-primary">Recibo DEMO-02 · Firma de contrato</div>
              <div className="text-xs text-gray-400">15 Abr 2026 · {money(46250)}</div>
            </div>
            <span className="text-xs font-black text-primary bg-primary/5 rounded-full px-3 py-2 whitespace-nowrap">PDF</span>
          </div>
        </section>

        {/* CTA */}
        <section className="mt-10 rounded-3xl bg-primary text-white p-7 text-center shadow-lg">
          <h2 className="font-serif text-2xl mb-2">Esto es lo que verás como propietario.</h2>
          <p className="text-sm opacity-90 mb-5">Obra en vivo, pagos claros y recibos al momento. Una empresa real detrás de cada villa.</p>
          <a href={WA} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 bg-white text-primary font-black rounded-full px-7 py-3.5 hover:bg-white/90 transition">
            <span className="material-symbols-outlined">chat</span> Reservar mi unidad
          </a>
          <div className="mt-4 text-xs opacity-70"><Link to="/proyectos" className="underline">Ver todos los proyectos</Link></div>
        </section>

        <p className="text-center text-[11px] text-gray-400 mt-8">Demo con datos de ejemplo · Unreal Studio</p>
      </main>

      {/* Lightbox */}
      {lightbox && (
        <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="" className="max-w-full max-h-full rounded-2xl" />
          <button className="absolute top-4 right-4 text-white" onClick={() => setLightbox(null)}><span className="material-symbols-outlined text-3xl">close</span></button>
        </div>
      )}
    </div>
  );
}
