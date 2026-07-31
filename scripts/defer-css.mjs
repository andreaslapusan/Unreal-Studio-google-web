/**
 * defer-css: hace NO render-blocking el CSS principal de la app en todos los HTML
 * de dist. Así el navegador pinta al instante el fondo crema + la ruedecita (estilos
 * inline), en vez de quedarse en NEGRO mientras descarga el CSS (107 KB) en conexiones
 * lentas. Cuando el CSS carga, se aplica (media='all') y se retira la capa de arranque
 * (window.__hideBoot), evitando cualquier flash sin estilos.
 *
 * Convierte:
 *   <link rel="stylesheet" crossorigin href="/assets/index-XXXX.css">
 * en:
 *   <link rel="stylesheet" crossorigin href="/assets/index-XXXX.css" media="print"
 *         onload="this.media='all';window.__hideBoot&&window.__hideBoot()">
 *   <noscript><link rel="stylesheet" crossorigin href="/assets/index-XXXX.css"></noscript>
 */
import { readdirSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DIST = 'dist';
const RE = /<link rel="stylesheet"([^>]*?)href="(\/assets\/index-[^"]+\.css)"([^>]*)>/g;

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...walk(p));
    else if (name.endsWith('.html')) out.push(p);
  }
  return out;
}

let changed = 0;
for (const file of walk(DIST)) {
  const html = readFileSync(file, 'utf8');
  if (!RE.test(html)) continue;
  RE.lastIndex = 0;
  const next = html.replace(RE, (_m, pre, href, post) => {
    const attrs = (pre + post).replace(/\s+media="[^"]*"/g, '').trim();
    return `<link rel="stylesheet" ${attrs} href="${href}" media="print" onload="this.media='all';window.__hideBoot&&window.__hideBoot()"><noscript><link rel="stylesheet" ${attrs} href="${href}"></noscript>`;
  });
  if (next !== html) { writeFileSync(file, next); changed++; }
}
console.log(`[defer-css] CSS diferido en ${changed} ficheros HTML.`);
