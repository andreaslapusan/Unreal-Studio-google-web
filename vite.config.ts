import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Fuera de beta (VITE_SEO_DRAFTS != 1) las landings en borrador no deben llegar al bundle:
// cuerpo vacío y en index.json solo id/slugs/published (lib/landings.ts los usa para desenlazar).
function stripSeoDrafts(enabled: boolean) {
  const idx = path.resolve(__dirname, 'content/landings/index.json');
  const drafts = (): Set<string> =>
    new Set(JSON.parse(fs.readFileSync(idx, 'utf8')).filter((l: any) => !l.published).map((l: any) => l.id));
  return {
    name: 'strip-seo-drafts',
    enforce: 'pre' as const,
    load(id: string) {
      if (enabled) return null;
      const m = id.match(/content\/landings\/([^/]+)\/[a-z]{2}\.html\?raw$/);
      return m && drafts().has(m[1]) ? 'export default ""' : null;
    },
    transform(code: string, id: string) {
      if (enabled || path.resolve(id.split('?')[0]) !== idx) return null;
      const out = JSON.parse(code).map((l: any) => (l.published ? l : { id: l.id, published: false, slugs: l.slugs, meta: {} }));
      return { code: JSON.stringify(out), map: null };
    },
  };
}

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
      plugins: [stripSeoDrafts(env.VITE_SEO_DRAFTS === '1'), react()],
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
      },
      // Quita console.log/debug/info del bundle de producción (ruido en consola,
      // hallazgo de la auditoría). Mantiene console.error/warn para diagnóstico.
      esbuild: mode === 'production' ? { pure: ['console.log', 'console.debug', 'console.info'] } : {},
    };
});
