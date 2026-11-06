/** Mis clientes: registro (protege la comisión por fecha) + listado con búsqueda y filtro de estado. */
import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { AgencyData, fmtDate, shortProjectName } from './useAgencyData';
import { card, btnPrimary, input, Empty, ListRow, SectionTitle, StatusPill } from './ui';

const EMPTY_LEAD = { client_name: '', client_email: '', client_phone: '', country: '', property_id: '', budget: '', notes: '' };
const STATUSES = ['new', 'contacted', 'won', 'lost'] as const;

export default function AgencyClients({ data }: { data: AgencyData }) {
  const { t } = useTranslation();
  const { partner, projects, leads, reloadLeads } = data;
  const [sp, setSp] = useSearchParams();
  const [open, setOpen] = useState(sp.get('new') === '1');
  const [form, setForm] = useState(EMPTY_LEAD);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const status = sp.get('status') ?? 'all';

  // ?new=1 (acceso rápido desde Inicio) abre el modal una vez y se limpia de la URL.
  useEffect(() => {
    if (sp.get('new') !== '1') return;
    setOpen(true);
    const next = new URLSearchParams(sp); next.delete('new'); setSp(next, { replace: true });
  }, [sp, setSp]);

  if (!partner) return null;

  const setStatus = (s: string) => { const next = new URLSearchParams(sp); if (s === 'all') next.delete('status'); else next.set('status', s); setSp(next, { replace: true }); };
  const set = (k: keyof typeof EMPTY_LEAD) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.client_name.trim() || (!form.client_email.trim() && !form.client_phone.trim())) {
      setErr(t('agenciasDashboard.leads.errRequired'));
      return;
    }
    setSaving(true);
    setErr('');
    const row = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, (v as string).trim() || null]));
    const { error } = await supabase.from('agency_leads').insert({ ...row, agency_id: partner.id });
    setSaving(false);
    if (error) { setErr(error.message); return; }
    setForm(EMPTY_LEAD);
    setOpen(false);
    await reloadLeads();
  };

  const projectName = (id: string | null) => { const n = projects.find((p) => p.id === id)?.name; return n ? shortProjectName(n) : t('agencyPortal.commissions.noProject'); };
  const needle = q.trim().toLowerCase();
  const shown = leads.filter((l) =>
    (status === 'all' || (status === 'open' ? l.status === 'new' || l.status === 'contacted' : l.status === status)) &&
    (!needle || [l.client_name, l.client_email, l.client_phone, l.country, projectName(l.property_id)].some((v) => v?.toLowerCase().includes(needle))));
  const count = (s: string) => leads.filter((l) => (s === 'open' ? l.status === 'new' || l.status === 'contacted' : l.status === s)).length;

  const registerBtn = (
    <button onClick={() => { setErr(''); setOpen(true); }} className={btnPrimary}>
      <span className="material-symbols-outlined text-base">person_add</span>{t('agenciasDashboard.leads.register')}
    </button>
  );

  return (
    <div className="animate-in fade-in duration-500">
      <SectionTitle title={t('agencyPortal.nav.clients')} sub={t('agenciasDashboard.leads.body')} action={registerBtn} />

      {leads.length === 0 ? (
        <Empty icon="group" text={t('agenciasDashboard.leads.empty')} action={registerBtn} />
      ) : (
        <>
          <div className="flex flex-col md:flex-row gap-3 mb-4">
            <div className="relative md:w-72">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-primary/30 text-lg">search</span>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('agencyPortal.clients.search')} className={`${input} pl-10`} />
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
              {['all', 'open', ...STATUSES].map((s) => (
                <button key={s} onClick={() => setStatus(s)}
                  className={`shrink-0 px-3 py-2 rounded-full text-xs font-bold transition ${status === s ? 'bg-primary text-white' : 'bg-white border border-gray-200 text-primary/70 hover:bg-gray-50'}`}>
                  {s === 'all' ? t('agencyPortal.clients.all') : s === 'open' ? t('agencyPortal.kpi.following') : t(`agenciasDashboard.leads.status.${s}`)}
                  <span className="ml-1.5 opacity-60">{s === 'all' ? leads.length : count(s)}</span>
                </button>
              ))}
            </div>
          </div>

          {shown.length === 0 ? (
            <p className="text-sm text-primary/50 py-6 text-center">{t('agencyPortal.clients.noMatch')}</p>
          ) : (
            <div className={`${card} !p-0 overflow-hidden`}>
              <ul className="divide-y divide-gray-100">
                {shown.map((l) => (
                  <ListRow key={l.id}
                    title={l.client_name}
                    sub={<>{projectName(l.property_id)}{l.budget ? <span className="text-primary/40"> · {l.budget}</span> : null}</>}
                    extra={[l.client_email, l.client_phone, l.country].filter(Boolean).join(' · ') || undefined}
                    right={<><StatusPill status={l.status} label={t(`agenciasDashboard.leads.status.${l.status}`)} /><span className="text-xs text-primary/40 whitespace-nowrap">{fmtDate(l.created_at)}</span></>}
                  />
                ))}
              </ul>
            </div>
          )}
          <p className="text-xs text-primary/40 mt-3">{t('agencyPortal.clients.statusHint')}</p>
        </>
      )}

      {open && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setOpen(false)}>
          <form onSubmit={submit} className="ust-modal bg-white rounded-2xl shadow-2xl p-7 relative w-full max-w-lg max-h-[90vh] overflow-y-auto space-y-3" onClick={(e) => e.stopPropagation()}>
            <button type="button" onClick={() => setOpen(false)} aria-label={t('agenciasDashboard.leads.close')} className="absolute top-4 right-4 text-gray-400 hover:text-primary transition">
              <span className="material-symbols-outlined">close</span>
            </button>
            <h2 className="text-2xl font-serif text-primary pr-8">{t('agenciasDashboard.leads.register')}</h2>
            <p className="text-xs text-primary/60">{t('agenciasDashboard.leads.body')}</p>
            <input className={input} placeholder={t('agenciasDashboard.leads.name')} value={form.client_name} onChange={set('client_name')} required maxLength={200} />
            <input className={input} type="email" placeholder={t('agenciasDashboard.leads.email')} value={form.client_email} onChange={set('client_email')} maxLength={200} />
            <input className={input} type="tel" placeholder={t('agenciasDashboard.leads.phone')} value={form.client_phone} onChange={set('client_phone')} maxLength={50} />
            <input className={input} placeholder={t('agenciasDashboard.leads.country')} value={form.country} onChange={set('country')} maxLength={100} />
            <select className={input} value={form.property_id} onChange={set('property_id')}>
              <option value="">{t('agenciasDashboard.leads.project')}</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <input className={input} placeholder={t('agenciasDashboard.leads.budget')} value={form.budget} onChange={set('budget')} maxLength={100} />
            <textarea className={input} rows={3} placeholder={t('agenciasDashboard.leads.notes')} value={form.notes} onChange={set('notes')} maxLength={2000} />
            {err && <p className="text-xs text-red-600">{err}</p>}
            <button type="submit" disabled={saving} className={`${btnPrimary} w-full !py-3`}>
              {saving ? t('agenciasDashboard.leads.saving') : t('agenciasDashboard.leads.submit')}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
