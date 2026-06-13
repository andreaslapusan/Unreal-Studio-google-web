/**
 * CobrosPanel — vista "Cobros" del admin: situación de cobros de TODOS los clientes
 * en una tabla unificada, con KPIs at-a-glance, filtros (proyecto/divisa/estado) y
 * búsqueda. Para el departamento de cobros. Solo lectura + atajos.
 *
 * - Los KPIs/resúmenes de arriba se recalculan según el FILTRO activo (proyecto(s)
 *   + divisa + búsqueda); el filtro de estado solo afecta a las filas de la tabla.
 * - Multi-selección de proyectos. Columna "Cliente" estrecha (nombre largo va a 2
 *   líneas, sin puntos suspensivos) e INMOVILIZADA (sticky) al hacer scroll lateral.
 * - Ordenación asc/desc al pulsar cada cabecera (importes/días numérico,
 *   cliente/proyecto/concepto alfabético, fecha por antigüedad, estado por urgencia).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { baliToday } from '../../lib/timezone';

interface Pay {
  id: string; label: string; amount: number; currency: string; due_date: string | null;
  received: boolean; received_amount: number | null; paid_at: string | null; position: number;
  client_id: string; client_name: string; client_email: string; client_lang: string;
  client_project_id: string; unit_number: string | null; project_name: string | null;
}

type SortKey = 'client' | 'project' | 'concept' | 'amount' | 'due' | 'days' | 'state' | 'balance';

const fmt = (n: number, c: string) => {
  try { return new Intl.NumberFormat(c === 'IDR' ? 'id-ID' : 'es-ES', { style: 'currency', currency: c || 'EUR', maximumFractionDigits: 0, useGrouping: 'always' } as any).format(n); }
  catch { return `${c} ${Math.round(n)}`; }
};
const recvOf = (p: Pay) => (p.received_amount != null ? p.received_amount : (p.received ? p.amount : 0));
const STATE_RANK: Record<string, number> = { vencido: 0, proximo: 1, pendiente: 2, recibido: 3 };

const CobrosPanel: React.FC<{ adminUserId: string | null; onOpenPayments?: (row: Pay) => void }> = ({ adminUserId, onOpenPayments }) => {
  const { t } = useTranslation();
  const [rows, setRows] = useState<Pay[]>([]);
  const [loading, setLoading] = useState(true);
  const [fProjects, setFProjects] = useState<string[]>([]);
  const [projOpen, setProjOpen] = useState(false);
  const [fCurrency, setFCurrency] = useState('');
  const [fState, setFState] = useState(''); // '', vencido, proximo, pendiente, recibido
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey | ''>('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
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

  const daysTo = (d: string | null) => d ? Math.round((Date.parse(d + 'T12:00:00Z') - Date.parse(today + 'T12:00:00Z')) / 86400000) : null;
  const stateOf = (p: Pay): 'recibido' | 'vencido' | 'proximo' | 'pendiente' => {
    if (p.received) return 'recibido';
    const dd = daysTo(p.due_date);
    if (dd != null && dd < 0) return 'vencido';
    if (dd != null && dd <= 7) return 'proximo';
    return 'pendiente';
  };

  const projects = useMemo(() => Array.from(new Set(rows.map((r) => r.project_name).filter(Boolean))) as string[], [rows]);
  const currencies = useMemo(() => Array.from(new Set(rows.map((r) => r.currency).filter(Boolean))), [rows]);

  // Alcance del filtro para KPIs y tabla: proyecto(s) + divisa + búsqueda. El estado
  // NO entra aquí (los KPIs ya se desglosan por estado y solo filtra filas de tabla).
  const scoped = useMemo(() => rows.filter((r) => {
    if (fProjects.length && !fProjects.includes(r.project_name || '')) return false;
    if (fCurrency && r.currency !== fCurrency) return false;
    if (search && !(`${r.client_name} ${r.project_name} ${r.label}`.toLowerCase().includes(search.toLowerCase()))) return false;
    return true;
  }), [rows, fProjects, fCurrency, search]);

  const filtered = useMemo(() => scoped.filter((r) => !fState || stateOf(r) === fState), [scoped, fState, today]);

  const sortVal = (r: Pay, k: SortKey): string | number => {
    switch (k) {
      case 'client': return (r.client_name || '').toLowerCase();
      case 'project': return `${r.project_name || ''} ${r.unit_number || ''}`.toLowerCase();
      case 'concept': return (r.label || '').toLowerCase();
      case 'amount': return r.amount || 0;
      case 'due': case 'days': return r.due_date ? Date.parse(r.due_date) : Number.POSITIVE_INFINITY;
      case 'state': return STATE_RANK[stateOf(r)];
      case 'balance': return (r.amount || 0) - recvOf(r);
    }
  };
  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const va = sortVal(a, sortKey), vb = sortVal(b, sortKey);
      if (typeof va === 'string' || typeof vb === 'string') return String(va).localeCompare(String(vb), 'es') * dir;
      return (va - vb) * dir;
    });
  }, [filtered, sortKey, sortDir, today]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(k); setSortDir('asc'); }
  };
  const toggleProject = (p: string) => setFProjects((cur) => cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]);

  // KPIs por moneda sobre lo NO recibido del ALCANCE filtrado.
  const kpis = useMemo(() => {
    const pend = scoped.filter((r) => !r.received);
    const byCur: Record<string, { due: number; overdue: number; next7: number; next30: number }> = {};
    let overdueCount = 0;
    for (const r of pend) {
      const c = r.currency || 'EUR';
      byCur[c] = byCur[c] || { due: 0, overdue: 0, next7: 0, next30: 0 };
      const amt = r.amount || 0; byCur[c].due += amt;
      const dd = daysTo(r.due_date);
      if (dd != null && dd < 0) { byCur[c].overdue += amt; overdueCount++; }
      else if (dd != null && dd <= 7) byCur[c].next7 += amt;
      if (dd != null && dd >= 0 && dd <= 30) byCur[c].next30 += amt;
    }
    return { byCur, overdueCount, pendCount: pend.length };
  }, [scoped, today]);

  const STATE_CLS: Record<string, string> = {
    recibido: 'bg-green-50 text-green-700', vencido: 'bg-red-50 text-red-600',
    proximo: 'bg-amber-50 text-amber-700', pendiente: 'bg-gray-100 text-gray-500',
  };

  // Cabecera ordenable. align 'right' alinea a la derecha (importes/días/balance).
  const Th = (k: SortKey | null, label: string, align?: 'right') => (
    <th
      className={`px-4 py-3 ${align === 'right' ? 'text-right' : ''} ${k ? 'cursor-pointer select-none hover:text-primary/70' : ''}`}
      onClick={k ? () => toggleSort(k) : undefined}
    >
      <span className={`inline-flex items-center gap-1 ${align === 'right' ? 'flex-row-reverse' : ''}`}>
        {label}
        {k && sortKey === k && <span className="text-primary text-[9px]">{sortDir === 'asc' ? '▲' : '▼'}</span>}
      </span>
    </th>
  );

  const projBtnLabel = fProjects.length === 0
    ? t('cobros.allProjects')
    : fProjects.length === 1 ? fProjects[0] : t('cobros.nProjects', { n: fProjects.length, defaultValue: '{{n}} proyectos' });

  return (
    <div className="animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end mb-6 gap-3">
        <h1 className="text-lg sm:text-2xl font-black uppercase tracking-wide sm:tracking-widest text-primary/20">{t('cobros.title')}</h1>
        <span className="text-[11px] font-bold text-primary/40">{t('cobros.pendingCount', { n: kpis.pendCount })} · {t('cobros.overdueCount', { n: kpis.overdueCount })}</span>
      </div>

      {/* KPIs por moneda (según el filtro activo) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
        {Object.entries(kpis.byCur).map(([c, k]) => (
          <div key={c} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-primary/40 mb-2">{c}</p>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-gray-400">{t('cobros.kpiDue')}</span><span className="font-black text-primary">{fmt(k.due, c)}</span></div>
              <div className="flex justify-between"><span className="text-gray-400">{t('cobros.kpiOverdue')}</span><span className="font-black text-red-600">{fmt(k.overdue, c)}</span></div>
              <div className="flex justify-between"><span className="text-gray-400">{t('cobros.kpiNext7')}</span><span className="font-bold text-amber-700">{fmt(k.next7, c)}</span></div>
              <div className="flex justify-between"><span className="text-gray-400">{t('cobros.kpiNext30')}</span><span className="font-bold text-primary/70">{fmt(k.next30, c)}</span></div>
            </div>
          </div>
        ))}
        {Object.keys(kpis.byCur).length === 0 && !loading && <p className="text-sm text-gray-400">{t('cobros.empty')}</p>}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2 mb-4">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('cobros.searchPh')} className="flex-1 min-w-[160px] px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm" />

        {/* Multi-selección de proyectos */}
        <div className="relative">
          <button type="button" onClick={() => setProjOpen((o) => !o)} className="flex items-center gap-2 px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold text-primary max-w-[240px]">
            <span className="truncate">{projBtnLabel}</span>
            <span className="material-symbols-outlined text-base shrink-0">{projOpen ? 'expand_less' : 'expand_more'}</span>
          </button>
          {projOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setProjOpen(false)} />
              <div className="absolute left-0 mt-1 z-20 w-72 max-h-72 overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-lg p-2">
                <button type="button" onClick={() => setFProjects([])} className="w-full text-left px-2 py-1.5 text-xs font-bold text-primary/50 hover:text-primary">{t('cobros.allProjects')}</button>
                {projects.map((p) => (
                  <label key={p} className="flex items-start gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 cursor-pointer text-sm">
                    <input type="checkbox" checked={fProjects.includes(p)} onChange={() => toggleProject(p)} className="mt-0.5 rounded border-gray-300" />
                    <span className="text-primary/80 leading-tight">{p}</span>
                  </label>
                ))}
              </div>
            </>
          )}
        </div>

        <select value={fCurrency} onChange={(e) => setFCurrency(e.target.value)} className="px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold"><option value="">{t('cobros.allCurrencies')}</option>{currencies.map((c) => <option key={c} value={c}>{c}</option>)}</select>
        <select value={fState} onChange={(e) => setFState(e.target.value)} className="px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold"><option value="">{t('cobros.allStates')}</option><option value="vencido">{t('cobros.stVencido')}</option><option value="proximo">{t('cobros.stProximo')}</option><option value="pendiente">{t('cobros.stPendiente')}</option><option value="recibido">{t('cobros.stRecibido')}</option></select>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-[10px] font-black uppercase tracking-widest text-primary/40 border-b border-gray-100">
            <th className="sticky left-0 z-20 bg-white px-4 py-3 w-[140px] cursor-pointer select-none hover:text-primary/70" onClick={() => toggleSort('client')}>
              <span className="inline-flex items-center gap-1">{t('cobros.colClient')}{sortKey === 'client' && <span className="text-primary text-[9px]">{sortDir === 'asc' ? '▲' : '▼'}</span>}</span>
            </th>
            {Th('project', t('cobros.colProject'))}
            {Th('concept', t('cobros.colConcept'))}
            {Th('amount', t('cobros.colAmount'), 'right')}
            {Th('due', t('cobros.colDue'))}
            {Th('days', t('cobros.colDays'), 'right')}
            {Th('state', t('cobros.colState'))}
            {Th('balance', t('cobros.colBalance'), 'right')}
            <th className="px-4 py-3"></th>
          </tr></thead>
          <tbody>
            {sorted.map((r) => {
              const st = stateOf(r); const dd = daysTo(r.due_date); const bal = r.amount - recvOf(r);
              return (
                <tr key={r.id} className="group border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="sticky left-0 z-10 bg-white group-hover:bg-gray-50 px-4 py-3 font-bold text-primary w-[140px] whitespace-normal break-words leading-tight">{r.client_name}</td>
                  <td className="px-4 py-3 text-primary/70 whitespace-nowrap">{r.project_name}{r.unit_number ? ` · ${r.unit_number}` : ''}</td>
                  <td className="px-4 py-3 text-primary/60">{r.label}</td>
                  <td className="px-4 py-3 text-right font-bold whitespace-nowrap">{fmt(r.amount, r.currency)}</td>
                  <td className="px-4 py-3 text-primary/60 whitespace-nowrap">{r.due_date || '—'}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">{r.received ? '—' : dd == null ? '—' : dd < 0 ? <span className="text-red-600 font-bold">{t('cobros.overdueD', { n: Math.abs(dd) })}</span> : <span className="text-primary/60">{t('cobros.leftD', { n: dd })}</span>}</td>
                  <td className="px-4 py-3"><span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${STATE_CLS[st]}`}>{t('cobros.st' + st.charAt(0).toUpperCase() + st.slice(1))}</span></td>
                  <td className={`px-4 py-3 text-right font-bold whitespace-nowrap ${bal > 0 && !r.received ? 'text-red-500' : 'text-primary/40'}`}>{fmt(bal, r.currency)}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => onOpenPayments?.(r)} title={t('cobros.openPayments')} className="p-1.5 text-primary bg-almond rounded-lg hover:brightness-95"><span className="material-symbols-outlined text-sm">payments</span></button>
                  </td>
                </tr>
              );
            })}
            {!loading && sorted.length === 0 && <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400 text-sm">{t('cobros.empty')}</td></tr>}
            {loading && <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-300 text-sm">…</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default CobrosPanel;
