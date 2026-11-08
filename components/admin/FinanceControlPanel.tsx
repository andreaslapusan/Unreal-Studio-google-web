/**
 * FinanceControlPanel — Finanzas › Control (pedido de Andreas 7-nov-2026). Agrupa en 3 bloques:
 *   1) Retrasados: pagos no recibidos con fecha límite pasada.
 *   2) Descuadres: pagos marcados como recibidos por MENOS de lo previsto. Cuenta lo acreditado
 *      (neto + comisión bancaria que asume Unreal) → si el descuadre era la comisión y está
 *      apuntada, ya no sale aquí.
 *   3) Próximos: pagos futuros aún no recibidos.
 * Totales SIEMPRE por moneda (nunca se suma EUR + IDR). Datos de admin_all_payments, que ya
 * excluye clientes en borrador y las cuentas demo de App Review. Solo lectura + atajos.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { baliToday } from '../../lib/timezone';
import { uiLocale } from '../../lib/dateLocale';
import { creditedOf } from './ClientPaymentsPanel';

export interface FinPay {
  id: string; label: string; amount: number; currency: string; due_date: string | null;
  received: boolean; received_amount: number | null; bank_fee: number | null; paid_at: string | null;
  client_id: string; client_name: string; client_email: string; client_project_id: string;
  unit_number: string | null; project_name: string | null;
}
type Col = 'client' | 'project' | 'concept' | 'due' | 'amount' | 'diff';

const money = (n: number, c: string) => {
  try { return new Intl.NumberFormat(c === 'IDR' ? 'id-ID' : 'es-ES', { style: 'currency', currency: c || 'EUR', maximumFractionDigits: c === 'IDR' ? 0 : 2, useGrouping: 'always' } as any).format(n); }
  catch { return `${c} ${n}`; }
};
const fmtDate = (s: string | null) => {
  if (!s) return '—';
  const d = new Date(s.slice(0, 10) + 'T00:00:00');
  return isNaN(d.getTime()) ? s : d.toLocaleDateString(uiLocale(), { day: '2-digit', month: 'short', year: 'numeric' });
};
const totalsByCur = (rows: FinPay[], val: (r: FinPay) => number) => {
  const m: Record<string, number> = {};
  for (const r of rows) m[r.currency || 'EUR'] = (m[r.currency || 'EUR'] || 0) + val(r);
  return m;
};

const Section: React.FC<{
  title: string; icon: string; tone: string; rows: FinPay[]; diffLabel: string; diff: (r: FinPay) => number;
  extra?: (r: FinPay) => React.ReactNode; actions: (r: FinPay) => React.ReactNode; emptyText: string;
}> = ({ title, icon, tone, rows, diffLabel, diff, extra, actions, emptyText }) => {
  const { t } = useTranslation();
  const [sort, setSort] = useState<{ k: Col; dir: 1 | -1 }>({ k: 'due', dir: 1 });
  const val = (r: FinPay, k: Col): string | number => k === 'client' ? (r.client_name || '').toLowerCase()
    : k === 'project' ? `${r.project_name || ''} ${r.unit_number || ''}`.toLowerCase()
    : k === 'concept' ? (r.label || '').toLowerCase()
    : k === 'due' ? (r.due_date ? Date.parse(r.due_date) : Number.POSITIVE_INFINITY)
    : k === 'amount' ? Number(r.amount) : diff(r);
  const sorted = useMemo(() => [...rows].sort((a, b) => {
    const va = val(a, sort.k), vb = val(b, sort.k);
    return (typeof va === 'string' ? va.localeCompare(String(vb), 'es') : (va as number) - (vb as number)) * sort.dir;
  }), [rows, sort]);
  const totals = totalsByCur(rows, diff);
  const Th = (k: Col, label: string, right?: boolean) => (
    <th className={`px-3 py-2 cursor-pointer select-none hover:text-primary/70 ${right ? 'text-right' : ''}`} onClick={() => setSort((s) => ({ k, dir: s.k === k ? (s.dir === 1 ? -1 : 1) : 1 }))}>
      {label}{sort.k === k && <span className="text-primary text-[9px] ml-1">{sort.dir === 1 ? '▲' : '▼'}</span>}
    </th>
  );
  return (
    <section className="bg-white rounded-2xl border border-gray-100 shadow-sm mb-5">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-gray-100">
        <h2 className={`flex items-center gap-2 font-black text-sm uppercase tracking-widest ${tone}`}><span className="material-symbols-outlined text-base">{icon}</span>{title} <span className="text-primary/30">({rows.length})</span></h2>
        <div className="flex flex-wrap gap-2">
          {Object.entries(totals).map(([c, v]) => <span key={c} className={`text-xs font-black px-2 py-1 rounded-lg bg-gray-50 ${tone}`}>{money(v, c)}</span>)}
        </div>
      </div>
      {rows.length === 0 ? <p className="px-4 py-5 text-sm text-gray-400">{emptyText}</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-[10px] font-black uppercase tracking-widest text-primary/40 border-b border-gray-100">
              {Th('client', t('cobros.colClient'))}{Th('project', t('cobros.colProject'))}{Th('concept', t('cobros.colConcept'))}
              {Th('due', t('cobros.colDue'))}{Th('amount', t('cobros.colAmount'), true)}{Th('diff', diffLabel, true)}<th className="px-3 py-2" />
            </tr></thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="px-3 py-2 font-bold text-primary leading-tight min-w-[120px]">{r.client_name}</td>
                  <td className="px-3 py-2 text-primary/70 whitespace-nowrap">{r.project_name}{r.unit_number ? ` · ${r.unit_number}` : ''}</td>
                  <td className="px-3 py-2 text-primary/60">{r.label}{extra && <span className="block text-[10px] text-primary/50">{extra(r)}</span>}</td>
                  <td className="px-3 py-2 text-primary/60 whitespace-nowrap">{fmtDate(r.due_date)}</td>
                  <td className="px-3 py-2 text-right font-bold whitespace-nowrap">{money(Number(r.amount), r.currency)}</td>
                  <td className={`px-3 py-2 text-right font-black whitespace-nowrap ${tone}`}>{money(diff(r), r.currency)}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">{actions(r)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};

const FinanceControlPanel: React.FC<{ adminUserId: string | null; onOpenPayments?: (r: FinPay) => void; onShortfallEmail?: (clientId: string) => void }> = ({ adminUserId, onOpenPayments, onShortfallEmail }) => {
  const { t } = useTranslation();
  const [rows, setRows] = useState<FinPay[]>([]);
  const [loading, setLoading] = useState(true);
  const [fProject, setFProject] = useState('');
  const [search, setSearch] = useState('');
  const today = baliToday();

  useEffect(() => {
    if (!adminUserId) return;
    void (async () => {
      setLoading(true);
      const { data } = await supabase.rpc('admin_all_payments', { p_user_id: adminUserId });
      setRows(data?.success ? (data.payments || []) : []);
      setLoading(false);
    })();
  }, [adminUserId]);

  const projects = useMemo(() => Array.from(new Set(rows.map((r) => r.project_name).filter(Boolean))).sort() as string[], [rows]);
  const scoped = useMemo(() => rows.filter((r) => (!fProject || r.project_name === fProject)
    && (!search || `${r.client_name} ${r.project_name} ${r.unit_number || ''} ${r.label}`.toLowerCase().includes(search.toLowerCase()))), [rows, fProject, search]);
  const shortOf = (r: FinPay) => Number(r.amount) - creditedOf(r);
  const daysLate = (r: FinPay) => r.due_date ? Math.round((Date.parse(today + 'T12:00:00Z') - Date.parse(r.due_date.slice(0, 10) + 'T12:00:00Z')) / 86400000) : 0;
  const overdue = scoped.filter((r) => !r.received && r.due_date && r.due_date.slice(0, 10) < today);
  const shortfalls = scoped.filter((r) => r.received && shortOf(r) > 0.009);
  const upcoming = scoped.filter((r) => !r.received && (!r.due_date || r.due_date.slice(0, 10) >= today));

  const openBtn = (r: FinPay) => (
    <button onClick={() => onOpenPayments?.(r)} title={t('cobros.openPayments')} className="p-1.5 text-primary bg-almond rounded-lg hover:brightness-95"><span className="material-symbols-outlined text-sm">payments</span></button>
  );

  return (
    <div className="animate-in fade-in duration-500">
      <h1 className="text-lg sm:text-2xl font-black uppercase tracking-wide sm:tracking-widest text-primary/20 mb-4">{t('fin.ctl.title')}</h1>
      <div className="flex flex-wrap gap-2 mb-5">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('cobros.searchPh')} className="flex-1 min-w-[160px] px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm" />
        <select value={fProject} onChange={(e) => setFProject(e.target.value)} className="px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold max-w-full">
          <option value="">{t('cobros.allProjects')}</option>{projects.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>
      {loading ? <p className="text-sm text-gray-300">…</p> : (
        <>
          <Section title={t('fin.ctl.overdue')} icon="warning" tone="text-red-600" rows={overdue} diffLabel={t('fin.ctl.colPending')}
            diff={(r) => Number(r.amount)} extra={(r) => t('cobros.overdueD', { n: daysLate(r) })} actions={openBtn} emptyText={t('fin.ctl.emptyOverdue')} />
          <Section title={t('fin.ctl.shortfalls')} icon="rule" tone="text-amber-700" rows={shortfalls} diffLabel={t('fin.ctl.colShort')} diff={shortOf}
            extra={(r) => `${t('fin.ctl.received', { amount: money(Number(r.received_amount ?? r.amount), r.currency) })}${Number(r.bank_fee || 0) > 0 ? ' · ' + t('fin.fee.short', { amount: money(Number(r.bank_fee), r.currency) }) : ''}`}
            actions={(r) => (
              <span className="inline-flex gap-1">
                <button onClick={() => onShortfallEmail?.(r.client_id)} title={t('fin.short.mailTitle')} className="p-1.5 text-primary bg-gray-50 rounded-lg hover:bg-gray-100"><span className="material-symbols-outlined text-sm">mail</span></button>
                {openBtn(r)}
              </span>
            )} emptyText={t('fin.ctl.emptyShort')} />
          <Section title={t('fin.ctl.upcoming')} icon="schedule" tone="text-primary" rows={upcoming} diffLabel={t('fin.ctl.colPending')}
            diff={(r) => Number(r.amount)} actions={openBtn} emptyText={t('fin.ctl.emptyUpcoming')} />
        </>
      )}
    </div>
  );
};

export default FinanceControlPanel;
