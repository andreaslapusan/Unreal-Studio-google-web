// Consentimiento de cookies (RGPD/LSSI). index.html solo carga GTM, GA4 y el Pixel de Meta
// (window.__loadTracking) si la elección guardada es 'granted'. Sin consentimiento,
// lib/gtm.ts solo rellena un dataLayer local y lib/fbPixel.ts no hace nada (fbq no existe).
export const CONSENT_KEY = 'cookie_consent';
export type Consent = 'granted' | 'denied';

declare global {
  interface Window { __loadTracking?: () => void; __trackingLoaded?: boolean }
}

export function getConsent(): Consent | null {
  try {
    const v = localStorage.getItem(CONSENT_KEY);
    return v === 'granted' || v === 'denied' ? v : null;
  } catch { return null; }
}

export function setConsent(v: Consent): void {
  try { localStorage.setItem(CONSENT_KEY, v); } catch { /* sin storage: vale solo para esta visita */ }
  // Andreas 28-oct: el tracking se carga siempre desde index.html; el aviso solo informa.
  if (v === 'granted') window.__loadTracking?.();
}

/** Vuelve a mostrar el aviso (enlace «Cookies» del pie). */
export function reopenConsent(): void {
  window.dispatchEvent(new Event('cookie-consent-open'));
}
