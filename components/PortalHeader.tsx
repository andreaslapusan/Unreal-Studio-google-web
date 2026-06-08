/**
 * PortalHeader — cabecera UNIFICADA para todos los portales (Clientes, Agencias,
 * Equipo, Empleados). Replica la identidad del sitio (logo "Unreal Studio" como
 * link a "/") y aporta los controles comunes a la derecha: selector de idioma y
 * botón de cerrar sesión.
 *
 * Cada página conecta SU propia función de logout vía `onLogout` (no se cambia la
 * lógica de signOut de cada página, solo se enchufa al botón del header).
 *
 * `subtitle` muestra contexto opcional (email/nombre del usuario) bajo el logo.
 * `extra` permite inyectar controles propios de la página (p.ej. selector de
 * divisa, enlaces de navegación, "ver guía") manteniendo el look unificado.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import LanguageSwitcher from './LanguageSwitcher';
import BrandLogo from './BrandLogo';

interface PortalHeaderProps {
  /** Logout propio de la página (se conecta al botón "Cerrar sesión"). */
  onLogout?: () => void;
  /** Contexto opcional (email/nombre) mostrado bajo el logo. */
  subtitle?: string;
  /** Controles específicos de la página (divisa, navegación, guía…). */
  extra?: React.ReactNode;
}

export default function PortalHeader({ onLogout, subtitle, extra }: PortalHeaderProps) {
  const { t } = useTranslation();

  return (
    <header className="sticky top-0 z-40 bg-almond border-b border-primary/10 px-4 md:px-8 py-3 md:py-4 shadow-sm">
      <div className="max-w-6xl mx-auto flex items-center justify-between gap-3 flex-wrap">
        {/* IZQUIERDA: logo de marca como link a "/" */}
        <Link to="/" className="flex flex-col shrink-0 leading-tight">
          <BrandLogo imgClassName="h-9 w-auto object-contain" textClassName="font-serif text-2xl font-bold text-primary tracking-tighter" />
          {subtitle && (
            <span className="text-[10px] font-bold uppercase tracking-widest text-primary/40 truncate max-w-[200px] md:max-w-none">
              {subtitle}
            </span>
          )}
        </Link>

        {/* DERECHA: controles propios de la página + idioma + logout */}
        <div className="flex items-center gap-2 md:gap-3 flex-wrap justify-end">
          {extra}
          <LanguageSwitcher />
          {onLogout && (
            <button
              onClick={onLogout}
              className="flex items-center gap-1.5 bg-white border border-primary/10 text-primary/70 px-3 md:px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest hover:bg-primary hover:text-white transition shadow-sm"
            >
              <span className="material-symbols-outlined text-sm">logout</span>
              <span className="hidden sm:inline">{t('admin.common.logout')}</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
