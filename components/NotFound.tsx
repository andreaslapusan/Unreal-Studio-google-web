import React from 'react';
import { useTranslation } from 'react-i18next';

// Pantalla 404 editorial (marca Unreal). Texto traducido (4 idiomas).
export default function NotFound() {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-almond px-6 text-center relative overflow-hidden">
      {/* Líneas arquitectónicas sutiles de fondo (line-art, muy tenue) */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-[0.05]">
        <div className="absolute top-0 left-1/4 w-px h-full bg-primary" />
        <div className="absolute top-0 left-2/4 w-px h-full bg-primary" />
        <div className="absolute top-0 left-3/4 w-px h-full bg-primary" />
      </div>

      <div className="relative z-10 flex flex-col items-center motion-safe:animate-[fadeInUp_0.7s_ease-out]">
        <span className="inline-flex items-center gap-2.5 text-[11px] md:text-xs font-black uppercase tracking-[0.3em] text-primary/45 mb-7">
          <span className="h-px w-9 bg-primary/35" />Unreal Studio · Bali<span className="h-px w-9 bg-primary/35" />
        </span>
        <h1 className="text-[7rem] md:text-[12rem] leading-[0.85] font-serif text-primary tracking-[-0.03em]">404</h1>
        <div className="h-px w-16 bg-primary/25 my-8" />
        <p className="text-xl md:text-2xl text-primary/65 font-light max-w-lg leading-relaxed mb-10">{t('notFound.msg', { defaultValue: 'Esta página no existe o ha sido movida.' })}</p>
        <div className="flex flex-col sm:flex-row items-center gap-4">
          <a href="/" className="bg-primary text-white px-8 py-4 rounded-xl font-bold uppercase tracking-widest text-xs shadow-lg hover:bg-black hover:-translate-y-0.5 transition focus-visible:ring-2 focus-visible:ring-primary/30">
            {t('notFound.back', { defaultValue: 'Volver al inicio' })}
          </a>
          <a href="/proyectos" className="group inline-flex items-center gap-2 text-primary/70 hover:text-primary font-black uppercase tracking-widest text-xs transition-colors">
            {t('nav.projects')}
            <span className="material-symbols-outlined text-base transition-transform duration-300 group-hover:translate-x-1">arrow_forward</span>
          </a>
        </div>
      </div>
    </div>
  );
}
