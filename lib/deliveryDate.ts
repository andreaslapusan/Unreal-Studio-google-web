/**
 * Lógica de la fecha de entrega ("Entrega") en las fichas/tarjetas públicas.
 * Reglas pedidas por Andreas (2026-10-05):
 *  - Obra FINALIZADA → NO mostrar fecha de entrega (ya está entregada).
 *  - Sobre plano / en construcción → mostrar "a partir de {fecha}" (prefijo
 *    localizado), evitando duplicar el prefijo si el dato ya lo trae
 *    (p.ej. "A partir de marzo 2027").
 */

const FINISHED = ['obra finalizada', 'finalizado', 'entregado', 'listo para entrar', 'terminad'];

/** ¿El estado es "obra finalizada" (en cualquiera de sus variantes/idiomas de dato)? */
export function isFinished(status?: string | null): boolean {
  const s = (status || '').toLowerCase().trim();
  return FINISHED.some((f) => s.includes(f));
}

/**
 * Texto de entrega con prefijo "a partir de" normalizado. Quita cualquier
 * prefijo ya presente (a partir de / from / de la / mulai) y antepone el que
 * toca en el idioma. Devuelve '' si no hay fecha.
 */
export function deliveryText(rawDate: string | null | undefined, fromWord: string): string {
  const clean = (rawDate || '').replace(/^\s*(a partir de|from|de la|mulai|începând cu)\s+/i, '').trim();
  if (!clean) return '';
  return `${fromWord} ${clean}`;
}
