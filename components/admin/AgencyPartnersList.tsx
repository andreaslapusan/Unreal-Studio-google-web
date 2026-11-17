/**
 * Agencias (admin) — misma lista que Clientes: búsqueda + estado, "Seleccionar todos" + acciones en bloque
 * (Activa / Suspendida) y una ficha por agencia (AgencyPartnerCard) con contraseña, accesos, plantillas,
 * editar, borrar y proyectos asignados activos/inactivos. Las borradas no salen.
 */
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { ListFilters, Pager, Toast, ilikeTerm, usePaged, useErrText } from './agencyAdminUi';
import AgencyPartnerEditor from './AgencyPartnerEditor';
import AgencyPartnerCard, { CardAccount, CardPassword, CardProject } from './AgencyPartnerCard';

const COLS = 'id, agency_name, manager_name, email, phone, whatsapp, website, country, status, user_id, logo_url, personal_link_slug, approved_at, market, lang, commission_close_pct, commission_referral_pct, is_demo, welcomed_at, deleted_at, notes, signed_contract_path, signed_contract_uploaded_at, agency_signed_path, agency_signed_uploaded_at';

interface Cards { projects: CardProject[]; access: Record<string, Record<string, boolean>>; passwords: Record<string, CardPassword>; accounts: Record<string, CardAccount> }

export default function AgencyPartnersList({ toast, refreshKey }: { toast: Toast; refreshKey: number }) {
  const { t } = useTranslation();
  const errText = useErrText();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [editing, setEditing] = useState<any | null>(null);
  const [stats, setStats] = useState<Record<string, any>>({});
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [cards, setCards] = useState<Cards>({ projects: [], access: {}, passwords: {}, accounts: {} });
  const list = usePaged<any>(() => {
    let b = supabase.from('listing_partners').select(COLS, { count: 'exact' }).is('deleted_at', null).neq('status', 'deleted').order('approved_at', { ascending: false, nullsFirst: false });
    if (status !== 'all') b = b.eq('status', status);
    if (q.trim()) b = b.or(`agency_name.ilike.${ilikeTerm(q)},email.ilike.${ilikeTerm(q)},country.ilike.${ilikeTerm(q)},personal_link_slug.ilike.${ilikeTerm(q.replace(/^\s*ref:\s*/i, ''))}`);
    return b;
  }, [q, status, refreshKey]);

  const loadCards = async () => {
    const { data, error } = await supabase.rpc('admin_agency_cards');
    if (error) { toast(errText(error), false); return; }
    const d = (data as any) ?? {};
    const access: Cards['access'] = {};
    for (const a of d.access ?? []) access[a.partner_id] = { ...(access[a.partner_id] ?? {}), [a.project_id]: a.is_active };
    const byId = (rows: any[]) => Object.fromEntries((rows ?? []).map((r) => [r.partner_id, r]));
    setCards({ projects: d.projects ?? [], access, passwords: byId(d.passwords), accounts: byId(d.accounts) });
  };
  useEffect(() => {
    void supabase.rpc('admin_partner_overview').then(({ data }) => setStats(Object.fromEntries((data ?? []).map((r: any) => [r.partner_id, r]))));
    void loadCards();
  }, [refreshKey, list.rows]);
  const reloadAll = async () => { await list.reload(); await loadCards(); };

  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allSel = list.rows.length > 0 && list.rows.every((p) => sel.has(p.id));
  const bulk = async (st: 'approved' | 'suspended') => {
    setBulkBusy(true);
    let okN = 0;
    for (const id of sel) {
      const { data, error } = await supabase.rpc('admin_set_partner_status', { p_id: id, p_status: st, p_reason: null });
      if (!error && (data as any)?.status === 'ok') okN += 1;
    }
    setBulkBusy(false);
    toast(t('admin.agencyCard.bulkDone', { n: okN, total: sel.size }), okN === sel.size);
    setSel(new Set());
    await reloadAll();
  };
  const statuses = ['all', 'approved', 'suspended', 'pending', 'rejected'].map((s) => ({ value: s, label: s === 'all' ? t('agencyFunnel.admin.allStatuses') : t(`admin.partnerStatus.${s}`) }));

  return (
    <div>
      <ListFilters q={q} setQ={setQ} status={status} setStatus={setStatus} statuses={statuses} label={t('agencyFunnel.admin.statusLabel')} />
      {list.error && <p className="text-xs text-red-600 mb-2">{errText(list.error)}</p>}
      {!list.loading && list.rows.length === 0 && <p className="text-primary/60 text-sm">{t('fix.apm.noActiveAgencies')}</p>}
      {list.rows.length > 0 && (
        <div className="flex items-center gap-3 mb-3 flex-wrap">
          <label className="flex items-center gap-2 text-xs font-bold text-primary/60 cursor-pointer">
            <input type="checkbox" checked={allSel} onChange={() => setSel(allSel ? new Set() : new Set(list.rows.map((p) => p.id)))} className="rounded border-gray-300" /> {t('admin.clientsTab.selectAll')}
          </label>
          {sel.size > 0 && (
            <div className="flex items-center gap-2 flex-wrap bg-primary/5 rounded-xl px-3 py-2">
              <span className="text-xs font-black text-primary">{t('admin.clientsTab.nSelected', { n: sel.size })}</span>
              <span className="text-[10px] text-gray-400">{t('admin.clientsTab.setStatusTo')}</span>
              <button type="button" disabled={bulkBusy} onClick={() => void bulk('approved')} className="text-[10px] font-black uppercase px-2 py-1 rounded bg-green-600 text-white disabled:opacity-50">{t('admin.partnerStatus.approved')}</button>
              <button type="button" disabled={bulkBusy} onClick={() => void bulk('suspended')} className="text-[10px] font-black uppercase px-2 py-1 rounded bg-red-600 text-white disabled:opacity-50">{t('admin.partnerStatus.suspended')}</button>
            </div>
          )}
        </div>
      )}
      <div className="space-y-4">
        {list.rows.map((p) => (
          <AgencyPartnerCard key={p.id} partner={p} stats={stats[p.id] ?? {}} projects={cards.projects} access={cards.access[p.id] ?? {}}
            password={cards.passwords[p.id]} account={cards.accounts[p.id]} selected={sel.has(p.id)} onSelect={() => toggle(p.id)}
            onEdit={() => setEditing(p)} onSaved={reloadAll} toast={toast} />
        ))}
      </div>
      <Pager page={list.page} count={list.count} setPage={list.setPage} />
      {editing && <AgencyPartnerEditor partner={editing} account={cards.accounts[editing.id]} toast={toast} onClose={() => setEditing(null)} onSaved={reloadAll} />}
    </div>
  );
}
