/**
 * URLs de portales localizadas: /{idioma}/{segmento-traducido}.
 *   /es/cliente · /en/clients · /ro/clienti · /id/klien   (y empleados/agencias/admin)
 *
 * Aditivo: las rutas antiguas (/cliente, /empleados…) siguen existiendo y
 * redirigen a la versión localizada del idioma activo, para no romper accesos.
 */
import { currentLang, type Lang } from '../components/LocaleRoute';

export type Portal = 'cliente' | 'empleados' | 'agencias' | 'admin';

export const PORTAL_SEGMENTS: Record<Portal, Record<Lang, string>> = {
  cliente: { es: 'clientes', en: 'clients', ro: 'clienti', id: 'klien' },
  empleados: { es: 'empleados', en: 'employees', ro: 'angajati', id: 'karyawan' },
  agencias: { es: 'agencias', en: 'agencies', ro: 'agentii', id: 'agensi' },
  admin: { es: 'admin', en: 'admin', ro: 'admin', id: 'admin' },
};

/** Ruta localizada de un portal: portalPath('cliente','en') → "/en/clients". */
export function portalPath(portal: Portal, lang?: Lang, sub?: string): string {
  const l = lang || currentLang();
  const seg = PORTAL_SEGMENTS[portal][l] || PORTAL_SEGMENTS[portal].es;
  return `/${l}/${seg}${sub ? '/' + sub : ''}`;
}

/** Dado un pathname, devuelve {portal, lang, sub} si es una URL de portal localizada. */
export function matchPortalPath(pathname: string): { portal: Portal; lang: Lang; sub: string } | null {
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length < 2) return null;
  const [lang, seg, ...rest] = parts;
  const langs: string[] = ['es', 'en', 'ro', 'id'];
  if (!langs.includes(lang)) return null;
  for (const portal of Object.keys(PORTAL_SEGMENTS) as Portal[]) {
    if (PORTAL_SEGMENTS[portal][lang as Lang] === seg) {
      return { portal, lang: lang as Lang, sub: rest.join('/') };
    }
  }
  return null;
}
