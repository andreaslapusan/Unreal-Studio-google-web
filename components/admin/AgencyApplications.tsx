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

const AgencyApplications: React.FC = () => {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [applications, setApplications] = useState<any[]>([]);
  const [partners, setPartners] = useState<any[]>([]);
  const [properties, setProperties] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    const [app, lp, props] = await Promise.all([
      supabase.from('listing_partner_applications').select('id, agency_name, manager_name, email, whatsapp, country, projects_interested, monthly_volume, notes, status, created_at').order('created_at', { ascending: false }),
      supabase.from('listing_partners').select('id, agency_name, email, status, projects_assigned, user_id').order('agency_name'),
      supabase.from('properties').select('id, slug, name, area, pct_progress, delivery_date, hero_image_url, walkthrough_url, brand_pdf_url').order('name'),
    ]);
    setApplications(app.data ?? []);
    setPartners(lp.data ?? []);
    setProperties(props.data ?? []);
    setLoading(false);
  }, []);
  useEffect(() => { void reload(); }, [reload]);

  const who = user?.email ?? user?.id ?? 'admin';

  const handleApprove = async (app: any) => {
    if (!confirm(`¿Aprobar a ${app.agency_name}? Crea la agencia y se le manda acceso por email.`)) return;
    try {
      const { error: insErr } = await supabase.from('listing_partners').insert({
        agency_name: app.agency_name, manager_name: app.manager_name, email: app.email,
        phone: app.whatsapp, whatsapp: app.whatsapp, country: app.country,
        status: 'active', approved_at: new Date().toISOString(), approved_by: who,
      });
      if (insErr) throw insErr;
      await supabase.from('listing_partner_applications').update({ status: 'approved', reviewed_by: who, reviewed_at: new Date().toISOString() }).eq('id', app.id);
      await supabase.functions.invoke('send-magic-link', { body: { email: app.email, portal: 'agencias', lang: (typeof localStorage !== 'undefined' && localStorage.getItem('_unreal_lang')) || 'es', redirectTo: `${window.location.origin}/auth/finish` } });
      await reload();
      alert('Agencia aprobada + acceso enviado por email.');
    } catch (err) {
      alert('Error: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  const handleReject = async (app: any) => {
    if (!confirm(`¿Rechazar ${app.agency_name}?`)) return;
    await supabase.from('listing_partner_applications').update({ status: 'rejected', reviewed_by: who, reviewed_at: new Date().toISOString() }).eq('id', app.id);
    await reload();
  };

  const handleAssign = async (partner: any) => {
    const current: string[] = partner.projects_assigned ?? [];
    const list = properties.map((p) => `${current.includes(p.id) ? '[x]' : '[ ]'} ${p.name} (${p.id.slice(0, 8)})`).join('\n');
    const input = prompt(`Proyectos asignados a ${partner.agency_name}.\nActual:\n${list}\n\nPega los IDs (uno por línea, completos):`, current.join('\n'));
    if (input === null) return;
    const newIds = input.split('\n').map((s) => s.trim()).filter(Boolean);
    await supabase.from('listing_partners').update({ projects_assigned: newIds }).eq('id', partner.id);
    await reload();
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
        <PartnersTab data={partners} properties={properties} onAssign={handleAssign} onChange={reload} />
      </section>
    </div>
  );
};

export default AgencyApplications;
