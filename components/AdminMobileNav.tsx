/**
 * AdminMobileNav — navegación admin para MÓVIL (md:hidden) de las páginas admin
 * INDEPENDIENTES (Marketing, Portal Manager, Agencias). Bocadillo (tres rayitas)
 * arriba a la derecha que despliega todas las secciones + cerrar sesión.
 */
import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';

const AdminMobileNav: React.FC = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const [open, setOpen] = useState(false);

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
    <div className="lg:hidden sticky top-0 z-30 bg-primary text-white border-b border-white/10">
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-xs font-bold text-white/70">Unreal · Admin</span>
        <button onClick={() => setOpen((o) => !o)} aria-label="Menú" className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center active:scale-95 transition">
          <span className="material-symbols-outlined text-[20px]">{open ? 'close' : 'menu'}</span>
        </button>
      </div>
      {open && (
        <div className="fixed inset-0 z-40" onClick={() => setOpen(false)}>
          <div className="absolute right-3 top-12 bg-[#4a2b0c] rounded-2xl shadow-xl border border-white/10 p-3 w-[210px] flex flex-col gap-1" onClick={(e) => e.stopPropagation()}>
            {links.map((it) => {
              const active = it.match(location.pathname);
              return (
                <Link key={it.key} to={it.to} onClick={() => setOpen(false)}
                  className={`px-3 py-2 rounded-xl text-sm font-bold transition ${active ? 'bg-amber-400 text-primary' : 'text-white/80 hover:bg-white/10'}`}>
                  {it.label}
                </Link>
              );
            })}
            <button onClick={handleLogout} className="mt-1 px-3 py-2 rounded-xl text-xs font-black uppercase tracking-widest bg-red-500/80 text-white hover:bg-red-500 transition text-left">
              {t('admin.common.logout')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminMobileNav;
