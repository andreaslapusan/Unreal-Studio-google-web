/** Reportes de obra PRIVADOS (bucket `reports`). En BD se guarda la ruta pelada
 * `property-updates/<project_id>/<fichero>`; para abrirlo se enlaza a /report/<ruta> (pages/ReportOpen),
 * que con la sesión pide a la edge fn `report-url` un enlace firmado de 10 min. */
import { supabase } from './supabase';

export const REPORTS_BUCKET = 'reports';
const LEGACY = '/storage/v1/object/public/images/';

/** Ruta en el bucket privado, o null si no es un reporte privado (p.ej. enlace de Drive). */
export function reportPath(v?: string | null): string | null {
  if (!v) return null;
  const p = v.includes(LEGACY + 'property-updates/') ? v.split(LEGACY)[1] : v; // URL pública vieja → ruta
  return p.startsWith('property-updates/') ? p : null;
}

/** href para un enlace de reporte: privado → /report/<ruta>; externo → tal cual. */
export function reportHref(v?: string | null): string {
  const p = reportPath(v);
  return p ? '/report/' + p : (v || '');
}

/** Enlace firmado (10 min). En nuestro dominio se sirve vía /rs/ (proxy nginx) para no exponer supabase.co. */
export async function signReport(path: string): Promise<{ url?: string; status: number }> {
  const { data, error } = await supabase.functions.invoke('report-url', { body: { path } });
  if (error || !data?.url) return { status: (error as { context?: { status?: number } })?.context?.status ?? 500 };
  const url: string = data.url;
  const ours = /(^|\.)unrealstudiobali\.com$/.test(window.location.hostname);
  return { status: 200, url: ours ? url.replace(/^https:\/\/[^/]+\/storage\/v1\/object\/sign\/reports\//, '/rs/') : url };
}

/** iOS (PWA instalada, app, navegadores in-app) abre target=_blank en OTRO almacenamiento SIN la
 * sesión → /report/ mostraba "inicia sesión". Por eso, con sesión, firmamos aquí cada enlace
 * /report/ visible y lo cambiamos por el enlace firmado: el clic abre el PDF directo en cualquier
 * pestaña. Sin sesión no se firma nada → el enlace reenviado sigue bloqueado. */
const signed = new Map<string, { at: number; p: Promise<string | undefined> }>();
const FRESH_MS = 8 * 60 * 1000; // la firma dura 10 min: se renueva antes
const getSigned = (path: string) => {
  const hit = signed.get(path);
  if (hit && Date.now() - hit.at < FRESH_MS) return hit.p;
  const p = signReport(path).then((r) => { if (!r.url) signed.delete(path); return r.url; }); // fallo → reintentar luego
  signed.set(path, { at: Date.now(), p });
  return p;
};
const pathOf = (a: HTMLAnchorElement) => {
  const h = a.getAttribute('href') || '';
  return h.startsWith('/report/') ? decodeURIComponent(h.slice(8)) : a.dataset.report || ''; // href nuevo de React manda
};
const setHref = (a: HTMLAnchorElement, h: string) => { if (a.getAttribute('href') !== h) a.setAttribute('href', h); };

async function presignAll() {
  const links = [...document.querySelectorAll<HTMLAnchorElement>('a[href^="/report/"], a[data-report]')];
  if (!links.length || !(await supabase.auth.getSession()).data.session) return;
  for (const a of links) {
    const path = pathOf(a);
    if (!path) continue;
    a.dataset.report = path;
    void getSigned(path).then((url) => setHref(a, url || '/report/' + path));
  }
}

export function initReportLinks() {
  let t: number | undefined;
  const run = () => { clearTimeout(t); t = window.setTimeout(() => void presignAll(), 150); };
  new MutationObserver(run).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['href'] });
  window.setInterval(run, 60 * 1000); // renueva las firmas antes de que caduquen
  supabase.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_OUT') signed.clear(); run(); }); // sin sesión no se reutilizan firmas
  // Clic antes de que acabe la firma: esperarla y abrir el PDF firmado (no la página /report/).
  document.addEventListener('click', (e) => {
    const a = (e.target as Element | null)?.closest?.('a') as HTMLAnchorElement | null;
    if (!a || e.defaultPrevented || !a.getAttribute('href')?.startsWith('/report/')) return;
    e.preventDefault();
    const path = pathOf(a);
    void getSigned(path).then((url) => {
      const dest = url || '/report/' + path;
      const w = a.target === '_blank' ? window.open(dest, '_blank') : null;
      if (w) w.opener = null; else window.location.assign(dest); // popup bloqueado → misma pestaña
    });
  }, true);
}
