/**
 * Genera el recibí como PDF FIJO A4 dibujado directamente con jsPDF (NO captura
 * de pantalla / html2canvas, que en iPhone se quedaba en negro). Mismas dimensiones
 * siempre en cualquier dispositivo; se descarga como archivo real.
 *
 * El DISEÑO replica el recibí de la web (renderKwitansiHtml): tarjeta crema con
 * tarjeta blanca dentro, cabecera con marca a la IZQUIERDA y "Recibí de pago"
 * + "Nº DS-01" a la DERECHA, filas con subrayado punteado, caja del importe
 * abajo a la izquierda, lugar/fecha + sello/firma a la derecha. Añade la
 * "Fecha de vencimiento del pago" cuando viene informada.
 */
import { jsPDF } from 'jspdf';
import { amountInWords, formatFigure } from './kwitansi';

export interface RecibiPdfData {
  no: string | number;
  receivedFrom: string;
  amount: number;
  currency: string;
  forPayment: string;
  place?: string;
  date?: string;       // ISO o YYYY-MM-DD (fecha del recibí)
  dueDate?: string;    // fecha de vencimiento del pago (calendario) — solo nuevos
  projectName?: string;// para el nombre de archivo
  unit?: string;       // nº de unidad (p.ej. "DS-02") para el nombre de archivo
  lang?: string;
  html?: string;       // recibí firmado almacenado (de ahí sacamos sello/firma)
}

const BROWN: [number, number, number] = [63, 35, 5];
const MUTE: [number, number, number] = [120, 95, 65];
const CREAM: [number, number, number] = [243, 229, 216];
const LINE: [number, number, number] = [210, 190, 160];

// Etiquetas por idioma — mismas que renderKwitansiHtml (marca ES por defecto).
const LBL: Record<string, { title: string; no: string; from: string; amount: string; concept: string; due: string }> = {
  es: { title: 'Recibí de pago', no: 'Nº', from: 'Recibí de', amount: 'La cantidad de', concept: 'En concepto de', due: 'Fecha de vencimiento del pago' },
  en: { title: 'Payment receipt', no: 'No.', from: 'Received from', amount: 'The amount of', concept: 'For', due: 'Payment due date' },
  ro: { title: 'Chitanță de plată', no: 'Nr.', from: 'Primit de la', amount: 'Suma de', concept: 'Pentru', due: 'Data scadenței' },
  id: { title: 'Tanda terima', no: 'No.', from: 'Telah terima dari', amount: 'Uang sejumlah', concept: 'Untuk pembayaran', due: 'Tanggal jatuh tempo' },
};

function fmtDate(iso: string | undefined, lang: string): string {
  if (!iso) return '';
  const loc = lang === 'en' ? 'en-GB' : lang === 'id' ? 'id-ID' : lang === 'ro' ? 'ro-RO' : 'es-ES';
  try { return new Date(iso.length === 10 ? iso + 'T00:00:00' : iso).toLocaleDateString(loc, { day: '2-digit', month: 'long', year: 'numeric' }); }
  catch { return iso; }
}

function imgSrcs(html?: string): string[] {
  if (!html) return [];
  const out: string[] = []; const re = /<img[^>]+src="([^"]+)"/g; let m;
  while ((m = re.exec(html))) out.push(m[1]);
  return out;
}

// Carga una imagen remota → {dataUrl, w, h, fmt} (para jsPDF.addImage). null si falla.
async function loadImg(url: string): Promise<{ data: string; w: number; h: number; fmt: string } | null> {
  try {
    const res = await fetch(url, { mode: 'cors' });
    const blob = await res.blob();
    const data: string = await new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = no; r.readAsDataURL(blob); });
    const dims = await new Promise<{ w: number; h: number }>((ok) => { const im = new Image(); im.onload = () => ok({ w: im.naturalWidth || 200, h: im.naturalHeight || 100 }); im.onerror = () => ok({ w: 200, h: 100 }); im.src = data; });
    const fmt = data.startsWith('data:image/png') ? 'PNG' : data.startsWith('data:image/webp') ? 'WEBP' : 'JPEG';
    return { data, w: dims.w, h: dims.h, fmt };
  } catch { return null; }
}

export async function downloadRecibiPdf(d: RecibiPdfData): Promise<void> {
  const lang = d.lang || 'es';
  const L = LBL[lang] || LBL.es;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210;

  // ---- Tarjeta crema exterior + tarjeta blanca interior (como en la web) ----
  doc.setFillColor(...CREAM); doc.roundedRect(16, 22, 178, 200, 6, 6, 'F');
  doc.setFillColor(255, 255, 255); doc.setDrawColor(...LINE); doc.setLineWidth(0.4);
  doc.roundedRect(24, 30, 162, 176, 5, 5, 'FD');

  const CL = 36;   // content left
  const CR = 174;  // content right

  // ---- Cabecera: marca a la izquierda, título + Nº a la derecha ----
  doc.setTextColor(...BROWN); doc.setFont('times', 'bold'); doc.setFontSize(19);
  doc.text('Unreal Studio', CL, 48);
  doc.setFont('times', 'italic'); doc.setFontSize(9); doc.setTextColor(...MUTE);
  doc.text('Beyond the Ordinary, Inside the Unreal', CL, 53.5);

  doc.setTextColor(...BROWN); doc.setFont('times', 'bold'); doc.setFontSize(16);
  doc.text(L.title, CR, 48, { align: 'right' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...MUTE);
  doc.text(`${L.no} ${d.no}`, CR, 53.5, { align: 'right' });

  doc.setDrawColor(...LINE); doc.setLineWidth(0.3); doc.line(CL, 60, CR, 60);

  // ---- Filas con subrayado punteado ----
  const VX = 82;        // x donde empieza el valor
  let y = 73;
  const row = (label: string, val: string, style: 'bold' | 'italic' | 'normal') => {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5); doc.setTextColor(...MUTE);
    doc.text(label, CL, y);
    doc.setFont(style === 'italic' ? 'times' : 'helvetica', style === 'bold' ? 'bold' : style === 'italic' ? 'italic' : 'normal');
    doc.setFontSize(style === 'italic' ? 12 : 11); doc.setTextColor(...BROWN);
    const lines = doc.splitTextToSize(val || '—', CR - VX);
    doc.text(lines, VX, y);
    const bottom = y + (lines.length - 1) * 6 + 2.5;
    doc.setDrawColor(...MUTE); doc.setLineWidth(0.2); doc.setLineDashPattern([0.6, 0.8], 0);
    doc.line(VX, bottom, CR, bottom); doc.setLineDashPattern([], 0);
    y = bottom + 8;
  };
  row(L.from, d.receivedFrom, 'bold');
  row(L.amount, amountInWords(d.amount, d.currency, lang), 'italic');
  row(L.concept, d.forPayment, 'normal');

  // ---- Lugar + fecha + vencimiento (derecha, centrado sobre la firma) ----
  const SCX = 134; // centro de la columna derecha (firma)
  let dy = 132;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...MUTE);
  doc.text(`${d.place || 'Bali'}${d.date ? ', ' + fmtDate(d.date, lang) : ''}`, SCX, dy, { align: 'center' });
  if (d.dueDate) {
    dy += 5;
    doc.setFontSize(8); doc.setTextColor(150, 130, 110);
    doc.text(`${L.due}: ${fmtDate(d.dueDate, lang)}`, SCX, dy, { align: 'center' });
  }

  // ---- Caja del importe en cifras (abajo a la izquierda) ----
  doc.setFillColor(...CREAM); doc.setDrawColor(...BROWN); doc.setLineWidth(0.5);
  doc.roundedRect(CL, 150, 58, 16, 3, 3, 'FD');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(...BROWN);
  doc.text(formatFigure(d.amount, d.currency), CL + 29, 160.5, { align: 'center' });

  // ---- Sello + firma (extraídos del HTML firmado), centrados a la derecha ----
  try {
    let srcs = imgSrcs(d.html);
    if (srcs.length >= 3) srcs = srcs.slice(1); // descarta el logo de cabecera
    srcs = srcs.slice(0, 2);
    const loaded: { data: string; w: number; h: number; fmt: string }[] = [];
    for (const s of srcs) { const im = await loadImg(s); if (im) loaded.push(im); }
    const maxH = 22, gap = 4;
    const dims = loaded.map((im) => { const r = Math.min(28 / im.w, maxH / im.h); return { im, w: im.w * r, h: im.h * r }; });
    const totalW = dims.reduce((s, x) => s + x.w, 0) + gap * Math.max(0, dims.length - 1);
    let sx = SCX - totalW / 2; const sy = (d.dueDate ? dy : 132) + 8;
    for (const x of dims) { doc.addImage(x.im.data, x.im.fmt, sx, sy, x.w, x.h); sx += x.w + gap; }
  } catch { /* sin firma si falla */ }

  doc.setDrawColor(...MUTE); doc.setLineWidth(0.3); doc.line(SCX - 35, 172, SCX + 35, 172);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...BROWN);
  doc.text('Unreal Studio', SCX, 177, { align: 'center' });

  // ---- Pie (sobre la crema, bajo la tarjeta blanca) ----
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(150, 130, 110);
  doc.text('Unreal Studio · Bali, Indonesia · hello@unrealstudiobali.com', W / 2, 214, { align: 'center' });

  // Nombre de archivo con identidad del proyecto: "DS-02 - Unreal Studio.pdf"
  // (unidad si existe; si no, el proyecto). Saneamos caracteres no válidos.
  const who = (d.unit || d.projectName || String(d.no)).trim();
  const safe = who.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim();
  doc.save(`${safe} - Unreal Studio.pdf`);
}
