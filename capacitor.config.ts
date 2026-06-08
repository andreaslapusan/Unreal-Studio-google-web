import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor — empaqueta la MISMA web React (carpeta dist) como app nativa iOS +
 * Android, reutilizando el 100% del código. Publicar en App Store / Play Store.
 *
 * Nota: el contenido se sirve desde el bundle local (dist). Si en el futuro
 * quieres que la app cargue SIEMPRE la web en vivo (auto-update sin pasar por
 * tienda), descomenta `server.url`. Por defecto va local = más rápido y offline.
 */
const config: CapacitorConfig = {
  appId: 'com.unrealstudio.app',
  appName: 'Unreal Studio',
  webDir: 'dist',
  backgroundColor: '#f3e5d8',
  // server: { url: 'https://unrealstudiobali.com', cleartext: false },
  ios: {
    contentInset: 'always',
    backgroundColor: '#f3e5d8',
  },
  android: {
    backgroundColor: '#f3e5d8',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      backgroundColor: '#f3e5d8',
      showSpinner: false,
      androidScaleType: 'CENTER_CROP',
      splashImmersive: false,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#f3e5d8',
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
