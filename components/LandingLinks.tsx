/** Línea discreta de enlaces a las guías/landings SEO publicadas (home y /proyectos). */
import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { landingLink } from '../lib/landings';

const IDS = ['invertir-en-bali', 'comprar-sobre-plano-bali', 'zonas-uluwatu', 'zonas-canggu-pererenan', 'zonas-tabanan', 'mercado-inmobiliario-bali', 'rentabilidad-inversion-bali', 'sobre-nosotros'];

export default function LandingLinks({ className = '' }: { className?: string }) {
  const { t, i18n } = useTranslation();
  const links = IDS.map((id) => landingLink(id, (i18n.language || 'es').slice(0, 2))).filter((l): l is NonNullable<typeof l> => !!l);
  if (!links.length) return null;
  return (
    <nav aria-label={t('landings.guidesTitle')} className={`text-xs text-primary/50 ${className}`}>
      <span className="font-black uppercase tracking-widest text-primary/60 mr-2">{t('landings.guidesTitle')}:</span>
      {links.map((l, i) => (
        <React.Fragment key={l.href}>
          {i > 0 && <span className="mx-1.5">·</span>}
          <Link to={l.href} className="hover:text-primary underline-offset-2 hover:underline transition">{l.label}</Link>
        </React.Fragment>
      ))}
    </nav>
  );
}
