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

// Rediseño Apple: todos los portales en claro (gris #f5f5f7 + tarjeta blanca); `dark` se ignora a propósito.
const PortalShell: React.FC<PortalShellProps> = ({ children }) => {
  return (
    <div className="min-h-screen flex flex-col bg-[#f5f5f7]">
      <header
        className="sticky top-0 z-40 flex items-center justify-between px-5 sm:px-8 h-14 border-b glass-nav border-black/[0.08]"
      >
        <Link to="/">
          <BrandLogo imgClassName="h-8 w-auto object-contain" textClassName="brand-wordmark text-[22px] text-ink" />
        </Link>
        <LanguageSwitcher />
      </header>

      {/* el pie queda bajo el pliegue: sin franja blanca bajo la tarjeta de login en móvil */}
      <main className="flex-grow flex items-center justify-center px-5 py-12 min-h-[calc(100dvh-4rem)]">{children}</main>

    </div>
  );
};

export default PortalShell;
