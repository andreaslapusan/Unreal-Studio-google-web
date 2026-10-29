/// <reference types="vite/client" />
/**
 * Landings SEO estáticas (content/landings). Mismo registro que leen el prerender
 * (scripts/prerender-og.mjs) y el sitemap (scripts/generate-sitemap.mjs).
 * Un idioma existe solo si tiene slug y <lang>.html. Borradores: VITE_SEO_DRAFTS=1 (beta).
 */
import registry from '../content/landings/index.json';

export type LandingLang = 'es' | 'en' | 'ro' | 'id';
export interface LandingMeta { title: string; description: string; h1: string; crumb: string }
export interface Landing {
  id: string; published: boolean; type: string; zone: string | null; image: string; dateModified: string;
  slugs: Partial<Record<LandingLang, string>>; meta: Partial<Record<LandingLang, LandingMeta>>;
}

const bodies = import.meta.glob('../content/landings/*/*.html', { query: '?raw', import: 'default' }) as Record<string, () => Promise<string>>;
const bodyKey = (id: string, lang: string) => `../content/landings/${id}/${lang}.html`;
const ALL = registry as Landing[];

export const LANDINGS: Landing[] = ALL.filter((l) => l.published || import.meta.env.VITE_SEO_DRAFTS === '1');

const langsOf = (l: Landing) => (Object.keys(l.slugs) as LandingLang[]).filter((lang) => bodyKey(l.id, lang) in bodies);

export function landingRoutes(): { lang: LandingLang; path: string; id: string }[] {
  return LANDINGS.flatMap((l) => langsOf(l).map((lang) => ({ lang, path: l.slugs[lang]!, id: l.id })));
}

/** '/es/invertir-en-bali' → { es: '/invertir-en-bali', en: '/invest-in-bali' } (tails sin prefijo). */
export function landingAltPaths(pathname: string): Partial<Record<LandingLang, string>> | null {
  const l = LANDINGS.find((x) => langsOf(x).some((lang) => pathname === `/${lang}/${x.slugs[lang]}`));
  if (!l) return null;
  return Object.fromEntries(langsOf(l).map((lang) => [lang, `/${l.slugs[lang]}`]));
}

/** Enlace a una landing en el idioma pedido (o EN/ES si no existe); null si no está publicada. */
export function landingLink(id: string, lang: string): { href: string; label: string } | null {
  const l = LANDINGS.find((x) => x.id === id);
  if (!l) return null;
  const use = ([lang, 'en', 'es'] as LandingLang[]).find((c) => l.slugs[c] && langsOf(l).includes(c));
  return use ? { href: `/${use}/${l.slugs[use]}`, label: l.meta[use]!.crumb } : null;
}

// Rutas de landings NO publicadas: sus enlaces en el cuerpo se quedan en texto (sin 404).
const DEAD = ALL.filter((l) => !LANDINGS.includes(l)).flatMap((l) => Object.entries(l.slugs).map(([lang, s]) => `/${lang}/${s}`));
export const unlinkDead = (html: string) =>
  html.replace(/<a href="([^"]+)">([\s\S]*?)<\/a>/g, (m, href, txt) => (DEAD.includes(href) ? txt : m));

export async function loadLandingBody(id: string, lang: string): Promise<string> {
  const load = bodies[bodyKey(id, lang)];
  return load ? unlinkDead(await load()) : '';
}

export const landingById = (id: string) => LANDINGS.find((l) => l.id === id);
