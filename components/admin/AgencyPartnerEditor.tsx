/**
 * Editar agencia (lápiz de la ficha) — mismo modal que "Editar cliente": accesos al portal, datos, logo, mercado,
 * idioma, comisión %, notas y estado (Activa/Suspendida vía admin_set_partner_status, que bloquea el acceso).
 * Cambiar el email mueve también la cuenta de acceso (agency-hub update_email). Nada se guarda hasta "Guardar".
 */
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { uiLocale } from '../../lib/dateLocale';
import { logoFileError, uploadPartnerLogo } from '../agency/partnerLogo';
import { SheetModal, Toast, closeBtnCls, fieldCls, labelCls, saveBtnCls, useErrText } from './agencyAdminUi';

const TEXT_FIELDS = ['agency_name', 'manager_name', 'email', 'phone', 'whatsapp', 'website', 'country', 'personal_link_slug'] as const;

interface Props {
  partner: Record<string, any>;
  account?: { last_login: string | null; logins_7d: number; logins_30d: number };
  onClose: () => void;
  onSaved: () => Promise<void>;
  toast: Toast;
}

const AgencyPartnerEditor: React.FC<Props> = ({ partner, account, onClose, onSaved, toast }) => {
  const { t } = useTranslation();
  const errText = useErrText();
  const initial = useMemo(() => ({
    ...Object.fromEntries(TEXT_FIELDS.map((k) => [k, partner[k] ?? ''])),
    market: partner.market ?? 'es', lang: partner.lang ?? 'es', notes: partner.notes ?? '',
    status: partner.status === 'suspended' ? 'suspended' : 'approved',
    commission_close_pct: String(partner.commission_close_pct ?? ''), commission_referral_pct: String(partner.commission_referral_pct ?? ''),
  }) as Record<string, string>, [partner]);
  const [form, setForm] = useState<Record<string, string>>(initial);
  const [logo, setLogo] = useState<string | null>(partner.logo_url ?? null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  const emailChanged = form.email.trim().toLowerCase() !== String(partner.email ?? '').toLowerCase();
  const set = (k: string, v: string) => setForm({ ...form, [k]: v });

  const onLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const bad = logoFileError(file);
    if (bad) { setErr(t(bad === 'size' ? 'agenciasDashboard.logoErrorSize' : 'agenciasDashboard.logoErrorType')); return; }
    setBusy(true); setErr('');
    try { setLogo(await uploadPartnerLogo(partner.id, file)); } catch (x) { setErr(errText(x)); }
    setBusy(false);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.agency_name.trim() || !form.email.trim()) { setErr(t('admin.agencyEdit.errRequired')); return; }
    const pct = (v: string) => (String(v).trim() === '' ? null : Number(String(v).replace(',', '.')));
    const close = pct(form.commission_close_pct), referral = pct(form.commission_referral_pct);
    if ([close, referral].some((n) => n !== null && (!Number.isFinite(n) || n < 0 || n > 50))) { setErr(t('agencyFunnel.err.pct')); return; }
    setBusy(true); setErr('');
    if (emailChanged) {
      const { data, error } = await supabase.functions.invoke('agency-hub', { body: { action: 'update_email', partner_id: partner.id, email: form.email.trim().toLowerCase() } });
      if (error || !(data as any)?.ok) { setBusy(false); setErr(errText((data as any)?.error ?? error)); return; }
    }
    const patch: Record<string, unknown> = Object.fromEntries(TEXT_FIELDS.filter((k) => k !== 'email').map((k) => [k, form[k].trim() || null]));
    Object.assign(patch, { market: form.market, lang: form.lang, notes: form.notes.trim() || null, commission_close_pct: close, commission_referral_pct: referral });
    const { error } = await supabase.from('listing_partners').update(patch).eq('id', partner.id);
    if (error) { setBusy(false); setErr(errText(error)); return; }
    if (form.status !== initial.status) {
      const { data, error: se } = await supabase.rpc('admin_set_partner_status', { p_id: partner.id, p_status: form.status, p_reason: null });
      if (se || (data as any)?.status !== 'ok') { setBusy(false); setErr(errText(se ?? (data as any)?.status)); return; }
    }
    setBusy(false);
    toast(t('agencyFunnel.admin.saved'));
    await onSaved();
    onClose();
  };

  const when = account?.last_login
    ? new Date(account.last_login).toLocaleString(uiLocale(), { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : t('admin.dash.portalNever');

  return (
    <SheetModal title={t('admin.agencyEdit.title', { name: partner.agency_name })} subtitle={t('admin.agencyCard.editSubtitle')} onClose={onClose} guard={dirty}>
      <form onSubmit={save} onKeyDown={(e) => { if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'TEXTAREA') e.preventDefault(); }} className="space-y-5">
        <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 text-xs text-primary">
          <p className="font-bold"><span className="material-symbols-outlined text-sm align-middle text-green-700">login</span> {t('admin.dash.portalLastLogin', { when })}</p>
          <p className="mt-1 font-medium">{t('admin.dash.portalLogins', { d7: account?.logins_7d ?? 0, d30: account?.logins_30d ?? 0 })}</p>
          <p className="text-[10px] text-gray-400 mt-2">{t('admin.dash.portalLoginsHint')}</p>
        </div>

        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-gray-50 border border-gray-100 flex items-center justify-center overflow-hidden shrink-0">
            {logo ? <img src={logo} alt={form.agency_name} className="w-full h-full object-contain" /> : <span className="material-symbols-outlined text-2xl text-primary/20">storefront</span>}
          </div>
          <label className={`text-xs font-bold bg-primary text-white px-4 py-2.5 rounded-xl cursor-pointer ${busy ? 'opacity-50 pointer-events-none' : ''}`}>
            {logo ? t('agenciasDashboard.logoChange') : t('agenciasDashboard.logoUpload')}
            <input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" onChange={onLogo} className="hidden" />
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {TEXT_FIELDS.map((k) => (
            <div key={k} className="min-w-0">
              <label className={labelCls}>{t(`admin.agencyEdit.f.${k}`)}</label>
              <input value={form[k]} onChange={(e) => set(k, e.target.value)} className={fieldCls} type={k === 'email' ? 'email' : 'text'} />
            </div>
          ))}
        </div>
        {emailChanged && <p className="text-xs text-amber-800 bg-amber-50 rounded-lg px-3 py-2">{t('agencyFunnel.admin.emailWarning')}</p>}
        <p className="text-[11px] text-primary/50 -mt-2">{t('admin.agencyEdit.slugHint')}</p>

        <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 grid grid-cols-2 gap-3">
          <div className="col-span-2 sm:col-span-1">
            <label className={labelCls}>{t('agencyFunnel.admin.market')}</label>
            <select value={form.market} onChange={(e) => set('market', e.target.value)} className="w-full px-5 py-3 bg-white border border-gray-200 rounded-2xl font-bold">
              {['es', 'world'].map((m) => <option key={m} value={m}>{t(`agencyFunnel.admin.marketOpt.${m}`)}</option>)}
            </select>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label className={labelCls}>{t('agencyFunnel.admin.lang')}</label>
            <select value={form.lang} onChange={(e) => set('lang', e.target.value)} className="w-full px-5 py-3 bg-white border border-gray-200 rounded-2xl font-bold">
              <option value="es">Español</option><option value="en">English</option><option value="ro">Română</option><option value="id">Indonesia</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>{t('agencyFunnel.admin.closePct')}</label>
            <input inputMode="decimal" value={form.commission_close_pct} onChange={(e) => set('commission_close_pct', e.target.value)} className="w-full px-5 py-3 bg-white border border-gray-200 rounded-2xl font-bold" aria-label={t('agencyFunnel.admin.closePct')} />
          </div>
          <div>
            <label className={labelCls}>{t('agencyFunnel.admin.referralPct')}</label>
            <input inputMode="decimal" value={form.commission_referral_pct} onChange={(e) => set('commission_referral_pct', e.target.value)} className="w-full px-5 py-3 bg-white border border-gray-200 rounded-2xl font-bold" aria-label={t('agencyFunnel.admin.referralPct')} />
          </div>
        </div>

        <div>
          <label className={labelCls}>{t('admin.dash.notesLabel')}</label>
          <textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} className={`${fieldCls} resize-none h-24`} />
        </div>

        <div className={`p-4 rounded-2xl border ${form.status === 'approved' ? 'bg-gray-50 border-gray-100' : 'bg-red-50 border-red-200'}`}>
          <label className="text-[10px] font-black uppercase text-primary/60 block mb-2">{t('admin.agencyEdit.f.status')}</label>
          <select value={form.status} onChange={(e) => set('status', e.target.value)} className={`w-full px-5 py-3 border rounded-2xl font-bold ${form.status === 'approved' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
            <option value="approved">{t('admin.partnerStatus.approved')}</option>
            <option value="suspended">{t('admin.partnerStatus.suspended')}</option>
          </select>
          <p className="text-[10px] text-gray-400 mt-2">{t('admin.agencyCard.statusHint')}</p>
        </div>

        {err && <p role="alert" className="text-xs text-red-600 break-words">{err}</p>}
        <div className="flex gap-4 pt-2">
          <button type="submit" disabled={busy} className={saveBtnCls}>{busy ? t('admin.adminDash.savingEllipsis') : t('admin.adminDash.saveChanges')}</button>
          <button type="button" onClick={onClose} className={closeBtnCls}>{t('admin.dash.close')}</button>
        </div>
      </form>
    </SheetModal>
  );
};

export default AgencyPartnerEditor;
