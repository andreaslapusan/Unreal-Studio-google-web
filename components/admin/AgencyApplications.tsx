/**
 * AgencyApplications — gestión de agencias en el admin principal (vista 'agencias').
 * Solicitudes (AgencyApplicationsList) · Agencias (AgencyPartnersList) · Clientes registrados · Solicitudes de agencias.
 * Todo con filtro, búsqueda y paginación; acciones con modal de la casa + toast (sin alert/confirm).
 */
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { uiLocale } from '../../lib/dateLocale';
import LeadDrawer from '../agency/LeadDrawer';
import { shortProjectName } from '../agency/useAgencyData';
import AgencyApplicationsList from './AgencyApplicationsList';
import AgencyPartnersList from './AgencyPartnersList';
import AgencyLeadEventModal from './AgencyLeadEventModal';
import { ListFilters, Modal, Pager, ilikeTerm, pillBtn, usePaged, useErrText, useToast } from './agencyAdminUi';
import { fuzzyIncludes } from '../../lib/fold';

const LEAD_COLS = 'id, agency_id, created_at, client_name, client_email, client_phone, country, property_id, budget, notes, status';
const REQ_COLS = 'id, agency_id, created_at, type, lead_id, unit_id, preferred_date, notes, status, agency_leads(client_name), property_units(unit_name)';

const AgencyApplications: React.FC = () => {
  const { t } = useTranslation();
  const errText = useErrText();
  const [toastNode, toast] = useToast();
  const [names, setNames] = useState<Record<string, string>>({});
  const [props, setProps] = useState<any[]>([]);
  const [pending, setPending] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);
  const [openLead, setOpenLead] = useState<any | null>(null);
  const [event, setEvent] = useState<{ lead: any; kind: 'reservation' | 'sale' } | null>(null);
  const [delLead, setDelLead] = useState<any | null>(null);
  const [lq, setLq] = useState(''); const [ls, setLs] = useState('all');
  const [rq, setRq] = useState(''); const [rs, setRs] = useState('open');

  const loadMeta = async () => {
    const [lp, pr, pc] = await Promise.all([
      supabase.from('listing_partners').select('id, agency_name'),
      supabase.from('properties').select('id, slug, name').order('name'),
      supabase.from('listing_partner_applications').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    ]);
    setNames(Object.fromEntries((lp.data ?? []).map((p: any) => [p.id, p.agency_name])));
    setProps(pr.data ?? []);
    setPending(pc.count ?? 0);
  };
  useEffect(() => { void loadMeta(); }, [refreshKey]);
  const changed = () => setRefreshKey((k) => k + 1);

  const agencyIdsFor = (q: string) => Object.entries(names).filter(([, n]) => fuzzyIncludes(n, q)).map(([id]) => id);
  const leads = usePaged<any>(() => {
    let b = supabase.from('agency_leads').select(LEAD_COLS, { count: 'exact' }).order('created_at', { ascending: false });
    if (ls !== 'all') b = b.eq('status', ls);
    if (lq.trim()) {
      const ids = agencyIdsFor(lq);
      b = b.or([`client_name.ilike.${ilikeTerm(lq)}`, `client_email.ilike.${ilikeTerm(lq)}`, `country.ilike.${ilikeTerm(lq)}`, ...(ids.length ? [`agency_id.in.(${ids.join(',')})`] : [])].join(','));
    }
    return b;
  }, [lq, ls, refreshKey]);
  const requests = usePaged<any>(() => {
    let b = supabase.from('agency_requests').select(REQ_COLS, { count: 'exact' }).order('created_at', { ascending: false });
    if (rs === 'open') b = b.in('status', ['pending', 'scheduled']);
    else if (rs !== 'all') b = b.eq('status', rs);
    if (rq.trim()) { const ids = agencyIdsFor(rq); b = ids.length ? b.or(`agency_id.in.(${ids.join(',')}),notes.ilike.${ilikeTerm(rq)}`) : b.ilike('notes', ilikeTerm(rq)); }
    return b;
  }, [rq, rs, refreshKey]);

  const projectName = (id: string | null) => shortProjectName(props.find((p) => p.id === id)?.name ?? '') || '—';
  const when = (iso: string) => new Date(iso).toLocaleString(uiLocale(), { dateStyle: 'short', timeStyle: 'short' });

  const setLeadStatus = async (id: string, status: string) => {
    const { error } = await supabase.from('agency_leads').update({ status }).eq('id', id);
    if (error) { toast(errText(error), false); return; }
    leads.setRows((rows) => rows.map((l) => (l.id === id ? { ...l, status } : l)));
  };
  const setRequestStatus = async (id: string, status: string) => {
    const { error } = await supabase.from('agency_requests').update({ status }).eq('id', id);
    if (error) { toast(errText(error), false); return; }
    requests.setRows((rows) => rows.map((r) => (r.id === id ? { ...r, status } : r)));
  };
  const removeLead = async () => {
    const { error } = await supabase.from('agency_leads').delete().eq('id', delLead.id);
    if (error) { toast(errText(error), false); return; }
    toast(t('agencyFunnel.admin.leadDeleted'));
    setDelLead(null);
    await leads.reload();
  };

  const leadActions = (l: any) => (
    <div className="flex flex-wrap items-center gap-1.5">
      <select value={l.status} onChange={(e) => void setLeadStatus(l.id, e.target.value)} aria-label={t('agencyFunnel.admin.statusLabel')} className="border border-primary/15 rounded-lg px-2 py-1 text-xs bg-white">
        {['new', 'contacted', 'won', 'lost'].map((s) => <option key={s} value={s}>{t(`agenciasDashboard.leads.status.${s}`)}</option>)}
      </select>
      {(['reservation', 'sale'] as const).map((kind) => (
        <button key={kind} type="button" onClick={() => setEvent({ lead: l, kind })} className={pillBtn}>+ {t(`admin.agencyLeads.ev.${kind}`)}</button>
      ))}
      <button type="button" onClick={() => setDelLead(l)} aria-label={t('agencyFunnel.admin.delete')} className={`${pillBtn} !border-red-200 text-red-700`}><span className="material-symbols-outlined text-sm align-middle">delete</span></button>
    </div>
  );

  const reqStatus = (r: any) => (
    <select value={r.status} onChange={(e) => void setRequestStatus(r.id, e.target.value)} aria-label={t('agencyFunnel.admin.statusLabel')} className="border border-primary/15 rounded-lg px-2 py-1 text-xs bg-white">
      {['pending', 'scheduled', 'done', 'cancelled'].map((s) => <option key={s} value={s}>{t(`agencyPortal.requests.st.${s}`)}</option>)}
    </select>
  );
  const reqWhat = (r: any) => [t(`agencyPortal.requests.t.${r.type}`), r.agency_leads?.client_name, r.property_units?.unit_name].filter(Boolean).join(' · ');

  const H3 = ({ children }: { children: React.ReactNode }) => <h3 className="text-sm font-black uppercase tracking-widest text-primary/40 mb-4">{children}</h3>;

  return (
    <>
    <div className="animate-in fade-in duration-500 space-y-10 min-w-0">
      <h2 className="text-2xl font-serif text-primary">{t('admin.agencyApps.title')}{pending > 0 ? ` · ${t('admin.agencyApps.pendingCount', { n: pending })}` : ''}</h2>
      <section><H3>{t('admin.agencyApps.applications')}</H3><AgencyApplicationsList toast={toast} onChanged={changed} /></section>
      <section><H3>{t('admin.agencyApps.activePartners')}</H3><AgencyPartnersList toast={toast} refreshKey={refreshKey} /></section>

      <section>
        <H3>{t('admin.agencyLeads.title')}</H3>
        <ListFilters q={lq} setQ={setLq} status={ls} setStatus={setLs} label={t('agencyFunnel.admin.statusLabel')}
          statuses={['all', 'new', 'contacted', 'won', 'lost'].map((s) => ({ value: s, label: s === 'all' ? t('agencyFunnel.admin.allStatuses') : t(`agenciasDashboard.leads.status.${s}`) }))} />
        {leads.rows.length === 0 ? <p className="text-sm text-primary/50">{t('admin.agencyLeads.empty')}</p> : (
          <>
          <ul className="md:hidden space-y-3">
            {leads.rows.map((l) => (
              <li key={l.id} className="bg-white rounded-2xl p-4 border border-primary/5 shadow-sm min-w-0">
                <div className="flex items-start justify-between gap-3">
                  <button type="button" onClick={() => setOpenLead(l)} className="text-left font-bold text-primary underline decoration-primary/30 underline-offset-2 min-w-0 break-words">{l.client_name}</button>
                  <span className="text-[11px] text-primary/40 whitespace-nowrap">{new Date(l.created_at).toLocaleDateString(uiLocale(), { day: '2-digit', month: 'short' })}</span>
                </div>
                <p className="text-xs text-primary/60 mt-1">{[names[l.agency_id], projectName(l.property_id), l.budget].filter(Boolean).join(' · ')}</p>
                {(l.client_email || l.client_phone) && <p className="text-xs text-primary/40 mt-0.5 break-all">{[l.client_email, l.client_phone].filter(Boolean).join(' · ')}</p>}
                <div className="mt-3">{leadActions(l)}</div>
              </li>
            ))}
          </ul>
          <div className="hidden md:block overflow-x-auto bg-white/60 rounded-xl">
            <table className="w-full text-sm">
              <thead className="text-left text-[10px] uppercase tracking-widest text-primary/40">
                <tr>{['date', 'agency', 'client', 'contact', 'project', 'budget', 'notes', 'status'].map((c) => <th key={c} className="p-3">{t(`admin.agencyLeads.col.${c}`)}</th>)}</tr>
              </thead>
              <tbody>
                {leads.rows.map((l) => (
                  <tr key={l.id} className="border-t border-primary/10 align-top">
                    <td className="p-3 whitespace-nowrap text-xs">{when(l.created_at)}</td>
                    <td className="p-3">{names[l.agency_id] ?? '—'}</td>
                    <td className="p-3 font-medium">
                      <button type="button" onClick={() => setOpenLead(l)} className="text-left underline decoration-primary/30 underline-offset-2 hover:decoration-primary" title={t('admin.agencyLeads.open')}>{l.client_name}</button>
                      {l.country ? <span className="block text-xs text-primary/50">{l.country}</span> : null}
                    </td>
                    <td className="p-3 text-xs min-w-0 break-all max-w-[220px]">{[l.client_email, l.client_phone].filter(Boolean).join(' · ') || '—'}</td>
                    <td className="p-3 text-xs">{projectName(l.property_id)}</td>
                    <td className="p-3 text-xs">{l.budget ?? '—'}</td>
                    <td className="p-3 text-xs max-w-[220px] whitespace-pre-wrap break-words">{l.notes ?? '—'}</td>
                    <td className="p-3">{leadActions(l)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
        <Pager page={leads.page} count={leads.count} setPage={leads.setPage} />
      </section>

      <section>
        <H3>{t('admin.agencyRequests.title')}</H3>
        <ListFilters q={rq} setQ={setRq} status={rs} setStatus={setRs} label={t('agencyFunnel.admin.statusLabel')}
          statuses={['open', 'all', 'pending', 'scheduled', 'done', 'cancelled'].map((s) => ({ value: s, label: s === 'all' ? t('agencyFunnel.admin.allStatuses') : s === 'open' ? t('agencyPortal.requests.open') : t(`agencyPortal.requests.st.${s}`) }))} />
        {requests.rows.length === 0 ? <p className="text-sm text-primary/50">{t('admin.agencyRequests.empty')}</p> : (
          <>
          <ul className="md:hidden space-y-3">
            {requests.rows.map((r) => (
              <li key={r.id} className="bg-white rounded-2xl p-4 border border-primary/5 shadow-sm min-w-0">
                <div className="flex items-start justify-between gap-3"><p className="font-bold text-primary text-sm min-w-0 break-words">{reqWhat(r)}</p><span className="text-[11px] text-primary/40 whitespace-nowrap">{when(r.created_at)}</span></div>
                <p className="text-xs text-primary/60 mt-1">{names[r.agency_id] ?? '—'}{r.preferred_date ? ` · ${new Date(r.preferred_date).toLocaleDateString(uiLocale())}` : ''}</p>
                {r.notes && <p className="text-xs text-primary/50 mt-1 whitespace-pre-wrap break-words">{r.notes}</p>}
                <div className="mt-3">{reqStatus(r)}</div>
              </li>
            ))}
          </ul>
          <div className="hidden md:block overflow-x-auto bg-white/60 rounded-xl">
            <table className="w-full text-sm">
              <thead className="text-left text-[10px] uppercase tracking-widest text-primary/40">
                <tr>{['date', 'agency', 'type', 'client', 'preferred', 'notes', 'status'].map((c) => <th key={c} className="p-3">{t(`admin.agencyRequests.col.${c}`)}</th>)}</tr>
              </thead>
              <tbody>
                {requests.rows.map((r) => (
                  <tr key={r.id} className="border-t border-primary/10 align-top">
                    <td className="p-3 whitespace-nowrap text-xs">{when(r.created_at)}</td>
                    <td className="p-3">{names[r.agency_id] ?? '—'}</td>
                    <td className="p-3 font-medium whitespace-nowrap">{t(`agencyPortal.requests.t.${r.type}`)}{r.property_units?.unit_name ? <span className="block text-xs text-primary/50">{r.property_units.unit_name}</span> : null}</td>
                    <td className="p-3 text-xs">{r.agency_leads?.client_name ?? '—'}</td>
                    <td className="p-3 text-xs whitespace-nowrap">{r.preferred_date ? new Date(r.preferred_date).toLocaleDateString(uiLocale()) : '—'}</td>
                    <td className="p-3 text-xs max-w-[260px] whitespace-pre-wrap break-words">{r.notes ?? '—'}</td>
                    <td className="p-3">{reqStatus(r)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
        <Pager page={requests.page} count={requests.count} setPage={requests.setPage} />
      </section>
    </div>
    {toastNode}
    {event && <AgencyLeadEventModal lead={event.lead} kind={event.kind} toast={toast} onClose={() => setEvent(null)} onDone={() => { void leads.reload(); changed(); }} />}
    {delLead && (
      <Modal title={t('agencyFunnel.admin.deleteLeadTitle', { name: delLead.client_name })} onClose={() => setDelLead(null)}>
        <p className="text-sm text-primary/70">{t('agencyFunnel.admin.deleteLeadBody')}</p>
        <div className="flex gap-2 mt-5">
          <button type="button" onClick={() => void removeLead()} className="flex-1 bg-red-600 text-white py-2 rounded-lg">{t('agencyFunnel.admin.delete')}</button>
          <button type="button" onClick={() => setDelLead(null)} className="flex-1 bg-white border border-primary/30 text-primary py-2 rounded-lg">{t('fix.apm.cancel')}</button>
        </div>
      </Modal>
    )}
    {openLead && (
      <LeadDrawer
        lead={openLead}
        agencyId={openLead.agency_id}
        projectName={projectName(openLead.property_id)}
        team={{ agencyName: names[openLead.agency_id] ?? t('admin.agencyLeads.col.agency') }}
        onClose={() => setOpenLead(null)}
      />
    )}
    </>
  );
};

export default AgencyApplications;
