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
    <div className="min-h-screen bg-primary flex flex-col items-center justify-center gap-6 px-6"
      role="status" aria-live="polite" aria-busy="true">
      <span className="font-logo text-4xl md:text-5xl text-almond us-loader-breathe select-none">
        Unreal Studio
      </span>
      <div className="relative h-px w-32 bg-almond/15 overflow-hidden" aria-hidden="true">
        <span className="absolute inset-y-0 left-0 w-1/3 bg-clay-light us-loader-bar"></span>
      </div>
      <p className="us-label text-almond/45">{label || t('common.loading')}</p>
    </div>
  );
};

export default PageLoader;
