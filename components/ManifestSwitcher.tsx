/**
 * ManifestSwitcher — cambia el <link rel="manifest"> y el título de la app web
 * según la sección, para que cada portal se pueda INSTALAR como su propia app
 * (start_url propio). Sin esto, iOS usaba siempre start_url "/" del manifest
 * principal y solo dejaba instalar la web pública.
 */
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const PORTAL: Record<string, { manifest: string; title: string }> = {
  empleados: { manifest: '/manifest-empleados.webmanifest', title: 'Unreal · Empleados' },
  cliente: { manifest: '/manifest-cliente.webmanifest', title: 'Unreal · Cliente' },
  agencias: { manifest: '/manifest-agencias.webmanifest', title: 'Unreal · Agencias' },
  admin: { manifest: '/manifest-admin.webmanifest', title: 'Unreal · Admin' },
};

export default function ManifestSwitcher() {
  const { pathname } = useLocation();
  useEffect(() => {
    const seg = pathname.split('/')[1] || '';
    const p = PORTAL[seg];
    const href = p?.manifest || '/manifest.webmanifest';
    const title = p?.title || 'Unreal Studio';

    let link = document.querySelector('link[rel="manifest"]') as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement('link');
      link.rel = 'manifest';
      document.head.appendChild(link);
    }
    if (link.getAttribute('href') !== href) link.setAttribute('href', href);

    let meta = document.querySelector('meta[name="apple-mobile-web-app-title"]') as HTMLMetaElement | null;
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'apple-mobile-web-app-title');
      document.head.appendChild(meta);
    }
    meta.setAttribute('content', title);
  }, [pathname]);

  return null;
}
