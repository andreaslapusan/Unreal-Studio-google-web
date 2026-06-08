/**
 * LocaleRoute — soporte de URLs con prefijo de idioma (/es, /en, /ro, /id).
 *
 * Diseño retrocompatible (la web es pública y está en producción):
 *  - Las páginas de marketing se sirven bajo un prefijo estático de idioma
 *    (/es/proyectos, /en/proyectos…). El prefijo MANDA sobre la detección por
 *    geo/localStorage: entrar a /en/... fuerza inglés.
 *  - Las URLs SIN prefijo (enlaces antiguos, bookmarks, los <Link> internos que
 *    siguen apuntando a /proyectos) se REDIRIGEN al prefijo del idioma actual,
 *    así no hace falta tocar todos los enlaces y nada se rompe.
 *  - Los prefijos son estáticos (no un comodín :lang) para no chocar con las
 *    rutas de los portales (/admin, /cliente, /empleados, /agencias/login…).
 */
import React, { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import i18n from '../lib/i18n';

export const SUPPORTED_LANGS = ['es', 'en', 'ro', 'id'] as const;
export type Lang = (typeof SUPPORTED_LANGS)[number];

export function currentLang(): Lang {
  // Preferencia guardada por el usuario (gana sobre el idioma actual de i18n,
  // que en el primer render puede ser aún el fallback).
  let stored: string | null = null;
  try { stored = localStorage.getItem('_unreal_lang'); } catch { /* ignore */ }
  const l = (stored || i18n.language || 'es').slice(0, 2) as Lang;
  return (SUPPORTED_LANGS as readonly string[]).includes(l) ? l : 'es';
}

/** Fija el idioma a partir del prefijo de la URL y renderiza la página. */
export const LangSetter: React.FC<{ lang: Lang; children: React.ReactNode }> = ({ lang, children }) => {
  useEffect(() => {
    if (i18n.language?.slice(0, 2) !== lang) void i18n.changeLanguage(lang);
    document.documentElement.lang = lang;
  }, [lang]);
  return <>{children}</>;
};

/** Redirige una URL sin prefijo al mismo path bajo el idioma actual. */
export const BareRedirect: React.FC = () => {
  const { pathname, search, hash } = useLocation();
  const lang = currentLang();
  const target = pathname === '/' ? `/${lang}` : `/${lang}${pathname}`;
  return <Navigate to={`${target}${search}${hash}`} replace />;
};
