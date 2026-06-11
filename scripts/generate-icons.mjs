/**
 * Regenera el subset self-hosted de Material Symbols con TODOS los iconos usados
 * en el código, y actualiza el cache-buster (?v=hash) en index.css. Así la fuente
 * es pequeña/rápida (~110KB) pero nunca falta un icono. Correr en el lado del repo
 * (tiene red) ANTES de commitear cuando se añaden iconos:
 *   node scripts/generate-icons.mjs
 * Si falla (icono inválido / sin red), mantiene la fuente actual (no rompe).
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { createHash as ch } from 'node:crypto';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36';

// 1) extrae nombres de icono del código — EN NODE PURO (sin `grep` de shell, que
//    en alpine/Docker se comportaba distinto y generaba un subset casi vacío →
//    iconos rotos en producción). Recorre pages/ y components/ y aplica regex.
function walk(dir) {
  let out = [];
  let entries = [];
  try { entries = readdirSync(dir); } catch { return out; }
  for (const f of entries) {
    const p = dir + '/' + f;
    let s; try { s = statSync(p); } catch { continue; }
    if (s.isDirectory()) out = out.concat(walk(p));
    else if (/\.(tsx|ts)$/.test(f)) out.push(p);
  }
  return out;
}
let code = '';
for (const dir of ['pages', 'components', 'src']) {
  for (const f of walk(dir)) { try { code += '\n' + readFileSync(f, 'utf8'); } catch { /* ignore */ } }
}
const names = new Set();
// Icono LITERAL como nodo de texto: <span className="material-symbols-outlined ...">event</span>
for (const m of code.matchAll(/material-symbols-outlined[^>]*>\s*([a-z][a-z_0-9]{2,})\s*</g)) names.add(m[1]);
// icon: 'event'  /  icon="event"
for (const m of code.matchAll(/icon:\s*['"]([a-z][a-z_0-9]+)['"]/g)) names.add(m[1]);
for (const m of code.matchAll(/icon=["']([a-z][a-z_0-9]+)["']/g)) names.add(m[1]);
// Iconos DINÁMICOS dentro del span (ternarios/variables con comillas): >{cond ? 'a' : 'b'}<
for (const m of code.matchAll(/material-symbols-outlined[^>]*>\s*\{[^}]*\}/g)) {
  for (const q of m[0].matchAll(/['"]([a-z][a-z_0-9]{2,})['"]/g)) names.add(q[1]);
}
// Lista curada de iconos usados de forma dinámica (variables/mapas) a garantizar.
['expand_more','expand_less','visibility','visibility_off','check_circle','warning','schedule','unfold_more','filter_list','sort','tune','event','close','check','download','calculate','construction','handshake','apartment','groups','progress_activity','sentiment_dissatisfied'].forEach((n) => names.add(n));
// Falsos positivos conocidos.
['text','name','password','property','aprobada','pendiente','all','active','inactive','div','span','button'].forEach((n) => names.delete(n));
const list = [...names].sort();
if (!list.length) { console.log('icons: no se encontraron, no se toca nada'); process.exit(0); }

const url = `https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&icon_names=${list.join(',')}&display=block`;

try {
  const css = await (await fetch(url, { headers: { 'User-Agent': UA } })).text();
  const wmatch = css.match(/url\((https:\/\/[^)]+)\)/);
  if (!wmatch) throw new Error('Google no devolvió woff2 (¿icono inválido?): ' + css.slice(0, 120));
  const buf = Buffer.from(await (await fetch(wmatch[1], { headers: { 'User-Agent': UA } })).arrayBuffer());
  if (buf.slice(0, 4).toString() !== 'wOF2') throw new Error('respuesta no es woff2');
  writeFileSync('public/fonts/material-symbols-outlined.woff2', buf);
  const hash = ch('md5').update(buf).digest('hex').slice(0, 8);
  let indexCss = readFileSync('index.css', 'utf8');
  indexCss = indexCss.replace(/material-symbols-outlined\.woff2\?v=[a-z0-9]+/g, `material-symbols-outlined.woff2?v=${hash}`);
  writeFileSync('index.css', indexCss);
  console.log(`icons: ${list.length} iconos, ${Math.round(buf.length / 1024)}KB, v=${hash}`);
} catch (e) {
  console.log('icons: no se regeneró (' + e.message + '). Se mantiene la fuente actual.');
}
