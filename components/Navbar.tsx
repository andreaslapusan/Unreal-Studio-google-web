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
    { name: t('nav.agencies'), path: '/agencias' },
  ];

  return (
    <>
      {/* Header Fijo con efecto de desvanecimiento */}
      <nav 
        className={`fixed top-0 left-0 right-0 w-full px-4 py-4 md:px-12 md:py-6 flex justify-between items-center z-50 bg-almond transition-all duration-500 ease-in-out ${
          isScrolled 
            ? 'opacity-0 -translate-y-4 blur-sm pointer-events-none' 
            : 'opacity-100 translate-y-0'
        }`}
      >
        <Link to="/" className="flex items-center shrink-0">
          <BrandLogo imgClassName="h-9 md:h-11 w-auto object-contain" textClassName="font-serif text-2xl md:text-3xl font-bold text-primary tracking-tighter" />
        </Link>

        {/* Menu Links - Hidden on Mobile AND Tablet, Visible on Large Screens */}
        <div className="hidden lg:flex items-center space-x-10 text-xs font-bold uppercase tracking-widest text-primary/70">
          {navLinks.map((link) => (
            <Link
              key={link.path}
              to={link.path}
              className={`hover:text-primary transition pb-1 ${
                isActive(link.path) ? 'text-primary border-b-2 border-primary' : ''
              }`}
            >
              {link.name}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-2 md:gap-4">
          {/* Idioma + Divisa (popover desktop ≥lg, accesible en menú hamburguesa en móvil/tablet) */}
          <div className="relative hidden lg:block">
            <button
              type="button"
              onClick={() => setSettingsOpen(!settingsOpen)}
              onBlur={() => setTimeout(() => setSettingsOpen(false), 150)}
              className="w-9 h-9 flex items-center justify-center rounded-full bg-white/60 hover:bg-white border border-primary/10 text-primary transition"
              title="Idioma y divisa"
              aria-label="Idioma y divisa"
            >
              <span className="material-symbols-outlined text-[20px]">language</span>
            </button>
            {settingsOpen && (
              <div className="absolute right-0 mt-2 w-56 bg-white border border-primary/10 rounded-xl shadow-2xl py-3 px-3 z-50 space-y-3">
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-primary/40 font-black mb-2">Idioma</p>
                  <LanguageSwitcher />
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-primary/40 font-black mb-2">Divisa</p>
                  <select
                    value={currency}
                    onMouseDown={(e) => e.stopPropagation()}
                    onChange={(e) => setCurrency(e.target.value as any)}
                    className="w-full bg-white border border-primary/10 rounded-full px-3 py-1.5 text-xs font-bold text-primary focus:ring-0 cursor-pointer hover:bg-primary/5 transition"
                  >
                    {CURRENCIES.map(c => (
                      <option key={c.code} value={c.code}>{c.code} ({c.symbol})</option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Botón Header: Optimizado para Móvil (2 líneas) y Desktop (1 línea) */}
          <a
            href={bookingLink({ medium: 'cta_navbar' })}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-primary text-white rounded-full font-bold uppercase tracking-widest hover:bg-opacity-90 transition shadow-xl whitespace-nowrap flex items-center justify-center px-4 py-2 md:px-7 md:py-3"
          >
            {/* Versión Móvil: Texto apilado y más pequeño */}
            <div className="flex flex-col items-center leading-[0.9] md:hidden">
              <span className="text-[9px]">{t('nav.scheduleShort')}</span>
            </div>
            {/* Versión Desktop: Texto normal (Visible desde md en adelante) */}
            <span className="hidden md:inline text-[10px] md:text-xs">{t('nav.scheduleCall')}</span>
          </a>

          {/* Hamburger Menu - Visible on Mobile AND Tablet (Hidden on LG+) */}
          <button 
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="lg:hidden flex items-center justify-center p-2 text-primary"
          >
            <span className="material-symbols-outlined text-3xl">menu</span>
          </button>
        </div>
      </nav>

      {/* Menú Móvil / Tablet - Se muestra hasta LG */}
      {isMenuOpen && (
        <div className="fixed inset-0 z-[60] bg-[#F3E5D8] lg:hidden flex flex-col animate-in fade-in duration-300">
          {/* Cabecera del Menú Móvil - Alineada exactamente con el Navbar */}
          <div className="flex justify-between items-center px-4 py-4 md:px-12 border-b border-primary/5 shrink-0">
              <Link to="/" onClick={() => setIsMenuOpen(false)} className="flex items-center shrink-0">
                <BrandLogo imgClassName="h-9 md:h-11 w-auto object-contain" textClassName="font-serif text-2xl md:text-3xl font-bold text-primary tracking-tighter" />
              </Link>
              <button onClick={() => setIsMenuOpen(false)} className="text-primary p-2 flex items-center justify-center bg-primary/5 rounded-full">
                <span className="material-symbols-outlined text-3xl">close</span>
              </button>
          </div>
          
          {/* Contenido del Menú */}
          <div className="flex flex-col items-center justify-start flex-grow pt-10 md:pt-16 pb-10 px-6">
            <nav className="flex flex-col items-center gap-y-4 md:gap-y-5">
              {navLinks.map((link) => (
                <Link
                  key={link.path}
                  to={link.path}
                  onClick={() => setIsMenuOpen(false)}
                  className={`text-xl md:text-2xl font-black uppercase tracking-wider ${isActive(link.path) ? 'text-primary' : 'text-primary/50'} hover:text-primary transition-colors`}
                >
                  {link.name}
                </Link>
              ))}
            </nav>

            {/* Idioma + Divisa dentro del menú lateral */}
            <div className="w-full max-w-xs flex flex-col items-center gap-3 pt-6 mt-8 border-t border-primary/10">
              <div className="flex items-center gap-3">
                <LanguageSwitcher />
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value as any)}
                  className="bg-white border border-primary/10 rounded-full px-3 py-1.5 text-[11px] font-bold text-primary focus:ring-0 cursor-pointer hover:bg-primary/5 transition"
                >
                  {CURRENCIES.map(c => (
                    <option key={c.code} value={c.code}>{c.code} ({c.symbol})</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Botón Agendar en el Menú */}
            <a
              href={bookingLink({ medium: 'cta_mobile_menu' })}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setIsMenuOpen(false)}
              className="bg-primary text-white px-8 py-3.5 rounded-full font-bold text-sm uppercase tracking-widest shadow-xl flex items-center gap-2.5 mt-6 whitespace-nowrap w-full justify-center max-w-xs"
            >
              <span>{t('nav.scheduleCall')}</span>
              <span className="material-symbols-outlined text-base">arrow_forward</span>
            </a>
          </div>
        </div>
      )}

      {/* Espaciador para compensar el header fijo */}
      <div className="h-28 w-full bg-almond transition-colors duration-300"></div>

      {/* Botón Flotante Permanente (Aparece al bajar) */}
      <div 
        className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-40 transition-all duration-500 transform ${
          isScrolled && !footerVisible
            ? 'translate-y-0 opacity-100'
            : 'translate-y-20 opacity-0 pointer-events-none'
        }`}
      >
        <a
          href={bookingLink({ medium: 'cta_floating' })}
          target="_blank"
          rel="noopener noreferrer"
          className="bg-primary text-white px-8 py-4 rounded-full font-bold text-xs uppercase tracking-widest shadow-2xl flex items-center gap-3 border border-almond/20 hover:scale-105 transition-transform whitespace-nowrap"
        >
          <span>{t('nav.scheduleCall')}</span>
          <span className="material-symbols-outlined text-sm">calendar_month</span>
        </a>
      </div>
    </>
  );
};

export default Navbar;