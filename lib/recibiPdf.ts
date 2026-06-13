/**
 * Genera el recibí como PDF FIJO A4 dibujado directamente con jsPDF (NO captura
 * de pantalla / html2canvas, que en iPhone se quedaba en negro). Mismas dimensiones
 * siempre en cualquier dispositivo; se descarga como archivo real.
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
  date?: string;       // ISO o YYYY-MM-DD
  lang?: string;
  html?: string;       // recibí firmado almacenado (de ahí sacamos sello/firma)
}

const BROWN: [number, number, number] = [63, 35, 5];
const MUTE: [number, number, number] = [120, 95, 65];

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
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210; const M = 20;

  // Cabecera de marca
  doc.setTextColor(...BROWN);
  doc.setFont('times', 'bold'); doc.setFontSize(22); doc.text('Unreal Studio', W / 2, 26, { align: 'center' });
  doc.setFont('times', 'italic'); doc.setFontSize(10); doc.setTextColor(...MUTE);
  doc.text('Beyond the Ordinary, Inside the Unreal', W / 2, 32, { align: 'center' });

  // Título + número
  doc.setTextColor(...BROWN); doc.setFont('times', 'bold'); doc.setFontSize(17);
  doc.text('Recibí de pago', M, 50);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...MUTE);
  doc.text(`Nº ${d.no}`, W - M, 50, { align: 'right' });
  doc.setDrawColor(210, 190, 160); doc.setLineWidth(0.3); doc.line(M, 55, W - M, 55);

  // Filas
  let y = 70; doc.setFontSize(11);
  const row = (label: string, val: string) => {
    doc.setFont('helvetica', 'normal'); doc.setTextColor(...MUTE); doc.text(label, M, y);
    doc.setFont('helvetica', 'bold'); doc.setTextColor(...BROWN);
    const lines = doc.splitTextToSize(val || '—', W - M - 62);
    doc.text(lines, M + 52, y);
    y += 9 + (lines.length - 1) * 6;
  };
  row(lang === 'en' ? 'Received from:' : 'Recibí de:', d.receivedFrom);
  row(lang === 'en' ? 'Amount:' : 'La cantidad de:', amountInWords(d.amount, d.currency, lang));
  row(lang === 'en' ? 'For:' : 'En concepto de:', d.forPayment);

  // Caja del importe en cifras
  y += 6;
  doc.setFillColor(243, 229, 216); doc.setDrawColor(...BROWN); doc.setLineWidth(0.5);
  doc.roundedRect(M, y, 66, 18, 3, 3, 'FD');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(...BROWN);
  doc.text(formatFigure(d.amount, d.currency), M + 33, y + 11.5, { align: 'center' });
  // Lugar y fecha (derecha)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...MUTE);
  doc.text(`${d.place || 'Bali'}${d.date ? ', ' + fmtDate(d.date, lang) : ''}`, W - M, y + 8, { align: 'right' });

  // Sello + firma (extraídos del HTML firmado), abajo a la derecha
  try {
    const srcs = imgSrcs(d.html).filter((s) => !/logo/i.test(s)).slice(0, 2);
    let sx = W - M - 60; const sy = y + 22;
    for (const s of srcs) {
      const im = await loadImg(s);
      if (!im) continue;
      const maxW = 30, maxH = 26; const r = Math.min(maxW / im.w, maxH / im.h);
      const w = im.w * r, h = im.h * r;
      doc.addImage(im.data, im.fmt, sx, sy, w, h);
      sx += w + 4;
    }
    doc.setDrawColor(180, 150, 120); doc.line(W - M - 62, sy + 30, W - M, sy + 30);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...BROWN);
    doc.text('Unreal Studio', W - M - 31, sy + 35, { align: 'center' });
  } catch { /* sin firma si falla */ }

  // Pie
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(150, 130, 110);
  doc.text('Unreal Studio · Bali, Indonesia · hello@unrealstudiobali.com', W / 2, 285, { align: 'center' });

  doc.save(`recibi_${d.no}.pdf`);
}
