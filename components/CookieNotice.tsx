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
      className="fixed bottom-3 left-3 z-[70] max-w-[calc(100vw-5.5rem)] sm:max-w-none bg-white/95 backdrop-blur border border-primary/10 shadow-lg rounded-2xl pl-3 pr-1.5 py-1.5 text-[11px] leading-snug text-primary/75 flex flex-wrap sm:flex-nowrap items-center gap-x-3 gap-y-1"
    >
      <span>
        {t('cookies.text')}{' '}
        <Link to="/privacidad" className="underline hover:text-primary whitespace-nowrap">{t('cookies.more')}</Link>
      </span>
      <span className="flex items-center gap-1.5 shrink-0">
        <button type="button" onClick={() => choose('granted')} className="px-2.5 py-1 rounded-full bg-primary text-white border border-primary hover:bg-almond hover:text-primary transition">{t('cookies.accept')}</button>
        <button type="button" onClick={() => setOpen(false)} aria-label={t('cookies.close')} className="w-6 h-6 rounded-full text-primary/50 hover:text-primary hover:bg-primary/5 text-base leading-none">×</button>
      </span>
    </div>
  );
}
