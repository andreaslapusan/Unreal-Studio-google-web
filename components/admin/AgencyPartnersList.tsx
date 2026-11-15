/**
 * Agencias (admin): filtro por estado, búsqueda, paginación, recuentos de clientes/reservas/ventas,
 * fecha de alta y último acceso (admin_partner_overview) y acciones por fila. Las borradas no salen.
 */
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { uiLocale } from '../../lib/dateLocale';
import { ListFilters, Pager, Toast, ilikeTerm, usePaged, useErrText } from './agencyAdminUi';
import AgencyPartnerActions from './AgencyPartnerActions';
import AgencyPartnerEditor from './AgencyPartnerEditor';

const COLS = 'id, agency_name, manager_name, email, phone, whatsapp, website, country, status, user_id, logo_url, personal_link_slug, approved_at, market, lang, commission_close_pct, commission_referral_pct, is_demo, welcomed_at, deleted_at';
const STATUS_STYLE: Record<string, string> = { approved: 'bg-green-100 text-green-800', suspended: 'bg-amber-100 text-amber-800', pending: 'bg-gray-100 text-gray-700', rejected: 'bg-red-100 text-red-700' };

export default function AgencyPartnersList({ toast, refreshKey }: { toast: Toast; refreshKey: number }) {
  const { t } = useTranslation();
  const errText = useErrText();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [editing, setEditing] = useState<any | null>(null);
  const [stats, setStats] = useState<Record<string, any>>({});
  const list = usePaged<any>(() => {
    let b = supabase.from('listing_partners').select(COLS, { count: 'exact' }).is('deleted_at', null).neq('status', 'deleted').order('approved_at', { ascending: false, nullsFirst: false });
    if (status !== 'all') b = b.eq('status', status);
    if (q.trim()) b = b.or(`agency_name.ilike.${ilikeTerm(q)},email.ilike.${ilikeTerm(q)},country.ilike.${ilikeTerm(q)}`);
    return b;
  }, [q, status, refreshKey]);

  useEffect(() => {
    void supabase.rpc('admin_partner_overview').then(({ data }) => setStats(Object.fromEntries((data ?? []).map((r: any) => [r.partner_id, r]))));
  }, [refreshKey, list.rows]);

  const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(uiLocale(), { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
  const statuses = ['all', 'approved', 'suspended', 'pending', 'rejected'].map((s) => ({ value: s, label: s === 'all' ? t('agencyFunnel.admin.allStatuses') : t(`admin.partnerStatus.${s}`) }));

  return (
    <div>
      <ListFilters q={q} setQ={setQ} status={status} setStatus={setStatus} statuses={statuses} label={t('agencyFunnel.admin.statusLabel')} />
      {list.error && <p className="text-xs text-red-600 mb-2">{errText(list.error)}</p>}
      {!list.loading && list.rows.length === 0 && <p className="text-primary/60 text-sm">{t('fix.apm.noActiveAgencies')}</p>}
      <div className="space-y-3">
        {list.rows.map((p) => {
          const s = stats[p.id] ?? {};
          return (
            <article key={p.id} className="bg-white/60 rounded-xl p-4">
              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-serif text-lg text-primary break-words">
                    {p.agency_name}
                    {p.is_demo && <span className="ml-2 align-middle text-[10px] font-black uppercase tracking-widest bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{t('agencyFunnel.admin.demo')}</span>}
                  </h3>
                  <p className="text-xs text-primary/60 break-all">{[p.email, p.country].filter(Boolean).join(' · ')}</p>
                  <p className="text-xs mt-1 flex flex-wrap gap-x-2 gap-y-1 items-center">
                    <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${STATUS_STYLE[p.status] ?? 'bg-gray-100'}`}>{t(`admin.partnerStatus.${p.status}`, { defaultValue: p.status })}</span>
                    <span>{t(`agencyFunnel.admin.marketOpt.${p.market}`)} · {p.commission_close_pct ?? '—'}% / {p.commission_referral_pct ?? '—'}%</span>
                  </p>
                  <p className="text-xs text-primary/50 mt-1">
                    {t('agencyFunnel.admin.counts', { leads: s.leads ?? 0, res: s.reservations ?? 0, sales: s.sales ?? 0 })}
                    {' · '}{t('agencyFunnel.admin.approvedOn', { date: fmt(p.approved_at) })}
                    {' · '}{t('agencyFunnel.admin.lastLogin', { date: s.last_sign_in_at ? fmt(s.last_sign_in_at) : t('agencyFunnel.admin.never') })}
                  </p>
                </div>
                <div className="flex flex-col gap-2 md:items-end shrink-0">
                  <button type="button" onClick={() => setEditing(p)} className="text-xs bg-primary text-white px-3 py-2 rounded-full self-start md:self-end">{t('admin.agencyEdit.button')}</button>
                  <AgencyPartnerActions partner={p} toast={toast} onDone={list.reload} />
                </div>
              </div>
            </article>
          );
        })}
      </div>
      <Pager page={list.page} count={list.count} setPage={list.setPage} />
      {editing && <AgencyPartnerEditor partner={editing} toast={toast} onClose={() => setEditing(null)} onSaved={list.reload} />}
    </div>
  );
}
