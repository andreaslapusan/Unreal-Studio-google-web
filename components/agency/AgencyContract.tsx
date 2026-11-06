/** Contrato: resumen de las condiciones de colaboración + solicitar contrato (agency_requests type='contract'). */
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AgencyData } from './useAgencyData';
import { createRequest, RequestRow } from './AgencyRequests';
import { card, btnPrimary, SectionTitle } from './ui';

export default function AgencyContract({ data }: { data: AgencyData }) {
  const { t } = useTranslation();
  const { partner, requests, reloadRequests } = data;
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  if (!partner) return null;

  const mine = requests.filter((r) => r.type === 'contract');
  const inProgress = mine.some((r) => r.status === 'pending' || r.status === 'scheduled');

  const request = async () => {
    setSaving(true); setMsg(null);
    const err = await createRequest(partner.id, { type: 'contract' });
    setSaving(false);
    if (err) { setMsg({ ok: false, text: err }); return; }
    setMsg({ ok: true, text: t('agencyPortal.contract.requested') });
    await reloadRequests();
  };

  const terms = [1, 2, 3, 4, 5];
  return (
    <div className="animate-in fade-in duration-500 space-y-6">
      <SectionTitle title={t('agencyPortal.nav.contract')} sub={t('agencyPortal.contract.sub')}
        action={<button onClick={request} disabled={saving || inProgress} className={btnPrimary}><span className="material-symbols-outlined text-base">gavel</span>{t('agencyPortal.contract.request')}</button>} />
      {(msg || inProgress) && (
        <p className={`text-sm rounded-xl px-4 py-3 ${msg && !msg.ok ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-800'}`}>{msg?.text ?? t('agencyPortal.contract.pending')}</p>
      )}

      <section className={`${card} !p-0 overflow-hidden`}>
        <h3 className="text-sm font-black uppercase tracking-widest text-primary/40 px-5 pt-5 pb-2">{t('agencyPortal.contract.termsTitle')}</h3>
        <dl className="divide-y divide-gray-100">
          {terms.map((i) => (
            <div key={i} className="px-5 py-4 md:grid md:grid-cols-[220px_1fr] md:gap-6">
              <dt className="text-sm font-bold text-primary">{t(`agencyPortal.contract.c${i}t`)}</dt>
              <dd className="text-sm text-primary/70 leading-relaxed mt-1 md:mt-0">{t(`agencyPortal.contract.c${i}`)}</dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 [&>*]:min-w-0">
        <section className={card}>
          <h3 className="text-sm font-black uppercase tracking-widest text-primary/40 mb-2">{t('agencyPortal.contract.youTitle')}</h3>
          <p className="text-sm text-primary/70 leading-relaxed">{t('agencyPortal.contract.you')}</p>
        </section>
        <section className={card}>
          <h3 className="text-sm font-black uppercase tracking-widest text-primary/40 mb-2">{t('agencyPortal.contract.usTitle')}</h3>
          <p className="text-sm text-primary/70 leading-relaxed">{t('agencyPortal.contract.us')}</p>
        </section>
      </div>

      {mine.length > 0 && (
        <section>
          <h3 className="text-sm font-black uppercase tracking-widest text-primary/40 mb-3">{t('agencyPortal.contract.history')}</h3>
          <div className={`${card} !p-0 overflow-hidden`}><ul className="divide-y divide-gray-100">{mine.map((r) => <RequestRow key={r.id} r={r} />)}</ul></div>
        </section>
      )}
    </div>
  );
}
