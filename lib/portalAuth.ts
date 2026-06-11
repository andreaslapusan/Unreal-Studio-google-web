/**
 * Fase B — independencia de portales por email sintético.
 *
 * Cada portal usa su propio usuario de Supabase Auth con un email "sintético"
 * (sub-dirección por portal), de modo que un MISMO email real puede tener una
 * contraseña DISTINTA en cada portal sin chocar con la unicidad de auth.users.
 *
 *   andreas@unrealstudiobali.com  +  cliente  →  andreas+ust-cliente@unrealstudiobali.com
 *
 * El email REAL se guarda en user_metadata.real_email; las funciones/políticas
 * de la BD usan app_email() (real_email o, si no hay, auth.email()), así que la
 * resolución de datos (cliente, empleado, admin…) sigue funcionando.
 *
 * COMPATIBILIDAD: el login intenta primero el sintético y, si falla, reintenta
 * con el email real (cuentas aún no migradas) → ningún usuario existente pierde
 * el acceso.
 */
import type { User } from '@supabase/supabase-js';

export type Portal = 'cliente' | 'agencias' | 'empleados' | 'admin';

/** Email sintético por portal a partir del email real. */
export function synthEmail(portal: Portal, email: string): string {
  const real = (email || '').trim().toLowerCase();
  const at = real.indexOf('@');
  if (at < 0) return real;
  return `${real.slice(0, at)}+ust-${portal}@${real.slice(at + 1)}`;
}

/** Email real de la sesión: real_email del metadata o, si no, el email auth. */
export function realEmailOf(user: User | null | undefined): string {
  if (!user) return '';
  const meta = (user.user_metadata || {}) as Record<string, unknown>;
  const real = typeof meta.real_email === 'string' ? meta.real_email : '';
  return (real || user.email || '').toLowerCase();
}
