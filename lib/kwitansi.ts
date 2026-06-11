/**
 * Kwitansi (Indonesian payment receipt) generator.
 *
 * Reproduces the format of Andreas's handwritten Unreal Studio kwitansi:
 *   No. · Telah terima dari · Uang sejumlah (terbilang) · Untuk pembayaran · Rp.
 * plus place/date and the Unreal Studio signature/stamp.
 *
 * Pure & dependency-free on purpose: the admin panel imports it to render the
 * preview and to produce the HTML it hands to the `send-client-email` edge
 * function (which only mails the string — no duplicated logic server-side).
 */

export interface KwitansiData {
  no: string | number;            // receipt number (sequential)
  receivedFrom: string;           // "Telah terima dari" — client / payer name
  amount: number;                 // figure
  currency?: string;              // default IDR
  forPayment: string;             // "Untuk pembayaran" — what it's for (unit / milestone)
  place?: string;                 // default Bali
  date?: string;                  // ISO yyyy-mm-dd; default today (caller passes)
  logoUrl?: string;               // absolute URL to the Unreal logo for emails
  signatureUrl?: string;          // absolute URL to Andreas's signature PNG (optional)
  stampUrl?: string;              // absolute URL to the company stamp/seal PNG (optional)
}

const SATUAN = [
  '', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan',
  'sembilan', 'sepuluh', 'sebelas',
];

/** Convert an integer to Indonesian words (terbilang). */
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

const CURRENCY_WORD: Record<string, string> = { IDR: 'Rupiah', EUR: 'Euro', USD: 'Dollar' };

/** Amount in words, e.g. "Lima Puluh Empat Juta Rupiah". */
export function amountInWords(amount: number, currency = 'IDR'): string {
  const words = terbilang(amount);
  const cased = words.replace(/\b\w/g, (c) => c.toUpperCase());
  return `${cased} ${CURRENCY_WORD[currency] ?? currency}`.trim();
}

const SYMBOL: Record<string, string> = { IDR: 'Rp', EUR: '€', USD: '$' };

/** Figure with thousands separators, e.g. "Rp 54.000.000,-". */
export function formatFigure(amount: number, currency = 'IDR'): string {
  const loc = currency === 'IDR' ? 'id-ID' : 'es-ES';
  const sep = new Intl.NumberFormat(loc, { useGrouping: 'always' } as any);
  return `${SYMBOL[currency] ?? currency} ${sep.format(Math.round(amount))},-`;
}

function fmtDate(iso?: string): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
  } catch {
    return iso;
  }
}

const esc = (s: string) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

/**
 * Self-contained HTML kwitansi (inline styles only, so it survives email
 * clients and prints cleanly). Café-noir (#3F2305) + almond (#F3E5D8) brand.
 */
export function renderKwitansiHtml(d: KwitansiData): string {
  const currency = d.currency ?? 'IDR';
  const place = d.place ?? 'Bali';
  const words = amountInWords(d.amount, currency);
  const figure = formatFigure(d.amount, currency);
  const dateStr = fmtDate(d.date);
  const logo = d.logoUrl
    ? `<img src="${esc(d.logoUrl)}" alt="Unreal Studio" style="height:34px;opacity:.9" />`
    : `<div style="font-family:'DM Serif Display',Georgia,serif;font-size:22px;letter-spacing:2px;color:#3F2305">UNREAL <span style="font-weight:400">STUDIO</span></div>`;

  return `
<div style="max-width:560px;margin:0 auto;background:#F3E5D8;padding:28px;border-radius:18px;font-family:Manrope,Arial,sans-serif;color:#3F2305">
  <div style="background:#fff;border:1px solid rgba(63,35,5,.18);border-radius:14px;padding:28px 30px">
    <table style="width:100%;border-collapse:collapse"><tr>
      <td style="text-align:left;vertical-align:middle">${logo}</td>
      <td style="text-align:right;vertical-align:middle">
        <div style="font-family:'DM Serif Display',Georgia,serif;font-size:24px;letter-spacing:2px;color:#3F2305">RECIBÍ DE PAGO</div>
      </td>
    </tr></table>

    <div style="height:1px;background:rgba(63,35,5,.15);margin:20px 0 22px"></div>

    <table style="width:100%;font-size:14px;line-height:1.9">
      <tr><td style="width:165px;color:rgba(63,35,5,.6)">No.</td>
          <td style="font-weight:700">${esc(String(d.no))}</td></tr>
      <tr><td style="color:rgba(63,35,5,.6)">Telah terima dari</td>
          <td style="font-weight:700;border-bottom:1px dotted rgba(63,35,5,.35)">${esc(d.receivedFrom)}</td></tr>
      <tr><td style="color:rgba(63,35,5,.6);vertical-align:top">Uang sejumlah</td>
          <td style="font-style:italic;border-bottom:1px dotted rgba(63,35,5,.35)">${esc(words)}</td></tr>
      <tr><td style="color:rgba(63,35,5,.6);vertical-align:top">Untuk pembayaran</td>
          <td style="border-bottom:1px dotted rgba(63,35,5,.35)">${esc(d.forPayment)}</td></tr>
    </table>

    <table style="width:100%;margin-top:26px"><tr>
      <td style="vertical-align:bottom">
        <div style="display:inline-block;background:#F3E5D8;border:1.5px solid #3F2305;border-radius:10px;padding:10px 18px;font-size:18px;font-weight:800;letter-spacing:.5px">${esc(figure)}</div>
      </td>
      <td style="text-align:center;vertical-align:bottom">
        <div style="font-size:13px;color:rgba(63,35,5,.7)">${esc(place)}${dateStr ? ', ' + esc(dateStr) : ''}</div>
        <div style="position:relative;height:64px">
          ${d.stampUrl ? `<img src="${esc(d.stampUrl)}" alt="" style="position:absolute;left:50%;top:0;transform:translateX(-50%);height:74px;opacity:.85" />` : ''}
          ${d.signatureUrl ? `<img src="${esc(d.signatureUrl)}" alt="" style="position:absolute;left:50%;top:8px;transform:translateX(-50%);height:54px" />` : ''}
        </div>
        <div style="border-top:1px solid rgba(63,35,5,.4);padding-top:6px;font-size:12px;font-weight:700">Unreal Studio</div>
      </td>
    </tr></table>
  </div>
  <div style="text-align:center;font-size:10px;color:rgba(63,35,5,.45);margin-top:12px">Unreal Studio · Bali, Indonesia · hello@unrealstudiobali.com</div>
</div>`.trim();
}
