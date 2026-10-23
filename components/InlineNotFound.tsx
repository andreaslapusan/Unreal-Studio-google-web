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
  <div className="min-h-[80vh] flex flex-col justify-center bg-almond px-5 md:px-12 relative overflow-hidden">
    <div className="relative z-10 max-w-[1440px] w-full mx-auto motion-safe:animate-[fadeInUp_0.7s_cubic-bezier(0.23,1,0.32,1)]">
      <span className="material-symbols-outlined text-clay text-4xl mb-6 block" aria-hidden="true">{icon}</span>
      <h1 className="font-display uppercase text-[2.4rem] leading-[0.95] md:text-7xl text-primary max-w-4xl">{title}</h1>
      {hint && <p className="text-primary/60 leading-relaxed mt-6 max-w-xl">{hint}</p>}
      <Link to={backTo} className="us-btn mt-10">
        <span className="material-symbols-outlined">arrow_back</span>{backLabel}
      </Link>
    </div>
  </div>
);

export default InlineNotFound;
