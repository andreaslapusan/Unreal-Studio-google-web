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
import { landingAltPaths } from '../lib/landings';

const ORIGIN = 'https://unrealstudiobali.com';
const MARK = 'data-locale-seo';
// URL de entrada: el JSON-LD pre-renderizado (scripts/prerender-og.mjs) solo describe esa.
const ENTRY_PATH = typeof window !== 'undefined' ? window.location.pathname : '';

function clear() {
  document.querySelectorAll(`[${MARK}]`).forEach((el) => el.remove());
}

export default function LocaleSeo() {
  const { pathname } = useLocation();

  useEffect(() => {
    clear();
    if (pathname !== ENTRY_PATH) document.querySelectorAll('script[data-prerender-ld]').forEach((el) => el.remove());
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
    // Landings: slug distinto por idioma y solo los idiomas que existen.
    const alts: Record<string, string> = landingAltPaths(pathname) ?? Object.fromEntries(SUPPORTED_LANGS.map((l) => [l, tail]));
    for (const [l, t] of Object.entries(alts)) add('alternate', `${ORIGIN}/${l}${t}`, l);
    add('alternate', `${ORIGIN}/es${alts.es ?? tail}`, 'x-default');

    // Actualiza el content-language al idioma de la URL (en index.html es estático
    // "es" y quedaba mal en /en /ro /id). También el atributo lang del <html>.
    const cl = document.head.querySelector('meta[http-equiv="content-language"]');
    if (cl) cl.setAttribute('content', first);
    document.documentElement.lang = first;

    return clear;
  }, [pathname]);

  return null;
}
