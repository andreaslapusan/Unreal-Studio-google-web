/**
 * InlineNotFound — estado "no encontrado" a pantalla completa, de marca y
 * editorial, para cuando un recurso concreto no existe (un proyecto, un
 * artículo…). Unifica el patrón que estaba suelto y pobre en ProjectDetail y
 * BlogDetail (titular serif + enlace subrayado) con el mismo lenguaje que la
 * 404 global (NotFound.tsx): columnas line-art tenues + overline + fade-in.
 * Sin texto propio: recibe title/backLabel/hint ya traducidos por quien lo usa.
 */
import React from 'react';
import { Link } from 'react-router-dom';

interface InlineNotFoundProps {
  title: string;
  backTo: string;
  backLabel: string;
  hint?: string;
  /** Icono Material Symbols. Por defecto 'search_off'. */
  icon?: string;
}

const InlineNotFound: React.FC<InlineNotFoundProps> = ({ title, backTo, backLabel, hint, icon = 'search_off' }) => (
  <div className="min-h-screen flex flex-col items-center justify-center bg-almond px-6 text-center relative overflow-hidden">
    {/* Líneas arquitectónicas sutiles de fondo (igual que la 404 global). */}
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-[0.05]">
      <div className="absolute top-0 left-1/4 w-px h-full bg-primary" />
      <div className="absolute top-0 left-2/4 w-px h-full bg-primary" />
      <div className="absolute top-0 left-3/4 w-px h-full bg-primary" />
    </div>
    <div className="relative z-10 flex flex-col items-center motion-safe:animate-[fadeInUp_0.7s_ease-out] max-w-lg">
      <span className="inline-flex items-center gap-2.5 text-[11px] font-black uppercase tracking-[0.3em] text-primary/45 mb-6">
        <span className="h-px w-9 bg-primary/35" />Unreal Studio · Bali<span className="h-px w-9 bg-primary/35" />
      </span>
      <span className="material-symbols-outlined text-primary/25 text-5xl mb-4" aria-hidden="true">{icon}</span>
      <h1 className="text-3xl md:text-5xl font-serif text-primary tracking-tight mb-4">{title}</h1>
      {hint && <p className="text-primary/55 font-light leading-relaxed mb-8">{hint}</p>}
      <Link to={backTo}
        className={`group inline-flex items-center gap-2 bg-primary text-white px-7 py-3.5 rounded-full font-black uppercase tracking-widest text-xs shadow-lg hover:bg-black hover:gap-3 transition-all outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 focus-visible:ring-offset-almond ${hint ? '' : 'mt-2'}`}>
        <span className="material-symbols-outlined text-base transition-transform duration-300 group-hover:-translate-x-0.5">arrow_back</span>{backLabel}
      </Link>
    </div>
  </div>
);

export default InlineNotFound;
