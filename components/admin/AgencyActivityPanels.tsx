/**
 * Dentro de la ficha de agencia (admin): "Leads" (clientes registrados por ESA agencia: estado, + reserva/venta,
 * borrar, ficha con notas) y "Solicitudes" (llamadas/visitas/acuerdos/acuerdos de proyecto y sus ficheros), en el
 * mismo modal que el resto de la ficha. Sustituyen a las tablas globales que había debajo de la lista de agencias.
 */
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { uiLocale } from '../../lib/dateLocale';
import LeadDrawer from '../agency/LeadDrawer';
import { shortProjectName } from '../agency/useAgencyData';
import AgencyLeadEventModal from './AgencyLeadEventModal';
import { SheetModal, Toast, pillBtn, useErrText } from './agencyAdminUi';

const LEAD_COLS = 'id, agency_id, created_at, client_name, client_email, client_phone, country, property_id, budget, notes, status, properties(name)';
const REQ_COLS = 'id, agency_id, created_at, type, lead_id, unit_id, preferred_date, notes, status, project_id, client_name, template_path, client_signed_path, agency_leads(client_name), property_units(unit_name), projects(name)';
const sel = 'border border-primary/15 rounded-lg px-2 py-1 text-xs bg-white';
const when = (iso: string) => new Date(iso).toLocaleString(uiLocale(), { dateStyle: 'short', timeStyle: 'short' });

/** "seen" marker per admin browser (unseen badge on the card buttons). */
export const seenKey = (kind: 'leads' | 'reqs', id: string) => `_ag_seen_${kind}_${id}`;
export const readSeen = (kind: 'leads' | 'reqs', id: string): number => {
  try { const v = localStorage.getItem(seenKey(kind, id)); return v ? Number(v) : Date.now() - 3 * 86400e3; } catch { return Date.now() - 3 * 86400e3; }
};
const markSeen = (kind: 'leads' | 'reqs', id: string) => { try { localStorage.setItem(seenKey(kind, id), String(Date.now())); } catch { /* private mode */ } };

interface Props { partner: Record<string, any>; toast: Toast; onClose: () => void; onChanged: () => void }

export function AgencyLeadsPanel({ partner, toast, onClose, onChanged }: Props) {
  const { t } = useTranslation();
  const errText = useErrText();
  const [rows, setRows] = useState<any[] | null>(null);
  const [open, setOpen] = useState<any | null>(null);
  const [event, setEvent] = useState<{ lead: any; kind: 'reservation' | 'sale' } | null>(null);
  const [del, setDel] = useState<any | null>(null);
  const load = async () => {
    const { data, error } = await supabase.from('agency_leads').select(LEAD_COLS).eq('agency_id', partner.id).order('created_at', { ascending: false });
    if (error) toast(errText(error), false);
    setRows(data ?? []);
  };
  useEffect(() => { void load(); markSeen('leads', partner.id); onChanged(); }, [partner.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const setStatus = async (id: string, status: string) => {
    const { error } = await supabase.from('agency_leads').update({ status }).eq('id', id);
    if (error) { toast(errText(error), false); return; }
    setRows((r) => (r ?? []).map((l) => (l.id === id ? { ...l, status } : l)));
  };
  const remove = async () => {
    const { error } = await supabase.from('agency_leads').delete().eq('id', del.id);
    if (error) { toast(errText(error), false); return; }
    toast(t('agencyFunnel.admin.leadDeleted'));
    setDel(null); await load(); onChanged();
  };

  return (
    <>
      <SheetModal title={t('admin.agencyCard.leadsTitle', { name: partner.agency_name })} onClose={onClose}>
        {rows === null ? <p className="text-sm text-primary/50">…</p> : rows.length === 0 ? <p className="text-sm text-primary/50">{t('admin.agencyLeads.empty')}</p> : (
          <ul className="space-y-3" data-agency-leads>
            {rows.map((l) => (
              <li key={l.id} className="bg-gray-50 rounded-2xl p-4 border border-gray-100 min-w-0">
                <div className="flex items-start justify-between gap-3">
                  <button type="button" onClick={() => setOpen(l)} className="text-left font-bold text-primary underline decoration-primary/30 underline-offset-2 min-w-0 break-words">{l.client_name}</button>
                  <span className="text-[11px] text-primary/40 whitespace-nowrap">{when(l.created_at)}</span>
                </div>
                <p className="text-xs text-primary/60 mt-1 break-words">{[shortProjectName(l.properties?.name ?? ''), l.country, l.budget].filter(Boolean).join(' · ') || '—'}</p>
                {(l.client_email || l.client_phone) && <p className="text-xs text-primary/40 mt-0.5 break-all">{[l.client_email, l.client_phone].filter(Boolean).join(' · ')}</p>}
                {l.notes && <p className="text-xs text-primary/50 mt-1 whitespace-pre-wrap break-words">{l.notes}</p>}
                <div className="flex flex-wrap items-center gap-1.5 mt-3">
                  <select value={l.status} onChange={(e) => void setStatus(l.id, e.target.value)} aria-label={t('agencyFunnel.admin.statusLabel')} className={sel}>
                    {['new', 'contacted', 'won', 'lost'].map((s) => <option key={s} value={s}>{t(`agenciasDashboard.leads.status.${s}`)}</option>)}
                  </select>
                  {(['reservation', 'sale'] as const).map((kind) => <button key={kind} type="button" onClick={() => setEvent({ lead: l, kind })} className={pillBtn}>+ {t(`admin.agencyLeads.ev.${kind}`)}</button>)}
                  <button type="button" onClick={() => setDel(l)} aria-label={t('agencyFunnel.admin.delete')} className={`${pillBtn} !border-red-200 text-red-700`}><span className="material-symbols-outlined text-sm align-middle">delete</span></button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SheetModal>
      {event && <AgencyLeadEventModal lead={event.lead} kind={event.kind} toast={toast} onClose={() => setEvent(null)} onDone={() => { void load(); onChanged(); }} />}
      {del && (
        <SheetModal title={t('agencyFunnel.admin.deleteLeadTitle', { name: del.client_name })} subtitle={t('agencyFunnel.admin.deleteLeadBody')} onClose={() => setDel(null)}>
          <div className="flex gap-4">
            <button type="button" onClick={() => void remove()} className="flex-1 bg-red-600 text-white py-4 rounded-xl font-bold uppercase tracking-widest text-xs">{t('agencyFunnel.admin.delete')}</button>
            <button type="button" onClick={() => setDel(null)} className="flex-1 bg-gray-100 text-primary py-4 rounded-xl font-bold uppercase tracking-widest text-xs">{t('fix.apm.cancel')}</button>
          </div>
        </SheetModal>
      )}
      {open && <LeadDrawer lead={open} agencyId={partner.id} projectName={shortProjectName(open.properties?.name ?? '') || '—'} team={{ agencyName: partner.agency_name }} onClose={() => setOpen(null)} />}
    </>
  );
}

export function AgencyRequestsPanel({ partner, toast, onClose, onChanged }: Props) {
  const { t } = useTranslation();
  const errText = useErrText();
  const [rows, setRows] = useState<any[] | null>(null);
  const load = async () => {
    const { data, error } = await supabase.from('agency_requests').select(REQ_COLS).eq('agency_id', partner.id).order('created_at', { ascending: false });
    if (error) toast(errText(error), false);
    setRows(data ?? []);
  };
  useEffect(() => { void load(); markSeen('reqs', partner.id); onChanged(); }, [partner.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const setStatus = async (id: string, status: string) => {
    const { error } = await supabase.from('agency_requests').update({ status }).eq('id', id);
    if (error) { toast(errText(error), false); return; }
    setRows((r) => (r ?? []).map((x) => (x.id === id ? { ...x, status } : x)));
  };
  const view = async (path: string) => {
    const w = window.open('', '_blank');
    const { data, error } = await supabase.storage.from('agency-contracts').createSignedUrl(path, 600);
    if (error || !data?.signedUrl) { w?.close(); toast(errText(error), false); return; }
    if (w) w.location.href = data.signedUrl; else window.location.href = data.signedUrl;
  };

  return (
    <SheetModal title={t('admin.agencyCard.reqsTitle', { name: partner.agency_name })} onClose={onClose}>
      {rows === null ? <p className="text-sm text-primary/50">…</p> : rows.length === 0 ? <p className="text-sm text-primary/50">{t('admin.agencyRequests.empty')}</p> : (
        <ul className="space-y-2" data-agency-reqs>
          {rows.map((r) => (
            <li key={r.id} className="flex items-start gap-3 rounded-2xl border border-gray-100 bg-white p-4">
              <span className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-amber-700 bg-amber-50"><span className="material-symbols-outlined text-[20px]">{r.type === 'project_contract' || r.type === 'contract' ? 'gavel' : r.type === 'visit' ? 'flight' : r.type === 'reserve' ? 'bookmark' : 'call'}</span></span>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-primary text-sm break-words">{t(`agencyPortal.requests.t.${r.type}`)}{r.projects?.name ? ` · ${r.projects.name}` : ''}{r.property_units?.unit_name ? ` · ${r.property_units.unit_name}` : ''}</p>
                <p className="text-xs text-primary/60 mt-0.5 break-words">{[r.client_name || r.agency_leads?.client_name, r.preferred_date ? new Date(r.preferred_date).toLocaleDateString(uiLocale()) : null].filter(Boolean).join(' · ')}</p>
                {r.notes && <p className="text-xs text-primary/50 mt-1 whitespace-pre-wrap break-words">{r.notes}</p>}
                {(r.template_path || r.client_signed_path) && (
                  <p className="text-[11px] mt-1 flex flex-wrap gap-x-3">
                    {r.template_path && <button type="button" onClick={() => void view(r.template_path)} className="font-bold text-primary underline underline-offset-2">{t('admin.agencyCard.reqTemplate')}</button>}
                    {r.client_signed_path && <button type="button" onClick={() => void view(r.client_signed_path)} className="font-bold text-green-700 underline underline-offset-2">{t('admin.agencyCard.reqClientCopy')}</button>}
                  </p>
                )}
                <p className="text-[11px] text-primary/40 mt-1">{when(r.created_at)}</p>
              </div>
              <select value={r.status} onChange={(e) => void setStatus(r.id, e.target.value)} aria-label={t('agencyFunnel.admin.statusLabel')} className={`${sel} shrink-0`}>
                {['pending', 'scheduled', 'done', 'cancelled'].map((s) => <option key={s} value={s}>{t(`agencyPortal.requests.st.${s}`)}</option>)}
              </select>
            </li>
          ))}
        </ul>
      )}
    </SheetModal>
  );
}
