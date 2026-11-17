/** Mi agencia: logo, link personal (atribución) y datos de la agencia. */
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { AgencyData, catalogLink, copyText, fmtDate, useShortLink } from './useAgencyData';
import { logoFileError, uploadPartnerLogo } from './partnerLogo';
import { card, btnPrimary, btnGhost, input, SectionTitle } from './ui';

// Lo que la agencia edita ella misma (la BD aplica la misma lista: trigger protect_partner_privileged_cols).
// El email de acceso va aparte: agency-hub request_email_change → enlace de confirmación al email NUEVO.
// Estado, comisión y proyectos: solo admin.
const EDITABLE = ['agency_name', 'manager_name', 'phone', 'whatsapp', 'website', 'country'] as const;
type Editable = typeof EDITABLE[number];

export default function AgencyProfile({ data, email }: { data: AgencyData; email: string | undefined }) {
  const { t } = useTranslation();
  const { partner, setPartner } = data;
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [linkCopied, setLinkCopied] = useState(false);
  const [form, setForm] = useState<Record<Editable, string> | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [emailMsg, setEmailMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const shortMine = useShortLink(partner ? catalogLink(partner) : null);
  if (!partner) return null;

  const startEdit = () => { setSaveError(''); setEmailMsg(null); setNewEmail(partner.email ?? ''); setForm(Object.fromEntries(EDITABLE.map((k) => [k, partner[k] ?? ''])) as Record<Editable, string>); };
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    setSaveError('');
    if (!form.agency_name.trim()) { setSaving(false); setSaveError(t('agencyPortal.profile.nameRequired')); return; }
    const patch = Object.fromEntries(EDITABLE.map((k) => [k, form[k].trim() || null])) as Record<Editable, string | null>;
    const { error } = await supabase.from('listing_partners').update(patch).eq('id', partner.id);
    if (error) { setSaving(false); setSaveError(t('agencyFunnel.err.generic')); return; }
    setPartner({ ...partner, ...patch });
    const e2 = newEmail.trim().toLowerCase();
    if (e2 && e2 !== String(partner.email ?? '').toLowerCase()) {
      const { data: r, error: ee } = await supabase.functions.invoke('agency-hub', { body: { action: 'request_email_change', email: e2, lang: partner.lang } });
      if (ee || !(r as any)?.ok) { setSaving(false); setSaveError(t(`agencyPortal.profile.emailErr.${(r as any)?.error ?? 'generic'}`, { defaultValue: t('agencyFunnel.err.generic') })); return; }
      setEmailMsg({ ok: true, text: t('agencyPortal.profile.emailSent', { email: e2 }) });
    }
    setSaving(false);
    setForm(null);
  };
  const link = shortMine ?? catalogLink(partner);

  const copyLink = async () => {
    if (await copyText(link, t('agenciasDashboard.copyPersonalLinkPrompt'))) { setLinkCopied(true); setTimeout(() => setLinkCopied(false), 2200); }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const bad = logoFileError(file);
    if (bad) { setUploadError(t(bad === 'size' ? 'agenciasDashboard.logoErrorSize' : 'agenciasDashboard.logoErrorType')); return; }
    setUploading(true);
    setUploadError('');
    try {
      const logoUrl = await uploadPartnerLogo(partner.id, file);
      setPartner({ ...partner, logo_url: logoUrl });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
    }
  };

  const fields: [string, string | null | undefined][] = [
    [t('agencyPortal.profile.agency'), partner.agency_name],
    [t('agencyPortal.profile.manager'), partner.manager_name],
    [t('agencyPortal.profile.email'), partner.email ?? email],
    [t('agencyPortal.profile.phone'), partner.phone],
    [t('agencyPortal.profile.whatsapp'), partner.whatsapp],
    [t('agencyPortal.profile.website'), partner.website],
    [t('agencyPortal.profile.country'), partner.country],
    [t('agencyPortal.profile.status'), t(`agencyPortal.profile.st.${partner.status}`, { defaultValue: partner.status })],
    [t('agencyPortal.profile.since'), partner.created_at ? fmtDate(partner.created_at) : null],
  ];

  return (
    <div className="animate-in fade-in duration-500">
      <SectionTitle title={t('agencyPortal.nav.profile')} sub={t('agencyPortal.profile.sub')} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 [&>*]:min-w-0">
        <section className={card}>
          <h3 className="text-sm font-black uppercase tracking-widest text-primary/40 mb-1">{t('agenciasDashboard.logoTitle')}</h3>
          <p className="text-xs text-primary/60 mb-4">{t('agenciasDashboard.logoBody')}</p>
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center overflow-hidden shrink-0">
              {partner.logo_url
                ? <img src={partner.logo_url} alt={partner.agency_name} className="w-full h-full object-contain" />
                : <span className="material-symbols-outlined text-3xl text-primary/20">storefront</span>}
            </div>
            <div className="min-w-0">
              <label className={`${btnPrimary} cursor-pointer ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
                <span className="material-symbols-outlined text-base">upload</span>
                {uploading ? t('agenciasDashboard.logoUploading') : partner.logo_url ? t('agenciasDashboard.logoChange') : t('agenciasDashboard.logoUpload')}
                <input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" onChange={handleLogoUpload} disabled={uploading} className="hidden" />
              </label>
              <p className="text-[10px] text-primary/40 mt-2">{t('agenciasDashboard.logoFormatHint')}</p>
              {uploadError && <p className="text-[11px] text-red-600 mt-1">{uploadError}</p>}
            </div>
          </div>
        </section>

        <section className="bg-primary text-white rounded-2xl p-5 shadow-sm">
          <h3 className="text-sm font-black uppercase tracking-widest text-white/50 mb-1">{t('agenciasDashboard.linkTitle')}</h3>
          <p className="text-xs text-white/70 mb-4">{t('agenciasDashboard.linkBody')}</p>
          <div className="bg-white/10 rounded-xl p-3 mb-3">
            <code className="text-[11px] break-all text-white/90">{link}</code>
          </div>
          <button onClick={copyLink} className={`w-full text-xs font-bold uppercase tracking-widest px-4 py-2.5 rounded-xl transition ${linkCopied ? 'bg-green-500 text-white' : 'bg-white text-primary hover:bg-gray-100'}`}>
            {linkCopied ? t('agencyPortal.copiedShort') : t('agencyPortal.copyMyLink')}
          </button>
        </section>

        <section className={`${card} lg:col-span-2`}>
          <div className="flex items-center justify-between gap-3 mb-4">
            <h3 className="text-sm font-black uppercase tracking-widest text-primary/40">{t('agencyPortal.profile.data')}</h3>
            {!form && <button type="button" onClick={startEdit} className={btnGhost}><span className="material-symbols-outlined text-base">edit</span>{t('agencyPortal.profile.edit')}</button>}
          </div>
          {form ? (
            <form onSubmit={save} className="grid sm:grid-cols-2 gap-4">
              {EDITABLE.map((k) => (
                <label key={k} className="block text-xs text-primary/60 min-w-0">
                  {t(`agencyPortal.profile.${k === 'manager_name' ? 'manager' : k === 'agency_name' ? 'agency' : k}`)}
                  <input value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} type={k === 'phone' || k === 'whatsapp' ? 'tel' : k === 'website' ? 'url' : 'text'} required={k === 'agency_name'} className={`${input} mt-1`} />
                </label>
              ))}
              <label className="block text-xs text-primary/60 sm:col-span-2 min-w-0">
                {t('agencyPortal.profile.email')}
                <input value={newEmail} onChange={(e) => setNewEmail(e.target.value)} type="email" autoComplete="email" className={`${input} mt-1`} data-profile-email />
                <span className="block text-[11px] text-primary/40 mt-1">{t('agencyPortal.profile.emailHint')}</span>
              </label>
              {saveError && <p className="sm:col-span-2 text-[11px] text-red-600">{saveError}</p>}
              <div className="sm:col-span-2 flex gap-2">
                <button type="submit" disabled={saving} className={btnPrimary}>{t('common.save')}</button>
                <button type="button" onClick={() => setForm(null)} className={btnGhost}>{t('common.cancel')}</button>
              </div>
            </form>
          ) : (
          <dl className="grid sm:grid-cols-2 gap-x-8 gap-y-3">
            {fields.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 border-b border-gray-50 pb-2 text-sm">
                <dt className="text-primary/50 shrink-0">{k}</dt>
                <dd className="text-primary font-medium text-right break-all">{v || '—'}</dd>
              </div>
            ))}
          </dl>
          )}
          {emailMsg && <p className={`text-sm rounded-xl px-4 py-3 mt-4 ${emailMsg.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}>{emailMsg.text}</p>}
          {partner.pending_email && !emailMsg && <p className="text-xs text-amber-800 bg-amber-50 rounded-xl px-4 py-3 mt-4">{t('agencyPortal.profile.emailPending', { email: partner.pending_email })}</p>}
          <p className="text-xs text-primary/40 mt-4">{t('agencyPortal.profile.editHint')}</p>
        </section>
      </div>
    </div>
  );
}
