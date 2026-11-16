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
        className={`fixed top-0 left-0 right-0 w-full z-50 glass-nav transition-[box-shadow,background-color] duration-500 ${
          isScrolled ? 'shadow-[0_1px_0_rgba(63,35,5,0.08)]' : ''
        }`}
      >
        <div className="max-w-7xl mx-auto h-14 md:h-16 px-4 md:px-8 flex justify-between items-center">
          <Link to={lp("/")} className="flex items-center shrink-0" aria-label="Unreal Studio">
            <BrandLogo imgClassName="h-8 md:h-9 w-auto object-contain" textClassName="font-serif text-xl md:text-2xl font-bold text-primary tracking-tighter" />
          </Link>

          <div className="hidden lg:flex items-center gap-1 text-[13px] font-medium text-primary/70">
            {navLinks.map((link) => (
              <Link
                key={link.path}
                to={lp(link.path)}
                aria-current={isActive(link.path) ? 'page' : undefined}
                className={`relative px-4 py-2 rounded-full hover:text-primary hover:bg-primary/[0.05] transition ${
                  isActive(link.path) ? 'text-primary after:absolute after:left-1/2 after:-translate-x-1/2 after:bottom-0.5 after:w-1 after:h-1 after:rounded-full after:bg-primary' : ''
                }`}
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
                className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-primary/[0.06] text-primary transition"
                title={t('fix.nav.languageAndCurrency')}
                aria-label={t('fix.nav.languageAndCurrency')}
                aria-expanded={settingsOpen}
              >
                <span className="material-symbols-outlined text-[20px]">language</span>
              </button>
              {settingsOpen && (
                <div className="pop-in absolute right-0 mt-3 w-60 bg-white/90 backdrop-blur-xl border border-primary/10 rounded-2xl shadow-2xl p-4 z-50 space-y-4">
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

            {/* CTA fijo "Agendar llamada" RETIRADO (Globalitae 2026-10-13): el contacto va por WhatsApp flotante. */}

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
        <div className="fixed inset-x-0 top-14 md:top-16 bottom-0 z-[80] lg:hidden bg-almond/[0.96] backdrop-blur-2xl overflow-y-auto" style={{ animation: 'ust-fade .25s ease-out' }}>
          <div className="max-w-xl mx-auto px-8 md:px-12 pt-6 pb-12 flex flex-col">
            <nav className="menu-stagger flex flex-col">
              {navLinks.map((link) => (
                <Link
                  key={link.path}
                  to={lp(link.path)}
                  onClick={() => setIsMenuOpen(false)}
                  className={`py-2.5 text-[28px] md:text-[32px] font-semibold tracking-tight ${isActive(link.path) ? 'text-primary' : 'text-primary/55'} hover:text-primary transition-colors`}
                >
                  {link.name}
                </Link>
              ))}
            </nav>

            <div className="menu-stagger mt-8 pt-6 border-t border-primary/10 flex flex-col gap-4">
              <div className="flex items-center gap-3 flex-wrap">
                <LanguageSwitcher />
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value as any)}
                  aria-label={t('fix.nav.currency')}
                  className="bg-white/70 border border-primary/10 rounded-full px-3 py-1.5 text-xs font-semibold text-primary focus:ring-0 cursor-pointer hover:bg-white transition"
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
                className="bg-primary text-white px-7 py-3.5 rounded-full font-semibold text-[15px] flex items-center gap-2 justify-center whitespace-nowrap"
              >
                <span>{t('nav.scheduleCall')}</span>
                <span className="material-symbols-outlined text-base">arrow_forward</span>
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Espaciador para compensar la barra fija */}
      <div className="h-14 md:h-16 w-full" />
    </>
  );
};

export default Navbar;