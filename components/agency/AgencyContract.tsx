/** Contrato: 1) descargar la plantilla real · 2) subir la copia firmada · 3) descargar la contrafirmada; + solicitar contrato (agency_requests type='contract'). Sin resúmenes generados (no coincidían con el contrato real). */
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { AgencyData } from './useAgencyData';
import { RequestRow } from './AgencyRequests';
import AgencyProjectAgreements from './AgencyProjectAgreements';
import { card, btnPrimary, btnGhost, SectionTitle } from './ui';

export default function AgencyContract({ data }: { data: AgencyData }) {
  const { t } = useTranslation();
  const { partner, requests } = data;
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [mine2, setMine2] = useState<{ path: string | null; at: string | null }>({ path: partner?.agency_signed_path ?? null, at: partner?.agency_signed_uploaded_at ?? null });
  const [uploading, setUploading] = useState(false);
  if (!partner) return null;

  const mine = requests.filter((r) => r.type === 'contract');

  // Contrato en 3 pasos (bucket PRIVADO agency-contracts, enlaces firmados de 10 min, solo su carpeta):
  // 1) plantilla (ES = PDF generado con sus condiciones; resto = plantilla EN|ID) · 2) sube su copia firmada · 3) descarga la contrafirmada
  const signedPath = partner.signed_contract_path ?? null;
  const countersigned = !!signedPath && (!mine2.at || !partner.signed_contract_uploaded_at || partner.signed_contract_uploaded_at >= mine2.at);
  const fromBucket = async (path: string) => {
    setMsg(null);
    const { data: s, error } = await supabase.storage.from('agency-contracts').createSignedUrl(path, 600, { download: path.split('/').pop()! });
    if (error || !s?.signedUrl) { setMsg({ ok: false, text: t('agencyFunnel.err.generic') }); return; }
    window.location.href = s.signedUrl;
  };
  // plantilla REAL del contrato (bucket): mercado ES → ES|ID si existe, si no EN|ID; resto → EN|ID. Nunca el resumen generado.
  const template = async () => {
    if (partner.market === 'es') {
      const { data: s } = await supabase.storage.from('agency-contracts').createSignedUrl('templates/Unreal-Studio-Agency-Agreement-ES-ID.pdf', 600, { download: 'Unreal-Studio-Agency-Agreement-ES-ID.pdf' });
      if (s?.signedUrl) { window.location.href = s.signedUrl; return; }
    }
    await fromBucket('templates/Unreal-Studio-Agency-Agreement-EN-ID.pdf');
  };
  const uploadSigned = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!/^(application\/pdf|image\/(jpeg|png))$/.test(file.type) || file.size > 20 * 1024 * 1024) { setMsg({ ok: false, text: t('agencyPortal.contract.badFile') }); return; }
    setUploading(true); setMsg(null);
    const ext = file.type === 'application/pdf' ? 'pdf' : file.type === 'image/png' ? 'png' : 'jpg';
    const path = `${partner.id}/agency-signed-${new Date().toISOString().replace(/[:.]/g, '-')}.${ext}`;
    const up = await supabase.storage.from('agency-contracts').upload(path, file, { contentType: file.type });
    const reg = up.error ? null : await supabase.rpc('agency_set_signed_upload', { p_path: path });
    setUploading(false);
    if (up.error || reg?.error || !(reg?.data as any)?.success) { setMsg({ ok: false, text: t('agencyFunnel.err.generic') }); return; }
    setMine2({ path, at: new Date().toISOString() });
    setMsg({ ok: true, text: t('agencyPortal.contract.uploadedOk') });
  };
  const fmtD = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString() : '');

  return (
    <div className="animate-in fade-in duration-500 space-y-6">
      <SectionTitle title={t('agencyPortal.nav.contract')} sub={t('agencyPortal.contract.sub')} />
      {msg && (
        <p className={`text-sm rounded-xl px-4 py-3 ${!msg.ok ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-800'}`}>{msg.text}</p>
      )}

      <section className={`${card} !p-0 overflow-hidden`} data-contract-steps>
        <h3 className="text-sm font-black uppercase tracking-widest text-primary/40 px-5 pt-5 pb-2">{t('agencyPortal.contract.stepsTitle')}</h3>
        <ol className="divide-y divide-gray-100">
          {[
            { n: 1, done: !!mine2.path, title: t('agencyPortal.contract.step1'), sub: t('agencyPortal.contract.step1Sub'),
              action: <button onClick={() => void template()} className={btnGhost}><span className="material-symbols-outlined text-base">download</span>{t('agencyPortal.contract.step1Btn')}</button> },
            { n: 2, done: !!mine2.path, title: t('agencyPortal.contract.step2'), sub: mine2.path ? t('agencyPortal.contract.step2Done', { date: fmtD(mine2.at) }) : t('agencyPortal.contract.step2Sub'),
              action: <label className={`${mine2.path ? btnGhost : btnPrimary} cursor-pointer ${uploading ? 'opacity-50 pointer-events-none' : ''}`} data-signed-upload>
                <span className="material-symbols-outlined text-base">upload</span>{uploading ? t('agencyPortal.contract.uploading') : mine2.path ? t('agencyPortal.contract.step2Again') : t('agencyPortal.contract.step2Btn')}
                <input type="file" accept="application/pdf,image/jpeg,image/png" className="hidden" onChange={(e) => void uploadSigned(e)} />
              </label> },
            { n: 3, done: countersigned, title: t('agencyPortal.contract.step3'), sub: countersigned ? t('agencyPortal.contract.step3Done', { date: fmtD(partner.signed_contract_uploaded_at) }) : t('agencyPortal.contract.step3Sub'),
              action: countersigned ? <button onClick={() => void fromBucket(signedPath!)} className={btnPrimary} data-signed-contract><span className="material-symbols-outlined text-base">download</span>{t('agencyPortal.contract.signedDownload')}</button> : null },
          ].map((st) => (
            <li key={st.n} className="px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3">
              <span className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-sm font-black ${st.done ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-primary/50'}`}>{st.done ? <span className="material-symbols-outlined text-base">check</span> : st.n}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-primary">{st.title}</p>
                <p className="text-xs text-primary/60 mt-0.5">{st.sub}</p>
              </div>
              {st.action && <div className="shrink-0">{st.action}</div>}
            </li>
          ))}
        </ol>
      </section>

      <AgencyProjectAgreements data={data} />

      {mine.length > 0 && (
        <section>
          <h3 className="text-sm font-black uppercase tracking-widest text-primary/40 mb-3">{t('agencyPortal.contract.history')}</h3>
          <div className={`${card} !p-0 overflow-hidden`}><ul className="divide-y divide-gray-100">{mine.map((r) => <RequestRow key={r.id} r={r} />)}</ul></div>
        </section>
      )}
    </div>
  );
}
