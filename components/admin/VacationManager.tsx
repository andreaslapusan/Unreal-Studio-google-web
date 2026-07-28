/**
 * VacationManager — gestión de vacaciones del equipo (Admin → Calendario).
 *
 * Sustituye al viejo calendario de "días libres" (que iba por admin_users y pedía
 * contraseña). Ahora: SIN contraseña (si eres admin ya entras), selector de
 * empleado (todos / uno), calendario anual con sus fechas, y aprobar / rechazar /
 * modificar / borrar cada solicitud. Datos en `employees` + `employee_vacations`.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { uiLocale } from '../../lib/dateLocale';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { useEscapeKey } from '../../lib/useEscapeKey';
import AsyncButton from '../AsyncButton';

interface Employee { id: string; full_name: string | null; email: string; }
interface Vacation {
  id: string; employee_id: string | null; employee_email: string; employee_name: string | null;
  start_date: string; end_date: string; type: string; status: string; note: string | null;
}

const STATUS_CLS: Record<string, string> = {
  aprobada: 'bg-green-100 text-green-700', approved: 'bg-green-100 text-green-700',
  pendiente: 'bg-amber-100 text-amber-700', pending: 'bg-amber-100 text-amber-700',
  rechazada: 'bg-red-100 text-red-600', rejected: 'bg-red-100 text-red-600',
};
const isApproved = (s: string) => s === 'aprobada' || s === 'approved';
const isPending = (s: string) => s === 'pendiente' || s === 'pending';

// Paleta por empleado (color estable por índice) para distinguirlos en el grid.
const PALETTE = ['#3F2305', '#1d4ed8', '#15803d', '#b45309', '#7c3aed', '#be185d', '#0e7490', '#4d7c0f'];

function eachDay(start: string, end: string): string[] {
  const out: string[] = [];
  let d = new Date(`${start}T00:00:00`);
  const e = new Date(`${end}T00:00:00`);
  while (d <= e) { out.push(d.toISOString().slice(0, 10)); d = new Date(d.getTime() + 86400000); }
  return out;
}

const VacationManager: React.FC = () => {
  const { t } = useTranslation();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [vacations, setVacations] = useState<Vacation[]>([]);
  const [year, setYear] = useState(new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(new Date().getMonth()); // un solo mes visible (con flechas)
  const [selected, setSelected] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Vacation | null>(null);
  const [dayDetail, setDayDetail] = useState<string | null>(null); // día pinchado → popup
  const [payDue, setPayDue] = useState<any[]>([]);
  // Mapa fecha límite → cobros pendientes (para marcar en el calendario).
  const payDayMap = useMemo(() => {
    const m = new Map<string, any[]>();
    for (const p of payDue) {
      if (!p.due_date) continue;
      const d = String(p.due_date).slice(0, 10);
      const arr = m.get(d) ?? []; arr.push(p); m.set(d, arr);
    }
    return m;
  }, [payDue]);
  const fmtMoney = (n: number, c: string) => { try { return new Intl.NumberFormat(c === 'IDR' ? 'id-ID' : 'es-ES', { style: 'currency', currency: c || 'EUR', maximumFractionDigits: 0 } as any).format(n); } catch { return `${c} ${Math.round(n)}`; } };

  const load = useCallback(async () => {
    setLoading(true);
    const [emp, vac, pays] = await Promise.all([
      supabase.from('employees').select('id, full_name, email').eq('active', true).order('full_name'),
      supabase.from('employee_vacations').select('id, employee_id, employee_email, employee_name, start_date, end_date, type, status, note').order('start_date'),
      supabase.rpc('payment_reminders_candidates'), // cobros pendientes (con fecha límite)
    ]);
    setEmployees((emp.data as Employee[]) ?? []);
    setVacations((vac.data as Vacation[]) ?? []);
    setPayDue((pays.data as any)?.success ? ((pays.data as any).payments ?? []) : []);
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const colorOf = useCallback((email: string) => {
    const idx = employees.findIndex((e) => e.email === email);
    return PALETTE[(idx < 0 ? 0 : idx) % PALETTE.length];
  }, [employees]);

  const filtered = useMemo(() => vacations.filter((v) => selected === 'all' || v.employee_email === selected), [vacations, selected]);
  const pending = useMemo(() => filtered.filter((v) => isPending(v.status)), [filtered]);

  // Mapa fecha → vacaciones (solo aprobadas/pendientes) para pintar el calendario.
  const dayMap = useMemo(() => {
    const map = new Map<string, Vacation[]>();
    for (const v of filtered) {
      if (v.status === 'rechazada' || v.status === 'rejected') continue;
      for (const d of eachDay(v.start_date, v.end_date)) {
        const arr = map.get(d) ?? []; arr.push(v); map.set(d, arr);
      }
    }
    return map;
  }, [filtered]);

  // Tooltip flotante al pasar el ratón por un día con vacaciones.
  const [hoverDay, setHoverDay] = useState<{ date: string; x: number; y: number } | null>(null);
  useEscapeKey(() => setEditing(null), !!editing);
  useEscapeKey(() => setDayDetail(null), !!dayDetail);
  const dayCount = (start: string, end: string) => { let n = 0; for (const _ of eachDay(start, end)) n++; return n; };
  const weekTotal = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    const monday = new Date(d); monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    let total = 0;
    for (let i = 0; i < 7; i++) { const dd = new Date(monday); dd.setDate(monday.getDate() + i); total += (dayMap.get(dd.toISOString().slice(0, 10))?.length ?? 0); }
    return total;
  };

  const setStatus = async (id: string, status: string) => {
    await supabase.from('employee_vacations').update({ status }).eq('id', id);
    await load();
  };
  const remove = async (id: string) => {
    if (!confirm(t('admin.vac.confirmDelete'))) return;
    await supabase.from('employee_vacations').delete().eq('id', id);
    await load();
  };
  const saveEdit = async () => {
    if (!editing) return;
    if (editing.end_date < editing.start_date) { alert(t('admin.vac.endBeforeStart')); return; }
    await supabase.from('employee_vacations').update({
      start_date: editing.start_date, end_date: editing.end_date, type: editing.type, note: editing.note,
    }).eq('id', editing.id);
    setEditing(null);
    await load();
  };

  const nameFor = (v: Vacation) => v.employee_name || v.employee_email;

  return (
    <div>
      <div className="flex flex-wrap justify-between items-center gap-3 mb-6">
        <h2 className="text-3xl font-serif text-primary">{t('admin.vac.title')}</h2>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full sm:w-auto">
          {/* Selector de empleado */}
          <select value={selected} onChange={(e) => setSelected(e.target.value)} className="flex-1 sm:flex-none min-w-0 pl-4 pr-8 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium text-primary">
            <option value="all">{t('admin.vac.allEmployees')}</option>
            {employees.map((e) => <option key={e.id} value={e.email}>{e.full_name || e.email}</option>)}
          </select>
          <div className="flex items-center justify-center gap-2">
            <button onClick={() => { if (viewMonth === 0) { setViewMonth(11); setYear((y) => y - 1); } else setViewMonth(viewMonth - 1); }} className="p-2 bg-gray-100 rounded-xl hover:bg-gray-200 transition shrink-0"><span className="material-symbols-outlined">chevron_left</span></button>
            <span className="text-base font-bold text-primary capitalize min-w-[130px] text-center">{new Date(year, viewMonth, 1).toLocaleDateString(uiLocale(), { month: 'long', year: 'numeric' })}</span>
            <button onClick={() => { if (viewMonth === 11) { setViewMonth(0); setYear((y) => y + 1); } else setViewMonth(viewMonth + 1); }} className="p-2 bg-gray-100 rounded-xl hover:bg-gray-200 transition shrink-0"><span className="material-symbols-outlined">chevron_right</span></button>
          </div>
        </div>
      </div>

      {/* Leyenda de empleados (colores) */}
      {selected === 'all' && employees.length > 0 && (
        <div className="flex flex-wrap gap-3 mb-5">
          {employees.map((e) => (
            <span key={e.id} className="flex items-center gap-1.5 text-xs text-primary/60">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: colorOf(e.email) }} /> {e.full_name || e.email}
            </span>
          ))}
        </div>
      )}

      {/* Solicitudes pendientes de aprobar */}
      {pending.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 mb-8">
          <h3 className="text-sm font-black uppercase tracking-widest text-amber-700 mb-3">{t('admin.vac.pendingApproval', { count: pending.length })}</h3>
          <ul className="space-y-2">
            {pending.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center justify-between gap-3 bg-white rounded-xl px-4 py-3 border border-amber-100">
                <div className="min-w-0">
                  <p className="font-bold text-primary text-sm">{nameFor(v)}</p>
                  <p className="text-xs text-gray-500">{v.start_date} → {v.end_date} · {v.type}{v.note ? ` · ${v.note}` : ''}</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <AsyncButton onClick={() => setStatus(v.id, 'aprobada')} className="text-[11px] font-black uppercase tracking-widest bg-green-600 text-white px-3 py-2 rounded-lg hover:bg-green-700 transition">{t('admin.vac.approve')}</AsyncButton>
                  <AsyncButton onClick={() => setStatus(v.id, 'rechazada')} className="text-[11px] font-black uppercase tracking-widest bg-red-600 text-white px-3 py-2 rounded-lg hover:bg-red-700 transition">{t('admin.vac.reject')}</AsyncButton>
                  <button onClick={() => setEditing(v)} className="text-[11px] font-black uppercase tracking-widest bg-gray-100 text-primary px-3 py-2 rounded-lg hover:bg-gray-200 transition">{t('admin.vac.modify')}</button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><span className="material-symbols-outlined animate-spin text-3xl text-primary/30">refresh</span></div>
      ) : (
        <div className="max-w-2xl mx-auto bg-white rounded-2xl p-4 sm:p-6 shadow-sm border border-primary/5">
          {(() => {
            const monthIdx = viewMonth;
            const monthDate = new Date(year, monthIdx, 1);
            const daysInMonth = new Date(year, monthIdx + 1, 0).getDate();
            const firstDayOfWeek = (monthDate.getDay() + 6) % 7;
            return (
              <div className="grid grid-cols-7 gap-1.5 text-center">
                {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((d) => <span key={d} className="text-[11px] font-bold text-primary/30 pb-1">{d}</span>)}
                {Array.from({ length: firstDayOfWeek }, (_, i) => <span key={`e${i}`} />)}
                {Array.from({ length: daysInMonth }, (_, dayIdx) => {
                  const day = dayIdx + 1;
                  const dateStr = `${year}-${String(monthIdx + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                  const offs = dayMap.get(dateStr) ?? [];
                  const pays = payDayMap.get(dateStr) ?? [];
                  const hasAny = offs.length > 0 || pays.length > 0;
                  const isToday = dateStr === new Date().toISOString().slice(0, 10);
                  return (
                    <div key={day}
                      onMouseEnter={hasAny ? (e) => setHoverDay({ date: dateStr, x: e.clientX, y: e.clientY }) : undefined}
                      onMouseLeave={hasAny ? () => setHoverDay(null) : undefined}
                      onClick={() => { setHoverDay(null); setDayDetail(dateStr); }}
                      className={`relative text-sm rounded-lg p-1 min-h-[48px] flex flex-col items-center justify-center cursor-pointer hover:ring-1 hover:ring-primary/30 ${isToday ? 'ring-2 ring-primary' : ''} ${pays.length ? 'bg-amber-50' : offs.length ? 'bg-primary/5' : ''}`}>
                      <span className="font-bold text-primary/80">{day}</span>
                      <div className="flex gap-0.5 mt-0.5 flex-wrap justify-center items-center">
                        {offs.slice(0, 6).map((v, i) => (
                          <span key={i} className="w-2 h-2 rounded-full" style={{ background: colorOf(v.employee_email), opacity: isApproved(v.status) ? 1 : 0.4 }} />
                        ))}
                        {pays.length > 0 && <span className="text-[10px] font-black text-amber-600 leading-none">€{pays.length > 1 ? `·${pays.length}` : ''}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      )}

      {/* Listado de todas las solicitudes (del filtro) con estado y acciones */}
      <div className="mt-8 bg-white rounded-2xl p-6 shadow-sm border border-primary/5">
        <h3 className="text-lg font-serif text-primary mb-4">{selected === 'all' ? t('admin.vac.requestsAllTeam', { year }) : t('admin.vac.requests', { year })}</h3>
        {filtered.filter((v) => v.start_date.startsWith(String(year)) || v.end_date.startsWith(String(year))).length === 0 ? (
          <p className="text-sm text-primary/50">{t('admin.vac.noneThisYear')}</p>
        ) : (
          <ul className="space-y-2">
            {filtered.filter((v) => v.start_date.startsWith(String(year)) || v.end_date.startsWith(String(year))).map((v) => (
              <li key={v.id} className="flex flex-wrap items-center justify-between gap-3 py-2 border-b border-gray-50">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: colorOf(v.employee_email) }} />
                  <span className="font-medium text-primary text-sm">{nameFor(v)}</span>
                  <span className="text-xs text-gray-500">{v.start_date} → {v.end_date} · {v.type}</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_CLS[v.status] ?? STATUS_CLS.pendiente}`}>{v.status}</span>
                </div>
                <div className="flex gap-2 shrink-0">
                  {!isApproved(v.status) && <AsyncButton onClick={() => setStatus(v.id, 'aprobada')} className="text-[10px] font-bold text-green-700 hover:underline">{t('admin.vac.approve')}</AsyncButton>}
                  <button onClick={() => setEditing(v)} className="text-[10px] font-bold text-primary/60 hover:underline">{t('admin.vac.modify')}</button>
                  <AsyncButton onClick={() => remove(v.id)} className="text-[10px] font-bold text-red-600 hover:underline">{t('admin.common.delete')}</AsyncButton>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Modal modificar */}
      {editing && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/50 p-4" onClick={(e) => { if (e.target === e.currentTarget) setEditing(null); }}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md">
            <h3 className="text-xl font-serif text-primary mb-4">{t('admin.vac.modifyTitle', { name: nameFor(editing) })}</h3>
            <div className="space-y-3">
              <label className="block"><span className="text-xs font-bold text-gray-500">{t('admin.vac.from')}</span>
                <input type="date" value={editing.start_date} onChange={(e) => setEditing({ ...editing, start_date: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg mt-1" /></label>
              <label className="block"><span className="text-xs font-bold text-gray-500">{t('admin.vac.to')}</span>
                <input type="date" value={editing.end_date} min={editing.start_date} onChange={(e) => setEditing({ ...editing, end_date: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg mt-1" /></label>
              <label className="block"><span className="text-xs font-bold text-gray-500">{t('admin.vac.type')}</span>
                <select value={editing.type} onChange={(e) => setEditing({ ...editing, type: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg mt-1 bg-white">
                  <option value="vacaciones">{t('admin.vac.typeVacation')}</option><option value="baja">{t('admin.vac.typeSickLeave')}</option><option value="personal">{t('admin.vac.typePersonal')}</option>
                </select></label>
              <label className="block"><span className="text-xs font-bold text-gray-500">{t('admin.vac.note')}</span>
                <input type="text" value={editing.note ?? ''} onChange={(e) => setEditing({ ...editing, note: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg mt-1" /></label>
            </div>
            <div className="flex gap-2 mt-5">
              <AsyncButton onClick={() => saveEdit()} className="flex-1 bg-primary text-white py-2.5 rounded-xl font-bold text-sm">{t('admin.common.save')}</AsyncButton>
              <button onClick={() => setEditing(null)} className="flex-1 bg-gray-100 text-primary py-2.5 rounded-xl font-bold text-sm">{t('admin.common.cancel')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Tooltip flotante al pasar el ratón sobre un día con vacaciones */}
      {hoverDay && ((dayMap.get(hoverDay.date)?.length ?? 0) > 0 || (payDayMap.get(hoverDay.date)?.length ?? 0) > 0) && (
        <div className="fixed z-[200] pointer-events-none w-72 bg-white rounded-2xl shadow-2xl border border-primary/10 p-4 text-xs"
          style={{ top: Math.min(hoverDay.y + 14, window.innerHeight - 220), left: Math.min(hoverDay.x + 14, window.innerWidth - 300) }}>
          <p className="font-black uppercase tracking-widest text-primary/40 text-[10px] mb-2 capitalize">
            {new Date(hoverDay.date + 'T00:00:00').toLocaleDateString(uiLocale(), { weekday: 'long', day: '2-digit', month: 'long' })}
          </p>
          <ul className="space-y-2">
            {(dayMap.get(hoverDay.date) ?? []).map((v, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="w-2.5 h-2.5 rounded-full mt-0.5 shrink-0" style={{ background: colorOf(v.employee_email), opacity: isApproved(v.status) ? 1 : 0.4 }} />
                <div className="min-w-0">
                  <p className="font-bold text-primary">{nameFor(v)} <span className="font-normal text-primary/40">· {isApproved(v.status) ? t('admin.vac.statusApproved') : t('admin.vac.statusPending')}</span></p>
                  <p className="text-primary/60">{v.start_date} → {v.end_date} · {t('admin.vac.daysTotal', { n: dayCount(v.start_date, v.end_date) })}</p>
                  <p className="text-primary/50 capitalize">{v.type}{v.note ? ` · ${t('admin.vac.reason')}: ${v.note}` : ''}</p>
                </div>
              </li>
            ))}
          </ul>
          {(payDayMap.get(hoverDay.date)?.length ?? 0) > 0 && (
            <div className="mt-2 pt-2 border-t border-gray-100">
              <p className="font-black uppercase tracking-widest text-amber-600 text-[10px] mb-1">{t('admin.vac.paymentsDue', { defaultValue: 'Cobros este día' })}</p>
              <ul className="space-y-1">
                {(payDayMap.get(hoverDay.date) ?? []).map((p, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-amber-600 font-black shrink-0">€</span>
                    <div className="min-w-0"><p className="font-bold text-primary">{p.client_name} · {fmtMoney(Number(p.amount), p.currency || 'EUR')}</p><p className="text-primary/50">{p.payment_label || ''}</p></div>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="mt-2 pt-2 border-t border-gray-100 font-bold text-primary/70">{t('admin.vac.weekTotal', { n: weekTotal(hoverDay.date) })}</p>
        </div>
      )}

      {/* Popup al PINCHAR un día: leyenda + detalle de lo que hay ese día (móvil + escritorio) */}
      {dayDetail && (() => {
        const offs = dayMap.get(dayDetail) ?? [];
        const pays = payDayMap.get(dayDetail) ?? [];
        return (
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4" onClick={(e) => { if (e.target === e.currentTarget) setDayDetail(null); }}>
            <div className="bg-white rounded-2xl w-full max-w-md p-6 max-h-[85vh] overflow-y-auto overscroll-contain">
              <div className="flex items-start justify-between gap-3 mb-4">
                <h3 className="text-lg font-serif text-primary capitalize">
                  {new Date(dayDetail + 'T00:00:00').toLocaleDateString(uiLocale(), { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
                </h3>
                <button onClick={() => setDayDetail(null)} className="text-primary/40 hover:text-primary shrink-0"><span className="material-symbols-outlined">close</span></button>
              </div>

              {/* Leyenda: qué significa cada cosa */}
              <div className="bg-gray-50 rounded-xl p-3 mb-4 space-y-1.5">
                <p className="text-[10px] font-black uppercase tracking-widest text-primary/40">{t('admin.vac.legendTitle', { defaultValue: 'Leyenda' })}</p>
                <div className="flex items-center gap-2 text-xs text-primary/70"><span className="w-2.5 h-2.5 rounded-full bg-primary" /> {t('admin.vac.legendVacation', { defaultValue: 'Bolita de color = empleado de vacaciones/ausente (un color por persona)' })}</div>
                <div className="flex items-center gap-2 text-xs text-primary/70"><span className="w-2.5 h-2.5 rounded-full bg-primary opacity-40" /> {t('admin.vac.legendPending', { defaultValue: 'Bolita apagada = solicitud pendiente de aprobar' })}</div>
                <div className="flex items-center gap-2 text-xs text-primary/70"><span className="text-amber-600 font-black">€</span> {t('admin.vac.legendPayment', { defaultValue: 'Cobro de cliente con fecha límite ese día' })}</div>
              </div>

              {/* Ausencias del día */}
              <p className="text-[10px] font-black uppercase tracking-widest text-primary/40 mb-2">{t('admin.vac.dayAbsences', { defaultValue: 'Ausencias' })}</p>
              {offs.length === 0 ? (
                <p className="text-sm text-primary/40 mb-4">{t('admin.vac.dayNoAbsences', { defaultValue: 'Nadie ausente este día.' })}</p>
              ) : (
                <ul className="space-y-2 mb-4">
                  {offs.map((v, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="w-2.5 h-2.5 rounded-full mt-1 shrink-0" style={{ background: colorOf(v.employee_email), opacity: isApproved(v.status) ? 1 : 0.4 }} />
                      <div className="min-w-0">
                        <p className="font-bold text-primary text-sm">{nameFor(v)} <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_CLS[v.status] ?? STATUS_CLS.pendiente}`}>{isApproved(v.status) ? t('admin.vac.statusApproved') : t('admin.vac.statusPending')}</span></p>
                        <p className="text-xs text-primary/60">{v.start_date} → {v.end_date} · {t('admin.vac.daysTotal', { n: dayCount(v.start_date, v.end_date) })}</p>
                        <p className="text-xs text-primary/50 capitalize">{v.type}{v.note ? ` · ${t('admin.vac.reason')}: ${v.note}` : ''}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              {/* Cobros del día */}
              <p className="text-[10px] font-black uppercase tracking-widest text-amber-600 mb-2">{t('admin.vac.paymentsDue', { defaultValue: 'Cobros este día' })}</p>
              {pays.length === 0 ? (
                <p className="text-sm text-primary/40">{t('admin.vac.dayNoPayments', { defaultValue: 'Ningún cobro con vencimiento este día.' })}</p>
              ) : (
                <ul className="space-y-2">
                  {pays.map((p, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-amber-600 font-black shrink-0">€</span>
                      <div className="min-w-0"><p className="font-bold text-primary text-sm">{p.client_name} · {fmtMoney(Number(p.amount), p.currency || 'EUR')}</p><p className="text-xs text-primary/50">{p.payment_label || ''}</p></div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export default VacationManager;
