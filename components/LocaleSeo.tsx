/**
 * LocaleSeo — inyecta <link rel="canonical"> + <link rel="alternate" hreflang>
 * para cada idioma en cada página pública con prefijo de idioma. Sin dependencia
 * de Helmet: manipula el <head> directamente (la web ya gestiona el title así).
 *
 * Solo actúa en rutas públicas prefijadas (/es, /en, /ro, /id); en portales o
 * rutas sin prefijo limpia las etiquetas para no confundir a los buscadores.
 */
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { SUPPORTED_LANGS } from './LocaleRoute';

const ORIGIN = 'https://unrealstudiobali.com';
const MARK = 'data-locale-seo';

function clear() {
  document.querySelectorAll(`[${MARK}]`).forEach((el) => el.remove());
}

export default function LocaleSeo() {
  const { pathname } = useLocation();

  useEffect(() => {
    clear();
    const seg = pathname.split('/').filter(Boolean);
    const first = seg[0];
    // Solo en rutas públicas con prefijo de idioma.
    if (!first || !(SUPPORTED_LANGS as readonly string[]).includes(first)) return;
    const cleanPath = '/' + seg.slice(1).join('/'); // sin el prefijo de idioma
    const tail = cleanPath === '/' ? '' : cleanPath;

    const head = document.head;
    const add = (rel: string, href: string, hreflang?: string) => {
      const link = document.createElement('link');
      link.setAttribute(MARK, '1');
      link.rel = rel;
      link.href = href;
      if (hreflang) link.hreflang = hreflang;
      head.appendChild(link);
    };

    add('canonical', `${ORIGIN}/${first}${tail}`);
    for (const l of SUPPORTED_LANGS) add('alternate', `${ORIGIN}/${l}${tail}`, l);
    add('alternate', `${ORIGIN}/es${tail}`, 'x-default');

    return clear;
  }, [pathname]);

  return null;
}
