import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Apps nativas iOS/Android (Capacitor). La app carga la web EN VIVO desde
 * unrealstudiobali.com (cambios sin pasar por tienda). `app-shell/` solo lleva la
 * página offline que se muestra si no hay conexión (server.errorPath).
 *
 * 4 apps (decisión del dueño 06-nov-2026): APP_FLAVOR=clientes|agencias|equipo|admin
 * (por defecto clientes). Cada una abre directamente su portal. Ver MOBILE.md.
 */
import { writeFileSync } from 'node:fs';

const FLAVORS = {
  clientes: { appId: 'com.unrealstudio.clientes', appName: 'Unreal Clientes', path: '/cliente' },
  agencias: { appId: 'com.unrealstudio.agencias', appName: 'Unreal Agencias', path: '/agencias/login' },
  equipo: { appId: 'com.unrealstudio.equipo', appName: 'Unreal Equipo', path: '/empleados' },
  admin: { appId: 'com.unrealstudio.admin', appName: 'Unreal Admin', path: '/admin/login' },
} as const;

const flavorName = (process.env.APP_FLAVOR || 'clientes') as keyof typeof FLAVORS;
const flavor = FLAVORS[flavorName];
if (!flavor) throw new Error(`APP_FLAVOR desconocido: ${flavorName}`);
const START_URL = `https://unrealstudiobali.com${flavor.path}`;
// La página offline (app-shell) necesita saber a qué portal volver al reintentar.
writeFileSync('app-shell/start.js', `window.START_URL=${JSON.stringify(START_URL)};\n`);

const BRAND_CREAM = '#f3e5d8';

const config: CapacitorConfig = {
  appId: flavor.appId,
  appName: flavor.appName,
  webDir: 'app-shell',
  backgroundColor: BRAND_CREAM,
  server: {
    url: START_URL,
    cleartext: false,
    errorPath: 'offline.html',
    // Dominios que se abren DENTRO de la app (login Supabase, storage, mapas).
    allowNavigation: ['unrealstudiobali.com', '*.unrealstudiobali.com', '*.supabase.co'],
  },
  // 'never' + overlaysWebView: la WebView a pantalla completa (sin franjas crema); la web se aparta con env(safe-area-inset-*).
  ios: { contentInset: 'never', backgroundColor: BRAND_CREAM, allowsLinkPreview: false },
  android: { backgroundColor: BRAND_CREAM },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      launchAutoHide: true,
      backgroundColor: BRAND_CREAM,
      showSpinner: false,
      androidScaleType: 'CENTER_CROP',
    },
    StatusBar: { style: 'LIGHT', overlaysWebView: true },
    // Android: pantalla completa; MainActivity pasa las barras a la web (--safe-area-inset-*). Iconos: los decide la web
    // (lib/nativeApp.ts → SystemBars.setStyle según el color de la cabecera).
    SystemBars: { insetsHandling: 'disable', style: 'LIGHT' },
    PushNotifications: { presentationOptions: ['badge', 'sound', 'alert'] },
  },
};

export default config;
