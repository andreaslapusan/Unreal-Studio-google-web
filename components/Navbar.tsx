import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useCurrency } from '../App';
import { CURRENCIES } from '../constants';
import LanguageSwitcher from './LanguageSwitcher';

const Navbar: React.FC = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const { currency, setCurrency } = useCurrency();
  const location = useLocation();

  useEffect(() => {
    const handleScroll = () => {
      // Ocultar header y mostrar botón flotante al bajar 50px
      setIsScrolled(window.scrollY > 50);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

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
          <span className="font-serif text-2xl md:text-3xl font-bold text-primary tracking-tighter">Unreal Studio</span>
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
          {/* Language switcher (compact) */}
          <LanguageSwitcher />

          {/* Selector de Divisa */}
          <select
            value={currency} 
            onChange={(e) => setCurrency(e.target.value as any)}
            className="bg-white/50 border border-primary/10 rounded-full px-3 py-1.5 text-[10px] font-bold text-primary focus:ring-0 cursor-pointer hover:bg-white transition"
          >
            {CURRENCIES.map(c => (
              <option key={c.code} value={c.code}>{c.code} ({c.symbol})</option>
            ))}
          </select>

          {/* Botón Header: Optimizado para Móvil (2 líneas) y Desktop (1 línea) */}
          <Link
            to="/agendar?utm_source=web&utm_medium=cta_navbar&utm_campaign=agendar_btn"
            className="bg-primary text-white rounded-full font-bold uppercase tracking-widest hover:bg-opacity-90 transition shadow-xl whitespace-nowrap flex items-center justify-center px-4 py-2 md:px-7 md:py-3"
          >
            {/* Versión Móvil: Texto apilado y más pequeño */}
            <div className="flex flex-col items-center leading-[0.9] md:hidden">
              <span className="text-[9px]">Agendar</span>
              <span className="text-[9px]">Llamada</span>
            </div>
            {/* Versión Desktop: Texto normal (Visible desde md en adelante) */}
            <span className="hidden md:inline text-[10px] md:text-xs">Agendar llamada</span>
          </Link>

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
                <span className="font-serif text-2xl md:text-3xl font-bold text-primary tracking-tighter">Unreal Studio</span>
              </Link>
              <button onClick={() => setIsMenuOpen(false)} className="text-primary p-2 flex items-center justify-center bg-primary/5 rounded-full">
                <span className="material-symbols-outlined text-3xl">close</span>
              </button>
          </div>
          
          {/* Contenido del Menú */}
          <div className="flex flex-col items-center justify-center flex-grow space-y-8 pb-10 px-6">
            {navLinks.map((link) => (
              <Link
                key={link.path}
                to={link.path}
                onClick={() => setIsMenuOpen(false)}
                className={`text-3xl font-black uppercase tracking-widest ${isActive(link.path) ? 'text-primary' : 'text-primary/40'} hover:text-primary transition-colors`}
              >
                {link.name}
              </Link>
            ))}
            
            {/* Botón Agendar en el Menú */}
            <Link
              to="/agendar?utm_source=web&utm_medium=cta_mobile_menu&utm_campaign=agendar_btn"
              onClick={() => setIsMenuOpen(false)}
              className="bg-primary text-white px-10 py-5 rounded-full font-bold text-sm uppercase tracking-widest shadow-xl flex items-center gap-3 mt-8 whitespace-nowrap w-full justify-center max-w-xs"
            >
              <span>Agendar llamada</span>
              <span className="material-symbols-outlined text-lg">arrow_forward</span>
            </Link>
          </div>
        </div>
      )}

      {/* Espaciador para compensar el header fijo */}
      <div className="h-28 w-full bg-almond transition-colors duration-300"></div>

      {/* Botón Flotante Permanente (Aparece al bajar) */}
      <div 
        className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-40 transition-all duration-500 transform ${
          isScrolled 
            ? 'translate-y-0 opacity-100' 
            : 'translate-y-20 opacity-0 pointer-events-none'
        }`}
      >
        <Link
          to="/agendar?utm_source=web&utm_medium=cta_floating&utm_campaign=agendar_btn"
          className="bg-primary text-white px-8 py-4 rounded-full font-bold text-xs uppercase tracking-widest shadow-2xl flex items-center gap-3 border border-almond/20 hover:scale-105 transition-transform whitespace-nowrap"
        >
          <span>Agendar Llamada</span>
          <span className="material-symbols-outlined text-sm">calendar_month</span>
        </Link>
      </div>
    </>
  );
};

export default Navbar;