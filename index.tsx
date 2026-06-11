
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import { initWebVitals } from './lib/webVitals';
import './index.css';
import './lib/i18n';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);

// Boot real-user metrics after first paint so we don't compete with hydration.
initWebVitals();

// PWA: registra el service worker (instalable + offline + auto-update). Se hace
// tras 'load' para no competir con el primer render.
//
// AUTO-UPDATE: cuando un SW nuevo toma el control (tras desplegar) recargamos la
// página UNA vez para que la app guardada en pantalla de inicio (iOS standalone)
// nunca se quede con un shell viejo → evita la "pantalla negra que nunca carga".
if ('serviceWorker' in navigator) {
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { updateViaCache: 'none' })
      .then((reg) => {
        reg.update().catch(() => {});
        if (reg.waiting) reg.waiting.postMessage('SKIP_WAITING');
        reg.addEventListener('updatefound', () => {
          const sw = reg.installing;
          if (!sw) return;
          sw.addEventListener('statechange', () => {
            if (sw.state === 'installed' && navigator.serviceWorker.controller) {
              sw.postMessage('SKIP_WAITING');
            }
          });
        });
      })
      .catch(() => { /* sin PWA si falla */ });
  });
}
