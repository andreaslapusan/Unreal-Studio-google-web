/**
 * AttendancePanel — REPORTE DE ASISTENCIA del equipo (admin, vista Empleados).
 * Tabla: Empleado · Fecha · Entrada · Pausa (in/out) · Salida · Total · Dif.
 * Cada evento: hora, lugar (GPS) y foto. Multiselección de empleados, rango de
 * fechas, y "Descargar reporte (PDF)". Total = horas trabajadas; Dif = vs horario
 * asignado (en rojo si trabajó menos).
 * Datos: RPC admin_attendance_list. Fotos del bucket privado `attendance` (firmadas).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { baliDate, baliTime, baliToday } from '../../lib/timezone';

interface Row { id: string; employee_email: string; employee_name: string; type: string; ts: string; latitude: number | null; longitude: number | null; photo_path: string | null; }
interface Emp { email: string; name: string; work_start_time: string | null; work_end_time: string | null; }
type Ev = { ts: string; lat: number | null; lng: number | null; photo: string | null };
interface DayRow { key: string; name: string; email: string; day: string; check_in?: Ev; break_start?: Ev; break_end?: Ev; check_out?: Ev; }

const COLS: [keyof DayRow, string][] = [['check_in', 'Entrada'], ['break_start', 'Pausa (in)'], ['break_end', 'Pausa (out)'], ['check_out', 'Salida']];
const ANCHORS: [number, number, string][] = [[-8.799, 115.1334, 'Golf Bay · Balangan'], [-8.6386, 115.1045, 'Oficina · Cemagi']];
function distM(a: number, b: number, c: number, d: number) { const R = 6371000, r = Math.PI / 180; const x = Math.sin((c - a) * r / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin((d - b) * r / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); }
function locLabel(lat: number | null, lng: number | null): string {
  if (lat == null || lng == null) return '';
  let best: [number, string] | null = null;
  for (const [alat, alng, lbl] of ANCHORS) { const dd = distM(lat, lng, alat, alng); if (dd <= 60 && (!best || dd < best[0])) best = [dd, lbl]; }
  return best ? best[1] : `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
}
function isoDaysAgo(n: number): string { const d = new Date(`${baliToday()}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); }
const fmtTime = (iso: string) => baliTime(iso);
const fmtDay = (s: string) => { try { return new Date(s + 'T00:00:00').toLocaleDateString('es-ES', { weekday: 'short', day: '2-digit', month: 'short' }); } catch { return s; } };
const hm = (min: number) => { const s = min < 0 ? '-' : ''; const a = Math.abs(Math.round(min)); return `${s}${Math.floor(a / 60)}:${String(a % 60).padStart(2, '0')}`; };
const schedMin = (t: string | null) => { if (!t) return null; const [h, m] = t.split(':'); return Number(h) * 60 + Number(m); };

const AttendancePanel: React.FC = () => {
  const { t } = useTranslation();
  const [emps, setEmps] = useState<Emp[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [from, setFrom] = useState(isoDaysAgo(30));
  const [to, setTo] = useState(isoDaysAgo(0));
  const [rows, setRows] = useState<Row[]>([]);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.from('employees').select('email, name, work_start_time, work_end_time').eq('active', true).order('name');
      setEmps((data as Emp[]) ?? []);
    })();
  }, []);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      const { data } = await supabase.rpc('admin_attendance_list', { p_email: null, p_from: from || null, p_to: to || null });
      const rs = (data as Row[]) ?? [];
      setRows(rs);
      const paths = rs.map((r) => r.photo_path).filter(Boolean) as string[];
      if (paths.length) {
        const { data: signed } = await supabase.storage.from('attendance').createSignedUrls(paths, 3600);
        const m: Record<string, string> = {};
        (signed || []).forEach((s) => { if (s.path && s.signedUrl) m[s.path] = s.signedUrl; });
        setPhotoUrls(m);
      } else setPhotoUrls({});
      setLoading(false);
    })();
  }, [from, to]);

  const schedule = useMemo(() => {
    const m: Record<string, number | null> = {};
    emps.forEach((e) => { const s = schedMin(e.work_start_time), en = schedMin(e.work_end_time); m[e.email] = (s != null && en != null) ? en - s : null; });
    return m;
  }, [emps]);

  const dayRows = useMemo(() => {
    const map: Record<string, DayRow> = {};
    for (const r of rows) {
      if (selected.size && !selected.has(r.employee_email)) continue;
      const day = baliDate(r.ts);
      const key = `${r.employee_email}|${day}`;
      if (!map[key]) map[key] = { key, name: r.employee_name || r.employee_email.split('@')[0], email: r.employee_email, day };
      const ev: Ev = { ts: r.ts, lat: r.latitude, lng: r.longitude, photo: r.photo_path };
      if (!(map[key] as any)[r.type]) (map[key] as any)[r.type] = ev;
    }
    return Object.values(map).sort((a, b) => b.day.localeCompare(a.day) || a.name.localeCompare(b.name));
  }, [rows, selected]);

  // Minutos trabajados: (salida - entrada) - (pausa_out - pausa_in).
  const worked = (d: DayRow): number | null => {
    if (!d.check_in || !d.check_out) return null;
    let mins = (new Date(d.check_out.ts).getTime() - new Date(d.check_in.ts).getTime()) / 60000;
    if (d.break_start && d.break_end) mins -= (new Date(d.break_end.ts).getTime() - new Date(d.break_start.ts).getTime()) / 60000;
    return mins;
  };

  const toggle = (email: string) => setSelected((prev) => { const n = new Set(prev); n.has(email) ? n.delete(email) : n.add(email); return n; });

  // Estructura de altura FIJA para que las fotos queden alineadas en toda la fila,
  // haya o no coordenadas/lugar identificado.
  const cellHtml = (ev?: Ev) => {
    if (!ev) return '<div style="height:108px;display:flex;align-items:flex-start;color:#cbb">—</div>';
    const url = ev.photo ? photoUrls[ev.photo] : '';
    const loc = ev.lat != null ? locLabel(ev.lat, ev.lng) : '';
    return `<div style="line-height:1.4">`
      + `<div style="height:16px;font-weight:700">${fmtTime(ev.ts)}</div>`
      + `<div style="height:14px;font-size:10px;color:#8a7;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:90px">${loc}</div>`
      + (url ? `<img src="${url}" style="width:70px;height:70px;object-fit:cover;border-radius:6px;margin-top:4px;display:block" />` : `<div style="width:70px;height:70px;margin-top:4px"></div>`)
      + `</div>`;
  };

  const [downloading, setDownloading] = useState(false);
  // Descarga DIRECTA del PDF (sin diálogo de imprimir).
  const downloadPdf = async () => {
    setDownloading(true);
    try {
      const head = `<tr style="background:#3F2305;color:#fff"><th>${t('fix.att.employee')}</th><th>${t('fix.att.date')}</th>${COLS.map(([k]) => `<th>${t(`fix.att.col_${k}`)}</th>`).join('')}<th>${t('fix.att.total')}</th><th>${t('fix.att.diff')}</th></tr>`;
      const body = dayRows.map((d) => {
        const w = worked(d); const asg = schedule[d.email]; const diff = (w != null && asg != null) ? w - asg : null;
        return `<tr><td><b>${d.name}</b><br><span style="font-size:10px;color:#888">${d.email}</span></td><td>${fmtDay(d.day)}</td>` +
          COLS.map(([k]) => `<td style="text-align:center">${cellHtml(d[k] as Ev | undefined)}</td>`).join('') +
          `<td style="text-align:center"><b>${w != null ? hm(w) : '—'}</b></td><td style="text-align:center;color:${diff != null && diff < 0 ? '#c00' : '#070'}">${diff != null ? hm(diff) : '—'}</td></tr>`;
      }).join('');
      const inner = `<style>h1{font-size:18px;margin:0 0 12px}table{width:100%;border-collapse:collapse;font-size:11px}th,td{border:1px solid #e4d9cc;padding:5px;text-align:left;vertical-align:top}</style>`
        + `<h1>${t('fix.att.reportTitle', { from, to })}</h1><table>${head}${body}</table>`;
      const { downloadPdfFromHtml } = await import('../../lib/pdf');
      await downloadPdfFromHtml(inner, `reporte-asistencia_${from}_a_${to}.pdf`);
    } finally {
      setDownloading(false);
    }
  };

  // Altura fija por bloque (hora / lugar / foto) → todas las fotos de la fila
  // quedan alineadas independientemente de si hay coordenadas o lugar.
  const Cell: React.FC<{ ev?: Ev }> = ({ ev }) => {
    if (!ev) return <div className="h-[108px] flex items-start text-gray-300">—</div>;
    const url = ev.photo ? photoUrls[ev.photo] : '';
    return (
      <div className="text-xs leading-tight">
        <div className="font-bold text-primary h-4">{fmtTime(ev.ts)}</div>
        <div className="h-3.5 overflow-hidden">
          {ev.lat != null && (
            <a href={`https://maps.google.com/?q=${ev.lat},${ev.lng}`} target="_blank" rel="noreferrer" className="text-[10px] text-primary/50 hover:text-primary inline-flex items-center gap-0.5 max-w-[92px] truncate">
              <span className="material-symbols-outlined text-[12px]">location_on</span>{locLabel(ev.lat, ev.lng)}
            </a>
          )}
        </div>
        {url
          ? <a href={url} target="_blank" rel="noreferrer" className="block mt-1"><img src={url} alt="" className="w-[70px] h-[70px] object-cover rounded-md border border-gray-100" /></a>
          : <div className="w-[70px] h-[70px] mt-1" />}
      </div>
    );
  };

  return (
    <div className="mt-12">
      <h2 className="text-2xl font-serif text-primary mb-2">{t('fix.att.heading')}</h2>
      <p className="text-sm text-gray-400 mb-4">{t('fix.att.subtitle')}</p>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <label className="text-xs text-primary/50 font-bold">{t('fix.att.from')}
          <input type="date" value={from} max="2099-12-31" onChange={(e) => setFrom(e.target.value)} className="ml-1 bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm" />
        </label>
        <label className="text-xs text-primary/50 font-bold">{t('fix.att.to')}
          <input type="date" value={to} max="2099-12-31" onChange={(e) => setTo(e.target.value)} className="ml-1 bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm" />
        </label>
        <button onClick={() => void downloadPdf()} disabled={loading || downloading || dayRows.length === 0} className="ml-auto bg-primary text-white text-[10px] font-black uppercase tracking-widest px-4 py-2.5 rounded-xl inline-flex items-center gap-1 hover:bg-black transition disabled:opacity-40">
          <span className={`material-symbols-outlined text-sm ${downloading ? 'animate-spin' : ''}`}>{downloading ? 'progress_activity' : 'download'}</span> {downloading ? t('fix.att.generating') : t('fix.att.downloadPdf')}
        </button>
      </div>
      {/* Multiselección de empleados (chips). Vacío = todos. */}
      <div className="flex flex-wrap gap-1.5 mb-5">
        {emps.map((e) => {
          const on = selected.has(e.email);
          return <button key={e.email} onClick={() => toggle(e.email)} className={`text-[11px] font-bold px-3 py-1.5 rounded-full transition ${on ? 'bg-primary text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>{e.name}</button>;
        })}
        {selected.size > 0 && <button onClick={() => setSelected(new Set())} className="text-[11px] text-primary/50 underline px-2">{t('fix.att.all')}</button>}
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">{t('admin.att.loading')}</p>
      ) : dayRows.length === 0 ? (
        <p className="text-sm text-gray-300 italic">{t('admin.att.empty')}</p>
      ) : (
        <div className="overflow-x-auto bg-white rounded-2xl border border-gray-100 shadow-sm">
          <table className="w-full text-sm min-w-[920px]">
            <thead className="bg-gray-50 text-[10px] uppercase tracking-widest text-primary/50">
              <tr>
                <th className="text-left px-3 py-3 w-[110px]">{t('fix.att.employee')}</th>
                <th className="text-left px-2 py-3 w-[70px]">{t('fix.att.date')}</th>
                {COLS.map(([k]) => <th key={k as string} className="text-left px-3 py-3">{t(`fix.att.col_${k}`)}</th>)}
                <th className="text-center px-2 py-3 w-[64px]">{t('fix.att.total')}</th>
                <th className="text-center px-2 py-3 w-[64px]">{t('fix.att.diff')}</th>
              </tr>
            </thead>
            <tbody>
              {dayRows.map((d) => {
                const w = worked(d); const asg = schedule[d.email]; const diff = (w != null && asg != null) ? w - asg : null;
                return (
                  <tr key={d.key} className="border-t border-gray-50 align-top">
                    <td className="px-3 py-3"><div className="font-bold text-primary text-xs leading-tight">{d.name}</div><div className="text-[9px] text-gray-400 truncate max-w-[100px]">{d.email}</div></td>
                    <td className="px-2 py-3 text-primary/70 text-xs whitespace-nowrap capitalize">{fmtDay(d.day)}</td>
                    {COLS.map(([k]) => <td key={k as string} className="px-3 py-3"><Cell ev={d[k] as Ev | undefined} /></td>)}
                    <td className="px-2 py-3 text-center font-bold text-primary whitespace-nowrap">{w != null ? hm(w) : '—'}</td>
                    <td className={`px-2 py-3 text-center font-bold whitespace-nowrap ${diff != null && diff < 0 ? 'text-red-600' : 'text-green-600'}`}>{diff != null ? hm(diff) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default AttendancePanel;
