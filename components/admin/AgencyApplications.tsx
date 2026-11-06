/**
 * AgencyApplications — gestión de agencias en el admin principal (vista 'agencias').
 * Reubicado del antiguo Portal Manager: solicitudes de agencias (aprobar/rechazar
 * → crea listing_partner + magic link) y agencias activas (asignar proyectos).
 * Reutiliza ApplicationsTab/PartnersTab de AdminPortalManager.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth-context';
import { ApplicationsTab, PartnersTab } from '../../pages/AdminPortalManager';
import { uiLocale } from '../../lib/dateLocale';
import LeadDrawer from '../agency/LeadDrawer';
import AgencyPartnerEditor from './AgencyPartnerEditor';

const AgencyApplications: React.FC = () => {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [applications, setApplications] = useState<any[]>([]);
  const [partners, setPartners] = useState<any[]>([]);
  const [properties, setProperties] = useState<any[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [openLead, setOpenLead] = useState<any | null>(null);
  const [editing, setEditing] = useState<any | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    const [app, lp, props, al, ar] = await Promise.all([
      supabase.from('listing_partner_applications').select('id, agency_name, manager_name, email, whatsapp, country, projects_interested, monthly_volume, notes, status, created_at').order('created_at', { ascending: false }),
      supabase.from('listing_partners').select('id, agency_name, manager_name, email, phone, whatsapp, website, country, status, projects_assigned, user_id, logo_url, personal_link_slug, approved_at').order('agency_name'),
      supabase.from('properties').select('id, slug, name, area, pct_progress, delivery_date, hero_image_url, walkthrough_url, brand_pdf_url').order('name'),
      supabase.from('agency_leads').select('id, agency_id, created_at, client_name, client_email, client_phone, country, property_id, budget, notes, status').order('created_at', { ascending: false }),
      supabase.from('agency_requests').select('id, agency_id, created_at, type, lead_id, preferred_date, notes, status').order('created_at', { ascending: false }),
    ]);
    setRequests(ar.data ?? []);
    setLeads(al.data ?? []);
    setApplications(app.data ?? []);
    setPartners(lp.data ?? []);
    setProperties(props.data ?? []);
    setLoading(false);
  }, []);
  useEffect(() => { void reload(); }, [reload]);

  const who = user?.email ?? user?.id ?? 'admin';

  const handleApprove = async (app: any) => {
    if (!confirm(t('admin.agencyApps.confirmApprove', { name: app.agency_name, defaultValue: '¿Aprobar a {{name}}? Crea la agencia y se le manda acceso por email.' }))) return;
    try {
      const { error: insErr } = await supabase.from('listing_partners').insert({
        agency_name: app.agency_name, manager_name: app.manager_name, email: app.email,
        phone: app.whatsapp, whatsapp: app.whatsapp, country: app.country,
        status: 'approved', approved_at: new Date().toISOString(), approved_by: who,
      });
      if (insErr) throw insErr;
      await supabase.from('listing_partner_applications').update({ status: 'approved', reviewed_by: who, reviewed_at: new Date().toISOString() }).eq('id', app.id);
      await supabase.functions.invoke('send-magic-link', { body: { email: app.email, portal: 'agencias', lang: (typeof localStorage !== 'undefined' && localStorage.getItem('_unreal_lang')) || 'es', redirectTo: `${window.location.origin}/auth/finish` } });
      await reload();
      alert(t('admin.agencyApps.approveOk', { defaultValue: 'Agencia aprobada + acceso enviado por email.' }));
    } catch (err) {
      alert(t('admin.agencyApps.actionError', { msg: (err instanceof Error ? err.message : String(err)), defaultValue: 'Error: {{msg}}' }));
    }
  };

  const handleReject = async (app: any) => {
    if (!confirm(t('admin.agencyApps.confirmReject', { name: app.agency_name, defaultValue: '¿Rechazar {{name}}?' }))) return;
    try {
      const { error } = await supabase.from('listing_partner_applications').update({ status: 'rejected', reviewed_by: who, reviewed_at: new Date().toISOString() }).eq('id', app.id);
      if (error) throw error;
      await reload();
    } catch (err) {
      alert(t('admin.agencyApps.actionError', { msg: (err instanceof Error ? err.message : String(err)), defaultValue: 'Error: {{msg}}' }));
    }
  };

  const handleAssign = async (partner: any) => { setEditing(partner); };

  // Reservas y ventas no las genera ninguna visita: las registra el equipo desde el lead.
  const addEvent = async (l: any, event_type: 'reservation' | 'sale') => {
    if (!confirm(t('admin.agencyLeads.confirmEvent', { type: t(`admin.agencyLeads.ev.${event_type}`), name: l.client_name }))) return;
    const { error } = await supabase.from('lead_attributions').insert({
      utm_source: 'lister', partner_id: l.agency_id, event_type,
      property_slug: properties.find((p) => p.id === l.property_id)?.slug ?? null,
      contact_email: l.client_email, contact_name: l.client_name, contact_phone: l.client_phone,
    });
    alert(error ? t('admin.agencyApps.actionError', { msg: error.message, defaultValue: 'Error: {{msg}}' }) : t('admin.agencyLeads.eventOk'));
  };

  const setLeadStatus = async (id: string, status: string) => {
    const { error } = await supabase.from('agency_leads').update({ status }).eq('id', id);
    if (error) { alert(t('admin.agencyApps.actionError', { msg: error.message, defaultValue: 'Error: {{msg}}' })); return; }
    setLeads((ls) => ls.map((l) => (l.id === id ? { ...l, status } : l)));
  };

  const setRequestStatus = async (id: string, status: string) => {
    const { error } = await supabase.from('agency_requests').update({ status }).eq('id', id);
    if (error) { alert(t('admin.agencyApps.actionError', { msg: error.message, defaultValue: 'Error: {{msg}}' })); return; }
    setRequests((rs) => rs.map((r) => (r.id === id ? { ...r, status } : r)));
  };

  if (loading) return <div className="py-12 text-center text-primary/40"><span className="material-symbols-outlined animate-spin text-3xl">refresh</span></div>;

  const pendingCount = applications.filter((a) => a.status === 'pending').length;

  return (
    <div className="animate-in fade-in duration-500 space-y-10">
      <h2 className="text-2xl font-serif text-primary">{t('admin.agencyApps.title', { defaultValue: 'Agencias' })}{pendingCount > 0 ? ` · ${t('admin.agencyApps.pendingCount', { defaultValue: '{{n}} solicitud(es) pendiente(s)', n: pendingCount })}` : ''}</h2>
      <section>
        <h3 className="text-sm font-black uppercase tracking-widest text-primary/40 mb-4">{t('admin.agencyApps.applications', { defaultValue: 'Solicitudes' })}</h3>
        <ApplicationsTab data={applications} onApprove={handleApprove} onReject={handleReject} />
      </section>
      <section>
        <h3 className="text-sm font-black uppercase tracking-widest text-primary/40 mb-4">{t('admin.agencyApps.activePartners', { defaultValue: 'Agencias activas' })}</h3>
        <PartnersTab data={partners} properties={properties} onAssign={handleAssign} onChange={reload} actionLabel={t('admin.agencyEdit.button')} />
      </section>
      <section>
        <h3 className="text-sm font-black uppercase tracking-widest text-primary/40 mb-4">{t('admin.agencyLeads.title')}</h3>
        {leads.length === 0 ? <p className="text-sm text-primary/50">{t('admin.agencyLeads.empty')}</p> : (
          <div className="overflow-x-auto bg-white/60 rounded-xl">
            <table className="w-full text-sm">
              <thead className="text-left text-[10px] uppercase tracking-widest text-primary/40">
                <tr>{['date', 'agency', 'client', 'contact', 'project', 'budget', 'notes', 'status'].map((c) => <th key={c} className="p-3">{t(`admin.agencyLeads.col.${c}`)}</th>)}</tr>
              </thead>
              <tbody>
                {leads.map((l) => (
                  <tr key={l.id} className="border-t border-primary/10 align-top">
                    <td className="p-3 whitespace-nowrap text-xs">{new Date(l.created_at).toLocaleString(uiLocale(), { dateStyle: 'short', timeStyle: 'short' })}</td>
                    <td className="p-3">{partners.find((p) => p.id === l.agency_id)?.agency_name ?? '—'}</td>
                    <td className="p-3 font-medium">
                      <button type="button" onClick={() => setOpenLead(l)} className="text-left underline decoration-primary/30 underline-offset-2 hover:decoration-primary" title={t('admin.agencyLeads.open')}>{l.client_name}</button>
                      {l.country ? <span className="block text-xs text-primary/50">{l.country}</span> : null}
                    </td>
                    <td className="p-3 text-xs">{[l.client_email, l.client_phone].filter(Boolean).join(' · ') || '—'}</td>
                    <td className="p-3 text-xs">{properties.find((p) => p.id === l.property_id)?.name ?? '—'}</td>
                    <td className="p-3 text-xs">{l.budget ?? '—'}</td>
                    <td className="p-3 text-xs max-w-[220px] whitespace-pre-wrap">{l.notes ?? '—'}</td>
                    <td className="p-3">
                      <select value={l.status} onChange={(e) => void setLeadStatus(l.id, e.target.value)} className="border border-primary/15 rounded-lg px-2 py-1 text-xs bg-white">
                        {['new', 'contacted', 'won', 'lost'].map((s) => <option key={s} value={s}>{t(`agenciasDashboard.leads.status.${s}`)}</option>)}
                      </select>
                      <div className="flex gap-1 mt-1">
                        {(['reservation', 'sale'] as const).map((ev) => (
                          <button key={ev} type="button" onClick={() => void addEvent(l, ev)} className="text-[10px] border border-primary/15 rounded-full px-2 py-0.5 hover:bg-primary hover:text-white transition whitespace-nowrap">+ {t(`admin.agencyLeads.ev.${ev}`)}</button>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {editing && <AgencyPartnerEditor partner={editing} properties={properties} onClose={() => setEditing(null)} onSaved={reload} />}
      {openLead && (
        <LeadDrawer
          lead={openLead}
          agencyId={openLead.agency_id}
          projectName={properties.find((p) => p.id === openLead.property_id)?.name ?? '—'}
          team={{ agencyName: partners.find((p) => p.id === openLead.agency_id)?.agency_name ?? t('admin.agencyLeads.col.agency') }}
          onClose={() => setOpenLead(null)}
        />
      )}
      <section>
        <h3 className="text-sm font-black uppercase tracking-widest text-primary/40 mb-4">{t('admin.agencyRequests.title')}</h3>
        {requests.length === 0 ? <p className="text-sm text-primary/50">{t('admin.agencyRequests.empty')}</p> : (
          <div className="overflow-x-auto bg-white/60 rounded-xl">
            <table className="w-full text-sm">
              <thead className="text-left text-[10px] uppercase tracking-widest text-primary/40">
                <tr>{['date', 'agency', 'type', 'client', 'preferred', 'notes', 'status'].map((c) => <th key={c} className="p-3">{t(`admin.agencyRequests.col.${c}`)}</th>)}</tr>
              </thead>
              <tbody>
                {requests.map((r) => (
                  <tr key={r.id} className="border-t border-primary/10 align-top">
                    <td className="p-3 whitespace-nowrap text-xs">{new Date(r.created_at).toLocaleString(uiLocale(), { dateStyle: 'short', timeStyle: 'short' })}</td>
                    <td className="p-3">{partners.find((p) => p.id === r.agency_id)?.agency_name ?? '—'}</td>
                    <td className="p-3 font-medium whitespace-nowrap">{t(`agencyPortal.requests.t.${r.type}`)}</td>
                    <td className="p-3 text-xs">{leads.find((l) => l.id === r.lead_id)?.client_name ?? '—'}</td>
                    <td className="p-3 text-xs whitespace-nowrap">{r.preferred_date ? new Date(r.preferred_date).toLocaleDateString(uiLocale()) : '—'}</td>
                    <td className="p-3 text-xs max-w-[260px] whitespace-pre-wrap">{r.notes ?? '—'}</td>
                    <td className="p-3">
                      <select value={r.status} onChange={(e) => void setRequestStatus(r.id, e.target.value)} className="border border-primary/15 rounded-lg px-2 py-1 text-xs bg-white">
                        {['pending', 'scheduled', 'done', 'cancelled'].map((s) => <option key={s} value={s}>{t(`agencyPortal.requests.st.${s}`)}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};

export default AgencyApplications;
