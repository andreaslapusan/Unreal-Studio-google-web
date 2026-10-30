import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getConsent, setConsent, Consent } from '../lib/consent';

// Aviso de cookies discreto abajo-IZQUIERDA (abajo-derecha está el botón de WhatsApp).
export default function CookieNotice() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(() => getConsent() === null);

  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener('cookie-consent-open', show);
    return () => window.removeEventListener('cookie-consent-open', show);
  }, []);

  if (!open) return null;
  const choose = (v: Consent) => { setOpen(false); setConsent(v); };

  return (
    <div
      role="region"
      aria-label={t('cookies.label')}
      className="fixed bottom-3 left-3 sm:bottom-6 sm:left-6 z-[70] w-[230px] max-w-[calc(100vw-6rem)] max-sm:w-auto max-sm:right-20 max-sm:flex max-sm:items-center max-sm:gap-2 max-sm:py-2 bg-white/95 backdrop-blur border border-primary/10 shadow-lg rounded-2xl p-3 pr-7 text-[11px] leading-snug text-primary/75"
    >
      <button type="button" onClick={() => setOpen(false)} aria-label={t('cookies.close')} className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full text-primary/50 hover:text-primary hover:bg-primary/5 text-base leading-none">×</button>
      <p>
        {t('cookies.text')}{' '}
        <Link to="/privacidad" className="underline hover:text-primary whitespace-nowrap">{t('cookies.more')}</Link>
      </p>
      <button type="button" onClick={() => choose('granted')} className="mt-2 max-sm:mt-0 max-sm:shrink-0 px-4 py-1 rounded-full bg-primary text-white border border-primary hover:bg-almond hover:text-primary transition">{t('cookies.accept')}</button>
    </div>
  );
}
