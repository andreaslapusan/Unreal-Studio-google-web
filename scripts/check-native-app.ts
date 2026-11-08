// Autocomprobación de lo que solo debe pasar DENTRO de la app nativa (Capacitor):
//   lib/nativeApp.ts, el idioma del dispositivo (lib/geoLanguageDetector.ts) y los scripts de index.html
//   (__hideBoot → splash nativo, __loadTracking → GTM/GA4/Pixel). En el navegador/PWA todo sigue igual.
// Uso: node --experimental-strip-types scripts/check-native-app.ts
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { isNativeApp, initNativeApp, nativeOverlayOpen, isDarkColor } from '../lib/nativeApp.ts';
import { geoLanguageDetector } from '../lib/geoLanguageDetector.ts';

const g = globalThis as any;
const NOT_NATIVE = [undefined, {}, { isNativePlatform: () => false }, { isNativePlatform: () => 'true' }];
const NATIVE = { isNativePlatform: () => true };
// Navegador (sin Capacitor o isNativePlatform() !== true): inerte, ni siquiera toca el DOM.
g.document = new Proxy({}, { get() { throw new Error('tocó el DOM fuera de la app'); } });
for (const Capacitor of NOT_NATIVE) {
  g.window = { Capacitor };
  assert.strictEqual(isNativeApp(), false);
  assert.strictEqual(nativeOverlayOpen(), false); // la PWA instalada tira-para-refrescar como antes, con o sin pop-up
  initNativeApp();
}

// App (iOS falso): clase, sin zoom, Atrás = X del pop-up → fondo → historial → segundo plano; vibración con límite.
const calls: string[] = [];
const on: Record<string, (e: unknown) => void> = {};
const classes = new Set<string>();
const meta = { content: 'width=device-width, initial-scale=1, viewport-fit=cover' };
let overlays: unknown[] = [];
let popup: unknown = null;
let back = (_: { canGoBack: boolean }) => {};
g.getComputedStyle = () => ({ pointerEvents: 'auto' });
g.document = {
  documentElement: { classList: { add: (c: string) => classes.add(c) } },
  querySelector: (s: string) => (s.includes('viewport') ? meta : s === '.fixed.inset-0' ? popup : null),
  querySelectorAll: () => overlays,
  addEventListener: (t: string, f: (e: unknown) => void) => { on[t] = f; },
};
g.window = {
  history: { back: () => calls.push('back') },
  Capacitor: { isNativePlatform: () => true, getPlatform: () => 'ios', Plugins: {
    App: { addListener: (_: string, f: typeof back) => { back = f; }, minimizeApp: () => calls.push('min') },
    Haptics: { impact: () => calls.push('hap') } } },
};
initNativeApp();
assert.ok(isNativeApp() && classes.has('native-app'));
assert.strictEqual(meta.content, 'width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1');
assert.strictEqual(nativeOverlayOpen(), false);
popup = {}; assert.strictEqual(nativeOverlayOpen(), true); popup = null; // en la app: sin recargar con un pop-up abierto
const x = { querySelector: () => ({ textContent: ' close ' }), getAttribute: () => null, click: () => calls.push('x') };
const overlay = (buttons: unknown[]) => ({ getClientRects: () => [{}], querySelectorAll: () => buttons, click: () => calls.push('backdrop') });
overlays = [overlay([x])]; back({ canGoBack: true });
overlays = [overlay([])]; back({ canGoBack: true });
overlays = []; back({ canGoBack: true }); back({ canGoBack: false });
assert.deepStrictEqual(calls.splice(0), ['x', 'backdrop', 'back', 'min']);
const submit = { target: { closest: () => ({}) } };
on.click(submit); on.click(submit); on.click({ target: { closest: () => null } });
assert.deepStrictEqual(calls, ['hap']);

// Barra de estado: iconos claros (DARK) sobre cabeceras oscuras (marrón del admin), oscuros sobre blanco/crema.
assert.ok(isDarkColor('rgb(63, 35, 5)') && isDarkColor('rgba(0, 0, 0, 0.5)'));
assert.ok(!isDarkColor('rgb(255, 255, 255)') && !isDarkColor('rgb(243, 229, 216)') && !isDarkColor('rgb(249, 250, 251)'));

// Idioma: ?lang → prefijo de ruta → elección guardada → (solo app) idioma del móvil → país por IP.
const lang = async ({ Capacitor, languages = ['ro-RO'], path = '/cliente', search = '', stored = null as string | null }: Record<string, any>) => {
  g.window = { Capacitor, location: { pathname: path, search } };
  Object.defineProperty(g, 'navigator', { value: { languages, language: languages[0] }, configurable: true, writable: true });
  const store: Record<string, string> = stored ? { _unreal_lang: stored } : {};
  g.localStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; } };
  g.fetch = async () => ({ ok: true, json: async () => ({ country_code: 'ES' }) }); // IP de España
  return (geoLanguageDetector as any).detect(() => {});
};
for (const Capacitor of NOT_NATIVE) assert.strictEqual(await lang({ Capacitor }), 'es'); // navegador: por IP, como siempre
assert.strictEqual(await lang({ Capacitor: NATIVE }), 'ro');
assert.strictEqual(await lang({ Capacitor: NATIVE, languages: ['de-DE', 'en-GB'] }), 'en');
assert.strictEqual(await lang({ Capacitor: NATIVE, languages: ['in-ID'] }), 'id');
assert.strictEqual(await lang({ Capacitor: NATIVE, languages: ['de-DE', 'fr-FR'] }), 'es'); // ninguno nuestro → IP
assert.strictEqual(await lang({ Capacitor: NATIVE, languages: [] }), 'es');
assert.strictEqual(await lang({ Capacitor: NATIVE, stored: 'en' }), 'en');
assert.strictEqual(await lang({ Capacitor: NATIVE, search: '?lang=id' }), 'id');
assert.strictEqual(await lang({ Capacitor: NATIVE, path: '/en/clients' }), 'en');

// index.html: los scripts en línea, ejecutados tal cual en un contexto aislado.
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const inline = (marker: string) => [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).find((s) => s.includes(marker))!;

// __hideBoot: SplashScreen.hide SOLO con isNativePlatform() === true.
const splash = (Capacitor: any) => {
  let hidden = 0;
  const ctx: any = {
    Capacitor: Capacitor && { ...Capacitor, Plugins: { SplashScreen: { hide: () => { hidden++; return Promise.resolve(); } } } },
    document: { getElementById: (id: string) => (id === 'root' ? { firstElementChild: { hasAttribute: () => false } } : { style: {}, remove() {} }), querySelector: () => null },
    setTimeout() {}, setInterval() {}, clearInterval() {},
  };
  ctx.window = ctx;
  vm.runInNewContext(inline('__hideBoot'), ctx);
  assert.strictEqual(ctx.__hideBoot(), true);
  return hidden;
};
for (const Capacitor of NOT_NATIVE) assert.strictEqual(splash(Capacitor), 0);
assert.strictEqual(splash(NATIVE), 1);

// __loadTracking: GTM + GA4 + Pixel en la web pública; nunca en portales/logins ni dentro de la app.
const trackers = (pathname: string, Capacitor?: unknown) => {
  const src: string[] = [];
  const ctx: any = { Capacitor, location: { pathname }, addEventListener() {}, document: { createElement: () => ({}), head: { appendChild: (s: { src: string }) => src.push(s.src) } } };
  ctx.window = ctx;
  vm.runInNewContext(inline('__loadTracking'), ctx);
  ctx.__loadTracking();
  return src.length;
};
for (const p of ['/', '/es', '/en/proyectos', '/es/proyecto/deseo', '/es/agencias', '/en/agencias', '/ro/blog/x', '/lofts-globalitae', '/administracion']) {
  for (const Capacitor of NOT_NATIVE) assert.strictEqual(trackers(p, Capacitor), 3, p);
  assert.strictEqual(trackers(p, NATIVE), 0, `app ${p}`);
}
for (const p of ['/admin', '/admin/login', '/admin/agencias', '/cliente', '/cliente/dashboard', '/clientes', '/empleados', '/empleados/dashboard',
  '/agencias/login', '/agencias/dashboard', '/manager/propiedades', '/equipo/upload', '/auth/reset', '/es/clientes', '/en/clients', '/ro/clienti',
  '/id/klien', '/es/empleados', '/en/employees', '/ro/angajati', '/id/karyawan', '/es/portal-agencias', '/en/agencies', '/ro/agentii', '/id/agensi',
  '/es/admin/login', '/en/admin/login', '/ro/admin/login', '/id/admin/login']) assert.strictEqual(trackers(p), 0, p);

console.log('nativeApp ok');
