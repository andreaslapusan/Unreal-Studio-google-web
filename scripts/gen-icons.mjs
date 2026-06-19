/**
 * gen-icons.mjs — genera el SUBSET de Material Symbols a partir de los iconos que
 * REALMENTE usa el código, y lo inyecta en index.html (&icon_names=...).
 *
 * Se ejecuta en prebuild (también dentro del build de Docker, donde el código SÍ
 * está). Así el subset siempre incluye todos los iconos usados (incl. los nuevos)
 * → carga rápida en conexiones lentas Y ningún icono sale como texto.
 *
 * Si añades un icono nuevo en el código, este script lo recoge solo en el próximo
 * build. No hay que mantener listas a mano.
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

function walk(dir, acc = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    const st = statSync(p);
    if (st.isDirectory()) { if (!/node_modules|dist|\.git/.test(p)) walk(p, acc); }
    else if (/\.(tsx?|jsx?)$/.test(e)) acc.push(p);
  }
  return acc;
}

const ICON_RE = /material-symbols-(?:outlined|rounded|sharp)/;
const icons = new Set();
// Palabras que NO son iconos (dominio de la app) — para no ensuciar la URL.
const BAD = new Set('outlined rounded sharp admin all always approved aprobada asc brand checkin client_login clients cobros compra config currency custom days_off desc desarrollo employees environment featured floating_fab generic inactive labels list long main marketing narrow notice numeric password pdf pendiente portal product project_main recibido rejected sending session short smooth agencias agencias_registrar blogs contact cta_floating cta_mobile_menu cta_navbar dashboard faqs gallery floor_plans logo notifications projects users calendar arquitectura cliente'.split(/\s+/));

for (const f of walk('pages').concat(walk('components'))) {
  const s = readFileSync(f, 'utf8');
  for (const m of s.matchAll(/material-symbols-(?:outlined|rounded|sharp)[^>]*>\s*([a-z0-9_]+)\s*</g)) icons.add(m[1]);
  for (const line of s.split('\n')) {
    if (!ICON_RE.test(line)) continue;
    for (const m of line.matchAll(/['"]([a-z][a-z0-9_]{2,})['"]/g)) icons.add(m[1]);
  }
  for (const m of s.matchAll(/icon:\s*['"]([a-z0-9_]+)['"]/g)) icons.add(m[1]);
  for (const m of s.matchAll(/:\s*['"]([a-z][a-z0-9_]{2,})['"]/g)) icons.add(m[1]);
}
const list = [...icons].filter((i) => !BAD.has(i) && !/\d{2,}/.test(i)).sort();

const html = readFileSync('index.html', 'utf8');
const names = list.join(',');
// Reemplaza/inyecta &icon_names= en las URL de Material Symbols (link + noscript).
const out = html.replace(
  /(family=Material\+Symbols\+Outlined:[^&"]*)(?:&icon_names=[^&"]*)?(&display=block)/g,
  `$1&icon_names=${names}$2`
);
writeFileSync('index.html', out);
console.log(`icons → subset de ${list.length} iconos inyectado en index.html`);
