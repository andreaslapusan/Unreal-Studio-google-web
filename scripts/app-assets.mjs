/**
 * app-assets.mjs — genera iconos + splash de las apps (iOS/Android) y el set para
 * tiendas desde el icono de marca (las "tablas" blancas sobre marrón del favicon).
 * Uso: APP_FLAVOR=clientes|agencias|equipo|admin node scripts/app-assets.mjs [carpetaStore]
 *      (por defecto ~/jobs/apps/store-assets/<flavor>). Cada flavor lleva su etiqueta pequeña bajo la marca.
 * shortcut: la fuente es el PNG 512 del favicon (re-escalado a 1024); si aparece el
 * vector original del logo, cámbialo en SRC para un master nítido.
 */
import sharp from 'sharp';
import { mkdirSync, readdirSync, existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const SRC = 'public/img/Logos/favicon_io/android-chrome-512x512.png';
const BROWN = '#3F2305', CREAM = '#F3E5D8';
const FLAVOR = process.env.APP_FLAVOR || 'clientes';
const LABEL = { clientes: 'CLIENTES', agencias: 'AGENCIAS', equipo: 'EQUIPO', admin: 'ADMIN' }[FLAVOR];
if (!LABEL) throw new Error(`APP_FLAVOR desconocido: ${FLAVOR}`);
const STORE = process.argv[2] || join(homedir(), 'jobs/apps/store-assets', FLAVOR);
const RES = 'android/app/src/main/res';

// Máscara de las tablas (blanco = marca) a cualquier tamaño, sin el fondo marrón.
async function mask(size) {
  const g = await sharp(SRC).greyscale().resize(size, size, { kernel: 'lanczos3' }).raw().toBuffer();
  const out = Buffer.alloc(g.length);
  for (let i = 0; i < g.length; i++) out[i] = Math.max(0, Math.min(255, Math.round((g[i] - 70) * 255 / 170)));
  return out;
}
async function mark(size, color) { // marca coloreada sobre transparente
  const a = await mask(size);
  const { r, g, b } = hex(color);
  const px = Buffer.alloc(size * size * 4);
  for (let i = 0; i < a.length; i++) { px[i * 4] = r; px[i * 4 + 1] = g; px[i * 4 + 2] = b; px[i * 4 + 3] = a[i]; }
  return sharp(px, { raw: { width: size, height: size, channels: 4 } }).png().toBuffer();
}
function hex(h) { const n = parseInt(h.slice(1), 16); return { r: n >> 16, g: (n >> 8) & 255, b: n & 255 }; }
// Marca reducida + etiqueta del flavor debajo (Manrope bold, espaciada), sobre transparente.
async function art(size, color) {
  const m = Math.round(size * 0.66), fs = Math.round(size * 0.088);
  const label = Buffer.from(`<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg"><text x="50%" y="${Math.round(size * 0.9)}" text-anchor="middle" font-family="Manrope" font-weight="700" font-size="${fs}" letter-spacing="${(fs * 0.14).toFixed(1)}" fill="${color}">${LABEL}</text></svg>`);
  return canvas(size, size, { r: 0, g: 0, b: 0, alpha: 0 })
    .composite([{ input: await mark(m, color), left: Math.round((size - m) / 2), top: Math.round(size * 0.07) }, { input: label }]).png().toBuffer();
}
const canvas = (w, h, bg) => sharp({ create: { width: w, height: h, channels: 4, background: bg } });

// Icono cuadrado completo: tablas blancas sobre marrón (sin alfa: App Store lo exige).
async function icon(size, file, round = false) {
  const a = round ? Math.round(size * 0.8) : size; // en redondo, la etiqueta no debe tocar el borde
  let img = canvas(size, size, BROWN).composite([{ input: await art(a, '#FFFFFF'), gravity: 'center' }]);
  if (round) {
    const r = size / 2;
    img = sharp(await img.png().toBuffer()).composite([{ input: Buffer.from(`<svg width="${size}" height="${size}"><circle cx="${r}" cy="${r}" r="${r}"/></svg>`), blend: 'dest-in' }]);
    return img.png().toFile(file);
  }
  return img.flatten({ background: BROWN }).png().toFile(file);
}
// Splash: marca marrón centrada (~28 % del lado corto) sobre crema.
async function splash(w, h, file) {
  const s = Math.round(Math.min(w, h) * 0.28);
  return canvas(w, h, CREAM).composite([{ input: await mark(s, BROWN), gravity: 'center' }]).flatten({ background: CREAM }).png().toFile(file);
}

mkdirSync(join(STORE, 'icons/android'), { recursive: true });
mkdirSync(join(STORE, 'icons/ios'), { recursive: true });

// --- Tiendas ---
await icon(1024, join(STORE, 'icons/icon-1024-master.png'));
await icon(512, join(STORE, 'icons/android/play-store-icon-512.png'));
for (const s of [20, 29, 40, 58, 60, 76, 80, 87, 120, 152, 167, 180, 1024]) await icon(s, join(STORE, `icons/ios/icon-${s}.png`));
await sharp(await canvas(1024, 500, CREAM).composite([{ input: await mark(300, BROWN), gravity: 'center' }]).png().toBuffer())
  .flatten({ background: CREAM }).png().toFile(join(STORE, 'play-feature-graphic-1024x500.png'));
await splash(2732, 2732, join(STORE, 'splash-2732.png'));

// --- Android (mipmaps + adaptive foreground 108dp + splash por densidad) ---
const DPI = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
if (existsSync(RES)) {
  for (const [d, k] of Object.entries(DPI)) {
    const dir = join(RES, `mipmap-${d}`);
    await icon(48 * k, join(dir, 'ic_launcher.png'));
    await icon(48 * k, join(dir, 'ic_launcher_round.png'), true);
    await icon(48 * k, join(STORE, `icons/android/ic_launcher-${d}.png`));
    const fg = 108 * k, inner = Math.round(72 * k); // zona segura 72/108dp
    await canvas(fg, fg, { r: 0, g: 0, b: 0, alpha: 0 }).composite([{ input: await art(inner, '#FFFFFF'), gravity: 'center' }]).png().toFile(join(dir, 'ic_launcher_foreground.png'));
  }
  for (const dir of readdirSync(RES).filter((d) => d.startsWith('drawable'))) {
    const f = join(RES, dir, 'splash.png');
    if (!existsSync(f)) continue;
    const { width, height } = await sharp(f).metadata();
    await splash(width, height, f + '.tmp');
    await sharp(f + '.tmp').toFile(f); unlinkSync(f + '.tmp'); // sobreescribe con mismo tamaño
  }
}
// --- iOS ---
const IOS = 'ios/App/App/Assets.xcassets';
if (existsSync(IOS)) {
  await icon(1024, join(IOS, 'AppIcon.appiconset/AppIcon-512@2x.png'));
  for (const f of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) await splash(2732, 2732, join(IOS, 'Splash.imageset', f));
}
console.log(`app-assets OK (${FLAVOR}) →`, STORE);
