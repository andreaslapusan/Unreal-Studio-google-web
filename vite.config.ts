import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Note: previously we shipped per-route /<name>/index.html stubs that
// redirected to the HashRouter prefix. After moving to BrowserRouter
// (commit Apr 30 2026), Firebase rewrites every path to /index.html
// so the SPA picks up the route directly — no per-route stubs needed.

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
      plugins: [react()],
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
