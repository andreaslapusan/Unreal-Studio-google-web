/**
 * Recibí de pago — generador del recibo de Unreal Studio (antes "kwitansi").
 *
 * Documento en el idioma del cliente (es por defecto): Nº, recibí de, cantidad en
 * LETRAS, concepto, cantidad en números, lugar, fecha, sello y firma.
 * Sin dependencias: el panel admin lo importa para el preview y para el HTML que
 * manda a la edge function `send-client-email`. Mismo diseño en portal/email/PDF.
 */

export interface KwitansiData {
  no: string | number;
  receivedFrom: string;
  amount: number;
  currency?: string;
  forPayment: string;
  place?: string;
  date?: string;                  // ISO yyyy-mm-dd
  lang?: string;                  // es | en | ro | id (default es)
  logoUrl?: string;
  signatureUrl?: string;
  stampUrl?: string;
}

// ---------- Cantidad en letras (español) ----------
const ES_U = ['', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez',
  'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte',
  'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve'];
const ES_D = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
const ES_C = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];

function esDecenas(n: number): string {
  if (n < 30) return ES_U[n];
  const d = Math.floor(n / 10), u = n % 10;
  return u === 0 ? ES_D[d] : `${ES_D[d]} y ${ES_U[u]}`;
}
function esCentenas(n: number): string {
  if (n === 0) return '';
  if (n === 100) return 'cien';
  const c = Math.floor(n / 100), r = n % 100;
  return `${c ? ES_C[c] : ''} ${r ? esDecenas(r) : ''}`.trim();
}
function esGrupo(n: number, uno: string, many: string): string {
  if (n === 0) return '';
  if (n === 1) return uno;
  // apócope: ...uno -> ...ún (veintiuno->veintiún, treinta y uno->treinta y un)
  let w = esCentenas(n).replace(/veintiuno$/, 'veintiún').replace(/uno$/, 'ún');
  return `${w} ${many}`;
}
export function numeroALetras(num: number): string {
  num = Math.floor(Math.abs(num));
  if (num === 0) return 'cero';
  const millones = Math.floor(num / 1_000_000);
  const resto = num % 1_000_000;
  const miles = Math.floor(resto / 1000);
  const cientos = resto % 1000;
  let out = '';
  if (millones === 1) out += 'un millón ';
  else if (millones > 1) out += `${numeroALetras(millones)} millones `;
  out += esGrupo(miles, 'mil', 'mil');
  if (miles > 0) out += ' ';
  out += esCentenas(cientos);
  return out.replace(/\s+/g, ' ').trim();
}

// ---------- Indonesian (kept for reference / id locale) ----------
const SATUAN = ['', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan', 'sepuluh', 'sebelas'];
export function terbilang(input: number): string {
  const n = Math.floor(Math.abs(input));
  let temp = '';
  if (n < 12) temp = ' ' + SATUAN[n];
  else if (n < 20) temp = terbilang(n - 10) + ' belas';
  else if (n < 100) temp = terbilang(Math.floor(n / 10)) + ' puluh' + terbilang(n % 10);
  else if (n < 200) temp = ' seratus' + terbilang(n - 100);
  else if (n < 1000) temp = terbilang(Math.floor(n / 100)) + ' ratus' + terbilang(n % 100);
  else if (n < 2000) temp = ' seribu' + terbilang(n - 1000);
  else if (n < 1_000_000) temp = terbilang(Math.floor(n / 1000)) + ' ribu' + terbilang(n % 1000);
  else if (n < 1_000_000_000) temp = terbilang(Math.floor(n / 1_000_000)) + ' juta' + terbilang(n % 1_000_000);
  else if (n < 1_000_000_000_000) temp = terbilang(Math.floor(n / 1_000_000_000)) + ' miliar' + terbilang(n % 1_000_000_000);
  else temp = terbilang(Math.floor(n / 1_000_000_000_000)) + ' triliun' + terbilang(n % 1_000_000_000_000);
  return temp.replace(/\s+/g, ' ').trim();
}

const CURRENCY_WORD: Record<string, Record<string, string>> = {
  es: { IDR: 'rupias', EUR: 'euros', USD: 'dólares' },
  en: { IDR: 'rupiah', EUR: 'euros', USD: 'dollars' },
  id: { IDR: 'Rupiah', EUR: 'Euro', USD: 'Dolar' },
};

/** Cantidad en letras + divisa, capitalizado. */
export function amountInWords(amount: number, currency = 'IDR', lang = 'es'): string {
  let words: string;
  if (lang === 'id') words = terbilang(amount);
  else words = numeroALetras(amount); // es/en/ro -> usamos español (marca ES)
  // apócope final antes de la divisa: "...uno euros" -> "...un euro"? mantenemos plural "euros"
  words = words.replace(/\buno$/, 'un');
  const cur = (CURRENCY_WORD[lang] || CURRENCY_WORD.es)[currency] ?? currency;
  const full = `${words} ${cur}`.trim();
  return full.charAt(0).toUpperCase() + full.slice(1);
}

const SYMBOL: Record<string, string> = { IDR: 'Rp', EUR: '€', USD: '$' };
export function formatFigure(amount: number, currency = 'IDR'): string {
  const loc = currency === 'IDR' ? 'id-ID' : 'es-ES';
  const sep = new Intl.NumberFormat(loc, { useGrouping: 'always' } as any);
  return `${SYMBOL[currency] ?? currency} ${sep.format(Math.round(amount))},-`;
}

function fmtDate(iso: string | undefined, lang: string): string {
  if (!iso) return '';
  const loc = lang === 'en' ? 'en-GB' : lang === 'id' ? 'id-ID' : lang === 'ro' ? 'ro-RO' : 'es-ES';
  try { return new Date(iso).toLocaleDateString(loc, { day: '2-digit', month: 'long', year: 'numeric' }); }
  catch { return iso; }
}

const esc = (s: string) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

const LABELS: Record<string, { title: string; no: string; from: string; amount: string; concept: string }> = {
  es: { title: 'Recibí de pago', no: 'Nº', from: 'Recibí de', amount: 'La cantidad de', concept: 'En concepto de' },
  en: { title: 'Payment receipt', no: 'No.', from: 'Received from', amount: 'The amount of', concept: 'For' },
  ro: { title: 'Chitanță de plată', no: 'Nr.', from: 'Primit de la', amount: 'Suma de', concept: 'Pentru' },
  id: { title: 'Tanda terima', no: 'No.', from: 'Telah terima dari', amount: 'Uang sejumlah', concept: 'Untuk pembayaran' },
};

/**
 * HTML auto-contenido (estilos inline). Café-noir #3F2305 + crema #F3E5D8.
 * Sello y firma encima de la línea, con espacio (no se cortan).
 */
export function renderKwitansiHtml(d: KwitansiData): string {
  const lang = d.lang || 'es';
  const L = LABELS[lang] || LABELS.es;
  const currency = d.currency ?? 'IDR';
  const place = d.place ?? 'Bali';
  const words = amountInWords(d.amount, currency, lang);
  const figure = formatFigure(d.amount, currency);
  const dateStr = fmtDate(d.date, lang);
  const logo = d.logoUrl
    ? `<img src="${esc(d.logoUrl)}" alt="Unreal Studio" style="height:30px;opacity:.95" />`
    : `<span style="font-family:'DM Serif Display',Georgia,serif;font-size:24px;font-weight:700;letter-spacing:.3px;color:#3F2305">Unreal Studio</span>`;

  return `
<style>
@media (max-width:520px){
  .kwrcpt{padding:16px !important}
  .kwrcpt .kwcard{padding:20px 18px !important}
  .kwrcpt table{display:block !important;width:100% !important}
  .kwrcpt tbody,.kwrcpt tr{display:block !important;width:100% !important}
  .kwrcpt td{display:block !important;width:100% !important;text-align:left !important;vertical-align:top !important}
  .kwrcpt .kwfig{margin:6px 0 18px !important}
  .kwrcpt .kwsign{text-align:left !important}
}
</style>
<div class="kwrcpt" style="max-width:560px;margin:0 auto;background:#F3E5D8;padding:28px;border-radius:18px;font-family:Manrope,Arial,sans-serif;color:#3F2305">
  <div class="kwcard" style="background:#fff;border:1px solid rgba(63,35,5,.18);border-radius:14px;padding:30px 32px">
    <!-- Cabecera: logo + lema + título -->
    <table style="width:100%;border-collapse:collapse"><tr>
      <td style="text-align:left;vertical-align:top">
        ${logo}
        <div style="font-family:'Cormorant Garamond',Georgia,serif;font-style:italic;font-size:13px;color:rgba(63,35,5,.55);margin-top:2px">Beyond the Ordinary, Inside the Unreal</div>
      </td>
      <td style="text-align:right;vertical-align:top">
        <div style="font-family:'DM Serif Display',Georgia,serif;font-size:22px;color:#3F2305">${esc(L.title)}</div>
        <div style="font-size:12px;color:rgba(63,35,5,.55)">${esc(L.no)} ${esc(String(d.no))}</div>
      </td>
    </tr></table>

    <div style="height:1px;background:rgba(63,35,5,.15);margin:20px 0 22px"></div>

    <table style="width:100%;font-size:14px;line-height:2">
      <tr><td style="width:150px;color:rgba(63,35,5,.6);vertical-align:top">${esc(L.from)}</td>
          <td style="font-weight:700;border-bottom:1px dotted rgba(63,35,5,.35)">${esc(d.receivedFrom)}</td></tr>
      <tr><td style="color:rgba(63,35,5,.6);vertical-align:top">${esc(L.amount)}</td>
          <td style="font-style:italic;border-bottom:1px dotted rgba(63,35,5,.35)">${esc(words)}</td></tr>
      <tr><td style="color:rgba(63,35,5,.6);vertical-align:top">${esc(L.concept)}</td>
          <td style="border-bottom:1px dotted rgba(63,35,5,.35)">${esc(d.forPayment)}</td></tr>
    </table>

    <table style="width:100%;margin-top:30px"><tr>
      <td class="kwfig" style="vertical-align:bottom;width:45%">
        <div style="display:inline-block;background:#F3E5D8;border:1.5px solid #3F2305;border-radius:10px;padding:10px 18px;font-size:18px;font-weight:800;letter-spacing:.5px">${esc(figure)}</div>
      </td>
      <td class="kwsign" style="text-align:center;vertical-align:bottom">
        <div style="font-size:13px;color:rgba(63,35,5,.7);margin-bottom:6px">${esc(place)}${dateStr ? ', ' + esc(dateStr) : ''}</div>
        <!-- Sello a la IZQUIERDA + firma GRANDE a la derecha, pisándolo un poco
             por su parte izquierda. Todo POR ENCIMA de la línea (no se corta). -->
        <div style="position:relative;height:118px;margin-bottom:6px;text-align:left">
          ${d.stampUrl ? `<img src="${esc(d.stampUrl)}" alt="" style="position:absolute;left:4px;top:10px;max-height:98px;max-width:118px;opacity:.88" />` : ''}
          ${d.signatureUrl ? `<img src="${esc(d.signatureUrl)}" alt="" style="position:absolute;left:86px;top:16px;max-height:96px;max-width:190px" />` : ''}
        </div>
        <div style="border-top:1px solid rgba(63,35,5,.4);padding-top:8px;font-size:12px;font-weight:700">Unreal Studio</div>
      </td>
    </tr></table>
  </div>
  <div style="text-align:center;font-size:10px;color:rgba(63,35,5,.45);margin-top:12px">Unreal Studio · Bali, Indonesia · hello@unrealstudiobali.com</div>
</div>`.trim();
}
