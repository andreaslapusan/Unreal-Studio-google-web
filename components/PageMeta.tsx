/**
 * PageMeta — fija título, meta-description y Open Graph POR PÁGINA (y por idioma).
 *
 * Problema que resuelve (hallazgo SEO #1): todas las páginas salvo la home
 * compartían la descripción/título genéricos del index.html → Google y las redes
 * mostraban el texto de la home en Blog, Proyectos, FAQ, Contacto. Con esto cada
 * página declara los suyos. El canonical + hreflang los pone <LocaleSeo/> aparte.
 *
 * Sin react-helmet (la web maneja el head imperativamente). Uso recomendado:
 * el hook `usePageMeta({ title, description })` allí donde la página ya fijaba
 * `document.title`. También existe el componente <PageMeta/> equivalente.
 */
import { useEffect } from 'react';

const MARK = 'data-page-meta';
const ORIGIN = 'https://unrealstudiobali.com';

function setMeta(selector: string, attr: 'name' | 'property', key: string, content: string) {
  let el = document.head.querySelector(selector) as HTMLMetaElement | null;
  if (!el) { el = document.createElement('meta'); el.setAttribute(attr, key); el.setAttribute(MARK, '1'); document.head.appendChild(el); }
  el.setAttribute('content', content);
}

export interface PageMetaOpts {
  title: string;
  description?: string;
  image?: string;   // ruta absoluta o relativa para og:image
  type?: string;    // og:type (website | article)
}

function apply({ title, description, image, type = 'website' }: PageMetaOpts) {
  if (title) {
    document.title = title;
    setMeta('meta[property="og:title"]', 'property', 'og:title', title);
    setMeta('meta[name="twitter:title"]', 'name', 'twitter:title', title);
  }
  if (description) {
    setMeta('meta[name="description"]', 'name', 'description', description);
    setMeta('meta[property="og:description"]', 'property', 'og:description', description);
    setMeta('meta[name="twitter:description"]', 'name', 'twitter:description', description);
  }
  setMeta('meta[property="og:type"]', 'property', 'og:type', type);
  setMeta('meta[property="og:url"]', 'property', 'og:url', ORIGIN + window.location.pathname);
  // Tarjeta grande en X/Twitter + locale OG según el prefijo de idioma de la URL.
  setMeta('meta[name="twitter:card"]', 'name', 'twitter:card', 'summary_large_image');
  const LOCALES: Record<string, string> = { es: 'es_ES', en: 'en_US', ro: 'ro_RO', id: 'id_ID' };
  const seg = window.location.pathname.split('/').filter(Boolean)[0];
  setMeta('meta[property="og:locale"]', 'property', 'og:locale', LOCALES[seg] || 'es_ES');
  if (image) {
    const abs = image.startsWith('http') ? image : ORIGIN + image;
    setMeta('meta[property="og:image"]', 'property', 'og:image', abs);
    setMeta('meta[name="twitter:image"]', 'name', 'twitter:image', abs);
  }
}

export function usePageMeta(opts: PageMetaOpts) {
  const { title, description, image, type } = opts;
  useEffect(() => { apply({ title, description, image, type }); }, [title, description, image, type]);
}

export default function PageMeta(props: PageMetaOpts) {
  usePageMeta(props);
  return null;
}
