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
    'group us-btn';
  return (
    <div className="min-h-screen flex flex-col justify-center bg-almond px-5 md:px-12 relative overflow-hidden">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-[0.05]">
        <div className="absolute top-0 left-1/4 w-px h-full bg-primary" />
        <div className="absolute top-0 left-2/4 w-px h-full bg-primary" />
        <div className="absolute top-0 left-3/4 w-px h-full bg-primary" />
      </div>
      <div className="relative z-10 flex flex-col items-start max-w-2xl w-full mx-auto motion-safe:animate-[fadeInUp_0.7s_cubic-bezier(0.23,1,0.32,1)]">
        <span className="font-logo text-2xl text-primary/60 mb-10">Unreal Studio</span>
        <span className="material-symbols-outlined text-clay text-4xl mb-5" aria-hidden="true">{icon}</span>
        <h1 className="font-display uppercase text-[2.2rem] leading-[0.95] md:text-6xl text-primary mb-5">{title}</h1>
        {body && <p className="text-primary/60 leading-relaxed mb-10 max-w-lg">{body}</p>}
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
