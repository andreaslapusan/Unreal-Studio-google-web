/**
 * PortalShell — marco compartido para todos los portales (Cliente, Admin,
 * Agencias, Team). Header idéntico (logo + selector de idioma) + contenido
 * centrado + footer común, para que todos los portales se vean igual.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import LanguageSwitcher from './LanguageSwitcher';
import Footer from './Footer';
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
  );
};

export default PortalShell;
