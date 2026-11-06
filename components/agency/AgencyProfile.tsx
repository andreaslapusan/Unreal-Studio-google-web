/** Mi agencia: logo, link personal (atribución) y datos de la agencia. */
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { AgencyData, catalogLink, copyText, fmtDate } from './useAgencyData';
import { logoFileError, uploadPartnerLogo } from './partnerLogo';
import { card, btnPrimary, btnGhost, input, SectionTitle } from './ui';

// Lo que la agencia puede editar ella misma (RLS + trigger impiden tocar estado/proyectos/email).
const EDITABLE = ['manager_name', 'phone', 'whatsapp', 'website', 'country'] as const;
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
  if (!partner) return null;

  const startEdit = () => { setSaveError(''); setForm(Object.fromEntries(EDITABLE.map((k) => [k, partner[k] ?? ''])) as Record<Editable, string>); };
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    setSaveError('');
    const patch = Object.fromEntries(EDITABLE.map((k) => [k, form[k].trim() || null])) as Record<Editable, string | null>;
    const { error } = await supabase.from('listing_partners').update(patch).eq('id', partner.id);
    setSaving(false);
    if (error) { setSaveError(error.message); return; }
    setPartner({ ...partner, ...patch });
    setForm(null);
  };
  const link = catalogLink(partner);

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
                <label key={k} className="block text-xs text-primary/60">
                  {t(`agencyPortal.profile.${k === 'manager_name' ? 'manager' : k}`)}
                  <input value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} type={k === 'website' ? 'url' : k === 'phone' || k === 'whatsapp' ? 'tel' : 'text'} className={`${input} mt-1`} />
                </label>
              ))}
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
          <p className="text-xs text-primary/40 mt-4">{t('agencyPortal.profile.editHint')}</p>
        </section>
      </div>
    </div>
  );
}
