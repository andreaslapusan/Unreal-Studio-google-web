/** Solicitudes al equipo Unreal: llamada, visita/viaje a Bali, presentación online o contrato (tabla agency_requests). */
import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { AgencyData, AgencyRequest, fmtDate } from './useAgencyData';
import { card, btnPrimary, input, Empty, ListRow, SectionTitle, StatusPill } from './ui';

export const REQUEST_TYPES = ['call', 'visit', 'presentation', 'contract'] as const;
const TYPE_ICON: { type: typeof REQUEST_TYPES[number]; icon: string }[] = [
  { type: 'call', icon: 'call' }, { type: 'visit', icon: 'flight' }, { type: 'presentation', icon: 'videocam' }, { type: 'contract', icon: 'gavel' },
];
export const requestIcon = (type: string) => TYPE_ICON.find((x) => x.type === type)?.icon ?? 'event';

/** Inserta una solicitud de la agencia. Devuelve el mensaje de error o null. */
export async function createRequest(agencyId: string, row: { type: string; lead_id?: string | null; preferred_date?: string | null; notes?: string | null }): Promise<string | null> {
  const { error } = await supabase.from('agency_requests').insert({ agency_id: agencyId, type: row.type, lead_id: row.lead_id || null, preferred_date: row.preferred_date || null, notes: row.notes?.trim() || null });
  return error ? error.message : null;
}

export const RequestRow: React.FC<{ r: AgencyRequest; leadName?: string }> = ({ r, leadName }) => {
  const { t } = useTranslation();
  return (
    <ListRow icon={requestIcon(r.type)} wrap
      title={t(`agencyPortal.requests.t.${r.type}`)}
      sub={leadName ? t('agencyPortal.requests.for', { name: leadName }) : undefined}
      extra={r.notes ?? undefined}
      right={<>
        <StatusPill status={r.status} label={t(`agencyPortal.requests.st.${r.status}`)} />
        {r.preferred_date
          ? <span className="inline-flex items-center gap-1 text-xs font-bold text-primary/60 whitespace-nowrap" title={t('agencyPortal.requests.date')}><span className="material-symbols-outlined text-sm">event</span>{fmtDate(r.preferred_date)}</span>
          : <span className="text-xs text-primary/40 whitespace-nowrap">{fmtDate(r.created_at)}</span>}
      </>}
    />
  );
};

export default function AgencyRequests({ data }: { data: AgencyData }) {
  const { t } = useTranslation();
  const { partner, leads, requests, reloadRequests } = data;
  const [sp, setSp] = useSearchParams();
  const [form, setForm] = useState({ type: 'call', lead_id: '', preferred_date: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // ?type=call&lead=<id> (desde la ficha de un cliente) precarga el formulario.
  useEffect(() => {
    const type = sp.get('type'); const lead = sp.get('lead');
    if (!type && !lead) return;
    setForm((f) => ({ ...f, type: type && (REQUEST_TYPES as readonly string[]).includes(type) ? type : f.type, lead_id: lead ?? f.lead_id }));
    const next = new URLSearchParams(sp); next.delete('type'); next.delete('lead'); setSp(next, { replace: true });
  }, [sp, setSp]);

  if (!partner) return null;
  const leadName = (id: string | null) => leads.find((l) => l.id === id)?.client_name;
  const open = requests.filter((r) => r.status === 'pending' || r.status === 'scheduled');
  const past = requests.filter((r) => r.status === 'done' || r.status === 'cancelled');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setMsg(null);
    const err = await createRequest(partner.id, form);
    setSaving(false);
    if (err) { setMsg({ ok: false, text: err }); return; }
    setForm({ type: 'call', lead_id: '', preferred_date: '', notes: '' });
    setMsg({ ok: true, text: t('agencyPortal.requests.sent') });
    await reloadRequests();
  };

  return (
    <div className="animate-in fade-in duration-500 space-y-6">
      <SectionTitle title={t('agencyPortal.nav.requests')} sub={t('agencyPortal.requests.sub')} />

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 [&>*]:min-w-0">
        <form onSubmit={submit} className={`${card} lg:col-span-2 space-y-3 self-start`}>
          <h3 className="text-sm font-black uppercase tracking-widest text-primary/40">{t('agencyPortal.requests.new')}</h3>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={t('agencyPortal.requests.type')}>
            {TYPE_ICON.map(({ type, icon }) => (
              <button type="button" key={type} role="radio" aria-checked={form.type === type} onClick={() => setForm((f) => ({ ...f, type }))}
                className={`flex flex-col items-start gap-1 p-3 rounded-xl border text-left transition ${form.type === type ? 'border-primary bg-primary text-white' : 'border-gray-200 text-primary hover:bg-gray-50'}`}>
                <span className="material-symbols-outlined text-xl">{icon}</span>
                <span className="text-xs font-bold leading-tight">{t(`agencyPortal.requests.t.${type}`)}</span>
              </button>
            ))}
          </div>
          {form.type !== 'contract' && (
            <select className={input} value={form.lead_id} onChange={(e) => setForm((f) => ({ ...f, lead_id: e.target.value }))} aria-label={t('agencyPortal.requests.client')}>
              <option value="">{t('agencyPortal.requests.noClient')}</option>
              {leads.filter((l) => l.status !== 'lost').map((l) => <option key={l.id} value={l.id}>{l.client_name}</option>)}
            </select>
          )}
          <label className="block">
            <span className="block text-xs text-primary/50 mb-1">{t('agencyPortal.requests.date')}</span>
            <input type="date" className={input} value={form.preferred_date} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setForm((f) => ({ ...f, preferred_date: e.target.value }))} />
          </label>
          <textarea className={input} rows={3} maxLength={2000} placeholder={t('agencyPortal.requests.notes')} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
          {msg && <p className={`text-xs ${msg.ok ? 'text-green-700' : 'text-red-600'}`}>{msg.text}</p>}
          <button type="submit" disabled={saving} className={`${btnPrimary} w-full !py-3`}>
            <span className="material-symbols-outlined text-base">send</span>{saving ? t('agencyPortal.requests.sending') : t('agencyPortal.requests.send')}
          </button>
        </form>

        <div className="lg:col-span-3 space-y-6">
          {requests.length === 0 ? <Empty icon="event" text={t('agencyPortal.requests.empty')} /> : (
            <>
              {open.length > 0 && (
                <section>
                  <h3 className="text-sm font-black uppercase tracking-widest text-primary/40 mb-3">{t('agencyPortal.requests.open')}</h3>
                  <div className={`${card} !p-0 overflow-hidden`}><ul className="divide-y divide-gray-100">{open.map((r) => <RequestRow key={r.id} r={r} leadName={leadName(r.lead_id)} />)}</ul></div>
                </section>
              )}
              {past.length > 0 && (
                <section>
                  <h3 className="text-sm font-black uppercase tracking-widest text-primary/40 mb-3">{t('agencyPortal.requests.history')}</h3>
                  <div className={`${card} !p-0 overflow-hidden`}><ul className="divide-y divide-gray-100">{past.map((r) => <RequestRow key={r.id} r={r} leadName={leadName(r.lead_id)} />)}</ul></div>
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
