/**
 * Plantillas de email "Amueblado + extensión" (solo Deseo) y "Aviso notarización" (cualquier proyecto)
 * de Clientes → Enviar correo. Se envían con el MISMO flujo que el resto (openEmailPreview: selección
 * de destinatarios, vista por persona, un correo por titular).
 * Fuente única del HTML: tabla email_templates (keys deseo_furnishing_extension / deseo_notarization),
 * sincronizada desde ~/jobs/deseo-furnishing/email por ~/jobs/deseo-furnishing/sync_pdfs.sh (cron 15 min,
 * que también sube el PDF más reciente de Drive por tipo y guarda su versión en meta.pdfs). Ver README allí.
 */
import { supabase } from './supabase';

export const FURNISHING_TYPES = ['A', 'B', 'C']; // D o sin tipo: sin plantilla ni PDF
export const DESEO_TEMPLATES = {
  furnishing: { key: 'deseo_furnishing_extension', withPdf: true },
  notarization: { key: 'deseo_notarization', withPdf: false },
} as const;
export type DeseoTemplate = keyof typeof DESEO_TEMPLATES;
export const furnishingPdfPath = (ty: string) => `emails/furnishing-2026-10/amueblado-tipo-${ty.toLowerCase()}.pdf`;
export const furnishingPdfName = (ty: string) => `Amueblado Deseo Studios - Tipo ${ty}.pdf`;

const isDeseo = (projectName?: string | null) => /deseo/i.test(projectName || '');

/** Unidad para mostrar: Deseo siempre "DS-NN" ("Unit 2" → DS-02, "4&9" → "DS-04 & DS-09"); resto, tal cual. */
export const unitLabel = (unit: string | null | undefined, projectName?: string | null): string => {
  const raw = (unit || '').trim();
  if (!raw) return '—';
  if (!isDeseo(projectName)) return raw;
  const nums = raw.match(/\d+/g);
  return nums ? nums.map((n) => `DS-${String(Number(n)).padStart(2, '0')}`).join(' & ') : raw;
};

/** "Golf Bay Lofts - 1bd" → "Golf Bay Lofts". */
export const projectShortName = (name?: string | null) => (name || '').replace(/\s*-\s*\d+\s*bd\s*$/i, '').trim();

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

/** Rellena {{nombre}} {{unidad}} {{tipo}} {{proyecto}}; dentro de un mailto: los valores van URL-encoded. */
export const fillTemplate = (html: string, v: Record<string, string>) =>
  html.replace(/(mailto:[^"']*)/g, (m) => Object.entries(v).reduce((acc, [k, val]) => acc.split(`{{${k}}}`).join(encodeURIComponent(val)), m))
    .replace(/{{(nombre|unidad|tipo|proyecto)}}/g, (_, k) => esc(v[k] || ''));

export const subjectOf = (html: string) => (html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || '')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();

export interface PdfMeta { name?: string; modifiedTime?: string; version?: string; sizeMB?: number }

export const fetchDeseoTemplate = async (tpl: DeseoTemplate): Promise<{ html: string; pdfs: Record<string, PdfMeta> } | null> => {
  const { data, error } = await supabase.from('email_templates').select('html, meta').eq('key', DESEO_TEMPLATES[tpl].key).maybeSingle();
  if (error || !data?.html) return null;
  return { html: data.html as string, pdfs: ((data.meta as any)?.pdfs || {}) as Record<string, PdfMeta> };
};
