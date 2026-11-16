/**
 * PortalShell — marco compartido para todos los portales (Cliente, Admin,
 * Agencias, Team). Header idéntico (logo + selector de idioma) + contenido
 * centrado + footer común, para que todos los portales se vean igual.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import LanguageSwitcher from './LanguageSwitcher';
import BrandLogo from './BrandLogo';

interface PortalShellProps {
  children: React.ReactNode;
  /** Fondo oscuro (p.ej. login admin). Por defecto crema (almond). */
  dark?: boolean;
}

const PortalShell: React.FC<PortalShellProps> = ({ children, dark = false }) => {
  return (
    <div className={`min-h-screen flex flex-col ${dark ? 'bg-primary' : 'bg-almond'}`}>
      <header
        className={`sticky top-0 z-40 flex items-center justify-between px-5 md:px-10 h-14 md:h-16 border-b ${
          dark ? 'glass-dark-nav border-white/10' : 'glass-nav border-primary/[0.06]'
        }`}
      >
        <Link to="/">
          <BrandLogo imgClassName="h-8 w-auto object-contain" textClassName={`font-serif text-xl font-bold tracking-tight ${dark ? 'text-white' : 'text-primary'}`} />
        </Link>
        <LanguageSwitcher />
      </header>

      {/* el pie queda bajo el pliegue: sin franja blanca bajo la tarjeta de login en móvil */}
      <main className="rise flex-grow flex items-center justify-center px-5 py-12 min-h-[calc(100dvh-4rem)]">{children}</main>

    </div>
  );
};

export default PortalShell;
