/** Ficha lateral de un cliente registrado: datos, protección, seguimiento (notas) y accesos rápidos. */
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { useEscapeKey } from '../../lib/useEscapeKey';
import { AgencyLead, fmtDate, fmtDateTime } from './useAgencyData';
import { btnGhost, btnPrimary, input, StatusPill } from './ui';

interface Note { id: string; created_at: string; author: 'agency' | 'unreal'; body: string }

// `team`: vista del admin (Equipo Unreal) — sus notas van como author='unreal' y las de la agencia se firman con su nombre.
interface Props { lead: AgencyLead; agencyId: string; projectName: string; onClose: () => void; onRequestCall?: () => void; team?: { agencyName: string } }

export default function LeadDrawer({ lead, agencyId, projectName, onClose, onRequestCall, team }: Props) {
  const { t } = useTranslation();
  const [notes, setNotes] = useState<Note[]>([]);
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  useEscapeKey(onClose, true);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('agency_lead_notes').select('id, created_at, author, body').eq('lead_id', lead.id).order('created_at');
    if (error) setErr(error.message); else setNotes((data ?? []) as Note[]);
  }, [lead.id]);
  useEffect(() => { void load(); }, [load]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return;
    setSaving(true); setErr('');
    const { error } = await supabase.from('agency_lead_notes').insert({ lead_id: lead.id, agency_id: agencyId, author: team ? 'unreal' : 'agency', body: body.trim() });
    setSaving(false);
    if (error) { setErr(error.message); return; }
    setBody('');
    await load();
  };

  // Solo admin (RLS aln_admin_delete) y solo notas del Equipo Unreal; no hay edición (sin política UPDATE).
  const del = async (id: string) => {
    if (!confirm(t('admin.agencyLeads.confirmDeleteNote'))) return;
    setErr('');
    const { error } = await supabase.from('agency_lead_notes').delete().eq('id', id);
    if (error) setErr(error.message);
    await load();
  };

  const protectedUntil = new Date(lead.created_at);
  protectedUntil.setFullYear(protectedUntil.getFullYear() + 1); // protección 12 meses desde el registro
  const details: [string, string | null][] = [
    [t('agencyPortal.profile.email'), lead.client_email],
    [t('agencyPortal.profile.phone'), lead.client_phone],
    [t('agencyPortal.profile.country'), lead.country],
    [t('agencyPortal.lead.project'), projectName],
    [t('agencyPortal.lead.budget'), lead.budget],
  ];

  return (
    <div className="fixed inset-0 z-[200] bg-black/50 backdrop-blur-sm flex justify-end" onClick={onClose}>
      <aside className="bg-gray-50 w-full md:max-w-md h-full overflow-y-auto shadow-2xl relative" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={lead.client_name}>
        <div className="sticky top-0 bg-white border-b border-gray-200 px-5 py-4 flex items-start gap-3 z-10">
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-serif text-primary truncate">{lead.client_name}</h2>
            <div className="flex items-center gap-2 mt-1.5">
              <StatusPill status={lead.status} label={t(`agenciasDashboard.leads.status.${lead.status}`)} />
              <span className="text-xs text-primary/50">{t('agencyPortal.lead.protected', { date: fmtDate(protectedUntil.toISOString()) })}</span>
            </div>
          </div>
          <button onClick={onClose} aria-label={t('agenciasDashboard.leads.close')} className="w-9 h-9 rounded-full bg-gray-100 text-primary flex items-center justify-center shrink-0 hover:bg-gray-200">
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <div className="p-5 space-y-5">
          <section className="bg-white rounded-2xl p-5 shadow-sm border border-primary/5">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-primary/40 mb-3">{t('agencyPortal.lead.details')}</h3>
            <dl className="space-y-2">
              {details.map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 text-sm">
                  <dt className="text-primary/50 shrink-0">{k}</dt>
                  <dd className="text-primary font-medium text-right break-all">{v || '—'}</dd>
                </div>
              ))}
            </dl>
            {lead.notes && <p className="text-sm text-primary/70 mt-3 pt-3 border-t border-gray-100 whitespace-pre-wrap">{lead.notes}</p>}
            {onRequestCall && (
              <div className="flex flex-wrap gap-2 mt-4">
                <button onClick={onRequestCall} className={btnGhost}><span className="material-symbols-outlined text-base">call</span>{t('agencyPortal.lead.requestCall')}</button>
              </div>
            )}
          </section>

          <section className="bg-white rounded-2xl p-5 shadow-sm border border-primary/5">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-primary/40 mb-4">{t('agencyPortal.lead.timeline')}</h3>
            <ol className="relative border-l-2 border-gray-100 ml-2 space-y-5">
              <li className="pl-5 relative">
                <span className="absolute -left-[7px] top-1 w-3 h-3 rounded-full bg-blue-500" />
                <p className="text-sm font-bold text-primary">{team ? t('admin.agencyLeads.registeredBy', { agency: team.agencyName }) : t('agencyPortal.lead.registered')}</p>
                <p className="text-xs text-primary/40">{fmtDate(lead.created_at)}</p>
              </li>
              {notes.map((n) => (
                <li key={n.id} className="pl-5 relative">
                  <span className={`absolute -left-[7px] top-1 w-3 h-3 rounded-full ${n.author === 'unreal' ? 'bg-primary' : 'bg-amber-500'}`} />
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-black uppercase tracking-widest text-primary/40">{n.author === 'unreal' ? t('agencyPortal.lead.unreal') : team ? team.agencyName : t('agencyPortal.lead.you')} · {fmtDateTime(n.created_at)}</p>
                    {team && n.author === 'unreal' && (
                      <button type="button" onClick={() => void del(n.id)} aria-label={t('admin.common.delete')} title={t('admin.common.delete')} className="shrink-0 -mt-1 p-2 text-red-600 bg-red-50 rounded-lg hover:bg-red-600 hover:text-white transition">
                        <span className="material-symbols-outlined text-sm">delete</span>
                      </button>
                    )}
                  </div>
                  <p className="text-sm text-primary/80 mt-0.5 whitespace-pre-wrap break-words">{n.body}</p>
                </li>
              ))}
            </ol>

            <form onSubmit={add} className="mt-5 space-y-2">
              <textarea className={input} rows={3} maxLength={2000} placeholder={t(team ? 'admin.agencyLeads.notePh' : 'agencyPortal.lead.notePh')} value={body} onChange={(e) => setBody(e.target.value)} aria-label={t('agencyPortal.lead.addNote')} />
              {err && <p className="text-xs text-red-600">{err}</p>}
              <button type="submit" disabled={saving || !body.trim()} className={`${btnPrimary} w-full`}>
                <span className="material-symbols-outlined text-base">add</span>{t('agencyPortal.lead.save')}
              </button>
            </form>
          </section>
        </div>
      </aside>
    </div>
  );
}
