/**
 * Regenera el subset self-hosted de Material Symbols con TODOS los iconos usados
 * en el código, y actualiza el cache-buster (?v=hash) en index.css. Así la fuente
 * es pequeña/rápida (~110KB) pero nunca falta un icono. Correr en el lado del repo
 * (tiene red) ANTES de commitear cuando se añaden iconos:
 *   node scripts/generate-icons.mjs
 * Si falla (icono inválido / sin red), mantiene la fuente actual (no rompe).
 */
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash as ch } from 'node:crypto';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36';

// 1) extrae nombres de icono del código (varios patrones)
function grep(re) {
  try { return execSync(`grep -rhoE "${re}" --include=*.tsx --include=*.ts pages components 2>/dev/null || true`).toString(); }
  catch { return ''; }
}
const names = new Set();
for (const m of grep('material-symbols-outlined[^>]*>[a-z_0-9]+').matchAll(/>([a-z_0-9]+)$/gm)) names.add(m[1]);
for (const m of grep("icon:\\s*'[a-z_0-9]+'").matchAll(/'([a-z_0-9]+)'/g)) names.add(m[1]);
for (const m of grep('icon="[a-z_0-9]+"').matchAll(/"([a-z_0-9]+)"/g)) names.add(m[1]);
for (const m of grep("'[^']+':\\s*'[a-z][a-z_0-9]+'").matchAll(/:\s*'([a-z][a-z_0-9]+)'/g)) names.add(m[1]);
// Iconos DINÁMICOS dentro del span: <span className="material-symbols-outlined">{cond ? 'a' : 'b'}</span>
// (el patrón de arriba solo capta el nombre literal pegado al '>'; los ternarios/variables se escapaban
//  y salían como TEXTO. Le pasó a Andreas con expand_more/less, visibility…). Captamos las comillas del {...}.
for (const m of grep('material-symbols-outlined[^>]*>\\{[^}]*\\}').matchAll(/['"]([a-z][a-z_0-9]{2,})['"]/g)) names.add(m[1]);
// Lista curada de iconos que se usan de forma dinámica (variables/mapas) y conviene garantizar.
['expand_more','expand_less','visibility','visibility_off','check_circle','unfold_more','filter_list','sort','tune'].forEach((n) => names.add(n));
// Falsos positivos conocidos (NO son iconos válidos → Google daría 400 y tumbaría toda la fuente).
['text','name','password','property','aprobada','pendiente','all','active','inactive'].forEach((n) => names.delete(n));
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
