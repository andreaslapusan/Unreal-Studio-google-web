/**
 * Asistente virtual de Ayuda (portal de agencias): botón flotante abajo a la derecha (solo en Ayuda).
 * Edge fn agency-assistant (Groq gratis, conocimiento propio, límites por agencia, registro para el admin);
 * si no sabe → "lo paso al equipo" + aviso al admin. Portal a <body> para que iOS no lo recorte.
 */
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';

interface Msg { role: 'user' | 'assistant'; content: string }

export default function AgencyAssistant() {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement | null>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [msgs, busy, open]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = text.trim();
    if (!q || busy) return;
    const history = msgs.slice(-6);
    setMsgs((m) => [...m, { role: 'user', content: q }]);
    setText(''); setBusy(true);
    const { data, error } = await supabase.functions.invoke('agency-assistant', { body: { message: q, lang: (i18n.language || 'en').slice(0, 2), history } });
    setBusy(false);
    setMsgs((m) => [...m, { role: 'assistant', content: !error && (data as any)?.answer ? (data as any).answer : t('agencyPortal.assistant.error') }]);
  };

  return createPortal(
    <>
      {!open && (
        <button type="button" onClick={() => setOpen(true)} data-assistant-open aria-label={t('agencyPortal.assistant.open')}
          className="fixed z-[120] right-4 bottom-4 sm:right-6 sm:bottom-6 flex items-center gap-2 bg-primary text-white pl-4 pr-5 h-12 rounded-full shadow-xl hover:bg-black transition"
          style={{ marginBottom: 'env(safe-area-inset-bottom)' }}>
          <span className="material-symbols-outlined text-xl">support_agent</span>
          <span className="text-xs font-bold uppercase tracking-wider">{t('agencyPortal.assistant.title')}</span>
        </button>
      )}
      {open && (
        <div role="dialog" aria-label={t('agencyPortal.assistant.title')} data-assistant-panel
          className="modal-keep fixed z-[120] inset-x-0 bottom-0 sm:inset-x-auto sm:right-6 sm:bottom-6 sm:w-[380px] h-[70vh] sm:h-[560px] bg-white sm:rounded-3xl rounded-t-3xl shadow-2xl border border-primary/10 flex flex-col overflow-hidden"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
          <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-gray-100">
            <div className="flex items-center gap-2 min-w-0">
              <span className="material-symbols-outlined text-primary">support_agent</span>
              <div className="min-w-0">
                <p className="text-sm font-bold text-primary truncate">{t('agencyPortal.assistant.title')}</p>
                <p className="text-[11px] text-primary/50 truncate">{t('agencyPortal.assistant.sub')}</p>
              </div>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label={t('admin.common.close')} className="p-2 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-primary transition shrink-0"><span className="material-symbols-outlined">close</span></button>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-almond/30">
            <p className="text-sm bg-white rounded-2xl rounded-tl-sm px-4 py-3 text-primary/80 max-w-[85%] shadow-sm">{t('agencyPortal.assistant.hello')}</p>
            {msgs.map((m, i) => (
              <p key={i} className={`text-sm rounded-2xl px-4 py-3 max-w-[85%] whitespace-pre-wrap break-words shadow-sm ${m.role === 'user' ? 'ml-auto bg-primary text-white rounded-tr-sm' : 'bg-white text-primary/80 rounded-tl-sm'}`} data-assistant-msg={m.role}>{m.content}</p>
            ))}
            {busy && <p className="text-sm bg-white rounded-2xl px-4 py-3 text-primary/40 max-w-[85%] shadow-sm">{t('agencyPortal.assistant.typing')}</p>}
            <div ref={end} />
          </div>
          <form onSubmit={send} className="flex items-center gap-2 p-3 border-t border-gray-100">
            <input value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} placeholder={t('agencyPortal.assistant.placeholder')} aria-label={t('agencyPortal.assistant.placeholder')}
              className="flex-1 min-w-0 border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white text-primary focus:outline-none focus:border-primary/40" />
            <button type="submit" disabled={busy || !text.trim()} aria-label={t('agencyPortal.assistant.send')} className="h-10 w-10 shrink-0 rounded-xl bg-primary text-white flex items-center justify-center disabled:opacity-40"><span className="material-symbols-outlined text-lg">send</span></button>
          </form>
        </div>
      )}
    </>, document.body,
  );
}
