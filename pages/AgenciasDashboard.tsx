/**
 * /agencias/dashboard — Portal de la agencia colaboradora.
 * Misma filosofía que el panel admin: sidebar fijo (AdminSidebar con items propios) en escritorio,
 * cabecera + bocadillo en móvil, y la sección activa en la URL (?view=) para que sea enlazable.
 * Acceso = tener fila en listing_partners (las agencias no tienen rol en profiles).
 */
import React from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../lib/auth-context';
import AdminSidebar, { NavItem } from '../components/AdminSidebar';
import BrandLogo from '../components/BrandLogo';
import LanguageSwitcher from '../components/LanguageSwitcher';
import { useCurrency } from '../App';
import { CURRENCIES } from '../constants';
import { useAgencyData } from '../components/agency/useAgencyData';
import AgencyOverview from '../components/agency/AgencyOverview';
import AgencyProjects from '../components/agency/AgencyProjects';
import AgencyClients from '../components/agency/AgencyClients';
import AgencyStats from '../components/agency/AgencyStats';
import AgencyCommissions from '../components/agency/AgencyCommissions';
import AgencyProfile from '../components/agency/AgencyProfile';
import AgencyHelp from '../components/agency/AgencyHelp';
import AgencyAvailability from '../components/agency/AgencyAvailability';
import AgencyKit from '../components/agency/AgencyKit';
import AgencyNews from '../components/agency/AgencyNews';
import AgencyRequests from '../components/agency/AgencyRequests';
import AgencyTraining from '../components/agency/AgencyTraining';
import AgencyContract from '../components/agency/AgencyContract';

const BASE = '/agencias/dashboard';
// Orden del menú: trabajo diario → vender → seguimiento → recursos → cuenta.
const VIEWS = ['dashboard', 'news', 'availability', 'projects', 'kit', 'clients', 'requests', 'commissions', 'stats', 'training', 'contract', 'profile', 'help'] as const;
type View = typeof VIEWS[number];
// Formato `icon: '…'` para que scripts/gen-icons.mjs los incluya en el subset de la fuente.
const ICON_LIST: { view: View; icon: string }[] = [
  { view: 'dashboard', icon: 'dashboard' }, { view: 'news', icon: 'campaign' }, { view: 'availability', icon: 'sell' },
  { view: 'projects', icon: 'home_work' }, { view: 'kit', icon: 'folder_open' }, { view: 'clients', icon: 'groups' },
  { view: 'requests', icon: 'event_available' }, { view: 'commissions', icon: 'payments' }, { view: 'stats', icon: 'analytics' },
  { view: 'training', icon: 'school' }, { view: 'contract', icon: 'gavel' }, { view: 'profile', icon: 'storefront' },
  { view: 'help', icon: 'help' },
];
const ICONS = Object.fromEntries(ICON_LIST.map((x) => [x.view, x.icon])) as Record<View, string>;

export default function AgenciasDashboard() {
  const { t } = useTranslation();
  const { user, role, loading: authLoading, signOut } = useAuth();
  const { currency, setCurrency } = useCurrency(); // los precios del portal se convierten a esta divisa
  const data = useAgencyData(user?.id, t('agenciasDashboard.accountNotLinked'));
  const [sp, setSp] = useSearchParams();
  const [menuOpen, setMenuOpen] = React.useState(false);
  const view: View = (VIEWS as readonly string[]).includes(sp.get('view') ?? '') ? (sp.get('view') as View) : 'dashboard';

  const go = (v: string, extra: Record<string, string> = {}) => {
    setSp({ view: v, ...extra });
    setMenuOpen(false);
    window.scrollTo({ top: 0 });
  };
  const logout = async () => { try { await signOut(); } catch { /* ignore */ } window.location.href = '/agencias/login'; };

  if (authLoading) return <div className="min-h-screen flex items-center justify-center">{t('agenciasDashboard.loadingAuth')}</div>;
  if (!user) return <Navigate to="/agencias" replace />;

  const label = (v: View) => t(`agencyPortal.nav.${v}`);
  const items: NavItem[] = VIEWS.filter((v) => v !== 'help').map((v) => ({ key: v, icon: ICONS[v], label: label(v), to: `${BASE}?view=${v}`, view: v }));
  const helpItem: NavItem = { key: 'help', icon: ICONS.help, label: label('help'), to: `${BASE}?view=help`, view: 'help' };
  const { partner, loading, error } = data;

  return (
    <div className="min-h-screen bg-gray-50 flex font-sans text-left relative">
      <AdminSidebar items={items} footerItem={helpItem} basePath={BASE} panelLabel={partner?.agency_name ?? t('agencyPortal.panel')} onLogout={logout} />
      <div className="flex-1 flex flex-col min-w-0 overflow-x-hidden">
        <header className="bg-white border-b border-gray-200 px-3 md:px-6 py-3 md:py-4 sticky top-0 z-30 shadow-sm flex justify-between items-center gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <Link to="/" className="shrink-0"><BrandLogo imgClassName="h-8 md:h-10 w-auto object-contain" textClassName="font-serif text-primary text-lg md:text-2xl tracking-tight" /></Link>
            <span className="hidden sm:block text-[10px] font-black uppercase tracking-widest text-primary/40 truncate">{t('agencyPortal.panel')}</span>
          </div>
          <div className="flex items-center gap-2 md:gap-3">
            {partner?.logo_url && <img src={partner.logo_url} alt={partner.agency_name} className="hidden lg:block h-8 w-8 rounded-full object-contain bg-gray-50 border border-gray-100" />}
            <span className="hidden lg:block text-xs font-bold text-primary/70 max-w-[200px] truncate">{partner?.agency_name ?? user.email}</span>
            <select value={currency} onChange={(e) => setCurrency(e.target.value as any)} aria-label={t('fix.nav.currency')} className="hidden lg:block bg-white/50 border border-primary/10 rounded-full px-3 py-1.5 text-[10px] font-bold text-primary focus:ring-0 cursor-pointer hover:bg-white transition">
              {CURRENCIES.map(c => (<option key={c.code} value={c.code}>{c.code} ({c.symbol})</option>))}
            </select>
            <div className="hidden lg:block"><LanguageSwitcher /></div>
            <button onClick={logout} className="hidden lg:block bg-red-50 text-red-600 px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-red-600 hover:text-white transition">{t('admin.common.logout')}</button>
            <button onClick={() => setMenuOpen((o) => !o)} aria-label={t('fix.adm.menuAria')} className="lg:hidden w-10 h-10 rounded-full bg-gray-100 text-primary flex items-center justify-center active:scale-95 transition">
              <span className="material-symbols-outlined text-[22px]">{menuOpen ? 'close' : 'menu'}</span>
            </button>
          </div>
        </header>

        {menuOpen && (
          <div className="lg:hidden fixed inset-0 z-40" onClick={() => setMenuOpen(false)}>
            <div className="absolute right-3 top-16 bg-white rounded-2xl shadow-xl border border-gray-100 p-3 w-[240px] max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              {partner && <p className="px-3 pb-2 mb-1 border-b border-gray-100 text-xs font-bold text-primary/50 truncate">{partner.agency_name}</p>}
              <div className="flex flex-col gap-1 mb-2">
                {VIEWS.map((v) => (
                  <button key={v} onClick={() => go(v)}
                    className={`flex items-center gap-2.5 text-left px-3 py-2.5 rounded-xl text-sm font-bold transition ${view === v ? 'bg-primary text-white' : 'text-primary/70 hover:bg-gray-100'}`}>
                    <span className="material-symbols-outlined text-[20px]">{ICONS[v]}</span>{label(v)}
                  </button>
                ))}
              </div>
              <div className="border-t border-gray-100 pt-2 flex flex-col gap-2">
                <div className="flex flex-col gap-2 px-1">
                  <select value={currency} onChange={(e) => setCurrency(e.target.value as any)} aria-label={t('fix.nav.currency')} className="w-full bg-gray-50 border border-gray-200 rounded-lg pl-3 pr-9 py-1.5 text-xs font-bold text-primary">
                    {CURRENCIES.map(c => (<option key={c.code} value={c.code}>{c.code} ({c.symbol})</option>))}
                  </select>
                  <LanguageSwitcher />
                </div>
                <button onClick={logout} className="text-left px-3 py-2 rounded-xl text-xs font-black uppercase tracking-widest bg-red-50 text-red-600 hover:bg-red-600 hover:text-white transition">{t('admin.common.logout')}</button>
              </div>
            </div>
          </div>
        )}

        <main className="p-4 md:p-8 max-w-7xl mx-auto w-full flex-grow">
          {loading && <p className="text-sm text-primary/60">{t('agenciasDashboard.loadingProjects')}</p>}
          {!loading && (error || !partner) && (
            <div className="bg-white rounded-2xl p-8 shadow-sm border border-primary/5 text-center max-w-lg mx-auto">
              <span className="material-symbols-outlined text-4xl text-primary/20">lock</span>
              <h1 className="text-2xl font-serif text-primary mt-2">{role === 'admin' ? t('agencyPortal.panel') : t('agenciasDashboard.accessDenied')}</h1>
              <p className="text-sm text-primary/60 mt-2">{error || t('agenciasDashboard.accessDeniedBody')}</p>
            </div>
          )}
          {!loading && partner && (
            <>
              {view === 'dashboard' && <AgencyOverview data={data} go={go} />}
              {view === 'projects' && <AgencyProjects data={data} />}
              {view === 'clients' && <AgencyClients data={data} go={go} />}
              {view === 'news' && <AgencyNews data={data} />}
              {view === 'availability' && <AgencyAvailability data={data} />}
              {view === 'kit' && <AgencyKit data={data} />}
              {view === 'requests' && <AgencyRequests data={data} />}
              {view === 'training' && <AgencyTraining />}
              {view === 'contract' && <AgencyContract data={data} />}
              {view === 'stats' && <AgencyStats data={data} />}
              {view === 'commissions' && <AgencyCommissions data={data} go={go} />}
              {view === 'profile' && <AgencyProfile data={data} email={user.email} />}
              {view === 'help' && <AgencyHelp agencyName={partner.agency_name} />}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
