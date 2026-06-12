/**
 * AttendanceReportsPanel — lista descargable de los REPORTES DE ASISTENCIA en PDF
 * que el sistema genera automáticamente cada día a las 23:59 (hora Bali) y sube al
 * bucket privado `attendance-reports`. Va dentro del menú de Empleados.
 *
 * Lectura directa de la tabla public.attendance_reports (RLS: solo admin/equipo).
 * Descarga vía signed URL del Storage (RLS de objetos: solo admin/equipo).
 * Filtrado por rango de fechas + ordenación (fecha / asistencia).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { uiLocale } from '../../lib/dateLocale';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';

interface Report {
  report_date: string;
  file_path: string;
  present: number;
  total: number;
  bytes: number;
  generated_at: string;
}

type SortKey = 'date_desc' | 'date_asc' | 'present_desc' | 'present_asc';

const AttendanceReportsPanel: React.FC = () => {
  const { t } = useTranslation();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sort, setSort] = useState<SortKey>('date_desc');
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('attendance_reports')
        .select('report_date, file_path, present, total, bytes, generated_at');
      setReports((data as Report[]) ?? []);
      setLoading(false);
    })();
  }, []);

  const rows = useMemo(() => {
    let r = reports.filter((x) => (!from || x.report_date >= from) && (!to || x.report_date <= to));
    r = [...r].sort((a, b) => {
      switch (sort) {
        case 'date_asc': return a.report_date.localeCompare(b.report_date);
        case 'present_desc': return b.present - a.present || b.report_date.localeCompare(a.report_date);
        case 'present_asc': return a.present - b.present || b.report_date.localeCompare(a.report_date);
        default: return b.report_date.localeCompare(a.report_date);
      }
    });
    return r;
  }, [reports, from, to, sort]);

  const download = async (r: Report) => {
    setBusy(r.report_date);
    const { data, error } = await supabase.storage
      .from('attendance-reports')
      .createSignedUrl(r.file_path, 3600);
    setBusy(null);
    if (error || !data?.signedUrl) {
      alert(t('admin.attRep.errDownload', 'No se pudo descargar el reporte.'));
      return;
    }
    window.open(data.signedUrl, '_blank');
  };

  const fmtDay = (d: string) => {
    try { return new Date(d + 'T00:00:00').toLocaleDateString(uiLocale(), { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }); }
    catch { return d; }
  };
  const fmtGen = (iso: string) => {
    try { return new Date(iso).toLocaleString(uiLocale(), { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); }
    catch { return ''; }
  };

  return (
    <div className="mt-12">
      <h2 className="text-2xl font-serif text-primary mb-2">{t('admin.attRep.title', 'Reportes de asistencia (PDF)')}</h2>
      <p className="text-sm text-gray-400 mb-4">{t('admin.attRep.subtitle', 'Reporte diario generado automáticamente a las 23:59 (hora Bali). Descargable, con foto por fichaje.')}</p>

      <div className="flex flex-wrap items-center gap-2 mb-5">
        <label className="text-xs text-primary/50 font-bold">{t('admin.att.from', 'Desde')}
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="ml-1 bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm" />
        </label>
        <label className="text-xs text-primary/50 font-bold">{t('admin.att.to', 'Hasta')}
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="ml-1 bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm" />
        </label>
        <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="bg-white border border-gray-200 rounded-xl pl-3 pr-8 py-2 text-sm font-bold text-primary">
          <option value="date_desc">{t('admin.attRep.sortDateDesc', 'Fecha (recientes)')}</option>
          <option value="date_asc">{t('admin.attRep.sortDateAsc', 'Fecha (antiguos)')}</option>
          <option value="present_desc">{t('admin.attRep.sortPresDesc', 'Más presentes')}</option>
          <option value="present_asc">{t('admin.attRep.sortPresAsc', 'Menos presentes')}</option>
        </select>
        <span className="text-[10px] font-black uppercase tracking-widest text-primary/30 ml-auto">{t('admin.attRep.count', { n: rows.length, defaultValue: '{{n}} reportes' })}</span>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">{t('admin.att.loading', 'Cargando…')}</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-300 italic">{t('admin.attRep.empty', 'Aún no hay reportes generados.')}</p>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-400 text-[10px] uppercase tracking-widest">
              <tr>
                <th className="text-left px-4 py-3">{t('admin.attRep.thDate', 'Fecha')}</th>
                <th className="text-left px-4 py-3">{t('admin.attRep.thPresent', 'Asistencia')}</th>
                <th className="text-left px-4 py-3 hidden md:table-cell">{t('admin.attRep.thGenerated', 'Generado')}</th>
                <th className="text-left px-4 py-3 hidden md:table-cell">{t('admin.attRep.thSize', 'Tamaño')}</th>
                <th className="text-right px-4 py-3">{t('admin.attRep.thAction', 'Descargar')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.report_date} className="border-t border-gray-50 hover:bg-gray-50/60 transition">
                  <td className="px-4 py-3 font-bold text-primary capitalize whitespace-nowrap">{fmtDay(r.report_date)}</td>
                  <td className="px-4 py-3 text-primary/70">
                    <span className="inline-flex items-center gap-1 text-[11px] font-black uppercase px-2 py-0.5 rounded-full bg-green-50 text-green-600">
                      <span className="material-symbols-outlined text-xs">groups</span>{r.present}/{r.total}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 hidden md:table-cell whitespace-nowrap">{fmtGen(r.generated_at)}</td>
                  <td className="px-4 py-3 text-gray-400 hidden md:table-cell whitespace-nowrap">{(r.bytes / 1024).toFixed(0)} KB</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => download(r)}
                      disabled={busy === r.report_date}
                      className="inline-flex items-center gap-1 bg-primary text-white text-[10px] font-black uppercase tracking-widest px-3 py-2 rounded-lg hover:bg-black transition disabled:opacity-50"
                    >
                      <span className={`material-symbols-outlined text-sm ${busy === r.report_date ? 'animate-spin' : ''}`}>{busy === r.report_date ? 'progress_activity' : 'download'}</span>
                      PDF
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default AttendanceReportsPanel;
