/**
 * Descarga DIRECTA de PDF (sin abrir el diálogo de imprimir).
 *
 * Recibe un fragmento HTML (puede incluir <style>) y guarda un archivo .pdf en
 * el ordenador del usuario. Antes de renderizar, incrusta las imágenes remotas
 * como dataURL para que html2canvas no falle por CORS (fotos de fichaje en
 * Supabase, sellos/firmas, etc.).
 *
 * Uso: await downloadPdfFromHtml(htmlInterno, 'reporte.pdf')
 */

async function inlineImages(root: HTMLElement): Promise<void> {
  const imgs = Array.from(root.querySelectorAll('img'));
  await Promise.all(
    imgs.map(async (img) => {
      const src = img.getAttribute('src') || '';
      if (!src || src.startsWith('data:')) return;
      try {
        const res = await fetch(src, { mode: 'cors' });
        const blob = await res.blob();
        const dataUrl: string = await new Promise((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(String(r.result));
          r.onerror = reject;
          r.readAsDataURL(blob);
        });
        img.setAttribute('src', dataUrl);
      } catch {
        /* si falla, se deja la imagen tal cual */
      }
    })
  );
}

export async function downloadPdfFromHtml(innerHtml: string, filename: string): Promise<void> {
  const holder = document.createElement('div');
  // ~ancho A4 a 96dpi; fuera de pantalla pero renderizable.
  holder.style.cssText =
    'position:fixed;left:-99999px;top:0;width:794px;background:#ffffff;color:#3F2305;font-family:Arial,Helvetica,sans-serif;padding:24px;box-sizing:border-box';
  holder.innerHTML = innerHtml;
  document.body.appendChild(holder);
  try {
    await inlineImages(holder);
    const html2pdf = (await import('html2pdf.js')).default;
    await html2pdf()
      .set({
        margin: [8, 8, 8, 8],
        filename: filename.endsWith('.pdf') ? filename : `${filename}.pdf`,
        image: { type: 'jpeg', quality: 0.95 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['css', 'legacy'] },
      })
      .from(holder)
      .save();
  } finally {
    try { document.body.removeChild(holder); } catch { /* ignore */ }
  }
}
