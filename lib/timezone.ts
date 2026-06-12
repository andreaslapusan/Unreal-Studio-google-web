/**
import { uiLocale } from './dateLocale';
 * Zona horaria del negocio: Bali = WITA = UTC+8 (sin horario de verano).
 *
 * Todo lo de fichajes/asistencia/calendario se interpreta y muestra en hora de
 * Bali, INDEPENDIENTEMENTE de la zona del dispositivo o del servidor (UTC). Así
 * un fichaje a las 03:29 de Bali cuenta como ese día en Bali, no como el día
 * anterior en UTC.
 */
export const BALI_TZ = 'Asia/Makassar'; // UTC+8

/** Fecha (YYYY-MM-DD) en hora de Bali de un instante dado. */
export function baliDate(d: Date | string): string {
  const dt = typeof d === 'string' ? new Date(d) : d;
  // en-CA → formato YYYY-MM-DD
  return dt.toLocaleDateString('en-CA', { timeZone: BALI_TZ });
}

/** Hoy (YYYY-MM-DD) en hora de Bali. */
export function baliToday(): string {
  return baliDate(new Date());
}

/** Instante UTC del inicio (00:00 Bali) de la fecha de Bali indicada. */
export function baliDayStartISO(baliYmd: string): string {
  return new Date(`${baliYmd}T00:00:00+08:00`).toISOString();
}

/** Hora HH:MM en Bali de un instante. */
export function baliTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString(uiLocale(), { hour: '2-digit', minute: '2-digit', timeZone: BALI_TZ });
  } catch {
    return '';
  }
}
