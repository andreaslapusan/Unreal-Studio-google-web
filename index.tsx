
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

// PWA: registra el service worker (instalable + offline + carga rápida). Se hace
// tras 'load' para no competir con el primer render. SIN recargas automáticas:
// el SW nuevo se activa solo en el siguiente arranque (la navegación va a red,
// así que el HTML siempre es fresco). Evita la doble carga negro→blanco en iOS.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { updateViaCache: 'none' })
      .then((reg) => { reg.update().catch(() => {}); })
      .catch(() => { /* sin PWA si falla */ });
  });
}
