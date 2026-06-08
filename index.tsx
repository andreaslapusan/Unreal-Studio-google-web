
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

// Integración nativa (Capacitor): solo hace algo dentro de la app iOS/Android.
import('./lib/native').then((m) => m.initNative()).catch(() => {});

// PWA: registra el service worker (instalable + offline + auto-update). Se hace
// tras 'load' para no competir con el primer render.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* sin PWA si falla */ });
  });
}
