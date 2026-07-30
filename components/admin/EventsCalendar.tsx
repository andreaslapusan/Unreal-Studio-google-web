/**
 * EventsCalendar — menú "Calendario": muestra TODOS los eventos guardados
 * (cobros de clientes + vacaciones del equipo) en un calendario mensual, y debajo
 * una lista configurable por tipo y orden (p.ej. Cobros + ascendente = próximos cobros).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';

type EvType = 'cobro' | 'vacacion';
interface Ev { date: string; end?: string; type: EvType; title: string; sub?: string; amount?: number; currency?: string; }

const money = (n: number, c: string) => {
  try { return new Intl.NumberFormat(c === 'IDR' ? 'id-ID' : 'es-ES', { style: 'currency', currency: c || 'EUR', maximumFractionDigits: 0 }).format(n); }
  catch { return `${c} ${Math.round(n).toLocaleString('es-ES')}`; }
};
const TYPE_META: Record<EvType, { label: string; dot: string; badge: string }> = {
  cobro: { label: 'Cobro', dot: 'bg-amber-500', badge: 'bg-amber-50 text-amber-700' },
  vacacion: { label: 'Vacaciones', dot: 'bg-blue-500', badge: 'bg-blue-50 text-blue-700' },
};

export default function EventsCalendar({ adminUserId }: { adminUserId: string | null }) {
  const { t } = useTranslation();
  const [events, setEvents] = useState<Ev[]>([]);
  const [loading, setLoading] = useState(true);
  const today = new Date();
  const [cur, setCur] = useState({ y: today.getFullYear(), m: today.getMonth() });
  const [filterType, setFilterType] = useState<'all' | EvType>('all');
  const [order, setOrder] = useState<'asc' | 'desc'>('asc');
  const [futureOnly, setFutureOnly] = useState(true);

  useEffect(() => { void load(); /* eslint-disable-next-line */ }, []);
  async function load() {
    setLoading(true);
    const evs: Ev[] = [];
    try {
      const { data } = await supabase.rpc('admin_all_payments', { p_user_id: adminUserId });
      const rows = (data as any)?.payments ?? (Array.isArray(data) ? data : []) ?? [];
      for (const p of rows) {
        if (p.received || !p.due_date) continue;
        evs.push({ date: String(p.due_date).slice(0, 10), type: 'cobro',
          title: `${p.client_name || '—'} · ${p.label || ''}`.trim(),
          sub: [p.project_name, p.unit_number].filter(Boolean).join(' · ') || undefined,
          amount: Number(p.amount) || 0, currency: p.currency || 'EUR' });
      }
    } catch { /* ignore */ }
    try {
      const { data } = await supabase.from('employee_vacations')
        .select('employee_name, start_date, end_date, type, status')
        .in('status', ['aprobada', 'approved', 'pendiente', 'pending']);
      for (const v of (data as any[] || [])) {
        if (!v.start_date) continue;
        evs.push({ date: String(v.start_date).slice(0, 10), end: v.end_date ? String(v.end_date).slice(0, 10) : undefined,
          type: 'vacacion', title: `${v.employee_name || '—'}`,
          sub: v.start_date === v.end_date ? (v.type || 'vacaciones') : `${v.type || 'vacaciones'} · hasta ${String(v.end_date).slice(0, 10)}` });
      }
    } catch { /* ignore */ }
    setEvents(evs); setLoading(false);
  }

  // Marcadores por día (expande rangos de vacaciones)
  const dayMap = useMemo(() => {
    const map: Record<string, Record<EvType, number>> = {};
    const add = (d: string, tp: EvType) => { (map[d] ||= { cobro: 0, vacacion: 0 })[tp]++; };
    for (const e of events) {
      if (e.type === 'vacacion' && e.end && e.end !== e.date) {
        let d = new Date(e.date + 'T00:00:00'); const end = new Date(e.end + 'T00:00:00');
        let guard = 0;
        while (d <= end && guard++ < 400) { add(d.toISOString().slice(0, 10), 'vacacion'); d.setDate(d.getDate() + 1); }
      } else add(e.date, e.type);
    }
    return map;
  }, [events]);

  const todayStr = today.toISOString().slice(0, 10);
  const list = useMemo(() => {
    let l = events.filter((e) => filterType === 'all' || e.type === filterType);
    if (futureOnly) l = l.filter((e) => e.date >= todayStr);
    l = [...l].sort((a, b) => order === 'asc' ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date));
    return l;
  }, [events, filterType, order, futureOnly, todayStr]);

  // Rejilla del mes
  const monthLabel = new Date(cur.y, cur.m, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
  const firstDow = (new Date(cur.y, cur.m, 1).getDay() + 6) % 7; // Lunes=0
  const daysInMonth = new Date(cur.y, cur.m + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(firstDow).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  const step = (d: number) => setCur((c) => { const nm = c.m + d; return { y: c.y + Math.floor(nm / 12), m: ((nm % 12) + 12) % 12 }; });
  const dstr = (day: number) => `${cur.y}-${String(cur.m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  return (
    <div className="animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
        <div>
          <h2 className="text-2xl font-serif text-primary mb-1">{t('admin.agenda.title', { defaultValue: 'Calendario' })}</h2>
          <p className="text-sm text-gray-400">{t('admin.agenda.hint', { defaultValue: 'Todos los eventos: cobros y vacaciones del equipo.' })}</p>
        </div>
        <div className="flex items-center justify-center gap-2 shrink-0">
          <button onClick={() => step(-1)} className="p-2 bg-gray-100 rounded-xl hover:bg-gray-200 transition shrink-0"><span className="material-symbols-outlined">chevron_left</span></button>
          <span className="text-base font-bold text-primary capitalize min-w-[130px] text-center">{monthLabel}</span>
          <button onClick={() => step(1)} className="p-2 bg-gray-100 rounded-xl hover:bg-gray-200 transition shrink-0"><span className="material-symbols-outlined">chevron_right</span></button>
        </div>
      </div>

      {/* Leyenda */}
      <div className="flex flex-wrap gap-3 mb-3">
        {(Object.keys(TYPE_META) as EvType[]).map((k) => (
          <span key={k} className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-500"><span className={`w-2.5 h-2.5 rounded-full ${TYPE_META[k].dot}`} />{TYPE_META[k].label}</span>
        ))}
      </div>

      {/* Rejilla del mes */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 sm:p-4 mb-6">
        <div className="grid grid-cols-7 text-center text-[10px] font-black uppercase tracking-widest text-gray-300 mb-1">
          {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((d, i) => <div key={i} className="py-1">{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((day, i) => {
            if (day === null) return <div key={i} />;
            const ds = dstr(day); const ev = dayMap[ds]; const isToday = ds === todayStr;
            return (
              <div key={i} className={`aspect-square rounded-lg border text-[11px] p-1 flex flex-col ${isToday ? 'border-primary bg-primary/5' : 'border-gray-100'}`}>
                <span className={`font-bold ${isToday ? 'text-primary' : 'text-gray-500'}`}>{day}</span>
                {ev && (
                  <span className="mt-auto flex flex-wrap gap-0.5 justify-center">
                    {ev.cobro > 0 && <span className={`w-1.5 h-1.5 rounded-full ${TYPE_META.cobro.dot}`} title={`${ev.cobro} cobro(s)`} />}
                    {ev.vacacion > 0 && <span className={`w-1.5 h-1.5 rounded-full ${TYPE_META.vacacion.dot}`} title={`${ev.vacacion} vacacion(es)`} />}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Lista configurable */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">{t('admin.agenda.listOf', { defaultValue: 'Lista' })}:</span>
          <select value={filterType} onChange={(e) => setFilterType(e.target.value as any)} className="bg-gray-50 border border-gray-200 rounded-xl pl-3 pr-8 py-1.5 text-xs font-bold text-primary">
            <option value="all">{t('admin.agenda.allTypes', { defaultValue: 'Todos' })}</option>
            <option value="cobro">Cobros</option>
            <option value="vacacion">Vacaciones</option>
          </select>
          <select value={order} onChange={(e) => setOrder(e.target.value as any)} className="bg-gray-50 border border-gray-200 rounded-xl pl-3 pr-8 py-1.5 text-xs font-bold text-primary">
            <option value="asc">{t('admin.agenda.asc', { defaultValue: 'Ascendente (próximos)' })}</option>
            <option value="desc">{t('admin.agenda.desc', { defaultValue: 'Descendente' })}</option>
          </select>
          <label className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-500 cursor-pointer">
            <input type="checkbox" checked={futureOnly} onChange={(e) => setFutureOnly(e.target.checked)} className="rounded border-gray-300" />
            {t('admin.agenda.futureOnly', { defaultValue: 'Solo próximos' })}
          </label>
          <span className="text-[10px] font-black uppercase tracking-widest text-primary/30 ml-auto">{list.length}</span>
        </div>
        {loading ? (
          <div className="py-10 text-center text-gray-400 text-sm">{t('admin.common.loading', { defaultValue: 'Cargando…' })}</div>
        ) : list.length === 0 ? (
          <div className="py-10 text-center text-gray-400 text-sm">{t('admin.agenda.empty', { defaultValue: 'No hay eventos.' })}</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {list.map((e, i) => (
              <div key={i} className="py-3 flex items-start gap-3">
                <div className="text-center shrink-0 w-12">
                  <div className="text-lg font-bold text-primary leading-none">{new Date(e.date + 'T00:00:00').getDate()}</div>
                  <div className="text-[10px] uppercase text-gray-400">{new Date(e.date + 'T00:00:00').toLocaleDateString('es-ES', { month: 'short' })}</div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${TYPE_META[e.type].badge}`}>{TYPE_META[e.type].label}</span>
                    <span className="text-sm font-bold text-primary break-words">{e.title}</span>
                  </div>
                  {e.sub && <div className="text-xs text-gray-400 break-words">{e.sub}</div>}
                </div>
                {e.type === 'cobro' && e.amount != null && (
                  <div className="text-sm font-black text-primary shrink-0 whitespace-nowrap">{money(e.amount, e.currency || 'EUR')}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
