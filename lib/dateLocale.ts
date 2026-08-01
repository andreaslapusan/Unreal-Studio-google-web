/**
 * Locale activo para formatear FECHAS/HORAS según el idioma de la interfaz.
 *
 * Antes había decenas de `toLocaleDateString('es-ES', ...)` fijos → las fechas
 * salían en español aunque la web estuviera en inglés/rumano/indonesio. Esta
 * función devuelve el locale correcto del idioma actual (i18n) para que las
 * fechas SIEMPRE acompañen al idioma elegido.
 *
 * OJO: para AGRUPAR MILES en importes seguimos usando 'es-ES' a propósito (puntos
 * de miles); eso NO usa esta función.
 */
import i18n from './i18n';

const DATE_LOCALE: Record<string, string> = {
  es: 'es-ES',
  en: 'en-GB',
  ro: 'ro-RO',
  id: 'id-ID',
};

/** Locale BCP-47 del idioma activo (es→es-ES, en→en-GB, ro→ro-RO, id→id-ID). */
export function uiLocale(): string {
  const l = (i18n.language || 'es').slice(0, 2);
  return DATE_LOCALE[l] || 'es-ES';
}

/**
 * Iniciales de los 7 días de la semana (lunes primero) en el idioma activo.
 * Reemplaza los arrays fijos ['L','M','X','J','V','S','D'] que salían en español
 * en EN/RO/ID. weekdaysFor('en-GB') → ['M','T','W','T','F','S','S'], etc.
 */
export const weekdaysFor = (locale: string): string[] =>
  Array.from({ length: 7 }, (_, i) =>
    new Date(2024, 0, 1 + i).toLocaleDateString(locale, { weekday: 'narrow' }).toUpperCase());
