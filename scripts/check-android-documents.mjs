// Comprueba en Chromium real el JS que MainActivity.java inyecta para las descargas blob: (recibos jsPDF):
// el gancho del nombre (<a download>) y el fetch → FileReader → UnrealDocs.open(dataUrl, nombre).
// Uso: node scripts/check-android-documents.mjs   (necesita los navegadores de Playwright)
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { chromium } from 'playwright';

const java = readFileSync(new URL('../android/app/src/main/java/com/unrealstudio/app/MainActivity.java', import.meta.url), 'utf8');
// Literales Java concatenados → texto JS
const literals = (src) => [...src.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => JSON.parse(`"${m[1]}"`)).join('');
const hook = literals(java.match(/DOWNLOAD_NAME_HOOK =([\s\S]*?);\n/)[1]);
const [before, after] = java.match(/evaluateJavascript\(\s*("fetch\(" \+ )JSONObject\.quote\(url\)( \+[\s\S]*?),\s*null\s*\)/).slice(1);
const download = (url) => literals(before) + JSON.stringify(url) + literals(after);

const browser = await chromium.launch({ executablePath: process.env.CHROME_EXE || homedir() + '/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome' });
const page = await browser.newPage();
await page.setContent('<html><body></body></html>');
await page.evaluate(() => { window.calls = []; window.UnrealDocs = { open: (d, n) => window.calls.push([d, n]) }; });
await page.evaluate(hook);
await page.evaluate(hook); // idempotente
// Igual que FileSaver (jsPDF.save): <a> fuera del DOM, download por propiedad, href = blob
const url = await page.evaluate(() => {
  if (!('download' in HTMLAnchorElement.prototype)) throw new Error('download desapareció del prototipo');
  const a = document.createElement('a');
  a.download = 'DS-02 Andreas Lapusan.pdf';
  a.href = URL.createObjectURL(new Blob(['%PDF-1.4 hola'], { type: 'application/pdf' }));
  if (a.download !== 'DS-02 Andreas Lapusan.pdf') throw new Error('getter roto');
  return a.href;
});
await page.evaluate(download(url));
await page.waitForFunction(() => window.calls.length === 1, null, { timeout: 5000 });
const [[dataUrl, name]] = await page.evaluate(() => window.calls);
await browser.close();

const ok = name === 'DS-02 Andreas Lapusan.pdf'
  && dataUrl.startsWith('data:application/pdf;base64,')
  && Buffer.from(dataUrl.split(',')[1], 'base64').toString() === '%PDF-1.4 hola';
console.log(ok ? 'OK android documents JS' : `FALLO: ${name} ${dataUrl.slice(0, 60)}`);
process.exit(ok ? 0 : 1);
