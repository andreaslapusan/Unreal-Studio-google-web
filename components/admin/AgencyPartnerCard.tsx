/**
 * Ficha de agencia en el admin — copia 1:1 de la ficha de cliente (AdminDashboard, vista Clientes):
 * casilla de selección · nombre + estado · email/teléfono · último acceso + accesos 7/30 días · contraseña (clic copia)
 * + hash · notas · botones Editar / Plantillas de email / WhatsApp / Borrar · "Proyectos asignados (n)" con "+ Asignar"
 * y sub-fichas por proyecto (Drive, editar asignación, desactivar). Activa/Inactiva = interruptor verde/rojo que solo
 * se guarda con "Guardar cambios" (admin_set_agency_projects).
 */
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { uiLocale } from '../../lib/dateLocale';
import { SheetModal, StateSwitch, Toast, closeBtnCls, fieldCls, labelCls, saveBtnCls, useErrText } from './agencyAdminUi';
import AgencyMailCenter from './AgencyMailCenter';
import { AgencyLeadsPanel, AgencyRequestsPanel } from './AgencyActivityPanels';
import { shortProjectName } from '../agency/useAgencyData';
import { fold } from '../../lib/fold';

// type-to-confirm: case/accent/whitespace-insensitive (the label is shown uppercase by CSS)
const sameName = (a: unknown, b: unknown) => fold(a).replace(/\s+/g, ' ').trim() === fold(b).replace(/\s+/g, ' ').trim();

export interface CardProject { id: string; name: string; default_on: boolean; drive_url: string | null }
export interface CardPassword { password_plain: string | null; temp_password: string | null; must_change_password: boolean }
export interface CardAccount { hash: string | null; last_login: string | null; logins_7d: number; logins_30d: number }

interface Props {
  partner: Record<string, any>;
  stats: Record<string, any>;
  projects: CardProject[];
  access: Record<string, boolean>; // project_id → is_active override for this partner
  password?: CardPassword;
  account?: CardAccount;
  requests: any[]; // agency_requests type project_contract
  unseen: { leads: number; reqs: number };
  onSeen: () => void;
  onEdit: () => void;
  onSaved: () => Promise<void> | void;
  toast: Toast;
}

const STATUS_STYLE: Record<string, string> = { approved: 'bg-green-50 text-green-600', suspended: 'bg-red-50 text-red-600', pending: 'bg-amber-50 text-amber-600', rejected: 'bg-red-50 text-red-600' };
const iconBtn = 'p-2.5 rounded-xl transition';
const subBtn = 'transition p-1.5 rounded-lg';

const AgencyPartnerCard: React.FC<Props> = ({ partner: p, stats: s, projects, access, password, account, requests, unseen, onSeen, onEdit, onSaved, toast }) => {
  const { t } = useTranslation();
  const errText = useErrText();
  const saved = useMemo(() => Object.fromEntries(projects.map((pr) => [pr.id, access[pr.id] ?? pr.default_on])) as Record<string, boolean>, [projects, access]);
  const [modal, setModal] = useState<null | 'mail' | 'assign' | 'delete' | 'leads' | 'reqs' | { project: CardProject }>(null);
  const [draft, setDraft] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [typed, setTyped] = useState('');
  const activeCount = projects.filter((pr) => saved[pr.id]).length;

  const saveProjects = async (items: { project_id: string; is_active: boolean }[]) => {
    if (!items.length) { setModal(null); return; }
    setBusy(true);
    const { data, error } = await supabase.rpc('admin_set_agency_projects', { p_partner: p.id, p_items: items });
    setBusy(false);
    if (error || !(data as any)?.success) { toast(errText(error ?? (data as any)?.error), false); return; }
    toast(t('admin.agencyCard.projectsSaved'));
    setModal(null); setDraft({});
    await onSaved();
  };
  const openModal = (m: typeof modal) => { setDraft({}); setTyped(''); setModal(m); };
  const draftItems = (): { project_id: string; is_active: boolean }[] => Object.entries(draft).filter(([id, on]) => saved[id] !== on).map(([project_id, is_active]) => ({ project_id, is_active: !!is_active }));

  const remove = async () => {
    setBusy(true);
    const { data, error } = await supabase.rpc('admin_set_partner_status', { p_id: p.id, p_status: 'deleted', p_reason: null });
    setBusy(false);
    if (error || (data as any)?.status !== 'ok') { toast(errText(error ?? (data as any)?.status), false); return; }
    toast(t('agencyFunnel.admin.statusOk.deleted', { name: p.agency_name }));
    setModal(null);
    await onSaved();
  };

  // contrato firmado: bucket privado agency-contracts/<partner_id>/…; sustituir borra el anterior
  const viewContract = async (path: string) => {
    const w = window.open('', '_blank'); // abrir antes del await: iOS bloquea popups tras una promesa
    const { data, error } = await supabase.storage.from('agency-contracts').createSignedUrl(path, 600);
    if (error || !data?.signedUrl) { w?.close(); toast(errText(error), false); return; }
    if (w) w.location.href = data.signedUrl; else window.location.href = data.signedUrl;
  };
  const uploadContract = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.type !== 'application/pdf' || file.size > 20 * 1024 * 1024) { toast(t('admin.agencyCard.contractBadFile'), false); return; }
    setBusy(true);
    const safe = file.name.normalize('NFD').replace(/[^\w.-]+/g, '-').replace(/-+/g, '-').slice(-120);
    const path = `${p.id}/${new Date().toISOString().slice(0, 10)}-${safe}`;
    const up = await supabase.storage.from('agency-contracts').upload(path, file, { upsert: true, contentType: 'application/pdf' });
    if (up.error) { setBusy(false); toast(errText(up.error), false); return; }
    const { error } = await supabase.from('listing_partners').update({ signed_contract_path: path, signed_contract_uploaded_at: new Date().toISOString() }).eq('id', p.id);
    if (error) { setBusy(false); toast(errText(error), false); return; }
    if (p.signed_contract_path && p.signed_contract_path !== path) await supabase.storage.from('agency-contracts').remove([p.signed_contract_path]);
    setBusy(false);
    toast(t('admin.agencyCard.contractUploaded'));
    await onSaved();
  };

  // plantilla de contrato de proyecto por solicitud → agency-contracts/<partner>/requests/<request>/template-…pdf
  const uploadTemplate = async (r: any, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.type !== 'application/pdf' || file.size > 20 * 1024 * 1024) { toast(t('admin.agencyCard.contractBadFile'), false); return; }
    setBusy(true);
    const safe = file.name.normalize('NFD').replace(/[^\w.-]+/g, '-').replace(/-+/g, '-').slice(-100);
    const path = `${p.id}/requests/${r.id}/template-${safe}`;
    const up = await supabase.storage.from('agency-contracts').upload(path, file, { upsert: true, contentType: 'application/pdf' });
    const { error } = up.error ? { error: up.error } : await supabase.from('agency_requests').update({ template_path: path, template_uploaded_at: new Date().toISOString() }).eq('id', r.id);
    if (!error && r.template_path && r.template_path !== path) await supabase.storage.from('agency-contracts').remove([r.template_path]);
    setBusy(false);
    if (error) { toast(errText(error), false); return; }
    toast(t('admin.agencyCard.templateUploaded'));
    await onSaved();
  };

  const pw = password?.password_plain || password?.temp_password || null;
  const copy = (v: string, key: string) => { void navigator.clipboard?.writeText(v); toast(t(key)); };
  const wa = String(p.whatsapp || p.phone || '').replace(/[^\d]/g, '');
  const lastLogin = account?.last_login || s.last_sign_in_at;
  const editing = modal && typeof modal === 'object' ? modal.project : null;
  const editOn = editing ? (draft[editing.id] ?? saved[editing.id]) : false;

  return (
    <>
    <div className="bg-[#f7f1ea] rounded-2xl border border-[#e4d8c9] shadow-sm overflow-hidden" data-agency-card={p.id}>
      <div className="p-5 sm:p-6 flex flex-col sm:flex-row sm:items-start gap-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <h3 className="text-base sm:text-lg font-bold text-primary break-words">{p.agency_name}</h3>
              <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${STATUS_STYLE[p.status] ?? 'bg-gray-100'}`}>{t(`admin.partnerStatus.${p.status}`, { defaultValue: p.status })}</span>
              {p.is_demo && <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{t('agencyFunnel.admin.demo')}</span>}
            </div>
            <p className="text-sm text-gray-500 break-words">{p.email}{(p.whatsapp || p.phone) && ` · ${p.whatsapp || p.phone}`}</p>
            <p className="text-xs text-primary/60 mt-0.5 break-words">
              {[p.manager_name, p.country, t(`agencyFunnel.admin.marketOpt.${p.market}`, { defaultValue: p.market ?? '' })].filter(Boolean).join(' · ')}
            </p>
            <p className="text-xs font-bold text-primary mt-0.5">{t('agencyFunnel.admin.closePct')}: {p.commission_close_pct ?? '—'}% · {t('agencyFunnel.admin.referralPct')}: {p.commission_referral_pct ?? '—'}%</p>
            <p className="text-[11px] text-primary/60 mt-0.5 break-all" title={t('admin.agencyCard.refHint')}>
              <span className="material-symbols-outlined text-xs align-middle">tag</span> {t('admin.agencyCard.ref')}: <span className="font-mono font-bold text-primary cursor-pointer" onClick={() => copy(String(p.personal_link_slug ?? p.id).toUpperCase(), 'admin.agencyCard.refCopied')} data-agency-ref>{String(p.personal_link_slug ?? p.id).toUpperCase()}</span>
            </p>
            {lastLogin && (
              <p className="text-[11px] text-green-700 font-medium mt-0.5"><span className="material-symbols-outlined text-xs align-middle">login</span> {t('admin.clientsTab.lastLogin')}: {new Date(lastLogin).toLocaleString(uiLocale(), { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })} · {t('admin.dash.portalLogins', { d7: account?.logins_7d ?? 0, d30: account?.logins_30d ?? 0 })}</p>
            )}
            <p className="text-[11px] text-primary/50 mt-0.5">{t('agencyFunnel.admin.counts', { leads: s.leads ?? 0, res: s.reservations ?? 0, sales: s.sales ?? 0 })}</p>
            <div className="mt-1 space-y-0.5">
              {pw ? (
                <p className="text-[10px] text-orange-500 font-mono cursor-pointer hover:bg-orange-50 rounded px-1 inline-block break-all" onClick={() => copy(pw, 'admin.dash.passwordCopied')} title={t('admin.dash.clickToCopy')} data-agency-pw>
                  <span className="material-symbols-outlined text-xs align-middle">key</span> {pw}
                  {password?.must_change_password && <span className="text-red-400 ml-2">{t('admin.dash.temporary')}</span>}
                </p>
              ) : account && (
                <p className="text-[10px] text-gray-400 px-1" data-agency-pw><span className="material-symbols-outlined text-xs align-middle">key</span> {t('admin.agencyCard.noPassword')}</p>
              )}
              {account?.hash && (
                <p className="text-[9px] text-gray-300 font-mono truncate max-w-[200px] cursor-pointer hover:bg-gray-50 rounded px-1 block" onClick={() => copy(account.hash!, 'admin.dash.hashCopied')} title={t('admin.dash.clickToCopyHash')}>🔒 {account.hash}...</p>
              )}
            </div>
            {(() => {
              const uploaded = !!p.agency_signed_path;
              const done = !!p.signed_contract_path && (!p.agency_signed_uploaded_at || !p.signed_contract_uploaded_at || p.signed_contract_uploaded_at >= p.agency_signed_uploaded_at);
              const [cls, key] = done ? ['bg-green-50 text-green-600', 'cStatusDone'] : uploaded ? ['bg-amber-50 text-amber-700', 'cStatusUploaded'] : ['bg-gray-100 text-gray-500', 'cStatusPending'];
              const d = (iso: string | null) => (iso ? ` · ${new Date(iso).toLocaleDateString(uiLocale())}` : '');
              return (
                <div className="mt-2 flex items-center gap-x-2 gap-y-1.5 flex-wrap" data-agency-contract>
                  <span className="material-symbols-outlined text-sm text-primary/50">description</span>
                  <span className="text-[11px] font-bold text-primary">{t('admin.agencyCard.contract')}:</span>
                  <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${cls}`} data-contract-status={key}>{t(`admin.agencyCard.${key}`)}</span>
                  {uploaded && <button type="button" onClick={() => void viewContract(p.agency_signed_path)} className="text-[11px] font-bold text-primary underline underline-offset-2">{t('admin.agencyCard.agencyCopy')}{d(p.agency_signed_uploaded_at)}</button>}
                  {p.signed_contract_path && <button type="button" onClick={() => void viewContract(p.signed_contract_path)} className="text-[11px] font-bold text-green-700 underline underline-offset-2">{t('admin.agencyCard.countersigned')}{d(p.signed_contract_uploaded_at)}</button>}
                  <label className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg bg-white border border-gray-200 text-primary cursor-pointer hover:bg-almond ${busy ? 'opacity-50 pointer-events-none' : ''}`}>
                    {p.signed_contract_path ? t('admin.agencyCard.contractReplace') : t('admin.agencyCard.uploadFinal')}
                    <input type="file" accept="application/pdf" className="hidden" onChange={(e) => void uploadContract(e)} />
                  </label>
                </div>
              );
            })()}
            {requests.length > 0 && (
              <div className="mt-2 space-y-1.5" data-agency-proj-reqs>
                {requests.map((r) => (
                  <div key={r.id} className="flex items-center gap-x-2 gap-y-1 flex-wrap text-[11px]">
                    <span className="material-symbols-outlined text-sm text-primary/50">gavel</span>
                    <span className="font-bold text-primary">{r.projects?.name ?? '—'}{r.client_name ? ` · ${r.client_name}` : ''}</span>
                    <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${r.client_signed_path ? 'bg-green-50 text-green-600' : r.template_path ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'}`}>
                      {t(r.client_signed_path ? 'admin.agencyCard.reqClientSigned' : r.template_path ? 'admin.agencyCard.reqTemplateSent' : 'admin.agencyCard.reqPending')}
                    </span>
                    {r.template_path && <button type="button" onClick={() => void viewContract(r.template_path)} className="font-bold text-primary underline underline-offset-2">{t('admin.agencyCard.reqTemplate')}</button>}
                    {r.client_signed_path && <button type="button" onClick={() => void viewContract(r.client_signed_path)} className="font-bold text-green-700 underline underline-offset-2">{t('admin.agencyCard.reqClientCopy')}</button>}
                    <label className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg bg-white border border-gray-200 text-primary cursor-pointer hover:bg-almond ${busy ? 'opacity-50 pointer-events-none' : ''}`}>
                      {r.template_path ? t('admin.agencyCard.contractReplace') : t('admin.agencyCard.reqUploadTemplate')}
                      <input type="file" accept="application/pdf" className="hidden" onChange={(e) => void uploadTemplate(r, e)} />
                    </label>
                  </div>
                ))}
              </div>
            )}
            {p.notes && (
              <details className="mt-2 text-xs text-primary/50">
                <summary className="cursor-pointer select-none font-bold text-[10px] uppercase tracking-widest text-gray-400">{t('admin.agencyCard.internalNotes')}</summary>
                <p className="mt-1 italic break-words">{p.notes}</p>
              </details>
            )}
          </div>
        </div>
        <div className="flex gap-1.5 shrink-0 flex-wrap justify-end">
          <button type="button" onClick={onEdit} className={`${iconBtn} text-primary bg-almond hover:brightness-95`} title={t('admin.agencyCard.settings')} aria-label={t('admin.agencyCard.settings')}><span className="material-symbols-outlined text-sm">edit</span></button>
          {([['leads', 'group', unseen.leads, 'admin.agencyCard.leads'], ['reqs', 'notifications', unseen.reqs, 'admin.agencyCard.reqs']] as const).map(([k, icon, n, label]) => (
            <button key={k} type="button" onClick={() => openModal(k)} className={`relative ${iconBtn} text-primary bg-almond hover:brightness-95`} title={t(label)} aria-label={`${t(label)}${n ? ` (${n})` : ''}`} data-agency-btn={k}>
              <span className="material-symbols-outlined text-sm">{icon}</span>
              {n > 0 && <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-black flex items-center justify-center" data-unseen={n}>{n > 99 ? '99+' : n}</span>}
            </button>
          ))}
          <button type="button" onClick={() => openModal('mail')} className={`${iconBtn} bg-almond text-primary hover:brightness-95`} title={t('admin.agencyCard.templates')} aria-label={t('admin.agencyCard.templates')}><span className="material-symbols-outlined text-sm">mail</span></button>
          {wa
            ? <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer" className={`${iconBtn} bg-green-50 text-green-600 hover:bg-green-100`} title={t('admin.dash.sendWhatsapp')} aria-label={t('admin.dash.sendWhatsapp')}><span className="material-symbols-outlined text-sm">chat</span></a>
            : <span className={`${iconBtn} bg-green-50 text-green-600 opacity-30`} aria-hidden><span className="material-symbols-outlined text-sm">chat</span></span>}
          <button type="button" onClick={() => openModal('delete')} className={`${iconBtn} text-red-500 bg-red-50 hover:bg-red-100`} title={t('agencyFunnel.admin.delete')} aria-label={t('agencyFunnel.admin.delete')}><span className="material-symbols-outlined text-sm">delete</span></button>
        </div>
      </div>

      <div className="border-t border-gray-50 bg-gray-50/50 px-6 py-4">
        <div className="flex justify-between items-center mb-3 gap-2">
          <p className="text-[10px] font-black uppercase text-gray-400 tracking-widest">{t('admin.clientsTab.assignedProjects')} ({activeCount}/{projects.length})</p>
          <button type="button" onClick={() => openModal('assign')} className="bg-primary text-white text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-lg flex items-center gap-1 hover:bg-black transition shrink-0">
            <span className="material-symbols-outlined text-xs">add</span> {t('admin.clientsTab.assign')}
          </button>
        </div>
        {projects.length === 0 ? <p className="text-xs text-gray-300 italic">{t('admin.clientsTab.noProjects')}</p> : (
          <div className="space-y-2">
            {[...projects].sort((x, y) => Number(saved[y.id]) - Number(saved[x.id])).map((pr) => {
              const on = saved[pr.id];
              return (
                <div key={pr.id} data-project-row={on ? 'on' : 'off'} className={`flex items-center justify-between gap-2 rounded-xl pl-3 pr-1.5 py-1.5 border ${on ? 'bg-white border-gray-100' : 'bg-gray-100 border-gray-200'}`}>
                  <div className={`flex items-center gap-2 min-w-0 ${on ? '' : 'opacity-70'}`}>
                    <span className="font-bold text-primary text-sm truncate" title={pr.name}>{shortProjectName(pr.name)}</span>
                    <span className={`shrink-0 text-[9px] font-black uppercase px-2 py-0.5 rounded-full whitespace-nowrap ${on ? 'bg-green-50 text-green-600' : 'bg-red-100 text-red-700'}`}>{on ? t('admin.agencyCard.projActive') : t('admin.agencyCard.projInactive')}</span>
                  </div>
                  <div className="flex gap-1 shrink-0 items-center">
                    {pr.drive_url ? <a href={pr.drive_url} target="_blank" rel="noopener noreferrer" className={`${subBtn} text-amber-700 bg-amber-50 hover:bg-amber-100`} title={t('admin.dash.driveFolder')} aria-label={t('admin.dash.driveFolder')}><span className="material-symbols-outlined text-lg leading-none">folder</span></a>
                      : <span className={`${subBtn} invisible`} aria-hidden><span className="material-symbols-outlined text-lg leading-none">folder</span></span>}
                    <button type="button" onClick={() => openModal({ project: pr })} className={`${subBtn} text-primary bg-primary/5 hover:bg-primary/15`} title={t('admin.dash.editAssignmentTitle')} aria-label={`${t('admin.dash.editAssignmentTitle')} · ${pr.name}`}><span className="material-symbols-outlined text-lg leading-none">edit</span></button>
                    <button type="button" disabled={busy || !on} onClick={() => void saveProjects([{ project_id: pr.id, is_active: false }])} className={`${subBtn} text-red-500 bg-red-50 hover:bg-red-100 disabled:opacity-30`} title={t('admin.agencyCard.deactivate')} aria-label={`${t('admin.agencyCard.deactivate')} · ${pr.name}`}><span className="material-symbols-outlined text-lg leading-none">close</span></button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>

    {/* modals are siblings of the card (and portaled to <body>): iOS clips fixed elements inside it */}
    {modal === 'leads' && <AgencyLeadsPanel partner={p} toast={toast} onClose={() => setModal(null)} onChanged={onSeen} />}
    {modal === 'reqs' && <AgencyRequestsPanel partner={p} toast={toast} onClose={() => { setModal(null); void onSaved(); }} onChanged={onSeen} />}
    {modal === 'mail' && <AgencyMailCenter partner={p} toast={toast} onClose={() => setModal(null)} onSent={onSaved} />}

    {modal === 'assign' && (
      <SheetModal title={t('admin.dash.assignProjectTitle')} subtitle={<>{t('admin.agencyCard.agencyLabel')}: <strong className="text-primary">{p.agency_name}</strong></>} onClose={() => setModal(null)} guard={draftItems().length > 0}>
        <div className="space-y-3">
          {projects.map((pr) => {
            const on = draft[pr.id] ?? saved[pr.id];
            return (
              <div key={pr.id} className={`flex items-center justify-between gap-4 rounded-2xl px-5 py-4 border ${on ? 'bg-gray-50 border-gray-200' : 'bg-red-50 border-red-200'}`}>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-primary break-words">{pr.name}</p>
                  <p className={`text-[11px] font-bold ${on ? 'text-emerald-600' : 'text-red-600'}`}>{on ? t('admin.agencyCard.projActive') : t('admin.agencyCard.projInactive')}</p>
                </div>
                <StateSwitch on={on} onChange={() => setDraft({ ...draft, [pr.id]: !on })} label={`${pr.name}: ${on ? t('admin.agencyCard.projActive') : t('admin.agencyCard.projInactive')}`} />
              </div>
            );
          })}
          <p className="text-[11px] text-gray-400">{t('admin.agencyCard.projectsHint')}</p>
        </div>
        <div className="flex gap-4 pt-6">
          <button type="button" disabled={busy} onClick={() => void saveProjects(draftItems())} className={saveBtnCls}>{busy ? t('admin.adminDash.savingEllipsis') : t('admin.adminDash.saveChanges')}</button>
          <button type="button" onClick={() => setModal(null)} className={closeBtnCls}>{t('admin.dash.close')}</button>
        </div>
      </SheetModal>
    )}

    {editing && (
      <SheetModal title={t('admin.dash.editAssignmentTitle')} subtitle={<><strong className="text-primary">{editing.name}</strong> · {p.agency_name}</>} onClose={() => setModal(null)} guard={draftItems().length > 0}>
        <div className={`flex items-center justify-between gap-4 rounded-2xl px-5 py-4 border ${editOn ? 'bg-gray-50 border-gray-200' : 'bg-red-50 border-red-200'}`}>
          <div className="min-w-0">
            <p className="text-sm font-bold text-primary">{t('admin.dash.assignmentStateLabel')}: <span className={editOn ? 'text-emerald-600' : 'text-red-600'}>{editOn ? t('admin.agencyCard.projActive') : t('admin.agencyCard.projInactive')}</span></p>
            <p className="text-[11px] text-gray-400 mt-0.5">{t('admin.agencyCard.assignmentHint')}</p>
          </div>
          <StateSwitch on={editOn} onChange={() => setDraft({ ...draft, [editing.id]: !editOn })} label={t('admin.dash.assignmentStateLabel')} />
        </div>
        <div className="flex gap-4 pt-6">
          <button type="button" disabled={busy} onClick={() => void saveProjects(draftItems())} className={saveBtnCls}>{busy ? t('admin.adminDash.savingEllipsis') : t('admin.adminDash.saveChanges')}</button>
          <button type="button" onClick={() => setModal(null)} className={closeBtnCls}>{t('admin.dash.close')}</button>
        </div>
      </SheetModal>
    )}

    {modal === 'delete' && (
      <SheetModal title={t('agencyFunnel.admin.deleteTitle', { name: p.agency_name })} subtitle={t('agencyFunnel.admin.deleteBody')} onClose={() => setModal(null)}>
        <label className={labelCls}>{t('agencyFunnel.admin.typeName', { name: p.agency_name })}</label>
        <input value={typed} onChange={(e) => setTyped(e.target.value)} className={fieldCls} autoComplete="off" />
        <div className="flex gap-4 pt-6">
          <button type="button" disabled={busy || sameName(typed, p.agency_name) === false} onClick={() => void remove()} className="flex-1 bg-red-600 text-white py-4 rounded-xl font-bold uppercase tracking-widest text-xs disabled:opacity-40">{t('agencyFunnel.admin.delete')}</button>
          <button type="button" onClick={() => setModal(null)} className="flex-1 bg-gray-100 text-primary py-4 rounded-xl font-bold uppercase tracking-widest text-xs">{t('fix.apm.cancel')}</button>
        </div>
      </SheetModal>
    )}
    </>
  );
};

export default AgencyPartnerCard;
