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
import React, { useEffect, useState } from 'react';
import { Link, useLocation, useSearchParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import BrandLogo from './BrandLogo';

interface NavItem {
  key: string;
  label: string;
  to: string;
  /** icono Material Symbols representativo (gris, hereda el color del texto) */
  icon: string;
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

  const currentView = searchParams.get('view') || 'dashboard';
  const onDashboard = location.pathname === '/admin';

  // Contador de notificaciones sin leer (badge). Refresca cada 60s.
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    let alive = true;
    const fetchUnread = async () => {
      const { data } = await supabase.rpc('admin_unread_count');
      if (alive && typeof data === 'number') setUnread(data);
    };
    void fetchUnread();
    const iv = setInterval(fetchUnread, 60000);
    return () => { alive = false; clearInterval(iv); };
  }, [currentView]);

  const sections: NavItem[] = [
    { key: 'dashboard', icon: 'dashboard', label: t('admin.nav.dashboard', 'Dashboard'), to: '/admin?view=dashboard', view: 'dashboard' },
    { key: 'notifications', icon: 'notifications', label: t('admin.nav.notifications', 'Notificaciones'), to: '/admin?view=notifications', view: 'notifications' },
    { key: 'cobros', icon: 'payments', label: t('admin.nav.cobros'), to: '/admin?view=cobros', view: 'cobros' },
    { key: 'calendar', icon: 'calendar_month', label: t('admin.nav.calendar'), to: '/admin?view=calendar', view: 'calendar' },
    { key: 'clients', icon: 'person', label: t('admin.nav.clients'), to: '/admin?view=clients', view: 'clients' },
    { key: 'employees', icon: 'badge', label: t('admin.nav.employees'), to: '/admin?view=employees', view: 'employees' },
    { key: 'users', icon: 'security', label: t('admin.nav.users'), to: '/admin?view=users', view: 'users' },
    { key: 'projects', icon: 'home_work', label: t('admin.nav.projects'), to: '/admin?view=projects', view: 'projects' },
    { key: 'blogs', icon: 'post_add', label: t('admin.nav.blogs'), to: '/admin?view=blogs', view: 'blogs' },
    { key: 'agencias', icon: 'public', label: t('admin.nav.agenciesMgmt', 'Agencias'), to: '/admin?view=agencias', view: 'agencias' },
    { key: 'faqs', icon: 'help', label: t('admin.nav.faqs', 'FAQs'), to: '/admin?view=faqs', view: 'faqs' },
  ];

  const pages: NavItem[] = [
    { key: 'marketing', icon: 'campaign', label: t('admin.nav.marketing'), to: '/admin/marketing', path: '/admin/marketing' },
    { key: 'agencyPacks', icon: 'handshake', label: t('admin.nav.agencyPacks', 'Packs Agencia'), to: '/admin/agencias', path: '/admin/agencias' },
  ];

  // Configuración siempre al fondo del todo.
  const configItem: NavItem = { key: 'config', icon: 'settings', label: t('admin.nav.config'), to: '/admin?view=config', view: 'config' };

  const isSectionActive = (it: NavItem) => onDashboard && it.view === currentView;
  const isPageActive = (it: NavItem) => it.path && location.pathname.startsWith(it.path);

  const handleLogout = async () => {
    localStorage.removeItem('_ust_sh_');
    sessionStorage.removeItem('_ust_sh_');
    try { await supabase.auth.signOut(); } catch { /* ignore */ }
    window.location.href = '/admin/login';
  };

  const itemClass = (active: boolean) =>
    `relative flex items-center gap-3 px-5 py-2.5 text-sm font-medium transition-colors ${
      active
        ? 'bg-white/10 text-white before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1 before:bg-amber-400'
        : 'text-white/55 hover:text-white hover:bg-white/5'
    }`;

  const renderItem = (it: NavItem, active: boolean) => (
    <Link key={it.key} to={it.to} className={itemClass(active)}>
      {/^[a-z_]+$/.test(it.icon)
        ? <span className="material-symbols-outlined text-[20px] leading-none">{it.icon}</span>
        : <span className="text-[18px] leading-none w-5 text-center">{it.icon}</span>}
      {it.label}
      {it.key === 'notifications' && unread > 0 && (
        <span className="ml-auto bg-red-500 text-white text-[10px] font-black rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center">
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </Link>
  );

  return (
    <aside className="hidden md:flex flex-col w-60 shrink-0 bg-[#1f2430] text-white h-screen sticky top-0 self-start overflow-y-auto">
      <Link to="/admin?view=dashboard" className="px-5 py-6 border-b border-white/10 block">
        <BrandLogo imgClassName="h-8 w-auto object-contain" textClassName="font-serif text-xl tracking-tight text-white" />
        <span className="block text-[10px] uppercase tracking-widest text-white/40 mt-1">{t('admin.nav.panel', 'Panel de administración')}</span>
      </Link>

      <nav className="flex-1 overflow-y-auto py-3">
        <p className="px-5 pt-2 pb-1 text-[10px] font-black uppercase tracking-widest text-white/30">{t('admin.nav.sections', 'Secciones')}</p>
        {sections.map((it) => renderItem(it, isSectionActive(it)))}

        <p className="px-5 pt-5 pb-1 text-[10px] font-black uppercase tracking-widest text-white/30">{t('admin.nav.tools', 'Herramientas')}</p>
        {pages.map((it) => renderItem(it, !!isPageActive(it)))}
      </nav>

      {/* Configuración: siempre al fondo del todo, justo encima del logout. */}
      <div className="border-t border-white/10 pt-2">
        {renderItem(configItem, isSectionActive(configItem))}
      </div>

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
