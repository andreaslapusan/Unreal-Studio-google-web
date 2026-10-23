import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useCurrency } from '../App';
import { CURRENCIES } from '../constants';
import { bookingLink } from '../lib/bookingLink';
import LanguageSwitcher from './LanguageSwitcher';
import { useAuth } from '../lib/auth-context';
import BrandLogo from './BrandLogo';

const Navbar: React.FC = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [footerVisible, setFooterVisible] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { currency, setCurrency } = useCurrency();
  const location = useLocation();
  const { user, role, signOut } = useAuth();

  // Páginas con hero a sangre: el nav se superpone transparente con texto claro.
  // Las públicas llevan prefijo de idioma (/es, /en/proyecto/…), así que
  // detectamos home (raíz o /xx) y cualquier ficha de proyecto.
  const _pn = location.pathname.replace(/\/+$/, '');
  const heroOverlay = _pn === '' || /^\/[a-z]{2}$/.test(_pn) || _pn.includes('/proyecto/');

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
    const handleScroll = () => {
      // Ocultar header y mostrar botón flotante al bajar 50px
      setIsScrolled(window.scrollY > 50);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Ocultar el botón flotante cuando el footer entra en viewport, para que NUNCA
  // tape los enlaces inferiores del footer (Privacidad/Términos/Clientes/etc.).
  useEffect(() => {
    const footer = document.querySelector('footer');
    if (!footer || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => setFooterVisible(entries[0]?.isIntersecting ?? false),
      { rootMargin: '0px 0px -40px 0px', threshold: 0 }
    );
    observer.observe(footer);
    return () => observer.disconnect();
  }, [location.pathname]);

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

  const lightText = heroOverlay;

  return (
    <>
      {/* Cabecera: transparente sobre los héroes a sangre, piedra sólida en el resto. */}
      <nav
        aria-label={t('nav.home')}
        className={`fixed top-0 left-0 right-0 w-full z-50 transition-[opacity,transform,filter] duration-500 ease-out ${heroOverlay ? 'bg-[linear-gradient(180deg,rgba(30,27,22,0.5),rgba(30,27,22,0))]' : 'bg-almond/90 backdrop-blur-xl border-b border-primary/10'} ${
          isScrolled ? 'opacity-0 -translate-y-4 blur-sm pointer-events-none' : 'opacity-100 translate-y-0'
        }`}
      >
        <div className="max-w-[1440px] mx-auto h-[4.5rem] md:h-24 px-5 md:px-12 flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-clay rounded-sm" aria-label="Unreal Studio">
            <BrandLogo imgClassName="h-9 md:h-11 w-auto object-contain" textClassName={`text-[1.65rem] md:text-[2rem] leading-none ${lightText ? 'text-almond' : 'text-primary'}`} />
          </Link>

          <div className="hidden lg:flex items-center gap-9">
            {navLinks.map((link) => (
              <Link
                key={link.path}
                to={link.path}
                aria-current={isActive(link.path) ? 'page' : undefined}
                className={`relative text-[0.75rem] font-semibold uppercase tracking-[0.16em] py-2 transition-colors duration-300 after:absolute after:left-0 after:right-0 after:bottom-0 after:h-px after:origin-left after:transition-transform after:duration-500 after:ease-out ${lightText ? 'text-almond/75 hover:text-almond after:bg-almond' : 'text-primary/60 hover:text-primary after:bg-clay'} ${
                  isActive(link.path) ? `${lightText ? 'text-almond' : 'text-primary'} after:scale-x-100` : 'after:scale-x-0 hover:after:scale-x-100'
                }`}
              >
                {link.name}
              </Link>
            ))}
          </div>

          <div className="flex items-center gap-2 md:gap-3">
            <div className="relative hidden lg:block">
              <button
                type="button"
                onClick={() => setSettingsOpen(!settingsOpen)}
                onBlur={() => setTimeout(() => setSettingsOpen(false), 150)}
                className={`w-11 h-11 flex items-center justify-center rounded-full border transition-colors duration-300 outline-none focus-visible:ring-2 focus-visible:ring-clay ${lightText ? 'border-almond/30 text-almond hover:bg-almond hover:text-primary' : 'border-primary/15 text-primary hover:bg-primary hover:text-almond'}`}
                title={t('fix.nav.languageAndCurrency')}
                aria-label={t('fix.nav.languageAndCurrency')}
                aria-expanded={settingsOpen}
              >
                <span className="material-symbols-outlined text-[20px]">language</span>
              </button>
              {settingsOpen && (
                <div className="absolute right-0 mt-3 w-60 bg-paper border border-primary/15 rounded-[3px] shadow-[0_24px_48px_-24px_rgba(30,27,22,0.45)] p-4 z-50 space-y-4 origin-top-right motion-safe:animate-[fadeInUp_0.25s_cubic-bezier(0.23,1,0.32,1)]">
                  <div>
                    <p className="us-label text-primary/45 mb-2">{t('fix.nav.language')}</p>
                    <LanguageSwitcher />
                  </div>
                  <div>
                    <p className="us-label text-primary/45 mb-2">{t('fix.nav.currency')}</p>
                    <select
                      value={currency}
                      onMouseDown={(e) => e.stopPropagation()}
                      onChange={(e) => setCurrency(e.target.value as any)}
                      className="w-full bg-white border border-primary/15 rounded-[3px] px-3 py-2 text-sm font-medium text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-clay cursor-pointer"
                    >
                      {CURRENCIES.map(c => (
                        <option key={c.code} value={c.code}>{c.code} ({c.symbol})</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>

            <a
              href={bookingLink({ medium: 'cta_navbar' })}
              target="_blank"
              rel="noopener noreferrer"
              className={`us-btn !min-h-[2.75rem] !px-4 md:!px-6 !text-[0.6875rem] md:!text-[0.75rem] whitespace-nowrap ${lightText ? 'us-btn-light' : ''}`}
            >
              <span className="md:hidden">{t('nav.scheduleShort')}</span>
              <span className="hidden md:inline">{t('nav.scheduleCall')}</span>
            </a>

            {/* Hamburguesa: dos trazos que se cruzan en X */}
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              aria-label="Menu"
              aria-expanded={isMenuOpen}
              className={`lg:hidden relative w-11 h-11 flex items-center justify-center ${lightText ? 'text-almond' : 'text-primary'}`}
            >
              <span className="absolute h-px w-6 bg-current -translate-y-[4px]" />
              <span className="absolute h-px w-6 bg-current translate-y-[4px]" />
            </button>
          </div>
        </div>
      </nav>

      {/* Menú móvil / tablet: telón de basalto con el índice en tipografía de rótulo */}
      {isMenuOpen && (
        <div className="fixed inset-0 z-[70] bg-primary text-almond lg:hidden flex flex-col motion-safe:animate-[usMenuIn_0.5s_cubic-bezier(0.32,0.72,0,1)]" role="dialog" aria-modal="true">
          <div className="h-[4.5rem] md:h-24 px-5 md:px-12 flex justify-between items-center shrink-0">
            <Link to="/" onClick={() => setIsMenuOpen(false)} className="flex items-center shrink-0">
              <BrandLogo imgClassName="h-9 md:h-11 w-auto object-contain" textClassName="text-[1.65rem] md:text-[2rem] leading-none text-almond" />
            </Link>
            <button onClick={() => setIsMenuOpen(false)} aria-label={t('common.close', { defaultValue: 'Cerrar' })} className="relative w-11 h-11 flex items-center justify-center text-almond">
              <span className="absolute h-px w-6 bg-current rotate-45" />
              <span className="absolute h-px w-6 bg-current -rotate-45" />
            </button>
          </div>

          <div className="flex-1 flex flex-col justify-between px-5 md:px-12 pt-6 pb-[max(2rem,env(safe-area-inset-bottom))] overflow-y-auto">
            <nav className="flex flex-col border-t border-almond/15">
              {navLinks.map((link, i) => (
                <Link
                  key={link.path}
                  to={link.path}
                  onClick={() => setIsMenuOpen(false)}
                  aria-current={isActive(link.path) ? 'page' : undefined}
                  style={{ animationDelay: `${120 + i * 60}ms` }}
                  className={`group flex items-center justify-between py-4 border-b border-almond/15 font-display uppercase text-[2.1rem] md:text-5xl leading-none motion-safe:animate-[fadeInUp_0.6s_cubic-bezier(0.23,1,0.32,1)_both] ${isActive(link.path) ? 'text-clay-light' : 'text-almond'}`}
                >
                  {link.name}
                  <span className="material-symbols-outlined text-2xl opacity-40">arrow_outward</span>
                </Link>
              ))}
            </nav>

            <div className="mt-10 space-y-5">
              <div className="flex items-center gap-3 flex-wrap">
                <LanguageSwitcher inverted />
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value as any)}
                  aria-label={t('fix.nav.currency')}
                  className="bg-transparent border border-almond/25 rounded-[3px] px-3 py-2 text-sm font-medium text-almond focus:outline-none focus-visible:ring-2 focus-visible:ring-clay-light cursor-pointer"
                  style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23ECE6DC' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")" }}
                >
                  {CURRENCIES.map(c => (
                    <option key={c.code} value={c.code} className="text-primary">{c.code} ({c.symbol})</option>
                  ))}
                </select>
              </div>
              <a
                href={bookingLink({ medium: 'cta_mobile_menu' })}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setIsMenuOpen(false)}
                className="us-btn us-btn-light w-full"
              >
                {t('nav.scheduleCall')} <span className="material-symbols-outlined">arrow_forward</span>
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Espaciador del header fijo (no en páginas con héroe a sangre). */}
      {!heroOverlay && <div className="h-[4.5rem] md:h-24 w-full" aria-hidden="true"></div>}

      {/* CTA flotante al bajar */}
      <div
        className={`fixed bottom-6 md:bottom-8 left-1/2 -translate-x-1/2 z-40 transition-[opacity,transform] duration-500 ease-out ${
          isScrolled && !footerVisible ? 'translate-y-0 opacity-100' : 'translate-y-20 opacity-0 pointer-events-none'
        }`}
      >
        <a
          href={bookingLink({ medium: 'cta_floating' })}
          target="_blank"
          rel="noopener noreferrer"
          className="us-btn whitespace-nowrap shadow-[0_20px_40px_-16px_rgba(30,27,22,0.55)]"
        >
          {t('nav.scheduleCall')} <span className="material-symbols-outlined">calendar_month</span>
        </a>
      </div>
    </>
  );
};

export default Navbar;