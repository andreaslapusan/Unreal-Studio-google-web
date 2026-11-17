/**
 * Agencias (admin) — misma lista que Clientes: búsqueda + estado y una ficha por agencia (AgencyPartnerCard) con contraseña, accesos, plantillas,
 * editar, borrar y proyectos asignados activos/inactivos. Las borradas no salen.
 */
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { ListFilters, Pager, Toast, ilikeTerm, usePaged, useErrText } from './agencyAdminUi';
import AgencyPartnerEditor from './AgencyPartnerEditor';
import { readSeen } from './AgencyActivityPanels';
import AgencyPartnerCard, { CardAccount, CardPassword, CardProject } from './AgencyPartnerCard';

const COLS = 'id, agency_name, manager_name, email, phone, whatsapp, website, country, status, user_id, logo_url, personal_link_slug, approved_at, market, lang, commission_close_pct, commission_referral_pct, is_demo, welcomed_at, deleted_at, notes, signed_contract_path, signed_contract_uploaded_at, agency_signed_path, agency_signed_uploaded_at';

interface Cards { reqs: Record<string, any[]>; projects: CardProject[]; access: Record<string, Record<string, boolean>>; passwords: Record<string, CardPassword>; accounts: Record<string, CardAccount> }

export default function AgencyPartnersList({ toast, refreshKey }: { toast: Toast; refreshKey: number }) {
  const { t } = useTranslation();
  const errText = useErrText();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [editing, setEditing] = useState<any | null>(null);
  const [stats, setStats] = useState<Record<string, any>>({});
  const [cards, setCards] = useState<Cards>({ reqs: {}, projects: [], access: {}, passwords: {}, accounts: {} });
  const list = usePaged<any>(() => {
    let b = supabase.from('listing_partners').select(COLS, { count: 'exact' }).is('deleted_at', null).neq('status', 'deleted').order('approved_at', { ascending: false, nullsFirst: false });
    if (status !== 'all') b = b.eq('status', status);
    if (q.trim()) b = b.or(`agency_name.ilike.${ilikeTerm(q)},email.ilike.${ilikeTerm(q)},country.ilike.${ilikeTerm(q)},personal_link_slug.ilike.${ilikeTerm(q.replace(/^\s*ref:\s*/i, ''))}`);
    return b;
  }, [q, status, refreshKey]);

  const loadCards = async () => {
    const [{ data, error }, rq] = await Promise.all([
      supabase.rpc('admin_agency_cards'),
      supabase.from('agency_requests').select('id, agency_id, created_at, status, project_id, client_name, template_path, template_uploaded_at, client_signed_path, client_signed_uploaded_at, projects(name)').eq('type', 'project_contract').order('created_at', { ascending: false }),
    ]);
    if (error) { toast(errText(error), false); return; }
    const d = (data as any) ?? {};
    const access: Cards['access'] = {};
    for (const a of d.access ?? []) access[a.partner_id] = { ...(access[a.partner_id] ?? {}), [a.project_id]: a.is_active };
    const byId = (rows: any[]) => Object.fromEntries((rows ?? []).map((r) => [r.partner_id, r]));
    const reqs: Cards['reqs'] = {};
    for (const r of rq.data ?? []) (reqs[(r as any).agency_id] ??= []).push(r);
    setCards({ reqs, projects: d.projects ?? [], access, passwords: byId(d.passwords), accounts: byId(d.accounts) });
  };
  useEffect(() => {
    void supabase.rpc('admin_partner_overview').then(({ data }) => setStats(Object.fromEntries((data ?? []).map((r: any) => [r.partner_id, r]))));
    void loadCards();
  }, [refreshKey, list.rows]);
  const reloadAll = async () => { await list.reload(); await loadCards(); };

  // contador de "nuevos" en los botones Leads / Solicitudes de cada ficha (desde la última vez que se abrieron)
  const [unseen, setUnseen] = useState<Record<string, { leads: number; reqs: number }>>({});
  const recount = async () => {
    const ids = list.rows.map((p) => p.id);
    if (!ids.length) { setUnseen({}); return; }
    const since = new Date(Date.now() - 90 * 86400e3).toISOString();
    const [l, r] = await Promise.all([
      supabase.from('agency_leads').select('agency_id, created_at').in('agency_id', ids).gte('created_at', since),
      supabase.from('agency_requests').select('agency_id, created_at, client_signed_uploaded_at').in('agency_id', ids).gte('created_at', since),
    ]);
    const out: Record<string, { leads: number; reqs: number }> = {};
    for (const id of ids) out[id] = { leads: 0, reqs: 0 };
    const sl = Object.fromEntries(ids.map((id) => [id, readSeen('leads', id)]));
    const sr = Object.fromEntries(ids.map((id) => [id, readSeen('reqs', id)]));
    for (const x of l.data ?? []) if (Date.parse(x.created_at) > sl[x.agency_id]) out[x.agency_id].leads += 1;
    for (const x of r.data ?? []) if (Math.max(Date.parse(x.created_at), x.client_signed_uploaded_at ? Date.parse(x.client_signed_uploaded_at) : 0) > sr[x.agency_id]) out[x.agency_id].reqs += 1;
    setUnseen(out);
  };
  useEffect(() => { void recount(); }, [list.rows]); // eslint-disable-line react-hooks/exhaustive-deps

  const statuses = ['all', 'approved', 'suspended', 'pending', 'rejected'].map((s) => ({ value: s, label: s === 'all' ? t('agencyFunnel.admin.allStatuses') : t(`admin.partnerStatus.${s}`) }));

  return (
    <div>
      <ListFilters q={q} setQ={setQ} status={status} setStatus={setStatus} statuses={statuses} label={t('agencyFunnel.admin.statusLabel')} />
      {list.error && <p className="text-xs text-red-600 mb-2">{errText(list.error)}</p>}
      {!list.loading && list.rows.length === 0 && <p className="text-primary/60 text-sm">{t('fix.apm.noActiveAgencies')}</p>}
      <div className="space-y-4">
        {list.rows.map((p) => (
          <AgencyPartnerCard key={p.id} partner={p} stats={stats[p.id] ?? {}} projects={cards.projects} access={cards.access[p.id] ?? {}}
            password={cards.passwords[p.id]} account={cards.accounts[p.id]} requests={cards.reqs[p.id] ?? []} unseen={unseen[p.id] ?? { leads: 0, reqs: 0 }} onSeen={recount}
            onEdit={() => setEditing(p)} onSaved={reloadAll} toast={toast} />
        ))}
      </div>
      <Pager page={list.page} count={list.count} setPage={list.setPage} />
      {editing && <AgencyPartnerEditor partner={editing} account={cards.accounts[editing.id]} toast={toast} onClose={() => setEditing(null)} onSaved={reloadAll} />}
    </div>
  );
}
