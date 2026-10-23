import React from 'react';
import { useTranslation } from 'react-i18next';

// Pantalla 404 editorial (marca Unreal). Texto traducido (4 idiomas).
export default function NotFound() {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen flex flex-col items-start justify-center bg-primary text-almond px-5 md:px-12 relative overflow-hidden">
      {/* Líneas arquitectónicas sutiles de fondo (line-art, muy tenue) */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-[0.07]">
        <div className="absolute top-0 left-1/4 w-px h-full bg-almond" />
        <div className="absolute top-0 left-2/4 w-px h-full bg-almond" />
        <div className="absolute top-0 left-3/4 w-px h-full bg-almond" />
      </div>

      <div className="relative z-10 flex flex-col items-start max-w-[1440px] w-full mx-auto motion-safe:animate-[fadeInUp_0.7s_cubic-bezier(0.23,1,0.32,1)]">
        <span className="font-logo text-3xl text-almond/70 mb-8">Unreal Studio</span>
        <h1 className="font-display text-[8rem] md:text-[16rem] leading-[0.8] text-clay-light us-num">404</h1>
        <div className="h-px w-16 bg-almond/25 my-8" />
        <p className="text-xl md:text-2xl text-almond/70 max-w-lg leading-relaxed mb-10">{t('notFound.msg', { defaultValue: 'Esta página no existe o ha sido movida.' })}</p>
        <div className="flex flex-col sm:flex-row items-center gap-4">
          <a href="/" className="us-btn us-btn-light">
            {t('notFound.back', { defaultValue: 'Volver al inicio' })}
          </a>
          <a href="/proyectos" className="group inline-flex items-center gap-2 us-link text-almond/80 hover:text-almond">
            {t('nav.projects')}
            <span className="material-symbols-outlined text-base transition-transform duration-300 group-hover:translate-x-1">arrow_forward</span>
          </a>
        </div>
      </div>
    </div>
  );
}
