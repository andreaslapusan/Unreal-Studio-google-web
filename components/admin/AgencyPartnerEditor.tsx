/**
 * Editor de una agencia en el admin (vista Agencias): datos de perfil, logo, estado,
 * link personal y proyectos asignados. Sustituye al prompt() de pegar IDs.
 */
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { logoFileError, uploadPartnerLogo } from '../agency/partnerLogo';

const TEXT_FIELDS = ['agency_name', 'manager_name', 'email', 'phone', 'whatsapp', 'website', 'country', 'personal_link_slug'] as const;
type TextField = typeof TEXT_FIELDS[number];
const STATUSES = ['pending', 'approved', 'rejected'];

interface Props {
  partner: Record<string, any>;
  properties: { id: string; name: string }[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}

const cls = 'mt-1 block w-full rounded-lg border border-primary/20 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40';

export default function AgencyPartnerEditor({ partner, properties, onClose, onSaved }: Props) {
  const { t } = useTranslation();
  const [form, setForm] = useState<Record<TextField, string>>(() => Object.fromEntries(TEXT_FIELDS.map((k) => [k, partner[k] ?? ''])) as Record<TextField, string>);
  const [status, setStatus] = useState<string>(partner.status ?? 'pending');
  const [projects, setProjects] = useState<string[]>(partner.projects_assigned ?? []);
  const [logo, setLogo] = useState<string | null>(partner.logo_url ?? null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const toggle = (id: string) => setProjects((ps) => (ps.includes(id) ? ps.filter((x) => x !== id) : [...ps, id]));

  const onLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const bad = logoFileError(file);
    if (bad) { setErr(t(bad === 'size' ? 'agenciasDashboard.logoErrorSize' : 'agenciasDashboard.logoErrorType')); return; }
    setBusy(true); setErr('');
    try { setLogo(await uploadPartnerLogo(partner.id, file)); } catch (x) { setErr(x instanceof Error ? x.message : String(x)); }
    setBusy(false);
  };

  const save = async () => {
    if (!form.agency_name.trim() || !form.email.trim()) { setErr(t('admin.agencyEdit.errRequired')); return; }
    setBusy(true); setErr('');
    const patch: Record<string, unknown> = Object.fromEntries(TEXT_FIELDS.map((k) => [k, form[k].trim() || null]));
    patch.email = form.email.trim().toLowerCase();
    patch.status = status;
    patch.projects_assigned = projects;
    if (status === 'approved' && !partner.approved_at) patch.approved_at = new Date().toISOString();
    const { error } = await supabase.from('listing_partners').update(patch).eq('id', partner.id);
    setBusy(false);
    if (error) { setErr(error.message); return; }
    await onSaved();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="relative bg-white rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={onClose} aria-label={t('admin.common.close')} className="absolute top-4 right-4 z-10 p-2 rounded-full hover:bg-gray-100 text-gray-400 hover:text-primary transition"><span className="material-symbols-outlined">close</span></button>
        <h2 className="pr-10 font-serif text-2xl mb-4">{t('admin.agencyEdit.title', { name: partner.agency_name })}</h2>

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
          {TEXT_FIELDS.map((k) => (
            <label key={k} className="block text-sm font-medium">
              {t(`admin.agencyEdit.f.${k}`)}
              <input value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} className={cls} />
            </label>
          ))}
          <label className="block text-sm font-medium">
            {t('admin.agencyEdit.f.status')}
            <select value={status} onChange={(e) => setStatus(e.target.value)} className={cls}>
              {STATUSES.map((s) => <option key={s} value={s}>{t(`admin.partnerStatus.${s}`)}</option>)}
            </select>
          </label>
        </div>
        <p className="text-[11px] text-primary/50 mt-2">{t('admin.agencyEdit.slugHint')}</p>

        <h3 className="text-sm font-black uppercase tracking-widest text-primary/40 mt-6 mb-2">{t('admin.agencyEdit.projects', { n: projects.length })}</h3>
        <div className="grid sm:grid-cols-2 gap-1 max-h-60 overflow-y-auto border border-primary/10 rounded-lg p-2">
          {properties.map((p) => (
            <label key={p.id} className="flex items-center gap-2 text-sm py-1 cursor-pointer">
              <input type="checkbox" checked={projects.includes(p.id)} onChange={() => toggle(p.id)} />
              {p.name}
            </label>
          ))}
        </div>

        {err && <p className="text-xs text-red-600 mt-3">{err}</p>}
        <div className="flex gap-2 mt-6">
          <button type="button" disabled={busy} onClick={() => void save()} className="flex-1 bg-primary text-white py-2 rounded-lg disabled:opacity-50">{t('fix.apm.save')}</button>
          <button type="button" onClick={onClose} className="flex-1 bg-white border border-primary/30 text-primary py-2 rounded-lg">{t('fix.apm.cancel')}</button>
        </div>
      </div>
    </div>
  );
}
