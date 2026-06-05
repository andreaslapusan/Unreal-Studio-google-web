/**
 * AdminMobileNav — barra de navegación admin para MÓVIL (md:hidden).
 *
 * El AdminSidebar es `hidden md:flex`, así que en móvil las páginas admin
 * INDEPENDIENTES (Marketing, Portal Manager, Agencias) quedaban sin forma de
 * volver a otras secciones ni de cerrar sesión. Esta barra horizontal, scrollable,
 * resuelve ese callejón sin salida sin tocar la lógica de auth de cada página.
 *
 * Sin iconos de fuente nuevos: navegación de texto + emoji para logout.
 */
import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';

const AdminMobileNav: React.FC = () => {
  const { t } = useTranslation();
  const location = useLocation();

  const links = [
    { key: 'dashboard', label: t('admin.nav.panel', 'Panel'), to: '/admin?view=projects', match: (p: string) => p === '/admin' },
    { key: 'marketing', label: t('admin.nav.marketing'), to: '/admin/marketing', match: (p: string) => p.startsWith('/admin/marketing') },
    { key: 'portal', label: t('admin.nav.portalManager'), to: '/admin/portal', match: (p: string) => p.startsWith('/admin/portal') },
    { key: 'agencias', label: t('admin.nav.agencies', 'Agencias'), to: '/admin/agencias', match: (p: string) => p.startsWith('/admin/agencias') },
  ];

  const handleLogout = async () => {
    localStorage.removeItem('_ust_sh_');
    sessionStorage.removeItem('_ust_sh_');
    try { await supabase.auth.signOut(); } catch { /* ignore */ }
    window.location.href = '/admin/login';
  };

  return (
    <div className="md:hidden sticky top-0 z-30 bg-[#1f2430] text-white border-b border-white/10">
      <div className="flex items-center gap-1 overflow-x-auto hide-scrollbar px-3 py-2">
        {links.map((it) => {
          const active = it.match(location.pathname);
          return (
            <Link
              key={it.key}
              to={it.to}
              className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${
                active ? 'bg-amber-400 text-[#1f2430]' : 'bg-white/10 text-white/70 hover:bg-white/20'
              }`}
            >
              {it.label}
            </Link>
          );
        })}
        <button
          onClick={handleLogout}
          className="ml-auto shrink-0 whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-bold bg-red-500/80 text-white hover:bg-red-500 transition-colors"
        >
          ⎋ {t('admin.common.logout')}
        </button>
      </div>
    </div>
  );
};

export default AdminMobileNav;
