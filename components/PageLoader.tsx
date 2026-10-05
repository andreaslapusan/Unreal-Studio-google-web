/**
 * PageLoader — estado de carga a PANTALLA COMPLETA, editorial y de marca.
 * Sustituye la ruedecita genérica que se repetía en Home/Projects/Blog/Ficha
 * (patrón duplicado) por un loader con carácter de estudio de arquitectura:
 *   - overline "UNREAL STUDIO · BALI" con hairlines (igual que los héroes)
 *   - wordmark serif que "respira" (opacity breathe)
 *   - una barra fina INDETERMINADA que recorre un raíl (línea que viaja), en
 *     vez de un spinner — más intencional y sobrio.
 * Respeta prefers-reduced-motion (sin animación). i18n: usa common.loading por
 * defecto; se puede pasar un label específico.
 */
import React from 'react';
import { useTranslation } from 'react-i18next';

interface PageLoaderProps {
  /** Texto bajo la barra (por defecto common.loading). */
  label?: string;
}

const PageLoader: React.FC<PageLoaderProps> = ({ label }) => {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen bg-almond flex flex-col items-center justify-center gap-6 px-6"
      role="status" aria-live="polite" aria-busy="true">
      <span className="inline-flex items-center gap-2.5 text-[11px] font-black uppercase tracking-[0.22em] text-primary/40">
        <span className="h-px w-8 bg-primary/30"></span>Unreal Studio · Bali<span className="h-px w-8 bg-primary/30"></span>
      </span>
      <span className="font-serif text-3xl md:text-4xl text-primary tracking-tight us-loader-breathe select-none">
        Unreal Studio
      </span>
      <div className="relative h-px w-40 bg-primary/15 overflow-hidden rounded-full" aria-hidden="true">
        <span className="absolute inset-y-0 left-0 w-1/3 bg-primary us-loader-bar"></span>
      </div>
      <p className="text-primary/40 font-bold text-[10px] uppercase tracking-[0.2em]">{label || t('common.loading')}</p>
    </div>
  );
};

export default PageLoader;
