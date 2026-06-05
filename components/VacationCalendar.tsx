/**
 * VacationCalendar — Calendario de vacaciones del equipo (portal Empleados).
 *
 * Visible para TODOS los empleados activos: cada uno ve las vacaciones de todo
 * el equipo (RLS SELECT abierta a empleados activos) y puede solicitar las suyas
 * (RLS INSERT solo con su propio email y status 'pendiente').
 *
 * Datos en la tabla `employee_vacations`. Se muestra como lista agrupada por mes
 * con chips por empleado, coloreados por `type` y con indicador de `status`.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

interface Vacation {
  id: string;
  employee_id: string | null;
  employee_email: string;
  employee_name: string | null;
  start_date: string;
  end_date: string;
  type: string;
  status: string;
  note: string | null;
}

interface VacationCalendarProps {
  employeeId: string;
  employeeEmail: string;
  employeeName: string;
}

type VacationType = 'vacaciones' | 'baja' | 'personal';

const TYPE_META: Record<VacationType, { label: string; chip: string; dot: string }> = {
  vacaciones: { label: 'Vacaciones', chip: 'bg-primary/10 text-primary border-primary/20', dot: 'bg-primary' },
  baja: { label: 'Baja', chip: 'bg-red-50 text-red-700 border-red-200', dot: 'bg-red-500' },
  personal: { label: 'Personal', chip: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500' },
};

const STATUS_META: Record<string, { label: string; cls: string }> = {
  pendiente: { label: 'Pendiente', cls: 'bg-gray-100 text-gray-600' },
  aprobada: { label: 'Aprobada', cls: 'bg-green-100 text-green-700' },
  rechazada: { label: 'Rechazada', cls: 'bg-red-100 text-red-700' },
};

const MONTHS_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

function fmtRange(start: string, end: string): string {
  const fmt = (d: string) =>
    new Date(`${d}T00:00:00`).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
  return start === end ? fmt(start) : `${fmt(start)} – ${fmt(end)}`;
}

function monthKey(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(key: string): string {
  const [y, m] = key.split('-');
  return `${MONTHS_ES[Number(m) - 1]} ${y}`;
}

function typeMeta(type: string) {
  return TYPE_META[(type as VacationType)] ?? TYPE_META.vacaciones;
}

const VacationCalendar: React.FC<VacationCalendarProps> = ({ employeeId, employeeEmail, employeeName }) => {
  const [vacations, setVacations] = useState<Vacation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [type, setType] = useState<VacationType>('vacaciones');
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('employee_vacations')
      .select('*')
      .order('start_date', { ascending: true });
    if (err) {
      setError('No se pudieron cargar las vacaciones.');
    } else {
      setVacations((data as Vacation[]) ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const grouped = useMemo(() => {
    const map = new Map<string, Vacation[]>();
    for (const v of vacations) {
      const key = monthKey(v.start_date);
      const arr = map.get(key) ?? [];
      arr.push(v);
      map.set(key, arr);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [vacations]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!startDate || !endDate) {
      setError('Indica fecha de inicio y fin.');
      return;
    }
    if (endDate < startDate) {
      setError('La fecha de fin no puede ser anterior a la de inicio.');
      return;
    }
    setSaving(true);
    try {
      const { error: err } = await supabase.from('employee_vacations').insert({
        employee_id: employeeId || null,
        employee_email: employeeEmail,
        employee_name: employeeName || employeeEmail,
        start_date: startDate,
        end_date: endDate,
        type,
        status: 'pendiente',
        note: note.trim() || null,
      });
      if (err) throw err;
      setShowForm(false);
      setNote('');
      setType('vacaciones');
      setStartDate(today);
      setEndDate(today);
      await load();
    } catch {
      setError('No se pudo enviar la solicitud. Reintenta.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="bg-white rounded-3xl p-5 shadow-sm border border-primary/5">
      <div className="flex items-center justify-between mb-1">
        <p className="text-[10px] font-black uppercase tracking-widest text-primary/40">Equipo</p>
        <button
          onClick={() => { setShowForm((s) => !s); setError(null); }}
          className="text-xs font-bold text-primary flex items-center gap-1 hover:underline"
        >
          <span className="material-symbols-outlined text-base">{showForm ? 'close' : 'add'}</span>
          {showForm ? 'Cerrar' : 'Solicitar'}
        </button>
      </div>
      <h2 className="text-lg font-serif text-primary mb-4">Calendario de vacaciones</h2>

      {/* Leyenda de tipos */}
      <div className="flex flex-wrap gap-3 mb-4 text-[11px] text-primary/60">
        {(Object.keys(TYPE_META) as VacationType[]).map((k) => (
          <span key={k} className="flex items-center gap-1.5">
            <span className={`w-2.5 h-2.5 rounded-full ${TYPE_META[k].dot}`} />
            {TYPE_META[k].label}
          </span>
        ))}
      </div>

      {/* Formulario de solicitud */}
      {showForm && (
        <form onSubmit={handleSubmit} className="mb-5 p-4 rounded-2xl bg-almond border border-primary/10 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-[11px] font-bold text-primary/60 mb-1">Desde</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
                className="w-full rounded-xl border border-primary/15 px-3 py-2 text-sm bg-white focus:outline-none focus:border-primary"
              />
            </label>
            <label className="block">
              <span className="block text-[11px] font-bold text-primary/60 mb-1">Hasta</span>
              <input
                type="date"
                value={endDate}
                min={startDate}
                onChange={(e) => setEndDate(e.target.value)}
                required
                className="w-full rounded-xl border border-primary/15 px-3 py-2 text-sm bg-white focus:outline-none focus:border-primary"
              />
            </label>
          </div>
          <label className="block">
            <span className="block text-[11px] font-bold text-primary/60 mb-1">Tipo</span>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as VacationType)}
              className="w-full rounded-xl border border-primary/15 px-3 py-2 text-sm bg-white focus:outline-none focus:border-primary"
            >
              <option value="vacaciones">Vacaciones</option>
              <option value="baja">Baja</option>
              <option value="personal">Personal</option>
            </select>
          </label>
          <label className="block">
            <span className="block text-[11px] font-bold text-primary/60 mb-1">Nota (opcional)</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="w-full rounded-xl border border-primary/15 px-3 py-2 text-sm bg-white focus:outline-none focus:border-primary resize-none"
              placeholder="Motivo o detalle…"
            />
          </label>
          <button
            type="submit"
            disabled={saving}
            className="w-full bg-primary text-white rounded-xl py-2.5 font-bold text-sm uppercase tracking-wide hover:bg-black transition disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {saving && <span className="material-symbols-outlined animate-spin text-base">refresh</span>}
            Enviar solicitud
          </button>
        </form>
      )}

      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

      {/* Lista agrupada por mes */}
      {loading ? (
        <div className="flex justify-center py-6">
          <span className="material-symbols-outlined animate-spin text-2xl text-primary/40">refresh</span>
        </div>
      ) : grouped.length === 0 ? (
        <p className="text-sm text-primary/50 py-4 text-center">
          Aún no hay vacaciones registradas. Sé el primero en solicitar.
        </p>
      ) : (
        <div className="space-y-5">
          {grouped.map(([key, items]) => (
            <div key={key}>
              <p className="text-[11px] font-black uppercase tracking-widest text-primary/40 mb-2">
                {monthLabel(key)}
              </p>
              <ul className="space-y-2">
                {items.map((v) => {
                  const tm = typeMeta(v.type);
                  const sm = STATUS_META[v.status] ?? STATUS_META.pendiente;
                  const isMine = v.employee_email === employeeEmail;
                  return (
                    <li
                      key={v.id}
                      className={`flex items-center gap-3 rounded-2xl border px-3 py-2.5 ${tm.chip} ${
                        isMine ? 'ring-1 ring-primary/30' : ''
                      }`}
                    >
                      <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${tm.dot}`} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-primary truncate">
                          {v.employee_name || v.employee_email}
                          {isMine && <span className="ml-1 text-[10px] font-black text-primary/40">(TÚ)</span>}
                        </p>
                        <p className="text-xs text-primary/60">
                          {fmtRange(v.start_date, v.end_date)} · {tm.label}
                          {v.note ? ` · ${v.note}` : ''}
                        </p>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-1 rounded-full shrink-0 ${sm.cls}`}>
                        {sm.label}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};

export default VacationCalendar;
