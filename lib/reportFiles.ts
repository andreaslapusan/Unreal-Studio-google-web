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
