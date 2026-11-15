/**
 * Editor de una agencia en el admin (vista Agencias): perfil, logo, link personal, mercado y comisión,
 * más las acciones de estado (suspender / reactivar / borrar / reenviar bienvenida / reset).
 * El estado ya no se elige en un desplegable: va por AgencyPartnerActions (RPC que también bloquea el acceso).
 * Cambiar el email mueve también la cuenta de acceso (agency-hub update_email).
 */
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { logoFileError, uploadPartnerLogo } from '../agency/partnerLogo';
import { Modal, Toast, inputCls, useErrText } from './agencyAdminUi';
import AgencyPartnerActions from './AgencyPartnerActions';

const TEXT_FIELDS = ['agency_name', 'manager_name', 'email', 'phone', 'whatsapp', 'website', 'country', 'personal_link_slug'] as const;
type TextField = typeof TEXT_FIELDS[number];

interface Props {
  partner: Record<string, any>;
  properties?: { id: string; name: string }[];
  onClose: () => void;
  onSaved: () => Promise<void>;
  toast: Toast;
}

export default function AgencyPartnerEditor({ partner, onClose, onSaved, toast }: Props) {
  const { t } = useTranslation();
  const errText = useErrText();
  const initial = useMemo(() => ({
    ...Object.fromEntries(TEXT_FIELDS.map((k) => [k, partner[k] ?? ''])),
    market: partner.market ?? 'es', lang: partner.lang ?? 'es',
    commission_close_pct: partner.commission_close_pct ?? '', commission_referral_pct: partner.commission_referral_pct ?? '',
  }) as Record<string, string>, [partner]);
  const [form, setForm] = useState<Record<string, string>>(initial);
  const [logo, setLogo] = useState<string | null>(partner.logo_url ?? null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  const emailChanged = form.email.trim().toLowerCase() !== String(partner.email ?? '').toLowerCase();

  const onLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const bad = logoFileError(file);
    if (bad) { setErr(t(bad === 'size' ? 'agenciasDashboard.logoErrorSize' : 'agenciasDashboard.logoErrorType')); return; }
    setBusy(true); setErr('');
    try { setLogo(await uploadPartnerLogo(partner.id, file)); } catch (x) { setErr(errText(x)); }
    setBusy(false);
  };

  const save = async () => {
    if (!form.agency_name.trim() || !form.email.trim()) { setErr(t('admin.agencyEdit.errRequired')); return; }
    const pct = (v: string) => (String(v).trim() === '' ? null : Number(v));
    const close = pct(form.commission_close_pct), referral = pct(form.commission_referral_pct);
    if ([close, referral].some((n) => n !== null && (!Number.isFinite(n) || n < 0 || n > 50))) { setErr(t('agencyFunnel.err.pct')); return; }
    setBusy(true); setErr('');
    if (emailChanged) {
      const { data, error } = await supabase.functions.invoke('agency-hub', { body: { action: 'update_email', partner_id: partner.id, email: form.email.trim().toLowerCase() } });
      if (error || !(data as any)?.ok) { setBusy(false); setErr(errText((data as any)?.error ?? error)); return; }
    }
    const patch: Record<string, unknown> = Object.fromEntries(TEXT_FIELDS.filter((k) => k !== 'email').map((k) => [k, form[k].trim() || null]));
    Object.assign(patch, { market: form.market, lang: form.lang, commission_close_pct: close, commission_referral_pct: referral });
    const { error } = await supabase.from('listing_partners').update(patch).eq('id', partner.id);
    setBusy(false);
    if (error) { setErr(errText(error)); return; }
    toast(t('agencyFunnel.admin.saved'));
    await onSaved();
    onClose();
  };

  const field = (k: string, label: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label key={k} className="block text-sm font-medium min-w-0">
      {label}
      <input value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} className={inputCls} {...extra} />
    </label>
  );

  return (
    <Modal title={t('admin.agencyEdit.title', { name: partner.agency_name })} onClose={onClose} guard={dirty}>
      <div className="flex items-center gap-4 mb-5">
        <div className="w-16 h-16 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center overflow-hidden shrink-0">
          {logo ? <img src={logo} alt={form.agency_name} className="w-full h-full object-contain" /> : <span className="material-symbols-outlined text-2xl text-primary/20">storefront</span>}
        </div>
        <label className={`text-xs bg-primary text-white px-3 py-2 rounded-full cursor-pointer ${busy ? 'opacity-50 pointer-events-none' : ''}`}>
          {logo ? t('agenciasDashboard.logoChange') : t('agenciasDashboard.logoUpload')}
          <input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" onChange={onLogo} className="hidden" />
        </label>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        {TEXT_FIELDS.map((k) => field(k, t(`admin.agencyEdit.f.${k}`)))}
        <label className="block text-sm font-medium">{t('agencyFunnel.admin.market')}
          <select value={form.market} onChange={(e) => setForm({ ...form, market: e.target.value })} className={inputCls}>
            {['es', 'world'].map((m) => <option key={m} value={m}>{t(`agencyFunnel.admin.marketOpt.${m}`)}</option>)}
          </select>
        </label>
        <label className="block text-sm font-medium">{t('agencyFunnel.admin.lang')}
          <select value={form.lang} onChange={(e) => setForm({ ...form, lang: e.target.value })} className={inputCls}>
            {['es', 'en', 'ro', 'id'].map((l) => <option key={l} value={l}>{l.toUpperCase()}</option>)}
          </select>
        </label>
        {field('commission_close_pct', t('agencyFunnel.admin.closePct'), { inputMode: 'decimal' })}
        {field('commission_referral_pct', t('agencyFunnel.admin.referralPct'), { inputMode: 'decimal' })}
      </div>
      {emailChanged && <p className="text-xs text-amber-800 bg-amber-50 rounded-lg px-3 py-2 mt-2">{t('agencyFunnel.admin.emailWarning')}</p>}
      <p className="text-[11px] text-primary/50 mt-2">{t('admin.agencyEdit.slugHint')}</p>
      <p className="text-xs text-primary/60 mt-4 bg-almond/60 rounded-lg px-3 py-2">{t('admin.agencyEdit.projectsAll')}</p>

      {err && <p role="alert" className="text-xs text-red-600 mt-3 break-words">{err}</p>}
      <div className="flex gap-2 mt-6">
        <button type="button" disabled={busy} onClick={() => void save()} className="flex-1 bg-primary text-white py-2 rounded-lg disabled:opacity-50">{t('fix.apm.save')}</button>
        <button type="button" onClick={onClose} className="flex-1 bg-white border border-primary/30 text-primary py-2 rounded-lg">{t('fix.apm.cancel')}</button>
      </div>
      <div className="border-t border-primary/10 mt-6 pt-4">
        <p className="text-[10px] font-black uppercase tracking-widest text-primary/40 mb-2">{t('agencyFunnel.admin.statusLabel')}: {t(`admin.partnerStatus.${partner.status}`, { defaultValue: partner.status })}</p>
        <AgencyPartnerActions partner={partner} toast={toast} onDone={async () => { await onSaved(); onClose(); }} />
      </div>
    </Modal>
  );
}
