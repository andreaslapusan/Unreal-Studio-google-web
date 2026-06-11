/**
 * PortalHeader — cabecera UNIFICADA para todos los portales (Clientes, Agencias,
 * Equipo, Empleados). Replica la identidad del sitio (logo "Unreal Studio" como
 * link a "/") y aporta los controles comunes a la derecha.
 *
 * Móvil: para no ocupar espacio con el selector de idioma permanente, los
 * controles (info/guía + idioma + cerrar sesión) se pliegan en un bocadillo con
 * icono de "tres rayitas" (menu) arriba a la derecha que se despliega al pulsar.
 * Escritorio: se muestran en línea como siempre.
 *
 * Cada página conecta SU propia función de logout vía `onLogout`. `extra` inyecta
 * controles propios (guía "i", contraseña, divisa…) que aparecen tanto en la fila
 * de escritorio como dentro del bocadillo móvil.
 */
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import LanguageSwitcher from './LanguageSwitcher';
import BrandLogo from './BrandLogo';

interface PortalHeaderProps {
  /** Logout propio de la página (se conecta al botón "Cerrar sesión"). */
  onLogout?: () => void;
  /** Contexto opcional (email/nombre) mostrado bajo el logo. */
  subtitle?: string;
  /** Controles específicos de la página (divisa, navegación, guía, contraseña…). */
  extra?: React.ReactNode;
}

export default function PortalHeader({ onLogout, subtitle, extra }: PortalHeaderProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const logoutBtn = onLogout && (
    <button
      onClick={onLogout}
      className="flex items-center gap-1.5 bg-white border border-primary/10 text-primary/70 px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest hover:bg-primary hover:text-white transition shadow-sm"
    >
      <span className="material-symbols-outlined text-sm">logout</span>
      <span>{t('admin.common.logout')}</span>
    </button>
  );

  return (
    <header className="sticky top-0 z-40 bg-almond border-b border-primary/10 px-4 md:px-8 py-3 md:py-4 shadow-sm">
      <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">
        {/* IZQUIERDA: logo de marca como link a "/" */}
        <Link to="/" className="flex flex-col shrink-0 leading-tight min-w-0">
          <BrandLogo imgClassName="h-9 w-auto object-contain" textClassName="font-serif text-2xl font-bold text-primary tracking-tighter" />
          {subtitle && (
            <span className="text-[11px] font-semibold text-primary/45 break-all leading-tight">
              {subtitle}
            </span>
          )}
        </Link>

        {/* DERECHA escritorio: controles en línea */}
        <div className="hidden md:flex items-center gap-3 justify-end">
          {extra}
          <LanguageSwitcher />
          {logoutBtn}
        </div>

        {/* DERECHA móvil: bocadillo (tres rayitas) */}
        <div className="md:hidden relative shrink-0">
          <button
            onClick={() => setOpen((o) => !o)}
            aria-label={t('admin.common.menu', 'Menú')}
            aria-expanded={open}
            className="w-10 h-10 rounded-full bg-white border border-primary/10 text-primary flex items-center justify-center shadow-sm active:scale-95 transition"
          >
            <span className="material-symbols-outlined text-[22px]">{open ? 'close' : 'menu'}</span>
          </button>
          {open && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
              <div
                className="absolute right-0 top-12 z-50 bg-white rounded-2xl shadow-xl border border-primary/10 p-3 min-w-[220px] flex flex-col gap-2.5"
                onClick={() => setOpen(false)}
              >
                {extra && <div className="flex flex-col gap-2.5">{extra}</div>}
                <div className="border-t border-primary/10 pt-2.5" onClick={(e) => e.stopPropagation()}>
                  <LanguageSwitcher />
                </div>
                {logoutBtn && <div className="border-t border-primary/10 pt-2.5">{logoutBtn}</div>}
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
