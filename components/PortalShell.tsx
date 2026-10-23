/**
 * PortalShell — marco compartido para todos los portales (Cliente, Admin,
 * Agencias, Team). Layout EDITORIAL split-screen: panel visual a sangre
 * (foto de arquitectura + marca) en desktop, y el lado del formulario con
 * header (logo + idioma) + contenido + footer. En móvil solo el lado del
 * formulario (el panel visual se oculta). Mismo marco para los 4 portales.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import LanguageSwitcher from './LanguageSwitcher';
import BrandLogo, { BRAND_LEMA } from './BrandLogo';

interface PortalShellProps {
  children: React.ReactNode;
  /** Fondo oscuro (p.ej. login admin). Por defecto crema (almond). */
  dark?: boolean;
}

// Foto de arquitectura propia (The Nook) para el panel editorial del login.
const PORTAL_VISUAL = '/img/The%20Nook/1-04.webp';

const PortalShell: React.FC<PortalShellProps> = ({ children, dark = false }) => {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[1.1fr_1fr] bg-almond">
      {/* Panel visual: fotografía propia a sangre + logotipo a escala de fachada. */}
      <aside className="relative h-56 sm:h-72 lg:h-auto overflow-hidden bg-primary text-almond">
        <img
          src={PORTAL_VISUAL}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover opacity-80 us-curtain"
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(30,27,22,0.45),rgba(30,27,22,0.1)_40%,rgba(30,27,22,0.9))]" />
        <div className="relative h-full flex flex-col justify-between p-5 md:p-10 xl:p-14">
          <div className="flex items-center justify-between">
            <Link to="/" className="outline-none focus-visible:ring-2 focus-visible:ring-clay-light">
              <BrandLogo imgClassName="h-9 w-auto object-contain" textClassName="text-2xl md:text-3xl text-almond leading-none" />
            </Link>
            <span className="lg:hidden"><LanguageSwitcher inverted /></span>
          </div>
          <div className="hidden lg:block max-w-lg">
            <h2 className="font-display uppercase text-almond text-4xl xl:text-[3.4rem] leading-[0.95]">
              {t('auth.portalHeroTitle')}
            </h2>
            <p className="text-almond/70 text-base leading-relaxed mt-5 max-w-md">
              {t('auth.portalHeroSubtitle')}
            </p>
            <p className="brand-lema text-almond/50 text-xl mt-10">{BRAND_LEMA}</p>
          </div>
        </div>
      </aside>

      {/* Lado del formulario */}
      <div className={`flex flex-col lg:min-h-screen ${dark ? 'bg-primary text-almond' : 'bg-almond'}`}>
        <header className="hidden lg:flex items-center justify-end px-12 py-8">
          <LanguageSwitcher inverted={dark} />
        </header>

        <main className="flex-grow flex items-center justify-center px-5 md:px-12 py-12 lg:py-8">{children}</main>

        <footer className={`px-5 md:px-12 py-6 border-t flex flex-wrap gap-x-6 gap-y-2 justify-between us-label ${dark ? 'border-almond/15 text-almond/40' : 'border-primary/10 text-primary/40'}`}>
          <span>{t('footer.rights')}</span>
          <span className="flex gap-5">
            <Link to="/privacidad" className="hover:text-clay transition-colors">{t('footer.privacy')}</Link>
            <Link to="/terminos" className="hover:text-clay transition-colors">{t('footer.terms')}</Link>
          </span>
        </footer>
      </div>
    </div>
  );
};

export default PortalShell;
