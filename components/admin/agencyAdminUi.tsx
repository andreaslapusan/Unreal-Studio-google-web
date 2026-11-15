/**
 * Small shared pieces for the admin Agencias view: modal with close X (house rule), toast,
 * a paged Supabase list hook (.range + exact count) and the error → i18n mapping.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

export const inputCls = 'mt-1 block w-full rounded-lg border border-primary/20 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40 bg-white';
export const pillBtn = 'text-[11px] font-bold border border-primary/15 rounded-full px-2.5 py-1 hover:bg-primary hover:text-white transition whitespace-nowrap disabled:opacity-40';
export const PAGE = 20;

interface ModalProps { title: string; onClose: () => void; children: React.ReactNode; guard?: boolean }

/** Modal: X top-right, Escape and backdrop close it (backdrop ignored while `guard`, e.g. unsaved changes). */
export function Modal({ title, onClose, children, guard }: ModalProps) {
  const { t } = useTranslation();
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape' && !guard) onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose, guard]);
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => { if (!guard) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label={title} className="ust-modal relative bg-white rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={onClose} aria-label={t('admin.common.close')} className="absolute top-4 right-4 z-10 p-2 rounded-full hover:bg-gray-100 text-gray-400 hover:text-primary transition"><span className="material-symbols-outlined">close</span></button>
        <h2 className="pr-10 font-serif text-2xl mb-4 text-primary break-words">{title}</h2>
        {children}
      </div>
    </div>
  );
}

export type Toast = (text: string, ok?: boolean) => void;

export function useToast(): [React.ReactNode, Toast] {
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const show = useCallback<Toast>((text, ok = true) => {
    setMsg({ text, ok });
    window.setTimeout(() => setMsg((m) => (m?.text === text ? null : m)), ok ? 4000 : 9000);
  }, []);
  const node = msg ? (
    <div role="status" aria-live="polite" className={`fixed bottom-4 left-4 right-4 sm:left-auto sm:max-w-md z-[300] rounded-xl px-4 py-3 text-sm shadow-xl break-words ${msg.ok ? 'bg-green-700 text-white' : 'bg-red-600 text-white'}`}>
      {msg.text}
    </div>
  ) : null;
  return [node, show];
}

/** Supabase/edge errors → readable, translated text (never a raw stack in the UI). */
export function useErrText() {
  const { t } = useTranslation();
  return (e: unknown): string => {
    const raw = typeof e === 'string' ? e : (e as { message?: string; error?: string })?.message ?? (e as { error?: string })?.error ?? String(e);
    const known = ['email_in_use', 'invalid_email', 'staff_account', 'partner_not_active', 'not_found', 'duplicate', 'demo_partner', 'unit_sold', 'unit_not_found', 'invalid', 'transport_not_configured', 'forbidden', 'unauthorized', 'not_allowed'];
    const k = known.find((x) => raw.includes(x));
    if (k) return t(`agencyFunnel.err.${k}`);
    if (raw.includes('violates foreign key')) return t('agencyFunnel.err.has_history');
    return t('agencyFunnel.err.withDetail', { msg: raw.slice(0, 200) });
  };
}

/** Paged list: `build` returns a query built with select(..., { count: 'exact' }); deps re-run it from page 0. */
export function usePaged<T>(build: () => any, deps: unknown[]) {
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<T[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setPage(0), deps);
  const load = useCallback(async () => {
    setLoading(true);
    const { data, count: c, error: e } = await build().range(page * PAGE, page * PAGE + PAGE - 1);
    setLoading(false);
    if (e) { setError(e.message); return; }
    setError('');
    setRows((data ?? []) as T[]);
    setCount(c ?? 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, ...deps]);
  useEffect(() => { void load(); }, [load]);
  return { rows, count, page, setPage, loading, error, reload: load, setRows };
}

export function Pager({ page, count, setPage }: { page: number; count: number; setPage: (n: number) => void }) {
  const { t } = useTranslation();
  const pages = Math.max(1, Math.ceil(count / PAGE));
  if (count <= PAGE) return null;
  return (
    <div className="flex items-center justify-between gap-3 mt-3 text-xs text-primary/60">
      <button type="button" className={pillBtn} disabled={page === 0} onClick={() => setPage(page - 1)}>{t('agencyFunnel.admin.prev')}</button>
      <span>{t('agencyFunnel.admin.pageOf', { page: page + 1, pages, count })}</span>
      <button type="button" className={pillBtn} disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>{t('agencyFunnel.admin.next')}</button>
    </div>
  );
}

/** Search box + status chips used by the three admin lists. */
export function ListFilters({ q, setQ, status, setStatus, statuses, label }: { q: string; setQ: (v: string) => void; status: string; setStatus: (v: string) => void; statuses: { value: string; label: string }[]; label: string }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col sm:flex-row gap-2 mb-3">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('agencyFunnel.admin.search')} aria-label={t('agencyFunnel.admin.search')} className={`${inputCls} !mt-0 sm:max-w-xs`} />
      <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label={label} className={`${inputCls} !mt-0 sm:max-w-[200px]`}>
        {statuses.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
      </select>
    </div>
  );
}

/** Escapes % and , for PostgREST .or(ilike) filters. */
export const ilikeTerm = (q: string) => `%${q.trim().replace(/[%,()]/g, ' ')}%`;
