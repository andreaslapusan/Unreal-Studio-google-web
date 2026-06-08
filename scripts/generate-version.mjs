/**
 * Genera lib/version.ts con la versión visible del build.
 * Esquema: 3.<nº de commits>  (major 3; el minor sube en cada commit/deploy).
 * Se ejecuta en el lado del repo (donde hay git) ANTES de commitear; en el build
 * de Docker (sin .git) es no-op y se respeta el valor ya commiteado.
 */
import { execSync } from 'node:child_process';
import { writeFileSync, existsSync } from 'node:fs';

let version = null;
try {
  if (existsSync('.git')) {
    const count = execSync('git rev-list --count HEAD').toString().trim();
    if (count && Number(count) > 0) version = `3.${count}`;
  }
} catch { /* sin git (Docker) → no-op */ }

if (version) {
  const body = `/**\n * Versión visible del build (footer). Generada automáticamente por\n * scripts/generate-version.mjs = 3.<nº de commits>. NO editar a mano.\n */\nexport const APP_VERSION = "${version}";\n`;
  writeFileSync('lib/version.ts', body);
  console.log('version →', version);
} else {
  console.log('version: sin git, se mantiene el valor commiteado');
}
