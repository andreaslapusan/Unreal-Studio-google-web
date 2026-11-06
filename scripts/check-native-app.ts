// Autocomprobación de lib/nativeApp.ts: node --experimental-strip-types scripts/check-native-app.ts
import assert from 'node:assert';
import { isNativeApp, initNativeApp } from '../lib/nativeApp.ts';

const g = globalThis as any;
// Navegador (sin Capacitor o isNativePlatform() !== true): inerte, ni siquiera toca el DOM.
g.document = new Proxy({}, { get() { throw new Error('tocó el DOM fuera de la app'); } });
for (const Capacitor of [undefined, {}, { isNativePlatform: () => false }, { isNativePlatform: () => 'true' }]) {
  g.window = { Capacitor };
  assert.strictEqual(isNativeApp(), false);
  initNativeApp();
}

// App (iOS falso): clase, sin zoom, Atrás = X del pop-up → fondo → historial → segundo plano; vibración con límite.
const calls: string[] = [];
const on: Record<string, (e: unknown) => void> = {};
const classes = new Set<string>();
const meta = { content: 'width=device-width, initial-scale=1, viewport-fit=cover' };
let overlays: unknown[] = [];
let back = (_: { canGoBack: boolean }) => {};
g.getComputedStyle = () => ({ pointerEvents: 'auto' });
g.document = {
  documentElement: { classList: { add: (c: string) => classes.add(c) } },
  querySelector: (s: string) => (s.includes('viewport') ? meta : null),
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
const x = { querySelector: () => ({ textContent: ' close ' }), getAttribute: () => null, click: () => calls.push('x') };
const overlay = (buttons: unknown[]) => ({ getClientRects: () => [{}], querySelectorAll: () => buttons, click: () => calls.push('backdrop') });
overlays = [overlay([x])]; back({ canGoBack: true });
overlays = [overlay([])]; back({ canGoBack: true });
overlays = []; back({ canGoBack: true }); back({ canGoBack: false });
assert.deepStrictEqual(calls.splice(0), ['x', 'backdrop', 'back', 'min']);
const submit = { target: { closest: () => ({}) } };
on.click(submit); on.click(submit); on.click({ target: { closest: () => null } });
assert.deepStrictEqual(calls, ['hap']);
console.log('nativeApp ok');
