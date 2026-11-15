/**
 * Solicitudes de agencias (admin): aprobar (agency-hub → un paso en servidor + email de bienvenida real),
 * rechazar con motivo (email en su idioma), "aprobar igualmente" las rechazadas y borrar spam.
 * Filtro por estado + búsqueda + paginación (plan items 4, 16, 22, 23).
 */
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { uiLocale } from '../../lib/dateLocale';
import { ListFilters, Modal, Pager, Toast, ilikeTerm, inputCls, pillBtn, usePaged, useErrText } from './agencyAdminUi';

const COLS = 'id, agency_name, manager_name, email, whatsapp, website, country, projects_interested, monthly_volume, notes, status, created_at, reviewed_by, reviewed_at, reject_reason, market, lang, campaign, utm_source, auto_check, accepted_terms_at';
const DEFAULTS: Record<string, { close: number; referral: number }> = { es: { close: 5, referral: 3 }, world: { close: 10, referral: 10 } };

export default function AgencyApplicationsList({ toast, onChanged }: { toast: Toast; onChanged: () => void }) {
  const { t } = useTranslation();
  const errText = useErrText();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('pending');
  const list = usePaged<any>(() => {
    let b = supabase.from('listing_partner_applications').select(COLS, { count: 'exact' }).order('created_at', { ascending: false });
    if (status !== 'all') b = b.eq('status', status);
    if (q.trim()) b = b.or(`agency_name.ilike.${ilikeTerm(q)},email.ilike.${ilikeTerm(q)},country.ilike.${ilikeTerm(q)}`);
    return b;
  }, [q, status]);
  const [approving, setApproving] = useState<any | null>(null);
  const [opts, setOpts] = useState({ market: 'es', close: '5', referral: '3' });
  const [rejecting, setRejecting] = useState<any | null>(null);
  const [reason, setReason] = useState('');
  const [deleting, setDeleting] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);
  const done = async () => { await list.reload(); onChanged(); };

  const openApprove = (a: any) => {
    const market = a.market ?? (/^(es|españa|espana|spain)$/i.test(String(a.country ?? '').trim()) || (!a.country && a.lang === 'es') ? 'es' : 'world');
    setOpts({ market, close: String(DEFAULTS[market].close), referral: String(DEFAULTS[market].referral) });
    setApproving(a);
  };

  const approve = async () => {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke('agency-hub', { body: { action: 'approve', application_id: approving.id, opts: { market: opts.market, close_pct: Number(opts.close), referral_pct: Number(opts.referral) } } });
    setBusy(false);
    const r = data as any;
    if (error || (!r?.ok && !r?.partner_id)) { toast(errText(r?.error ?? error), false); return; }
    toast(r.ok ? t('agencyFunnel.admin.approveOk', { email: approving.email }) : t('agencyFunnel.admin.approveNoEmail', { msg: errText(r.error) }), !!r.ok);
    setApproving(null);
    await done();
  };

  const reject = async () => {
    setBusy(true);
    const { data, error } = await supabase.rpc('reject_partner_application', { p_app: rejecting.id, p_reason: reason || null });
    setBusy(false);
    if (error || (data as any)?.status !== 'rejected') { toast(errText(error ?? (data as any)?.status), false); return; }
    toast(t('agencyFunnel.admin.rejectOk'));
    setRejecting(null); setReason('');
    await done();
  };

  const remove = async () => {
    setBusy(true);
    const { error } = await supabase.from('listing_partner_applications').delete().eq('id', deleting.id);
    setBusy(false);
    if (error) { toast(errText(error), false); return; }
    toast(t('agencyFunnel.admin.deletedApp'));
    setDeleting(null);
    await done();
  };

  const statuses = ['pending', 'approved', 'rejected', 'all'].map((s) => ({ value: s, label: t(`agencyFunnel.admin.appSt.${s}`) }));
  const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString(uiLocale(), { dateStyle: 'short', timeStyle: 'short' }) : '—');

  return (
    <div>
      <ListFilters q={q} setQ={setQ} status={status} setStatus={setStatus} statuses={statuses} label={t('agencyFunnel.admin.statusLabel')} />
      {list.error && <p className="text-xs text-red-600 mb-2">{errText(list.error)}</p>}
      {!list.loading && list.rows.length === 0 && <p className="text-sm text-primary/50">{t('fix.apm.noPendingRequests')}</p>}
      <div className="space-y-3">
        {list.rows.map((a) => (
          <article key={a.id} className="bg-white/60 rounded-xl p-4">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
              <div className="min-w-0">
                <h4 className="font-serif text-lg text-primary break-words">{a.agency_name}</h4>
                <p className="text-xs text-primary/60 break-all">{[a.email, a.country ?? t('fix.apm.countryUnknown'), a.website].filter(Boolean).join(' · ')}</p>
                <p className="text-xs text-primary/50 mt-1">
                  {t(`agencyFunnel.admin.appSt.${a.status}`, { defaultValue: a.status })} · {when(a.created_at)}
                  {a.campaign || a.utm_source ? ` · ${[a.utm_source, a.campaign].filter(Boolean).join('/')}` : ''}
                  {a.reviewed_at ? ` · ${t('agencyFunnel.admin.reviewedBy', { who: a.reviewed_by ?? '—', when: when(a.reviewed_at) })}` : ''}
                </p>
                {a.manager_name && <p className="text-sm">{t('fix.apm.managerLabel')} {a.manager_name}</p>}
                {a.projects_interested?.length ? <p className="text-sm mt-1">{t('fix.apm.interestedInLabel')} {a.projects_interested.join(', ')}</p> : null}
                {a.notes && <p className="text-sm text-primary/60 mt-1 italic break-words">{a.notes}</p>}
                {a.reject_reason && <p className="text-xs text-red-700 mt-1">{t('agencyFunnel.admin.reason')}: {a.reject_reason}</p>}
                {a.status === 'pending' && a.auto_check?.reasons?.length ? (
                  <p className="text-xs text-amber-800 mt-1">{t('agencyFunnel.admin.autoReasons')}: {a.auto_check.reasons.map((r: string) => t(`agencyFunnel.reason.${r}`, { defaultValue: r })).join(', ')}</p>
                ) : null}
              </div>
              <div className="flex flex-wrap sm:flex-col gap-2 shrink-0">
                {a.status !== 'approved' && (
                  <button type="button" onClick={() => openApprove(a)} className="text-xs bg-green-600 text-white px-3 py-2 rounded-full">{a.status === 'rejected' ? t('agencyFunnel.admin.approveAnyway') : t('fix.apm.approve')}</button>
                )}
                {a.status === 'pending' && <button type="button" onClick={() => { setReason(''); setRejecting(a); }} className="text-xs bg-red-600 text-white px-3 py-2 rounded-full">{t('fix.apm.reject')}</button>}
                {a.status !== 'approved' && <button type="button" onClick={() => setDeleting(a)} className={pillBtn}>{t('agencyFunnel.admin.delete')}</button>}
              </div>
            </div>
          </article>
        ))}
      </div>
      <Pager page={list.page} count={list.count} setPage={list.setPage} />

      {approving && (
        <Modal title={t('agencyFunnel.admin.approveTitle', { name: approving.agency_name })} onClose={() => setApproving(null)}>
          <p className="text-sm text-primary/70 mb-3">{t('agencyFunnel.admin.approveBody', { email: approving.email })}</p>
          <div className="grid grid-cols-3 gap-2">
            <label className="block text-sm font-medium col-span-3 sm:col-span-1">{t('agencyFunnel.admin.market')}
              <select value={opts.market} onChange={(e) => { const m = e.target.value; setOpts({ market: m, close: String(DEFAULTS[m].close), referral: String(DEFAULTS[m].referral) }); }} className={inputCls}>
                {['es', 'world'].map((m) => <option key={m} value={m}>{t(`agencyFunnel.admin.marketOpt.${m}`)}</option>)}
              </select>
            </label>
            <label className="block text-sm font-medium">{t('agencyFunnel.admin.closePct')}<input inputMode="decimal" value={opts.close} onChange={(e) => setOpts({ ...opts, close: e.target.value })} className={inputCls} /></label>
            <label className="block text-sm font-medium">{t('agencyFunnel.admin.referralPct')}<input inputMode="decimal" value={opts.referral} onChange={(e) => setOpts({ ...opts, referral: e.target.value })} className={inputCls} /></label>
          </div>
          <div className="flex gap-2 mt-5">
            <button type="button" disabled={busy} onClick={() => void approve()} className="flex-1 bg-green-600 text-white py-2 rounded-lg disabled:opacity-50">{busy ? t('agencyFunnel.admin.working') : t('fix.apm.approve')}</button>
            <button type="button" onClick={() => setApproving(null)} className="flex-1 bg-white border border-primary/30 text-primary py-2 rounded-lg">{t('fix.apm.cancel')}</button>
          </div>
        </Modal>
      )}
      {rejecting && (
        <Modal title={t('agencyFunnel.admin.rejectTitle', { name: rejecting.agency_name })} onClose={() => setRejecting(null)}>
          <p className="text-sm text-primary/70 mb-3">{t('agencyFunnel.admin.rejectBody')}</p>
          <label className="block text-sm font-medium">{t('agencyFunnel.admin.reasonOptional')}
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={500} className={inputCls} />
          </label>
          <div className="flex gap-2 mt-5">
            <button type="button" disabled={busy} onClick={() => void reject()} className="flex-1 bg-red-600 text-white py-2 rounded-lg disabled:opacity-50">{t('fix.apm.reject')}</button>
            <button type="button" onClick={() => setRejecting(null)} className="flex-1 bg-white border border-primary/30 text-primary py-2 rounded-lg">{t('fix.apm.cancel')}</button>
          </div>
        </Modal>
      )}
      {deleting && (
        <Modal title={t('agencyFunnel.admin.deleteAppTitle', { name: deleting.agency_name })} onClose={() => setDeleting(null)}>
          <p className="text-sm text-primary/70">{t('agencyFunnel.admin.deleteAppBody')}</p>
          <div className="flex gap-2 mt-5">
            <button type="button" disabled={busy} onClick={() => void remove()} className="flex-1 bg-red-600 text-white py-2 rounded-lg disabled:opacity-50">{t('agencyFunnel.admin.delete')}</button>
            <button type="button" onClick={() => setDeleting(null)} className="flex-1 bg-white border border-primary/30 text-primary py-2 rounded-lg">{t('fix.apm.cancel')}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
