/**
 * Acuerdos de proyecto (portal de agencias › Acuerdos legales): la agencia pide el contrato de un proyecto
 * (solo sus proyectos permitidos) + nombre del cliente opcional → aviso al admin → el admin sube la plantilla PDF
 * de ESA solicitud → la agencia la descarga y sube la copia firmada por su cliente (PDF/JPG/PNG).
 * Ficheros: bucket privado agency-contracts/<partner_id>/requests/<request_id>/… (solo su carpeta).
 */
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { AgencyData, AgencyRequest, shortProjectName } from './useAgencyData';
import { card, btnPrimary, btnGhost, input } from './ui';

export default function AgencyProjectAgreements({ data }: { data: AgencyData }) {
  const { t } = useTranslation();
  const { partner, projects, requests, reloadRequests } = data;
  const options = projects.filter((p) => p.project_id);
  const [projectId, setProjectId] = useState('');
  const [client, setClient] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  if (!partner) return null;
  const mine = requests.filter((r) => r.type === 'project_contract');
  const nameOf = (id?: string | null) => shortProjectName(options.find((p) => p.project_id === id)?.name ?? '') || '—';
  const fmtD = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString() : '');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId) return;
    setBusy('new'); setMsg(null);
    const { error } = await supabase.from('agency_requests').insert({ agency_id: partner.id, type: 'project_contract', project_id: projectId, client_name: client.trim() || null });
    setBusy(null);
    if (error) { setMsg({ ok: false, text: t('agencyFunnel.err.generic') }); return; }
    setProjectId(''); setClient('');
    setMsg({ ok: true, text: t('agencyPortal.contract.projRequested') });
    await reloadRequests();
  };
  const download = async (path: string) => {
    const { data: s, error } = await supabase.storage.from('agency-contracts').createSignedUrl(path, 600, { download: path.split('/').pop()! });
    if (error || !s?.signedUrl) { setMsg({ ok: false, text: t('agencyFunnel.err.generic') }); return; }
    window.location.href = s.signedUrl;
  };
  const upload = async (r: AgencyRequest, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!/^(application\/pdf|image\/(jpeg|png))$/.test(file.type) || file.size > 20 * 1024 * 1024) { setMsg({ ok: false, text: t('agencyPortal.contract.badFile') }); return; }
    setBusy(r.id); setMsg(null);
    const ext = file.type === 'application/pdf' ? 'pdf' : file.type === 'image/png' ? 'png' : 'jpg';
    const path = `${partner.id}/requests/${r.id}/agency-client-signed-${new Date().toISOString().replace(/[:.]/g, '-')}.${ext}`;
    const up = await supabase.storage.from('agency-contracts').upload(path, file, { contentType: file.type });
    const reg = up.error ? null : await supabase.rpc('agency_set_request_client_signed', { p_request: r.id, p_path: path });
    setBusy(null);
    if (up.error || reg?.error || !(reg?.data as any)?.success) { setMsg({ ok: false, text: t('agencyFunnel.err.generic') }); return; }
    setMsg({ ok: true, text: t('agencyPortal.contract.projUploadedOk') });
    await reloadRequests();
  };

  return (
    <section className={`${card} !p-0 overflow-hidden`} data-project-agreements>
      <div className="px-5 pt-5 pb-3">
        <h3 className="text-sm font-black uppercase tracking-widest text-primary/40">{t('agencyPortal.contract.projTitle')}</h3>
        <p className="text-xs text-primary/60 mt-1">{t('agencyPortal.contract.projSub')}</p>
      </div>
      <form onSubmit={submit} className="px-5 pb-4 grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3 items-end">
        <label className="block text-xs text-primary/60 min-w-0">{t('agencyPortal.contract.projProject')}
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)} required className={`${input} mt-1`} data-proj-select>
            <option value="">{t('agencyPortal.contract.projChoose')}</option>
            {options.map((p) => <option key={p.project_id} value={p.project_id}>{shortProjectName(p.name)}</option>)}
          </select>
        </label>
        <label className="block text-xs text-primary/60 min-w-0">{t('agencyPortal.contract.projClient')}
          <input value={client} onChange={(e) => setClient(e.target.value)} maxLength={200} className={`${input} mt-1`} />
        </label>
        <button type="submit" disabled={!projectId || busy === 'new'} className={btnPrimary}><span className="material-symbols-outlined text-base">gavel</span>{t('agencyPortal.contract.projRequest')}</button>
      </form>
      {msg && <p className={`mx-5 mb-4 text-sm rounded-xl px-4 py-3 ${msg.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}>{msg.text}</p>}
      {mine.length > 0 && (
        <ul className="divide-y divide-gray-100 border-t border-gray-100">
          {mine.map((r) => (
            <li key={r.id} className="px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3" data-proj-request={r.id}>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-primary break-words">{nameOf(r.project_id)}{r.client_name ? ` · ${r.client_name}` : ''}</p>
                <p className="text-xs text-primary/60 mt-0.5">
                  {r.client_signed_path ? t('agencyPortal.contract.projStClient', { date: fmtD(r.client_signed_uploaded_at) })
                    : r.template_path ? t('agencyPortal.contract.projStReady', { date: fmtD(r.template_uploaded_at) })
                    : t('agencyPortal.contract.projStRequested', { date: fmtD(r.created_at) })}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 shrink-0">
                {r.template_path && <button type="button" onClick={() => void download(r.template_path!)} className={btnGhost}><span className="material-symbols-outlined text-base">download</span>{t('agencyPortal.contract.projDownload')}</button>}
                {r.template_path && (
                  <label className={`${r.client_signed_path ? btnGhost : btnPrimary} cursor-pointer ${busy === r.id ? 'opacity-50 pointer-events-none' : ''}`}>
                    <span className="material-symbols-outlined text-base">upload</span>{r.client_signed_path ? t('agencyPortal.contract.step2Again') : t('agencyPortal.contract.projUpload')}
                    <input type="file" accept="application/pdf,image/jpeg,image/png" className="hidden" onChange={(e) => void upload(r, e)} />
                  </label>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
