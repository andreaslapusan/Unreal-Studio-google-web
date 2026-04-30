import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const spaRoutes = ['proyectos', 'blog', 'contacto', 'invertir', 'admin', 'privacy', 'terms', 'agencias', 'inversores', 'equipo', 'faq', 'preguntas-frecuentes', 'agendar', 'booking'];

function spaRedirectPlugin() {
  return {
    name: 'spa-redirect',
    closeBundle() {
      for (const route of spaRoutes) {
        const dir = path.resolve(__dirname, 'dist', route);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(
          path.join(dir, 'index.html'),
          `<!DOCTYPE html><html><head><script>window.location.replace('/#/${route}'+window.location.search);</script></head><body></body></html>`
        );
      }
    }
  };
}

export default defineConfig(({ mode }) => {
    // Only load VITE_-prefixed env vars into the client. This prevents server-side
    // secrets like GEMINI_API_KEY (without a VITE_ prefix) from being inlined into
    // the bundle by accident. Anything that needs to reach the browser must be
    // explicitly named VITE_*.
    const env = loadEnv(mode, '.', 'VITE_');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react(), spaRedirectPlugin()],
      // NOTE: We deliberately do NOT inline GEMINI_API_KEY into the client bundle.
      // If Gemini calls are needed from the SPA, route them through a Supabase
      // Edge Function or a server proxy that holds the key securely.
      define: {},
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      build: {
        chunkSizeWarningLimit: 700,
      }
    };
});
