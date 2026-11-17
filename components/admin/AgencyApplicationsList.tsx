/**
 * Solicitudes de agencias (admin) — misma ficha que Clientes/Agencias: datos, comisión (% si cierra la agencia /
 * % si cierra Unreal) y mercado EDITABLES antes de aprobar (lápiz → guarda en la solicitud), WhatsApp, borrar,
 * y abajo "Aprobar" (agency-hub: crea la agencia + bienvenida con contraseña temporal) / "Rechazar" (email con motivo).
 * Filtro por estado + búsqueda + paginación.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { uiLocale } from '../../lib/dateLocale';
import { ListFilters, Pager, SheetModal, Toast, closeBtnCls, fieldCls, ilikeTerm, labelCls, usePaged, useErrText } from './agencyAdminUi';

const COLS = 'id, agency_name, manager_name, email, phone, whatsapp, website, country, projects_interested, monthly_volume, notes, status, created_at, reviewed_by, reviewed_at, reject_reason, market, lang, campaign, utm_source, auto_check, accepted_terms_at, commission_close_pct, commission_referral_pct';
type Defaults = Record<string, { close: number; referral: number }>;
const FALLBACK: Defaults = { es: { close: 5, referral: 3 }, world: { close: 10, referral: 3 } };
const TEXT = ['agency_name', 'manager_name', 'email', 'whatsapp', 'phone', 'website', 'country'] as const;
const STATUS_STYLE: Record<string, string> = { pending: 'bg-amber-50 text-amber-600', approved: 'bg-green-50 text-green-600', rejected: 'bg-red-50 text-red-600' };
const boxSel = 'w-full px-5 py-3 bg-white border border-gray-200 rounded-2xl font-bold';

const guessMarket = (a: any) => a.market ?? (/^(es|españa|espana|spain)$/i.test(String(a.country ?? '').trim()) || (!a.country && a.lang === 'es') ? 'es' : 'world');
const num = (v: string) => (String(v).trim() === '' ? null : Number(String(v).replace(',', '.')));
const badPct = (...n: (number | null)[]) => n.some((x) => x === null || !Number.isFinite(x) || x < 0 || x > 50);

/** Mercado + las dos comisiones, con etiquetas claras (mismo bloque en editar y aprobar). */
function CommissionFields({ v, set, defaults, t }: { v: Record<string, string>; set: (p: Record<string, string>) => void; defaults: Defaults; t: (k: string, o?: any) => string }) {
  return (
    <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 grid grid-cols-2 gap-3">
      <div className="col-span-2">
        <label className={labelCls}>{t('agencyFunnel.admin.market')}</label>
        <select value={v.market} onChange={(e) => { const m = e.target.value; set({ ...v, market: m, close: String(defaults[m]?.close ?? ''), referral: String(defaults[m]?.referral ?? '') }); }} className={boxSel}>
          {['es', 'world'].map((m) => <option key={m} value={m}>{t(`agencyFunnel.admin.marketOpt.${m}`)}</option>)}
        </select>
      </div>
      <div className="min-w-0">
        <label className={labelCls}>{t('agencyFunnel.admin.closePct')}</label>
        <input inputMode="decimal" aria-label={t('agencyFunnel.admin.closePct')} value={v.close} onChange={(e) => set({ ...v, close: e.target.value })} className={boxSel} />
      </div>
      <div className="min-w-0">
        <label className={labelCls}>{t('agencyFunnel.admin.referralPct')}</label>
        <input inputMode="decimal" aria-label={t('agencyFunnel.admin.referralPct')} value={v.referral} onChange={(e) => set({ ...v, referral: e.target.value })} className={boxSel} />
      </div>
      <p className="col-span-2 text-[10px] text-gray-400">{t('admin.agencyCard.defaultsHint', { es: `${defaults.es?.close}/${defaults.es?.referral}`, world: `${defaults.world?.close}/${defaults.world?.referral}` })}</p>
    </div>
  );
}

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
  const [defaults, setDefaults] = useState<Defaults>(FALLBACK);
  useEffect(() => {
    void supabase.from('agency_config').select('value').eq('key', 'commission_defaults').maybeSingle().then(({ data }) => { if (data?.value?.es && data?.value?.world) setDefaults(data.value as Defaults); }, () => {});
  }, []);
  const [modal, setModal] = useState<null | { kind: 'edit' | 'approve' | 'reject' | 'delete'; app: any }>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const done = async () => { await list.reload(); onChanged(); };

  const commission = (a: any) => {
    const m = guessMarket(a);
    return { market: m, close: String(a.commission_close_pct ?? defaults[m]?.close ?? ''), referral: String(a.commission_referral_pct ?? defaults[m]?.referral ?? '') };
  };
  const open = (kind: 'edit' | 'approve' | 'reject' | 'delete', a: any) => {
    setForm(kind === 'edit'
      ? { ...Object.fromEntries(TEXT.map((k) => [k, a[k] ?? ''])), lang: a.lang ?? 'es', notes: a.notes ?? '', ...commission(a) }
      : kind === 'approve' ? commission(a) : { reason: '' });
    setModal({ kind, app: a });
  };
  const initialEdit = useMemo(() => (modal?.kind === 'edit' ? JSON.stringify(form) : ''), [modal]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = modal?.kind === 'edit' && JSON.stringify(form) !== initialEdit;

  const saveEdit = async () => {
    const close = num(form.close), referral = num(form.referral);
    if (!form.agency_name.trim() || !form.email.trim()) { toast(t('admin.agencyEdit.errRequired'), false); return; }
    if (badPct(close, referral)) { toast(t('agencyFunnel.err.pct'), false); return; }
    setBusy(true);
    const patch: Record<string, unknown> = Object.fromEntries(TEXT.map((k) => [k, form[k].trim() || null]));
    Object.assign(patch, { email: form.email.trim().toLowerCase(), lang: form.lang, notes: form.notes.trim() || null, market: form.market, commission_close_pct: close, commission_referral_pct: referral });
    const { error } = await supabase.from('listing_partner_applications').update(patch).eq('id', modal!.app.id);
    setBusy(false);
    if (error) { toast(errText(error), false); return; }
    toast(t('agencyFunnel.admin.saved'));
    setModal(null);
    await list.reload();
  };

  const approve = async () => {
    const close = num(form.close), referral = num(form.referral);
    if (badPct(close, referral)) { toast(t('agencyFunnel.err.pct'), false); return; }
    const a = modal!.app;
    setBusy(true);
    const { data, error } = await supabase.functions.invoke('agency-hub', { body: { action: 'approve', application_id: a.id, opts: { market: form.market, close_pct: close, referral_pct: referral } } });
    setBusy(false);
    const r = data as any;
    if (error || (!r?.ok && !r?.partner_id)) { toast(errText(r?.error ?? error), false); return; }
    toast(r.ok ? t('agencyFunnel.admin.approveOk', { email: a.email }) : t('agencyFunnel.admin.approveNoEmail', { msg: errText(r.error) }), !!r.ok);
    setModal(null);
    await done();
  };

  const reject = async () => {
    setBusy(true);
    const { data, error } = await supabase.rpc('reject_partner_application', { p_app: modal!.app.id, p_reason: form.reason || null });
    setBusy(false);
    if (error || (data as any)?.status !== 'rejected') { toast(errText(error ?? (data as any)?.status), false); return; }
    toast(t('agencyFunnel.admin.rejectOk'));
    setModal(null);
    await done();
  };

  const remove = async () => {
    setBusy(true);
    const { error } = await supabase.from('listing_partner_applications').delete().eq('id', modal!.app.id);
    setBusy(false);
    if (error) { toast(errText(error), false); return; }
    toast(t('agencyFunnel.admin.deletedApp'));
    setModal(null);
    await done();
  };

  const statuses = ['pending', 'approved', 'rejected', 'all'].map((s) => ({ value: s, label: t(`agencyFunnel.admin.appSt.${s}`) }));
  const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString(uiLocale(), { dateStyle: 'short', timeStyle: 'short' }) : '—');
  const footer = (onOk: () => void, okLabel: string, okCls: string, disabled = false) => (
    <div className="flex gap-4 pt-6">
      <button type="button" disabled={busy || disabled} onClick={onOk} className={`flex-1 text-white py-4 rounded-xl font-bold uppercase tracking-widest text-xs disabled:opacity-50 ${okCls}`}>{busy ? t('agencyFunnel.admin.working') : okLabel}</button>
      <button type="button" onClick={() => setModal(null)} className={closeBtnCls}>{t('admin.dash.close')}</button>
    </div>
  );

  return (
    <div>
      <ListFilters q={q} setQ={setQ} status={status} setStatus={setStatus} statuses={statuses} label={t('agencyFunnel.admin.statusLabel')} />
      {list.error && <p className="text-xs text-red-600 mb-2">{errText(list.error)}</p>}
      {!list.loading && list.rows.length === 0 && <p className="text-sm text-primary/50">{t('fix.apm.noPendingRequests')}</p>}
      <div className="space-y-4">
        {list.rows.map((a) => {
          const c = commission(a);
          const wa = String(a.whatsapp || a.phone || '').replace(/[^\d]/g, '');
          return (
            <div key={a.id} data-agency-app={a.id} className="bg-[#f7f1ea] rounded-2xl border border-[#e4d8c9] shadow-sm overflow-hidden">
              <div className="p-5 sm:p-6 flex flex-col sm:flex-row sm:items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <h3 className="text-base sm:text-lg font-bold text-primary break-words">{a.agency_name}</h3>
                    <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${STATUS_STYLE[a.status] ?? 'bg-gray-100'}`}>{t(`agencyFunnel.admin.appSt.${a.status}`, { defaultValue: a.status })}</span>
                  </div>
                  <p className="text-sm text-gray-500 break-words">{a.email}{(a.whatsapp || a.phone) && ` · ${a.whatsapp || a.phone}`}</p>
                  <p className="text-xs text-primary/60 mt-0.5 break-words">{[a.manager_name, a.country ?? t('fix.apm.countryUnknown'), t(`agencyFunnel.admin.marketOpt.${c.market}`)].filter(Boolean).join(' · ')}</p>
                  <p className="text-xs font-bold text-primary mt-0.5">{t('agencyFunnel.admin.closePct')}: {c.close}% · {t('agencyFunnel.admin.referralPct')}: {c.referral}%{a.commission_close_pct == null ? <span className="font-normal text-primary/40"> · {t('admin.agencyCard.byDefault')}</span> : null}</p>
                  {a.website && <a href={/^https?:\/\//i.test(a.website) ? a.website : `https://${a.website}`} target="_blank" rel="noopener noreferrer" className="text-[11px] text-primary/60 underline break-all">{a.website}</a>}
                  <p className="text-[11px] text-primary/50 mt-0.5">
                    {when(a.created_at)}
                    {a.campaign || a.utm_source ? ` · ${[a.utm_source, a.campaign].filter(Boolean).join('/')}` : ''}
                    {a.reviewed_at ? ` · ${t('agencyFunnel.admin.reviewedBy', { who: a.reviewed_by ?? '—', when: when(a.reviewed_at) })}` : ''}
                  </p>
                  {a.notes && <p className="text-xs text-primary/40 mt-2 italic break-words">{a.notes}</p>}
                  {a.reject_reason && <p className="text-xs text-red-700 mt-1">{t('agencyFunnel.admin.reason')}: {a.reject_reason}</p>}
                  {a.status === 'pending' && a.auto_check?.reasons?.length ? (
                    <p className="text-xs text-amber-800 mt-1">{t('agencyFunnel.admin.autoReasons')}: {a.auto_check.reasons.map((r: string) => t(`agencyFunnel.reason.${r}`, { defaultValue: r })).join(', ')}</p>
                  ) : null}
                </div>
                <div className="flex gap-1.5 shrink-0 flex-wrap justify-end">
                  {a.status !== 'approved' && <button type="button" onClick={() => open('edit', a)} className="p-2.5 text-primary bg-almond rounded-xl hover:brightness-95 transition" title={t('admin.agencyCard.editApp')} aria-label={t('admin.agencyCard.editApp')}><span className="material-symbols-outlined text-sm">edit</span></button>}
                  {wa
                    ? <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer" className="p-2.5 bg-green-50 text-green-600 rounded-xl hover:bg-green-100 transition" title={t('admin.dash.sendWhatsapp')} aria-label={t('admin.dash.sendWhatsapp')}><span className="material-symbols-outlined text-sm">chat</span></a>
                    : <span className="p-2.5 bg-green-50 text-green-600 rounded-xl opacity-30" aria-hidden><span className="material-symbols-outlined text-sm">chat</span></span>}
                  {a.status !== 'approved' && <button type="button" onClick={() => open('delete', a)} className="p-2.5 text-red-500 bg-red-50 rounded-xl hover:bg-red-100 transition" title={t('agencyFunnel.admin.delete')} aria-label={t('agencyFunnel.admin.delete')}><span className="material-symbols-outlined text-sm">delete</span></button>}
                </div>
              </div>
              <div className="border-t border-gray-50 bg-gray-50/50 px-6 py-4">
                <div className="flex justify-between items-center gap-3 flex-wrap">
                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase text-gray-400 tracking-widest mb-1">{t('admin.agencyCard.interested')}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {(a.projects_interested ?? []).length
                        ? a.projects_interested.map((x: string) => <span key={x} className="text-[10px] bg-white border border-gray-100 text-primary px-2 py-0.5 rounded font-bold">{x}</span>)
                        : <span className="text-xs text-gray-300 italic">—</span>}
                    </div>
                  </div>
                  {a.status !== 'approved' && (
                    <div className="flex gap-1.5 shrink-0">
                      {a.status === 'pending' && <button type="button" onClick={() => open('reject', a)} className="bg-red-50 text-red-600 text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-lg hover:bg-red-100 transition">{t('fix.apm.reject')}</button>}
                      <button type="button" onClick={() => open('approve', a)} className="bg-green-600 text-white text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-lg hover:bg-green-700 transition flex items-center gap-1"><span className="material-symbols-outlined text-xs">check</span>{a.status === 'rejected' ? t('agencyFunnel.admin.approveAnyway') : t('fix.apm.approve')}</button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <Pager page={list.page} count={list.count} setPage={list.setPage} />

      {modal?.kind === 'edit' && (
        <SheetModal title={t('admin.agencyCard.editApp')} subtitle={modal.app.agency_name} onClose={() => setModal(null)} guard={dirty}>
          <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {TEXT.map((k) => (
                <div key={k} className="min-w-0">
                  <label className={labelCls}>{t(`admin.agencyEdit.f.${k}`)}</label>
                  <input value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} className={fieldCls} type={k === 'email' ? 'email' : 'text'} />
                </div>
              ))}
              <div className="min-w-0">
                <label className={labelCls}>{t('agencyFunnel.admin.lang')}</label>
                <select value={form.lang} onChange={(e) => setForm({ ...form, lang: e.target.value })} className={`${fieldCls} font-bold`}>
                  <option value="es">Español</option><option value="en">English</option><option value="ro">Română</option><option value="id">Indonesia</option>
                </select>
              </div>
            </div>
            <CommissionFields v={form} set={setForm} defaults={defaults} t={t} />
            <div>
              <label className={labelCls}>{t('admin.dash.notesLabel')}</label>
              <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={`${fieldCls} resize-none h-24`} />
            </div>
          </div>
          {footer(() => void saveEdit(), t('admin.adminDash.saveChanges'), 'bg-primary')}
        </SheetModal>
      )}
      {modal?.kind === 'approve' && (
        <SheetModal title={t('agencyFunnel.admin.approveTitle', { name: modal.app.agency_name })} subtitle={t('agencyFunnel.admin.approveBody', { email: modal.app.email })} onClose={() => setModal(null)} guard={busy}>
          <CommissionFields v={form} set={setForm} defaults={defaults} t={t} />
          {footer(() => void approve(), t('fix.apm.approve'), 'bg-green-600')}
        </SheetModal>
      )}
      {modal?.kind === 'reject' && (
        <SheetModal title={t('agencyFunnel.admin.rejectTitle', { name: modal.app.agency_name })} subtitle={t('agencyFunnel.admin.rejectBody')} onClose={() => setModal(null)}>
          <label className={labelCls}>{t('agencyFunnel.admin.reasonOptional')}</label>
          <textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} rows={3} maxLength={500} className={`${fieldCls} resize-none`} />
          {footer(() => void reject(), t('fix.apm.reject'), 'bg-red-600')}
        </SheetModal>
      )}
      {modal?.kind === 'delete' && (
        <SheetModal title={t('agencyFunnel.admin.deleteAppTitle', { name: modal.app.agency_name })} subtitle={t('agencyFunnel.admin.deleteAppBody')} onClose={() => setModal(null)}>
          {footer(() => void remove(), t('agencyFunnel.admin.delete'), 'bg-red-600')}
        </SheetModal>
      )}
    </div>
  );
}
