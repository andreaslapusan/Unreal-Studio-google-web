/**
 * "Enviar plantillas de email" de una agencia — mismo modal/flujo que el "Enviar correo" de clientes.
 * Bienvenida y recordatorio → agency-hub (welcome / reminder); recuperar contraseña → send-password-reset (portal agencias).
 */
import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { Toast, useErrText } from './agencyAdminUi';

interface Props { partner: Record<string, any>; toast: Toast; onClose: () => void; onSent: () => Promise<void> | void }

export default function AgencyMailCenter({ partner: p, toast, onClose, onSent }: Props) {
  const { t } = useTranslation();
  const errText = useErrText();
  const [busy, setBusy] = useState(false);
  const active = p.status === 'approved';

  const hub = async (action: 'welcome' | 'reminder', okKey: string) => {
    const { data, error } = await supabase.functions.invoke('agency-hub', { body: { action, partner_id: p.id } });
    if (error || !(data as any)?.ok) { toast(errText((data as any)?.error ?? error), false); return; }
    toast(t(okKey, { email: p.email }));
    await onSent();
  };
  const reset = async () => {
    const { data, error } = await supabase.functions.invoke('send-password-reset', {
      body: { email: p.email, portal: 'agencias', lang: p.lang || 'es', redirectTo: 'https://unrealstudiobali.com/auth/reset?portal=agencias' },
    });
    if (error || !(data as any)?.success) { toast(errText((data as any)?.error ?? error), false); return; }
    toast(t('agencyFunnel.admin.resetSent', { email: p.email }));
  };

  const items = [
    { icon: 'waving_hand', title: t('admin.dash.mailWelcome'), desc: t('admin.agencyCard.welcomeDesc'), run: () => hub('welcome', 'agencyFunnel.admin.welcomeSent') },
    { icon: 'lock_reset', title: t('admin.dash.mailReset'), desc: t('admin.agencyCard.resetDesc'), run: reset },
    { icon: 'event', title: t('admin.agencyCard.reminderTitle'), desc: t('admin.agencyCard.reminderDesc'), run: () => hub('reminder', 'admin.agencyCard.reminderSent') },
  ];

  return createPortal(
    <div className="fixed inset-0 z-[150] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-4" onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label={t('admin.agencyCard.templates')} className="relative bg-white w-full sm:max-w-2xl rounded-t-3xl sm:rounded-3xl p-5 sm:p-10 shadow-2xl max-h-[88vh] overflow-y-auto">
        {busy && (
          <div className="absolute inset-0 z-10 bg-white/80 backdrop-blur-sm rounded-t-3xl sm:rounded-3xl flex flex-col items-center justify-center gap-3">
            <span className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
            <span className="text-sm font-bold text-primary">{t('admin.dash.sendingMail')}</span>
          </div>
        )}
        <div className="flex justify-between items-start gap-3 mb-6">
          <div className="min-w-0">
            <h2 className="text-xl sm:text-2xl font-serif text-primary">{t('admin.agencyCard.templates')}</h2>
            <p className="text-sm text-gray-400 mt-1 truncate">{t('admin.dash.sendTo')} <strong className="text-primary">{p.agency_name}</strong> <span className="text-gray-300">· {p.email || '—'}</span></p>
          </div>
          <button type="button" onClick={onClose} aria-label={t('admin.common.close')} className="p-2 text-red-500 bg-red-50 rounded-xl hover:bg-red-100 transition shrink-0"><span className="material-symbols-outlined">close</span></button>
        </div>
        {!active && <p className="text-xs text-red-700 bg-red-50 rounded-lg px-3 py-2 mb-3">{t('admin.agencyCard.notActive')}</p>}
        <div className="space-y-3">
          {items.map((m) => (
            <button key={m.icon} type="button" disabled={busy || !active} onClick={() => { void (async () => { setBusy(true); try { await m.run(); } finally { setBusy(false); } })(); }}
              className="w-full text-left bg-gray-50 hover:bg-almond rounded-xl px-4 sm:px-6 py-4 sm:py-5 transition border border-gray-100 hover:border-primary/20 flex items-center gap-3 sm:gap-4 disabled:opacity-60">
              <span className="material-symbols-outlined text-primary shrink-0">{m.icon}</span>
              <span className="min-w-0">
                <span className="block font-bold text-primary text-sm mb-0.5">{m.title}</span>
                <span className="block text-xs text-gray-400">{m.desc}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>, document.body,
  );
}
