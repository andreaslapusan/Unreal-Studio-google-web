/**
 * Indicador de carga GLOBAL. Un contador simple con suscriptores: cualquier
 * acción async (guardar, iniciar sesión, etc.) puede envolver su promesa con
 * `withLoading(...)` para mostrar la ruedecita centrada en pantalla mientras dura.
 */
let count = 0;
const listeners = new Set<(n: number) => void>();

function emit() { listeners.forEach((l) => l(count)); }

export function startLoading() { count += 1; emit(); }
export function stopLoading() { count = Math.max(0, count - 1); emit(); }

export async function withLoading<T>(p: Promise<T>): Promise<T> {
  startLoading();
  try { return await p; }
  finally { stopLoading(); }
}

export function subscribeLoading(l: (n: number) => void): () => void {
  listeners.add(l);
  l(count);
  return () => { listeners.delete(l); };
}
