/**
 * AdminSidebar — menú lateral izquierdo FIJO y persistente del panel admin.
 *
 * Resuelve el problema de "te atascas en Marketing / no ves cómo salir":
 * está presente en TODAS las páginas admin (dashboard + marketing + portal +
 * agencias), con navegación entre secciones/submenús y logout SIEMPRE visible.
 *
 * - Secciones del dashboard → navegan a `/admin?view=<x>` (AdminDashboard lee
 *   el query param). Así el sidebar funciona igual desde cualquier página.
 * - Páginas independientes (Marketing, Portal, Agencias) → rutas reales.
 * - Sin iconos de fuente (evitamos el problema del subset de Material Symbols):
 *   navegación de texto, marcador de activo con barra lateral.
 *
 * Móvil: el sidebar se oculta (md:flex) y cada página mantiene su nav superior.
 */
import React from 'react';
import { Link, useLocation, useSearchParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';

interface NavItem {
  key: string;
  label: string;
  to: string;
  /** view del dashboard que marca este item como activo (si aplica) */
  view?: string;
  /** ruta cuyo pathname marca este item como activo (si aplica) */
  path?: string;
}

const AdminSidebar: React.FC = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const currentView = searchParams.get('view') || 'projects';
  const onDashboard = location.pathname === '/admin';

  const sections: NavItem[] = [
    { key: 'projects', label: t('admin.nav.projects'), to: '/admin?view=projects', view: 'projects' },
    { key: 'blogs', label: t('admin.nav.blogs'), to: '/admin?view=blogs', view: 'blogs' },
    { key: 'clients', label: t('admin.nav.clients'), to: '/admin?view=clients', view: 'clients' },
    { key: 'users', label: t('admin.nav.users'), to: '/admin?view=users', view: 'users' },
    { key: 'employees', label: t('admin.nav.employees'), to: '/admin?view=employees', view: 'employees' },
    { key: 'config', label: t('admin.nav.config'), to: '/admin?view=config', view: 'config' },
    { key: 'calendar', label: t('admin.nav.calendar'), to: '/admin?view=calendar', view: 'calendar' },
  ];

  const pages: NavItem[] = [
    { key: 'marketing', label: t('admin.nav.marketing'), to: '/admin/marketing', path: '/admin/marketing' },
    { key: 'portal', label: t('admin.nav.portalManager'), to: '/admin/portal', path: '/admin/portal' },
    { key: 'agencias', label: t('admin.nav.agencies', 'Agencias'), to: '/admin/agencias', path: '/admin/agencias' },
  ];

  const isSectionActive = (it: NavItem) => onDashboard && it.view === currentView;
  const isPageActive = (it: NavItem) => it.path && location.pathname.startsWith(it.path);

  const handleLogout = async () => {
    localStorage.removeItem('_ust_sh_');
    sessionStorage.removeItem('_ust_sh_');
    try { await supabase.auth.signOut(); } catch { /* ignore */ }
    window.location.href = '/admin/login';
  };

  const itemClass = (active: boolean) =>
    `relative block px-5 py-2.5 text-sm font-medium transition-colors ${
      active
        ? 'bg-white/10 text-white before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1 before:bg-amber-400'
        : 'text-white/55 hover:text-white hover:bg-white/5'
    }`;

  return (
    <aside className="hidden md:flex flex-col w-60 shrink-0 bg-[#1f2430] text-white h-screen sticky top-0 self-start overflow-y-auto">
      <Link to="/admin?view=projects" className="px-5 py-6 border-b border-white/10 block">
        <span className="font-serif text-xl tracking-tight">Unreal Studio</span>
        <span className="block text-[10px] uppercase tracking-widest text-white/40 mt-1">{t('admin.nav.panel', 'Panel de administración')}</span>
      </Link>

      <nav className="flex-1 overflow-y-auto py-3">
        <p className="px-5 pt-2 pb-1 text-[10px] font-black uppercase tracking-widest text-white/30">{t('admin.nav.sections', 'Secciones')}</p>
        {sections.map((it) => (
          <Link key={it.key} to={it.to} className={itemClass(isSectionActive(it))}>
            {it.label}
          </Link>
        ))}

        <p className="px-5 pt-5 pb-1 text-[10px] font-black uppercase tracking-widest text-white/30">{t('admin.nav.tools', 'Herramientas')}</p>
        {pages.map((it) => (
          <Link key={it.key} to={it.to} className={itemClass(!!isPageActive(it))}>
            {it.label}
          </Link>
        ))}
      </nav>

      <div className="border-t border-white/10 p-3">
        <button
          onClick={() => navigate('/')}
          className="block w-full text-left px-2 py-2 text-xs text-white/50 hover:text-white transition"
        >
          {t('admin.nav.viewSite', 'Ver web pública')}
        </button>
        <button
          onClick={handleLogout}
          className="block w-full text-left px-2 py-2 mt-1 text-xs font-bold text-red-300 hover:text-white hover:bg-red-600/40 rounded transition"
        >
          {t('admin.common.logout')}
        </button>
      </div>
    </aside>
  );
};

export default AdminSidebar;
