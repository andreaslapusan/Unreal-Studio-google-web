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
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { uiLocale } from '../lib/dateLocale';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { baliToday } from '../lib/timezone';

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
  canRequest?: boolean; // permiso request_vacation; si false, oculta el formulario de solicitar
}

type VacationType = 'vacaciones' | 'baja' | 'personal';

// Estilos por tipo/estado (las etiquetas visibles se resuelven con i18n).
const TYPE_META: Record<VacationType, { chip: string; dot: string }> = {
  vacaciones: { chip: 'bg-primary/10 text-primary border-primary/20', dot: 'bg-primary' },
  baja: { chip: 'bg-red-50 text-red-700 border-red-200', dot: 'bg-red-500' },
  personal: { chip: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500' },
};

const STATUS_CLS: Record<string, string> = {
  pendiente: 'bg-gray-100 text-gray-600',
  aprobada: 'bg-green-100 text-green-700',
  rechazada: 'bg-red-100 text-red-700',
};

function fmtRange(start: string, end: string): string {
  const fmt = (d: string) =>
    new Date(`${d}T00:00:00`).toLocaleDateString(uiLocale(), { day: '2-digit', month: 'short' });
  return start === end ? fmt(start) : `${fmt(start)} – ${fmt(end)}`;
}

function monthKey(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function typeMetaKey(type: string): VacationType {
  return (type as VacationType) in TYPE_META ? (type as VacationType) : 'vacaciones';
}

const iso = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
// Nombres de mes y días de la semana SEGÚN EL IDIOMA (lunes primero). 2024-01-01 fue lunes.
const monthsFor = (locale: string) => Array.from({ length: 12 }, (_, m) => {
  const n = new Date(2024, m, 1).toLocaleDateString(locale, { month: 'long' });
  return n.charAt(0).toUpperCase() + n.slice(1);
});
const weekdaysFor = (locale: string) => Array.from({ length: 7 }, (_, i) =>
  new Date(2024, 0, 1 + i).toLocaleDateString(locale, { weekday: 'narrow' }).toUpperCase());

// Rejilla de un mes (lunes primero). Pinta un punto por cada vacación que cubre
// el día; al pasar el ratón muestra los nombres.
const MonthGrid: React.FC<{ y: number; m: number; vacations: Vacation[]; myEmail: string; weekdays: string[]; compact?: boolean; tooltipFor?: (v: Vacation) => string }> = ({ y, m, vacations, myEmail, weekdays, compact, tooltipFor }) => {
  const first = new Date(y, m, 1);
  const lead = (first.getDay() + 6) % 7; // 0 = lunes
  const days = new Date(y, m + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);
  const todayIso = baliToday();
  const dayVacs = (d: number) => { const k = iso(y, m, d); return vacations.filter((v) => v.start_date <= k && k <= v.end_date); };
  return (
    <div>
      <div className="grid grid-cols-7 mb-1">
        {weekdays.map((w, wi) => <div key={wi} className={`text-center font-black text-primary/40 ${compact ? 'text-[8px]' : 'text-[10px]'}`}>{w}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((d, i) => {
          if (d === null) return <div key={i} />;
          const vs = dayVacs(d);
          const k = iso(y, m, d);
          const isToday = k === todayIso;
          return (
            <div key={i} title={vs.map((v) => tooltipFor ? tooltipFor(v) : `${v.employee_name || v.employee_email} — ${typeMetaKey(v.type)} (${v.status})`).join('\n')}
              className={`rounded ${compact ? 'min-h-[26px] p-0.5' : 'min-h-[46px] p-1'} border ${isToday ? 'border-primary' : 'border-gray-100'} ${vs.length ? 'bg-almond/40' : 'bg-white'}`}>
              <div className={`text-right ${compact ? 'text-[8px]' : 'text-[10px]'} font-bold ${isToday ? 'text-primary' : 'text-primary/40'}`}>{d}</div>
              <div className="flex flex-wrap gap-0.5 mt-0.5">
                {vs.slice(0, compact ? 3 : 5).map((v) => (
                  <span key={v.id} className={`w-1.5 h-1.5 rounded-full ${TYPE_META[typeMetaKey(v.type)].dot} ${v.employee_email === myEmail ? 'ring-1 ring-primary/50' : ''}`} />
                ))}
                {vs.length > (compact ? 3 : 5) && <span className="text-[7px] text-primary/40">+{vs.length - (compact ? 3 : 5)}</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const VacationCalendar: React.FC<VacationCalendarProps> = ({ employeeId, employeeEmail, employeeName, canRequest = true }) => {
  const { t, i18n } = useTranslation();
  const locale = i18n.language || 'es';
  const MONTHS = monthsFor(locale);
  const WEEK = weekdaysFor(locale);
  const typeLabel = (type: string) => t(`vacaciones.types.${typeMetaKey(type)}`);
  const statusLabel = (status: string) =>
    (status in STATUS_CLS ? t(`vacaciones.status.${status}`) : t('vacaciones.status.pendiente'));
  const monthLabel = (key: string): string => {
    const [y, m] = key.split('-');
    const d = new Date(Number(y), Number(m) - 1, 1);
    const name = d.toLocaleDateString(i18n.language || 'es', { month: 'long' });
    return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${y}`;
  };
  const [vacations, setVacations] = useState<Vacation[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'mes' | 'anio'>('mes');
  const [cursor, setCursor] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });
  const calRef = useRef<HTMLDivElement | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const today = baliToday();
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
      setError(t('vacaciones.errors.loadFailed'));
    } else {
      setVacations((data as Vacation[]) ?? []);
    }
    setLoading(false);
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!startDate || !endDate) {
      setError(t('vacaciones.errors.datesRequired'));
      return;
    }
    if (endDate < startDate) {
      setError(t('vacaciones.errors.endBeforeStart'));
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
      setError(t('vacaciones.errors.submitFailed'));
    } finally {
      setSaving(false);
    }
  };

  const step = (dir: number) => setCursor((c) => {
    if (view === 'anio') return { ...c, y: c.y + dir };
    const total = c.y * 12 + c.m + dir;
    return { y: Math.floor(total / 12), m: ((total % 12) + 12) % 12 };
  });

  // Imprimir el calendario actual (abre el diálogo de impresión del navegador).
  const printCalendar = () => {
    const node = calRef.current;
    if (!node) return;
    const title = view === 'anio' ? t('fix.vac.printTitleYear', { year: cursor.y }) : t('fix.vac.printTitleMonth', { month: MONTHS[cursor.m], year: cursor.y });
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
    document.body.appendChild(iframe);
    const doc = iframe.contentWindow?.document;
    if (!doc) { document.body.removeChild(iframe); return; }
    doc.open();
    doc.write(`<html><head><title>${title}</title><style>body{font-family:Arial,sans-serif;color:#3F2305;padding:20px}h1{font-size:18px;margin:0 0 14px}.grid{display:grid}*{box-sizing:border-box}</style></head><body><h1>${title}</h1>${node.innerHTML}</body></html>`);
    doc.close();
    setTimeout(() => { iframe.contentWindow?.focus(); iframe.contentWindow?.print(); setTimeout(() => { try { document.body.removeChild(iframe); } catch { /* ignore */ } }, 1500); }, 350);
  };

  return (
    <section className="bg-white rounded-3xl p-5 shadow-sm border border-primary/5">
      <div className="flex items-center justify-between mb-1">
        <p className="text-[10px] font-black uppercase tracking-widest text-primary/40">{t('vacaciones.sectionLabel')}</p>
        {canRequest && (
          <button
            onClick={() => { setShowForm((s) => !s); setError(null); }}
            className="text-xs font-bold text-primary flex items-center gap-1 hover:underline"
          >
            <span className="material-symbols-outlined text-base">{showForm ? 'close' : 'add'}</span>
            {showForm ? t('vacaciones.close') : t('vacaciones.request')}
          </button>
        )}
      </div>
      <h2 className="text-lg font-serif text-primary mb-4">{t('vacaciones.title')}</h2>

      {/* Leyenda de tipos */}
      <div className="flex flex-wrap gap-3 mb-4 text-[11px] text-primary/60">
        {(Object.keys(TYPE_META) as VacationType[]).map((k) => (
          <span key={k} className="flex items-center gap-1.5">
            <span className={`w-2.5 h-2.5 rounded-full ${TYPE_META[k].dot}`} />
            {t(`vacaciones.types.${k}`)}
          </span>
        ))}
      </div>

      {/* Formulario de solicitud */}
      {showForm && (
        <form onSubmit={handleSubmit} className="mb-5 p-4 rounded-2xl bg-almond border border-primary/10 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-[11px] font-bold text-primary/60 mb-1">{t('vacaciones.form.from')}</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
                className="w-full rounded-xl border border-primary/15 px-3 py-2 text-sm bg-white focus:outline-none focus:border-primary"
              />
            </label>
            <label className="block">
              <span className="block text-[11px] font-bold text-primary/60 mb-1">{t('vacaciones.form.to')}</span>
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
            <span className="block text-[11px] font-bold text-primary/60 mb-1">{t('vacaciones.form.type')}</span>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as VacationType)}
              className="w-full rounded-xl border border-primary/15 px-3 py-2 text-sm bg-white focus:outline-none focus:border-primary"
            >
              <option value="vacaciones">{t('vacaciones.types.vacaciones')}</option>
              <option value="baja">{t('vacaciones.types.baja')}</option>
              <option value="personal">{t('vacaciones.types.personal')}</option>
            </select>
          </label>
          <label className="block">
            <span className="block text-[11px] font-bold text-primary/60 mb-1">{t('vacaciones.form.note')}</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="w-full rounded-xl border border-primary/15 px-3 py-2 text-sm bg-white focus:outline-none focus:border-primary resize-none"
              placeholder={t('vacaciones.form.notePlaceholder')}
            />
          </label>
          <button
            type="submit"
            disabled={saving}
            className="w-full bg-primary text-white rounded-xl py-2.5 font-bold text-sm uppercase tracking-wide hover:bg-black transition disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {saving && <span className="material-symbols-outlined animate-spin text-base">refresh</span>}
            {t('vacaciones.form.submit')}
          </button>
        </form>
      )}

      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

      {/* Controles: Mes/Año · navegación · imprimir */}
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <div className="flex items-center gap-1 bg-gray-100 rounded-full p-1">
          {(['mes', 'anio'] as const).map((v) => (
            <button key={v} onClick={() => setView(v)} className={`px-3 py-1 rounded-full text-[11px] font-bold transition ${view === v ? 'bg-primary text-white' : 'text-primary/50'}`}>{v === 'mes' ? t('fix.vac.viewMonth') : t('fix.vac.viewYear')}</button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => step(-1)} className="w-8 h-8 rounded-full bg-white border border-primary/10 text-primary flex items-center justify-center hover:bg-primary hover:text-white transition"><span className="material-symbols-outlined text-[18px]">chevron_left</span></button>
          <span className="text-sm font-bold text-primary min-w-[120px] text-center">{view === 'anio' ? cursor.y : `${MONTHS[cursor.m]} ${cursor.y}`}</span>
          <button onClick={() => step(1)} className="w-8 h-8 rounded-full bg-white border border-primary/10 text-primary flex items-center justify-center hover:bg-primary hover:text-white transition"><span className="material-symbols-outlined text-[18px]">chevron_right</span></button>
          <button onClick={printCalendar} title={t('fix.vac.print')} className="w-8 h-8 rounded-full bg-white border border-primary/10 text-primary flex items-center justify-center hover:bg-primary hover:text-white transition"><span className="material-symbols-outlined text-[18px]">print</span></button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-6">
          <span className="material-symbols-outlined animate-spin text-2xl text-primary/40">refresh</span>
        </div>
      ) : (
        <div ref={calRef}>
          {view === 'mes' ? (
            <MonthGrid y={cursor.y} m={cursor.m} vacations={vacations} myEmail={employeeEmail} weekdays={WEEK} tooltipFor={(v) => `${v.employee_name || v.employee_email} — ${typeLabel(v.type)} (${statusLabel(v.status)})`} />
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {Array.from({ length: 12 }, (_, m) => (
                <div key={m}>
                  <p className="text-[11px] font-black uppercase tracking-widest text-primary/40 mb-1">{MONTHS[m]}</p>
                  <MonthGrid y={cursor.y} m={m} vacations={vacations} myEmail={employeeEmail} weekdays={WEEK} compact tooltipFor={(v) => `${v.employee_name || v.employee_email} — ${typeLabel(v.type)} (${statusLabel(v.status)})`} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
};

export default VacationCalendar;
