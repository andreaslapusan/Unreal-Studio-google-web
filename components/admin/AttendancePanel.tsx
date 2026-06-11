/**
 * AttendancePanel — FICHAJES del equipo para admin (vista Empleados), en TABLA:
 * Empleado · Fecha · Entrada · Pausa comida (in/out) · Salida. Cada evento muestra
 * hora, lugar (GPS) y foto. Filtrable por empleado y rango de fechas. Botón para
 * descargar el reporte en PDF (rango seleccionado).
 *
 * Datos: RPC admin_attendance_list (guard is_admin_or_team). Fotos del bucket
 * privado `attendance` firmadas en lote (admin tiene permiso de lectura).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';

interface Row { id: string; employee_email: string; employee_name: string; type: string; ts: string; latitude: number | null; longitude: number | null; photo_path: string | null; }
interface Emp { email: string; name: string; }
type Ev = { ts: string; lat: number | null; lng: number | null; photo: string | null };
interface DayRow { key: string; name: string; email: string; day: string; check_in?: Ev; break_start?: Ev; break_end?: Ev; check_out?: Ev; }

const COLS: [keyof DayRow, string][] = [
  ['check_in', 'Entrada'], ['break_start', 'Pausa comida (in)'], ['break_end', 'Pausa comida (out)'], ['check_out', 'Salida'],
];
const ANCHORS: [number, number, string][] = [[-8.799, 115.1334, 'Golf Bay · Balangan'], [-8.6386, 115.1045, 'Oficina · Cemagi']];
function distM(a: number, b: number, c: number, d: number) {
  const R = 6371000, r = Math.PI / 180;
  const x = Math.sin((c - a) * r / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin((d - b) * r / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
function locLabel(lat: number | null, lng: number | null): string {
  if (lat == null || lng == null) return '';
  let best: [number, string] | null = null;
  for (const [alat, alng, lbl] of ANCHORS) { const dd = distM(lat, lng, alat, alng); if (dd <= 60 && (!best || dd < best[0])) best = [dd, lbl]; }
  return best ? best[1] : `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
}
function isoDaysAgo(n: number): string { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); }
const fmtTime = (iso: string) => { try { return new Date(iso).toLocaleString('es-ES', { hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };
const fmtDay = (d: string) => { try { return new Date(d + 'T00:00:00').toLocaleDateString('es-ES', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }); } catch { return d; } };

const AttendancePanel: React.FC = () => {
  const { t } = useTranslation();
  const [emps, setEmps] = useState<Emp[]>([]);
  const [email, setEmail] = useState('');
  const [from, setFrom] = useState(isoDaysAgo(30));
  const [to, setTo] = useState(isoDaysAgo(0));
  const [rows, setRows] = useState<Row[]>([]);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.from('employees').select('email, name').order('name');
      setEmps((data as Emp[]) ?? []);
    })();
  }, []);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      const { data } = await supabase.rpc('admin_attendance_list', { p_email: email || null, p_from: from || null, p_to: to || null });
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
  }, [email, from, to]);

  // Pivota por (empleado, día) → una fila con los 4 eventos en columnas.
  const dayRows = useMemo(() => {
    const map: Record<string, DayRow> = {};
    for (const r of rows) {
      const day = (r.ts || '').slice(0, 10);
      const key = `${r.employee_email}|${day}`;
      if (!map[key]) map[key] = { key, name: r.employee_name || r.employee_email.split('@')[0], email: r.employee_email, day };
      const ev: Ev = { ts: r.ts, lat: r.latitude, lng: r.longitude, photo: r.photo_path };
      if (!(map[key] as any)[r.type]) (map[key] as any)[r.type] = ev; // primer evento de cada tipo
    }
    return Object.values(map).sort((a, b) => b.day.localeCompare(a.day) || a.name.localeCompare(b.name));
  }, [rows]);

  const cell = (ev?: Ev) => {
    if (!ev) return '<span style="color:#cbb">—</span>';
    const url = ev.photo ? photoUrls[ev.photo] : '';
    return `<div style="line-height:1.5"><b>${fmtTime(ev.ts)}</b>` +
      (ev.lat != null ? `<br><span style="font-size:10px;color:#8a7">${locLabel(ev.lat, ev.lng)}</span>` : '') +
      (url ? `<br><img src="${url}" style="width:46px;height:46px;object-fit:cover;border-radius:6px;margin-top:3px" />` : '') + `</div>`;
  };

  const downloadPdf = () => {
    const head = `<tr style="background:#3F2305;color:#fff"><th>Empleado</th><th>Fecha</th>${COLS.map(([, l]) => `<th>${l}</th>`).join('')}</tr>`;
    const body = dayRows.map((d) => `<tr>
      <td><b>${d.name}</b><br><span style="font-size:10px;color:#888">${d.email}</span></td>
      <td>${fmtDay(d.day)}</td>
      ${COLS.map(([k]) => `<td style="text-align:center">${cell(d[k] as Ev | undefined)}</td>`).join('')}
    </tr>`).join('');
    const html = `<html><head><title>Reporte de fichajes ${from} a ${to}</title>
      <style>body{font-family:Arial,sans-serif;color:#3F2305;padding:24px} h1{font-size:18px} table{width:100%;border-collapse:collapse;font-size:12px} th,td{border:1px solid #e4d9cc;padding:6px;text-align:left;vertical-align:top}</style></head>
      <body><h1>Reporte de asistencia · ${from} a ${to}</h1><table>${head}${body}</table></body></html>`;
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
    document.body.appendChild(iframe);
    const doc = iframe.contentWindow?.document; if (!doc) { document.body.removeChild(iframe); return; }
    doc.open(); doc.write(html); doc.close();
    setTimeout(() => { iframe.contentWindow?.focus(); iframe.contentWindow?.print(); setTimeout(() => { try { document.body.removeChild(iframe); } catch { /* ignore */ } }, 1500); }, 400);
  };

  const Cell: React.FC<{ ev?: Ev }> = ({ ev }) => {
    if (!ev) return <span className="text-gray-300">—</span>;
    const url = ev.photo ? photoUrls[ev.photo] : '';
    return (
      <div className="text-xs leading-tight">
        <div className="font-bold text-primary">{fmtTime(ev.ts)}</div>
        {ev.lat != null && (
          <a href={`https://maps.google.com/?q=${ev.lat},${ev.lng}`} target="_blank" rel="noreferrer" className="text-[10px] text-primary/50 hover:text-primary inline-flex items-center gap-0.5">
            <span className="material-symbols-outlined text-[12px]">location_on</span>{locLabel(ev.lat, ev.lng)}
          </a>
        )}
        {url && <a href={url} target="_blank" rel="noreferrer" className="block mt-1"><img src={url} alt="" className="w-12 h-12 object-cover rounded-md border border-gray-100" /></a>}
      </div>
    );
  };

  return (
    <div className="mt-10">
      <h2 className="text-2xl font-serif text-primary mb-2">{t('admin.att.title')}</h2>
      <p className="text-sm text-gray-400 mb-4">{t('admin.att.subtitle')}</p>

      <div className="flex flex-wrap items-center gap-2 mb-5">
        <select value={email} onChange={(e) => setEmail(e.target.value)} className="bg-white border border-gray-200 rounded-xl pl-3 pr-8 py-2 text-sm font-bold text-primary">
          <option value="">{t('admin.att.allEmployees')}</option>
          {emps.map((e) => <option key={e.email} value={e.email}>{e.name}</option>)}
        </select>
        <label className="text-xs text-primary/50 font-bold">{t('admin.att.from')}
          <input type="date" value={from} max="2099-12-31" onChange={(e) => setFrom(e.target.value)} className="ml-1 bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm" />
        </label>
        <label className="text-xs text-primary/50 font-bold">{t('admin.att.to')}
          <input type="date" value={to} max="2099-12-31" onChange={(e) => setTo(e.target.value)} className="ml-1 bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm" />
        </label>
        <button onClick={downloadPdf} disabled={loading || dayRows.length === 0}
          className="bg-primary text-white text-[10px] font-black uppercase tracking-widest px-4 py-2.5 rounded-xl inline-flex items-center gap-1 hover:bg-black transition disabled:opacity-40">
          <span className="material-symbols-outlined text-sm">download</span> Descargar reporte (PDF)
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">{t('admin.att.loading')}</p>
      ) : dayRows.length === 0 ? (
        <p className="text-sm text-gray-300 italic">{t('admin.att.empty')}</p>
      ) : (
        <div className="overflow-x-auto bg-white rounded-2xl border border-gray-100 shadow-sm">
          <table className="w-full text-sm min-w-[820px]">
            <thead className="bg-gray-50 text-[10px] uppercase tracking-widest text-primary/50">
              <tr>
                <th className="text-left px-4 py-3">Empleado</th>
                <th className="text-left px-4 py-3">Fecha</th>
                {COLS.map(([k, l]) => <th key={k as string} className="text-left px-4 py-3">{l}</th>)}
              </tr>
            </thead>
            <tbody>
              {dayRows.map((d) => (
                <tr key={d.key} className="border-t border-gray-50 align-top">
                  <td className="px-4 py-3"><div className="font-bold text-primary">{d.name}</div><div className="text-[10px] text-gray-400">{d.email}</div></td>
                  <td className="px-4 py-3 text-primary/70 whitespace-nowrap capitalize">{fmtDay(d.day)}</td>
                  {COLS.map(([k]) => <td key={k as string} className="px-4 py-3"><Cell ev={d[k] as Ev | undefined} /></td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default AttendancePanel;
