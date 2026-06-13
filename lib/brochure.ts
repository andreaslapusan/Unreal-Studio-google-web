/**
 * Resuelve el brochure de un proyecto según el idioma activo, con fallback a
 * INGLÉS y, por último, al campo legacy `brochure_url`. Así, si un idioma no tiene
 * brochure subido en admin, se usa el de inglés (ENG) por defecto.
 */
export function brochureFor(p: any, lang?: string): string {
  const l = (lang || 'es').slice(0, 2);
  const b = p?.brochures;
  return (b && (b[l] || b.en)) || p?.brochure_url || '';
}
