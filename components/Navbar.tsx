import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useCurrency } from '../App';
import { CURRENCIES } from '../constants';
import { bookingLink } from '../lib/bookingLink';
import LanguageSwitcher from './LanguageSwitcher';
import { useAuth } from '../lib/auth-context';
import BrandLogo from './BrandLogo';
import { useLangPath } from './LocaleRoute';

const Navbar: React.FC = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { currency, setCurrency } = useCurrency();
  const location = useLocation();
  const lp = useLangPath();
  const { user, role, signOut } = useAuth();

  // Para admin/team mandamos al hub /admin desde donde se accede a Marketing,
  // Portal Manager, propiedades, blog, etc. Solo lister/investor tienen
  // dashboards monolíticos directos.
  const dashboardPath = role === 'admin' || role === 'team'
    ? '/admin'
    : role === 'lister'
      ? '/agencias/dashboard'
      : role === 'investor'
        ? '/cliente/dashboard'
        : '/admin/login';

  useEffect(() => {
    // Barra fija estilo Apple: siempre visible; al bajar gana borde fino y cristal más denso.
    const handleScroll = () => setIsScrolled(window.scrollY > 8);
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Cerrar el menú al cambiar de ruta.
  useEffect(() => { setIsMenuOpen(false); }, [location.pathname]);

  // Bloquear scroll cuando el menú está abierto
  useEffect(() => {
    if (isMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => { document.body.style.overflow = 'unset'; };
  }, [isMenuOpen]);

  const isActive = (path: string) => {
    if (path === '/' && location.pathname === '/') return true;
    if (path !== '/' && location.pathname.startsWith(path)) return true;
    return false;
  };

  const { t } = useTranslation();
  const navLinks = [
    { name: t('nav.home'), path: '/' },
    { name: t('nav.projects'), path: '/proyectos' },
    { name: t('nav.faq'), path: '/faq' },
    { name: t('nav.blog'), path: '/blog' },
    { name: t('nav.contact'), path: '/contacto' },
    // { name: t('nav.agencies'), path: '/agencias' }, // OCULTO temporalmente (Andreas, 2026-06-18)
  ];

  return (
    <>
      <nav
        className={`fixed top-0 left-0 right-0 w-full z-50 glass-nav border-b transition-[border-color] duration-500 ${
          isScrolled || isMenuOpen ? 'border-black/10' : 'border-black/[0.06]'
        }`}
      >
        <div className="max-w-6xl mx-auto h-14 px-4 sm:px-8 flex justify-between items-center gap-6">
          <Link to={lp("/")} className="flex items-center shrink-0" aria-label="Unreal Studio">
            <BrandLogo imgClassName="h-7 md:h-8 w-auto object-contain" textClassName="brand-wordmark text-[22px] text-ink" />
          </Link>

          <div className="hidden lg:flex items-center gap-7 text-[13px] text-ink/70 mr-auto ml-4">
            {navLinks.map((link) => (
              <Link
                key={link.path}
                to={lp(link.path)}
                aria-current={isActive(link.path) ? 'page' : undefined}
                className={`hover:text-ink transition-colors ${isActive(link.path) ? 'text-ink font-medium' : ''}`}
              >
                {link.name}
              </Link>
            ))}
          </div>

          <div className="flex items-center gap-1 md:gap-2">
            <div className="relative hidden lg:block">
              <button
                type="button"
                onClick={() => setSettingsOpen(!settingsOpen)}
                onBlur={() => setTimeout(() => setSettingsOpen(false), 150)}
                className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-black/[0.05] text-ink transition"
                title={t('fix.nav.languageAndCurrency')}
                aria-label={t('fix.nav.languageAndCurrency')}
                aria-expanded={settingsOpen}
              >
                <span className="material-symbols-outlined text-[20px]">language</span>
              </button>
              {settingsOpen && (
                <div className="pop-in absolute right-0 mt-3 w-60 bg-white border border-primary/10 rounded-2xl shadow-2xl p-4 z-50 space-y-4">
                  <div>
                    <p className="text-xs text-primary/50 font-semibold mb-2">{t('fix.nav.language')}</p>
                    <LanguageSwitcher />
                  </div>
                  <div>
                    <p className="text-xs text-primary/50 font-semibold mb-2">{t('fix.nav.currency')}</p>
                    <select
                      value={currency}
                      onMouseDown={(e) => e.stopPropagation()}
                      onChange={(e) => setCurrency(e.target.value as any)}
                      className="w-full bg-white border border-primary/10 rounded-xl px-3 py-2 text-sm font-medium text-primary focus:ring-0 cursor-pointer hover:bg-primary/5 transition"
                    >
                      {CURRENCIES.map(c => (
                        <option key={c.code} value={c.code}>{c.code} ({c.symbol})</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* Píldora CTA estilo Movelta ("Probar la demo"): lleva al catálogo (la llamada sigue por WhatsApp, Globalitae 2026-10-13). */}
            <Link to={lp('/proyectos')} className="hidden sm:inline-flex h-8 px-4 rounded-full bg-brand text-white text-[13px] font-semibold items-center hover:bg-[#2c1803] transition">
              {t('nav.projects')}
            </Link>

            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="lg:hidden w-10 h-10 flex flex-col items-center justify-center gap-[5px] rounded-full text-primary"
              aria-label={t('admin.common.menu', 'Menú')}
              aria-expanded={isMenuOpen}
            >
              <span className={`block h-[1.5px] w-[18px] bg-current rounded transition duration-300 ${isMenuOpen ? 'translate-y-[3.25px] rotate-45' : ''}`} />
              <span className={`block h-[1.5px] w-[18px] bg-current rounded transition duration-300 ${isMenuOpen ? '-translate-y-[3.25px] -rotate-45' : ''}`} />
            </button>
          </div>
        </div>
      </nav>

      {/* Menú móvil / tablet a pantalla completa (cristal), enlaces grandes escalonados como apple.com */}
      {isMenuOpen && (
        <div className="fixed inset-x-0 top-14 bottom-0 z-[80] lg:hidden bg-white overflow-y-auto" style={{ animation: 'ust-fade .25s ease-out' }}>
          <div className="max-w-xl mx-auto px-8 md:px-12 pt-6 pb-12 flex flex-col">
            <nav className="menu-stagger flex flex-col">
              {navLinks.map((link) => (
                <Link
                  key={link.path}
                  to={lp(link.path)}
                  onClick={() => setIsMenuOpen(false)}
                  className={`py-2.5 text-[28px] md:text-[32px] font-semibold tracking-[-0.03em] text-ink ${isActive(link.path) ? 'underline decoration-2 underline-offset-8 decoration-brand' : ''}`}
                >
                  {link.name}
                </Link>
              ))}
            </nav>

            <div className="menu-stagger mt-8 pt-6 border-t border-black/10 flex flex-col gap-4">
              <div className="flex items-center gap-3 flex-wrap">
                <LanguageSwitcher />
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value as any)}
                  aria-label={t('fix.nav.currency')}
                  className="bg-[#f5f5f7] border-0 rounded-full px-3 py-1.5 text-xs font-semibold text-ink focus:ring-0 cursor-pointer transition"
                >
                  {CURRENCIES.map(c => (
                    <option key={c.code} value={c.code}>{c.code} ({c.symbol})</option>
                  ))}
                </select>
              </div>
              <a
                href={bookingLink({ medium: 'cta_mobile_menu' })}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setIsMenuOpen(false)}
                className="bg-brand text-white h-12 px-7 rounded-full font-semibold text-[17px] flex items-center gap-2 justify-center whitespace-nowrap"
              >
                <span>{t('nav.scheduleCall')}</span>
                <span className="material-symbols-outlined text-base">arrow_forward</span>
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Espaciador para compensar la barra fija */}
      <div className="h-14 w-full" />
    </>
  );
};

export default Navbar;