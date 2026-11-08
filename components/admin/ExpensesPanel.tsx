/**
 * ExpensesPanel — menú admin «Gastos» (pedido de Andreas 7-nov-2026): pagos que ÉL tiene que hacer
 * a constructores y por terrenos. Tabla `expenses` (RLS is_admin(), solo admins) + adjuntos en el
 * bucket PRIVADO `expenses` (se abren con enlace firmado). El proveedor puede enlazarse a la agenda
 * de Contactos/Proveedores (service_contacts) o escribirse a mano. Totales por moneda (nunca EUR+IDR).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { baliToday } from '../../lib/timezone';
import { uiLocale } from '../../lib/dateLocale';
import NumberInput from '../NumberInput';

interface Expense {
  id?: string; kind: 'constructor' | 'terreno' | 'otro'; project_id: string | null; service_contact_id: string | null;
  payee: string | null; concept: string; amount: number | string; currency: string; due_date: string | null;
  paid_date: string | null; status: 'pendiente' | 'pagado'; notes: string | null; attachment_path: string | null;
}
type SortK = 'due' | 'concept' | 'payee' | 'amount' | 'status';
const KINDS = ['constructor', 'terreno', 'otro'] as const;
const empty = (): Expense => ({ kind: 'constructor', project_id: null, service_contact_id: null, payee: '', concept: '', amount: '', currency: 'IDR', due_date: null, paid_date: null, status: 'pendiente', notes: '', attachment_path: null });
const money = (n: number, c: string) => { try { return new Intl.NumberFormat(c === 'IDR' ? 'id-ID' : 'es-ES', { style: 'currency', currency: c || 'EUR', maximumFractionDigits: c === 'IDR' ? 0 : 2, useGrouping: 'always' } as any).format(n); } catch { return `${c} ${n}`; } };
const fmtDate = (s: string | null) => s ? new Date(s + 'T00:00:00').toLocaleDateString(uiLocale(), { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const ExpensesPanel: React.FC = () => {
  const { t } = useTranslation();
  const [rows, setRows] = useState<Expense[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [contacts, setContacts] = useState<{ id: string; name: string; category: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [fProject, setFProject] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [fKind, setFKind] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<{ k: SortK; dir: 1 | -1 }>({ k: 'due', dir: 1 });
  const today = baliToday();

  const load = async () => {
    setLoading(true);
    const [e, p, c] = await Promise.all([
      supabase.from('expenses').select('*').order('due_date', { ascending: true, nullsFirst: false }),
      supabase.from('projects').select('id,name').order('name'),
      supabase.from('service_contacts').select('id,name,category').order('name'),
    ]);
    if (e.error) alert(t('fin.exp.errorLoad', { error: e.error.message }));
    setRows((e.data as Expense[]) || []);
    setProjects((p.data as any[]) || []);
    setContacts((c.data as any[]) || []);
    setLoading(false);
  };
  useEffect(() => { void load(); }, []);

  const projName = (id: string | null) => projects.find((p) => p.id === id)?.name || '';
  const payeeOf = (r: Expense) => contacts.find((c) => c.id === r.service_contact_id)?.name || r.payee || '';
  const isOverdue = (r: Expense) => r.status === 'pendiente' && !!r.due_date && r.due_date < today;

  const filtered = useMemo(() => rows.filter((r) => (!fProject || r.project_id === fProject) && (!fStatus || (fStatus === 'vencido' ? isOverdue(r) : r.status === fStatus)) && (!fKind || r.kind === fKind)
    && (!search || `${r.concept} ${payeeOf(r)} ${projName(r.project_id)} ${r.notes || ''}`.toLowerCase().includes(search.toLowerCase()))), [rows, fProject, fStatus, fKind, search, projects, contacts]);
  const sorted = useMemo(() => {
    const v = (r: Expense): string | number => sort.k === 'due' ? (r.due_date ? Date.parse(r.due_date) : Number.POSITIVE_INFINITY)
      : sort.k === 'amount' ? Number(r.amount) : sort.k === 'payee' ? payeeOf(r).toLowerCase() : sort.k === 'status' ? (isOverdue(r) ? 0 : r.status === 'pendiente' ? 1 : 2) : r.concept.toLowerCase();
    return [...filtered].sort((a, b) => { const x = v(a), y = v(b); return (typeof x === 'string' ? x.localeCompare(String(y), 'es') : (x as number) - (y as number)) * sort.dir; });
  }, [filtered, sort]);
  const totals = useMemo(() => {
    const m: Record<string, { pending: number; paid: number; overdue: number }> = {};
    for (const r of filtered) {
      const c = r.currency || 'IDR'; const x = (m[c] = m[c] || { pending: 0, paid: 0, overdue: 0 }); const a = Number(r.amount) || 0;
      if (r.status === 'pagado') x.paid += a; else { x.pending += a; if (isOverdue(r)) x.overdue += a; }
    }
    return m;
  }, [filtered]);

  const save = async () => {
    if (!editing) return;
    if (!editing.concept.trim() || !(Number(editing.amount) > 0) || !editing.currency) { alert(t('fin.exp.fillRequired')); return; }
    setSaving(true);
    let attachment_path = editing.attachment_path;
    if (file) {
      const path = `${editing.project_id || 'general'}/${Date.now()}-${file.name.replace(/[^\w.-]+/g, '_')}`;
      const up = await supabase.storage.from('expenses').upload(path, file);
      if (up.error) { setSaving(false); alert(t('fin.exp.errorSave', { error: up.error.message })); return; }
      attachment_path = path;
    }
    const { id, ...rest } = editing;
    const payload = { ...rest, amount: Number(editing.amount), attachment_path, payee: editing.payee || null, notes: editing.notes || null,
      paid_date: editing.status === 'pagado' ? (editing.paid_date || today) : editing.paid_date, updated_at: new Date().toISOString() };
    const res = id ? await supabase.from('expenses').update(payload).eq('id', id) : await supabase.from('expenses').insert(payload);
    setSaving(false);
    if (res.error) { alert(t('fin.exp.errorSave', { error: res.error.message })); return; }
    setEditing(null); setFile(null); await load();
  };
  const del = async (r: Expense) => {
    if (!r.id || !window.confirm(t('fin.exp.confirmDelete'))) return;
    const { error } = await supabase.from('expenses').delete().eq('id', r.id);
    if (error) { alert(t('fin.exp.errorSave', { error: error.message })); return; }
    if (r.attachment_path) await supabase.storage.from('expenses').remove([r.attachment_path]);
    await load();
  };
  const openAttachment = async (path: string) => {
    const { data, error } = await supabase.storage.from('expenses').createSignedUrl(path, 600);
    if (error || !data?.signedUrl) { alert(t('fin.exp.errorSave', { error: error?.message || '' })); return; }
    window.open(data.signedUrl, '_blank', 'noopener');
  };

  const Th = (k: SortK, label: string, right?: boolean) => (
    <th className={`px-3 py-2 cursor-pointer select-none hover:text-primary/70 ${right ? 'text-right' : ''}`} onClick={() => setSort((s) => ({ k, dir: s.k === k ? (s.dir === 1 ? -1 : 1) : 1 }))}>
      {label}{sort.k === k && <span className="text-primary text-[9px] ml-1">{sort.dir === 1 ? '▲' : '▼'}</span>}
    </th>
  );
  const field = 'w-full px-3 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm';
  const lbl = 'block text-[10px] font-black uppercase text-gray-400 mb-1';
  const set = (patch: Partial<Expense>) => setEditing((pv) => (pv ? { ...pv, ...patch } : pv));

  return (
    <div className="animate-in fade-in duration-500 space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg sm:text-2xl font-black uppercase tracking-wide sm:tracking-widest text-primary/20">{t('fin.exp.title')}</h1>
          <p className="text-sm text-gray-400">{t('fin.exp.subtitle')}</p>
        </div>
        <button onClick={() => { setEditing(empty()); setFile(null); }} className="bg-primary text-white px-5 py-3 rounded-2xl font-bold text-sm flex items-center gap-2 hover:bg-black transition">
          <span className="material-symbols-outlined text-base">add</span>{t('fin.exp.add')}
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {Object.entries(totals).map(([c, k]) => (
          <div key={c} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-sm space-y-1">
            <p className="text-[10px] font-black uppercase tracking-widest text-primary/40">{c}</p>
            <div className="flex justify-between"><span className="text-gray-400">{t('fin.exp.totPending')}</span><span className="font-black text-primary">{money(k.pending, c)}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">{t('fin.exp.totOverdue')}</span><span className="font-black text-red-600">{money(k.overdue, c)}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">{t('fin.exp.totPaid')}</span><span className="font-black text-green-700">{money(k.paid, c)}</span></div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('fin.exp.searchPh')} className="flex-1 min-w-[160px] px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm" />
        <select value={fProject} onChange={(e) => setFProject(e.target.value)} className="px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold max-w-full">
          <option value="">{t('cobros.allProjects')}</option>{projects.filter((p) => rows.some((r) => r.project_id === p.id)).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select value={fKind} onChange={(e) => setFKind(e.target.value)} className="px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold">
          <option value="">{t('fin.exp.allKinds')}</option>{KINDS.map((k) => <option key={k} value={k}>{t('fin.exp.kind_' + k)}</option>)}
        </select>
        <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} className="px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold">
          <option value="">{t('cobros.allStates')}</option>
          <option value="pendiente">{t('fin.exp.st_pendiente')}</option><option value="vencido">{t('fin.exp.st_vencido')}</option><option value="pagado">{t('fin.exp.st_pagado')}</option>
        </select>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-[10px] font-black uppercase tracking-widest text-primary/40 border-b border-gray-100">
            {Th('concept', t('fin.exp.concept'))}{Th('payee', t('fin.exp.payee'))}{Th('due', t('fin.exp.dueDate'))}{Th('amount', t('fin.exp.amount'), true)}{Th('status', t('cobros.colState'))}<th className="px-3 py-2" />
          </tr></thead>
          <tbody>
            {sorted.map((r) => {
              const od = isOverdue(r);
              return (
                <tr key={r.id} className={`border-b border-gray-50 ${od ? 'bg-red-50/60' : 'hover:bg-gray-50/50'}`}>
                  <td className="px-3 py-2 min-w-[160px]"><p className="font-bold text-primary leading-tight">{r.concept}</p><p className="text-[10px] text-primary/50">{t('fin.exp.kind_' + r.kind)}{r.project_id ? ` · ${projName(r.project_id)}` : ''}</p></td>
                  <td className="px-3 py-2 text-primary/70">{payeeOf(r) || '—'}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-primary/60">{fmtDate(r.due_date)}{r.status === 'pagado' && r.paid_date && <span className="block text-[10px] text-green-700">{t('fin.exp.paidOn', { date: fmtDate(r.paid_date) })}</span>}</td>
                  <td className="px-3 py-2 text-right font-bold whitespace-nowrap">{money(Number(r.amount), r.currency)}</td>
                  <td className="px-3 py-2"><span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${r.status === 'pagado' ? 'bg-green-50 text-green-700' : od ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-500'}`}>{t('fin.exp.st_' + (r.status === 'pagado' ? 'pagado' : od ? 'vencido' : 'pendiente'))}</span></td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <span className="inline-flex gap-1">
                      {r.attachment_path && <button onClick={() => void openAttachment(r.attachment_path!)} title={t('fin.exp.attachment')} className="p-1.5 text-primary bg-gray-50 rounded-lg hover:bg-gray-100"><span className="material-symbols-outlined text-sm">attach_file</span></button>}
                      <button onClick={() => { setEditing({ ...r }); setFile(null); }} title={t('fin.exp.edit')} className="p-1.5 text-primary bg-almond rounded-lg hover:brightness-95"><span className="material-symbols-outlined text-sm">edit</span></button>
                      <button onClick={() => void del(r)} title={t('fin.exp.delete')} className="p-1.5 text-red-500 bg-red-50 rounded-lg hover:bg-red-100"><span className="material-symbols-outlined text-sm">delete</span></button>
                    </span>
                  </td>
                </tr>
              );
            })}
            {!loading && sorted.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400 text-sm">{t('fin.exp.empty')}</td></tr>}
            {loading && <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-300 text-sm">…</td></tr>}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="fixed inset-0 bg-black/40 z-[70] flex items-center justify-center p-4" onClick={() => setEditing(null)}>
          <div className="relative bg-white rounded-3xl p-6 md:p-8 w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <button type="button" onClick={() => setEditing(null)} aria-label={t('admin.common.close')} className="absolute top-4 right-4 z-10 p-2 rounded-full hover:bg-gray-100 text-gray-400 hover:text-primary transition"><span className="material-symbols-outlined">close</span></button>
            <h3 className="pr-10 text-xl font-serif text-primary mb-5">{editing.id ? t('fin.exp.edit') : t('fin.exp.add')}</h3>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><label className={lbl}>{t('fin.exp.kind')}</label>
                  <select value={editing.kind} onChange={(e) => set({ kind: e.target.value as Expense['kind'] })} className={field}>{KINDS.map((k) => <option key={k} value={k}>{t('fin.exp.kind_' + k)}</option>)}</select></div>
                <div><label className={lbl}>{t('fin.exp.project')}</label>
                  <select value={editing.project_id || ''} onChange={(e) => set({ project_id: e.target.value || null })} className={field}><option value="">—</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className={lbl}>{t('fin.exp.contact')}</label>
                  <select value={editing.service_contact_id || ''} onChange={(e) => set({ service_contact_id: e.target.value || null })} className={field}><option value="">—</option>{contacts.map((c) => <option key={c.id} value={c.id}>{c.name}{c.category ? ` · ${c.category}` : ''}</option>)}</select></div>
                <div><label className={lbl}>{t('fin.exp.payeeFree')}</label>
                  <input value={editing.payee || ''} onChange={(e) => set({ payee: e.target.value })} className={field} /></div>
              </div>
              <div><label className={lbl}>{t('fin.exp.concept')}</label><input value={editing.concept} onChange={(e) => set({ concept: e.target.value })} className={field} /></div>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2"><label className={lbl}>{t('fin.exp.amount')}</label><NumberInput decimal value={editing.amount} onChangeValue={(v) => set({ amount: v })} className={field} /></div>
                <div><label className={lbl}>{t('fin.exp.currency')}</label><select value={editing.currency} onChange={(e) => set({ currency: e.target.value })} className={field}><option>IDR</option><option>EUR</option><option>USD</option></select></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className={lbl}>{t('fin.exp.dueDate')}</label><input type="date" min="2000-01-01" max="2099-12-31" value={editing.due_date || ''} onChange={(e) => set({ due_date: e.target.value || null })} className={field} /></div>
                <div><label className={lbl}>{t('fin.exp.paidDate')}</label><input type="date" min="2000-01-01" max="2099-12-31" value={editing.paid_date || ''} onChange={(e) => set({ paid_date: e.target.value || null, ...(e.target.value ? { status: 'pagado' as const } : {}) })} className={field} /></div>
              </div>
              <div><label className={lbl}>{t('cobros.colState')}</label>
                <select value={editing.status} onChange={(e) => set({ status: e.target.value as Expense['status'] })} className={field}><option value="pendiente">{t('fin.exp.st_pendiente')}</option><option value="pagado">{t('fin.exp.st_pagado')}</option></select></div>
              <div><label className={lbl}>{t('fin.exp.notes')}</label><textarea rows={2} value={editing.notes || ''} onChange={(e) => set({ notes: e.target.value })} className={field} /></div>
              <div><label className={lbl}>{t('fin.exp.attachment')}</label>
                {editing.attachment_path && !file && <button type="button" onClick={() => void openAttachment(editing.attachment_path!)} className="text-xs font-bold text-primary underline mb-1 block truncate max-w-full">{editing.attachment_path.split('/').pop()}</button>}
                <input type="file" accept="application/pdf,image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} className="text-xs max-w-full" /></div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setEditing(null)} className="flex-1 py-3 rounded-2xl font-bold text-primary bg-gray-100 hover:bg-gray-200 transition">{t('admin.common.cancel')}</button>
              <button onClick={() => void save()} disabled={saving} className="flex-1 py-3 rounded-2xl font-bold text-white bg-primary hover:bg-black transition disabled:opacity-50">{saving ? '…' : t('admin.common.save')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExpensesPanel;
