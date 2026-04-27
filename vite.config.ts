import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const spaRoutes = ['proyectos', 'blog', 'contacto', 'invertir', 'admin', 'privacy', 'terms', 'agencias', 'inversores', 'equipo'];

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
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react(), spaRedirectPlugin()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      build: {
        // Reduce main bundle size by splitting framework + vendor libs
        rollupOptions: {
          output: {
            manualChunks: (id: string) => {
              if (id.includes('node_modules')) {
                if (id.includes('react-router') || id.includes('@remix-run')) return 'router';
                if (id.includes('react-dom') || /[\\/]react[\\/]/.test(id)) return 'react';
                if (id.includes('@supabase')) return 'supabase';
                if (id.includes('firebase')) return 'firebase';
                return 'vendor';
              }
              return undefined;
            },
          },
        },
        // Increase warning limit a bit since admin page is heavy
        chunkSizeWarningLimit: 600,
      }
    };
});
