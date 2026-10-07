/**
 * PortalNotice — aviso a pantalla completa, de marca y editorial, para estados
 * de portal (error al cargar, acceso denegado, sesión caduca…). Mismo lenguaje
 * visual que InlineNotFound / la 404 global (columnas line-art + overline +
 * icono + titular serif + fade-in) pero con una ACCIÓN flexible: o un enlace
 * (to) o un botón (onAction) — p.ej. "volver al login" cierra sesión.
 * Antes cada portal pintaba un <p> suelto gris; esto unifica el patrón.
 * Sin texto propio: recibe strings ya traducidos por quien lo usa.
 */
import React from 'react';
import { Link } from 'react-router-dom';

interface PortalNoticeProps {
  title: string;
  body?: string;
  /** Icono Material Symbols. Por defecto 'info'. */
  icon?: string;
  /** Texto del botón/enlace de acción (opcional). */
  actionLabel?: string;
  /** Destino si la acción es navegar. */
  to?: string;
  /** Handler si la acción es un botón (p.ej. cerrar sesión). */
  onAction?: () => void;
}

const PortalNotice: React.FC<PortalNoticeProps> = ({ title, body, icon = 'info', actionLabel, to, onAction }) => {
  const actionClass =
    'group inline-flex items-center gap-2 bg-primary text-white px-7 py-3.5 rounded-full font-black uppercase tracking-widest text-xs shadow-lg hover:bg-black hover:gap-3 transition-all outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 focus-visible:ring-offset-almond mt-2';
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-almond px-6 text-center relative overflow-hidden">
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
        {body && <p className="text-primary/55 font-light leading-relaxed mb-8">{body}</p>}
        {actionLabel && to && (
          <Link to={to} className={actionClass}>
            <span className="material-symbols-outlined text-base transition-transform duration-300 group-hover:-translate-x-0.5">arrow_back</span>{actionLabel}
          </Link>
        )}
        {actionLabel && !to && onAction && (
          <button type="button" onClick={onAction} className={actionClass}>
            <span className="material-symbols-outlined text-base transition-transform duration-300 group-hover:-translate-x-0.5">arrow_back</span>{actionLabel}
          </button>
        )}
      </div>
    </div>
  );
};

export default PortalNotice;
