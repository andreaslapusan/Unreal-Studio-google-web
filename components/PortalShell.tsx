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
import Footer from './Footer';
import BrandLogo from './BrandLogo';

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
    <div className="min-h-screen lg:grid lg:grid-cols-[1.05fr_1fr] bg-almond">
      {/* Panel visual editorial — solo desktop. Foto a sangre + overlay marrón
          + marca anclada abajo (estilo arquitectura/real-estate de primer nivel). */}
      <aside className="relative hidden lg:block overflow-hidden bg-primary">
        <img
          src={PORTAL_VISUAL}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover scale-105 motion-safe:animate-[portalPan_38s_ease-in-out_infinite_alternate]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-primary via-primary/45 to-primary/15" />
        <div className="absolute inset-0 bg-gradient-to-br from-primary/30 to-transparent" />
        <div className="relative h-full flex flex-col justify-between p-12 xl:p-16">
          <span className="inline-flex items-center gap-3 text-[11px] font-black uppercase tracking-[0.3em] text-almond/80">
            <span className="h-px w-10 bg-almond/50" />Unreal Studio · Bali
          </span>
          <div className="space-y-5 max-w-md">
            <h2 className="font-serif text-almond text-4xl xl:text-5xl leading-[1.08] tracking-[-0.01em]">
              {t('auth.portalHeroTitle')}
            </h2>
            <p className="text-almond/70 text-sm font-light leading-relaxed">
              {t('auth.portalHeroSubtitle')}
            </p>
          </div>
        </div>
      </aside>

      {/* Lado del formulario */}
      <div className={`flex flex-col min-h-screen ${dark ? 'bg-primary' : 'bg-almond'}`}>
        <header
          className={`flex items-center justify-between px-6 md:px-12 py-5 border-b ${
            dark ? 'border-white/10' : 'border-primary/5'
          }`}
        >
          <Link to="/">
            <BrandLogo imgClassName="h-8 w-auto object-contain" textClassName={`font-serif text-xl font-bold tracking-tight ${dark ? 'text-white' : 'text-primary'}`} />
          </Link>
          <LanguageSwitcher />
        </header>

        <main className="flex-grow flex items-center justify-center px-6 py-12">{children}</main>

        <Footer />
      </div>
    </div>
  );
};

export default PortalShell;
