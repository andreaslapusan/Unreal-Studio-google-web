/**
 * Admin actions on one agency (plan item 10): suspend / reactivate, soft delete (type the name to confirm),
 * resend welcome, send password reset. Status changes go through admin_set_partner_status (bans/unbans
 * the agency's login and signs it out); emails through agency-hub / send-password-reset.
 */
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { Modal, Toast, inputCls, pillBtn, useErrText } from './agencyAdminUi';

interface Props { partner: Record<string, any>; onDone: () => Promise<void> | void; toast: Toast }

export default function AgencyPartnerActions({ partner, onDone, toast }: Props) {
  const { t } = useTranslation();
  const errText = useErrText();
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<null | 'delete' | 'suspend'>(null);
  const [typed, setTyped] = useState('');
  const [reason, setReason] = useState('');

  const setStatus = async (status: string) => {
    setBusy(true);
    const { data, error } = await supabase.rpc('admin_set_partner_status', { p_id: partner.id, p_status: status, p_reason: reason || null });
    setBusy(false);
    if (error || (data as any)?.status !== 'ok') { toast(errText(error ?? (data as any)?.status), false); return; }
    toast(t(`agencyFunnel.admin.statusOk.${status}`, { name: partner.agency_name }));
    setConfirm(null); setTyped(''); setReason('');
    await onDone();
  };

  const welcome = async () => {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke('agency-hub', { body: { action: 'welcome', partner_id: partner.id } });
    setBusy(false);
    if (error || !(data as any)?.ok) { toast(errText((data as any)?.error ?? error), false); return; }
    toast(t('agencyFunnel.admin.welcomeSent', { email: partner.email }));
    await onDone();
  };

  const reset = async () => {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke('send-password-reset', {
      body: { email: partner.email, portal: 'agencias', lang: partner.lang || 'es', redirectTo: 'https://unrealstudiobali.com/auth/reset?portal=agencias' },
    });
    setBusy(false);
    if (error || !(data as any)?.success) { toast(errText((data as any)?.error ?? error), false); return; }
    toast(t('agencyFunnel.admin.resetSent', { email: partner.email }));
  };

  const active = partner.status === 'approved';
  return (
    <div className="flex flex-wrap gap-1.5">
      {active && <button type="button" disabled={busy} className={pillBtn} onClick={() => setConfirm('suspend')}>{t('agencyFunnel.admin.suspend')}</button>}
      {!active && <button type="button" disabled={busy} className={pillBtn} onClick={() => void setStatus('approved')}>{t('agencyFunnel.admin.reactivate')}</button>}
      {active && <button type="button" disabled={busy} className={pillBtn} onClick={() => void welcome()}>{t('agencyFunnel.admin.resendWelcome')}</button>}
      {active && <button type="button" disabled={busy} className={pillBtn} onClick={() => void reset()}>{t('agencyFunnel.admin.sendReset')}</button>}
      <button type="button" disabled={busy} className={`${pillBtn} !border-red-200 text-red-700 hover:!bg-red-600`} onClick={() => setConfirm('delete')}>{t('agencyFunnel.admin.delete')}</button>

      {confirm && (
        <Modal title={t(`agencyFunnel.admin.${confirm}Title`, { name: partner.agency_name })} onClose={() => { setConfirm(null); setTyped(''); }}>
          <p className="text-sm text-primary/70 mb-3">{t(`agencyFunnel.admin.${confirm}Body`)}</p>
          <label className="block text-sm font-medium mb-3">{t('agencyFunnel.admin.reason')}
            <input value={reason} onChange={(e) => setReason(e.target.value)} className={inputCls} maxLength={300} />
          </label>
          {confirm === 'delete' && (
            <label className="block text-sm font-medium mb-3">{t('agencyFunnel.admin.typeName', { name: partner.agency_name })}
              <input value={typed} onChange={(e) => setTyped(e.target.value)} className={inputCls} autoComplete="off" />
            </label>
          )}
          <div className="flex gap-2 mt-4">
            <button type="button" disabled={busy || (confirm === 'delete' && typed.trim() !== String(partner.agency_name).trim())}
              onClick={() => void setStatus(confirm === 'delete' ? 'deleted' : 'suspended')}
              className="flex-1 bg-red-600 text-white py-2 rounded-lg disabled:opacity-40">{t(`agencyFunnel.admin.${confirm}`)}</button>
            <button type="button" onClick={() => { setConfirm(null); setTyped(''); }} className="flex-1 bg-white border border-primary/30 text-primary py-2 rounded-lg">{t('fix.apm.cancel')}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
