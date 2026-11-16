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
    <div className="lg:hidden sticky top-0 z-30 glass-nav text-ink border-b border-black/[0.08]">
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-[15px] font-semibold tracking-[-0.01em] text-ink">Unreal · Admin</span>
        <button onClick={() => setOpen((o) => !o)} aria-label="Menú" className="w-9 h-9 rounded-full hover:bg-black/[0.05] flex items-center justify-center transition">
          <span className="material-symbols-outlined text-[20px]">{open ? 'close' : 'menu'}</span>
        </button>
      </div>
      {open && (
        <div className="fixed inset-0 z-40" onClick={() => setOpen(false)}>
          <div className="pop-in absolute right-3 top-12 bg-white rounded-2xl shadow-xl border border-black/[0.08] p-2 w-[230px] flex flex-col gap-0.5" onClick={(e) => e.stopPropagation()}>
            {links.map((it) => {
              const active = it.match(location.pathname);
              return (
                <Link key={it.key} to={it.to} onClick={() => setOpen(false)}
                  className={`px-3 py-2 rounded-[10px] text-[15px] transition ${active ? 'bg-brand text-white font-semibold' : 'text-ink hover:bg-black/[0.05]'}`}>
                  {it.label}
                </Link>
              );
            })}
            <button onClick={handleLogout} className="mt-1 px-3 py-2 rounded-[10px] text-[15px] font-medium text-red-600 hover:bg-red-50 transition text-left">
              {t('admin.common.logout')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminMobileNav;
