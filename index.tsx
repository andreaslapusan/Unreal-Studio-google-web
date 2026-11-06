
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import { initWebVitals } from './lib/webVitals';
import { initVersionGuard } from './lib/versionGuard';
import { initNativeApp, isNativeApp } from './lib/nativeApp';
import './index.css';
import { i18nReady } from './lib/i18n';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

// App nativa (Capacitor): atrás/vibración/clase native-app. En el navegador no hace nada.
initNativeApp();

// Montar cuando el JSON del idioma de la URL ya está (en/ro/id se cargan aparte).
void i18nReady.then(() => {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>
  );
});

// Boot real-user metrics after first paint so we don't compete with hydration.
initWebVitals();

// Detecta deploys nuevos y fuerza una recarga (clave para que las PWA instaladas
// del equipo reciban los arreglos —traducciones, etc.— sin quedarse en viejo).
initVersionGuard();

// PWA: registra el service worker (instalable + offline + carga rápida). Se hace
// tras 'load' para no competir con el primer render. SIN recargas automáticas:
// el SW nuevo se activa solo en el siguiente arranque (la navegación va a red,
// así que el HTML siempre es fresco). Evita la doble carga negro→blanco en iOS.
if ('serviceWorker' in navigator && !isNativeApp()) { // la app nativa no usa SW: su offline.html propio
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { updateViaCache: 'none' })
      .then((reg) => { reg.update().catch(() => {}); })
      .catch(() => { /* sin PWA si falla */ });
  });
}
