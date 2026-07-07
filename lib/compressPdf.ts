/**
 * compressPdf — comprime un PDF pesado (reportes de obra) re-rasterizando cada
 * página a una resolución razonable (calidad BUENA, no extrema) y reconstruyendo
 * un PDF ligero con jsPDF. Objetivo: que un reporte de ~40 MB baje a ~5-8 MB.
 *
 * Robusto por diseño: si el PDF ya es pequeño, si pdf.js falla, o si el resultado
 * no mejora, DEVUELVE EL ORIGINAL — nunca bloquea la subida de Adam.
 *
 * pdf.js (pdfjs-dist) y jsPDF se cargan de forma perezosa (dynamic import), así que
 * solo pesan cuando de verdad se comprime un PDF.
 */
// URL del worker de pdf.js emitida por Vite (se descarga solo al comprimir).
// @ts-ignore  — sufijo Vite `?url`
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

interface CompressOpts {
  maxSidePx?: number;        // lado más largo del render (calidad); def 1800
  jpegQuality?: number;      // 0..1; def 0.82
  minBytesToCompress?: number; // no comprime por debajo de esto; def 8 MB
}

export async function compressPdf(file: File, opts: CompressOpts = {}): Promise<File> {
  const maxSide = opts.maxSidePx ?? 1800;
  const quality = opts.jpegQuality ?? 0.82;
  const minBytes = opts.minBytesToCompress ?? 8 * 1024 * 1024;
  try {
    if (!file || file.type !== 'application/pdf' || file.size < minBytes) return file;

    const pdfjs: any = await import('pdfjs-dist');
    pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
    const { jsPDF } = await import('jspdf');

    const data = new Uint8Array(await file.arrayBuffer());
    const doc = await pdfjs.getDocument({ data }).promise;

    let out: any = null;
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const base = page.getViewport({ scale: 1 }); // tamaño original en pt
      // Escala de render para calidad, capada para no disparar el peso.
      const renderScale = Math.min(Math.max(maxSide / Math.max(base.width, base.height), 1), 2.5);
      const vp = page.getViewport({ scale: renderScale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.floor(vp.width));
      canvas.height = Math.max(1, Math.floor(vp.height));
      const ctx = canvas.getContext('2d');
      if (!ctx) { page.cleanup(); return file; }
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      const jpeg = canvas.toDataURL('image/jpeg', quality);

      const wPt = base.width;
      const hPt = base.height;
      const orient = wPt > hPt ? 'l' : 'p';
      if (!out) out = new jsPDF({ orientation: orient, unit: 'pt', format: [wPt, hPt], compress: true });
      else out.addPage([wPt, hPt], orient);
      out.addImage(jpeg, 'JPEG', 0, 0, wPt, hPt);

      // Liberar memoria (importante en móvil con PDFs grandes).
      canvas.width = 0; canvas.height = 0;
      page.cleanup();
    }
    if (!out) return file;

    const blob: Blob = out.output('blob');
    if (!blob || blob.size >= file.size) return file; // si no mejora, original
    return new File([blob], file.name.replace(/\.pdf$/i, '') + '.pdf', { type: 'application/pdf' });
  } catch (e) {
    console.warn('[compressPdf] no se pudo comprimir, se sube el original:', e);
    return file;
  }
}
