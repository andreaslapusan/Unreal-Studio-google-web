import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { portalPath } from '../lib/portalUrls';

// /agencias/confirmar-email?t=<token> → agency-hub confirm_email_change (link sent to the NEW address).
export default function AgencyEmailConfirm() {
  const { t } = useTranslation();
  const [sp] = useSearchParams();
  const [state, setState] = useState<'busy' | 'ok' | 'error'>('busy');
  const [email, setEmail] = useState('');
  useEffect(() => {
    void supabase.functions.invoke('agency-hub', { body: { action: 'confirm_email_change', token: sp.get('t') ?? '' } })
      .then(({ data }) => { if ((data as any)?.ok) { setEmail((data as any).email); setState('ok'); } else setState('error'); }, () => setState('error'));
  }, [sp]);
  return (
    <div className="min-h-screen flex items-center justify-center bg-almond p-6">
      <div className="bg-white rounded-3xl p-8 shadow-sm border border-primary/5 text-center max-w-md w-full" data-email-confirm={state}>
        <span className="material-symbols-outlined text-4xl text-primary/30">{state === 'ok' ? 'check_circle' : state === 'error' ? 'error' : 'hourglass_top'}</span>
        <p className="text-primary/80 mt-3 leading-relaxed break-words">
          {state === 'busy' ? t('agencyPortal.profile.emailConfirming') : state === 'ok' ? t('agencyPortal.profile.emailConfirmed', { email }) : t('agencyPortal.profile.emailConfirmError')}
        </p>
        {state !== 'busy' && <Link to={portalPath('agencias')} className="inline-flex mt-5 bg-primary text-white px-5 py-3 rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-black transition">{t('agencyPack.goLogin')}</Link>}
      </div>
    </div>
  );
}
