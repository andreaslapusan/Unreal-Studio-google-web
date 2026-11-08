/** /report/<ruta> — abre un reporte de obra PRIVADO: con la sesión pide un enlace firmado
 * de 10 min (edge fn report-url, que comprueba el permiso) y redirige a él. Sin sesión o sin
 * permiso muestra un aviso: así un enlace reenviado no sirve a nadie sin acceso. */
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { signReport } from '../lib/reportFiles';
import { portalPath, type Portal } from '../lib/portalUrls';

export default function ReportOpen() {
  const { t, i18n } = useTranslation();
  const [state, setState] = useState<'loading' | 'login' | 'denied'>('loading');

  useEffect(() => {
    const path = decodeURIComponent(window.location.pathname.replace(/^\/report\//, ''));
    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) { setState('login'); return; }
      const r = await signReport(path);
      if (r.url) window.location.replace(r.url);
      else setState(r.status === 401 ? 'login' : 'denied');
    })();
  }, []);

  const lang = (['es', 'en', 'ro', 'id'].includes(i18n.language) ? i18n.language : 'es') as 'es' | 'en' | 'ro' | 'id';
  return (
    <div className="min-h-screen flex items-center justify-center bg-almond/30 px-4">
      <div className="bg-white rounded-3xl shadow-xl p-8 max-w-sm w-full text-center">
        <span className="material-symbols-outlined text-4xl text-primary/60">{state === 'loading' ? 'hourglass_top' : 'lock'}</span>
        <p className="mt-3 text-primary font-bold">
          {state === 'loading' ? t('reportOpen.opening') : state === 'login' ? t('reportOpen.login') : t('reportOpen.denied')}
        </p>
        {state !== 'loading' && (
          <a href={portalPath('cliente' as Portal, lang)} className="inline-block mt-5 bg-primary text-white text-sm font-black px-5 py-3 rounded-2xl">{t('reportOpen.goPortal')}</a>
        )}
      </div>
    </div>
  );
}
