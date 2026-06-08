/**
 * AttendancePanel — tabla de FICHAJES (attendance) para el admin, dentro del menú
 * de Empleados. Filtrable por empleado y por rango de fechas. Las notificaciones
 * de "fichó tarde" enlazan aquí (vista Empleados).
 *
 * Datos vía RPC `admin_attendance_list` (SECURITY DEFINER, guard is_admin_or_team).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';

interface Row { id: string; employee_email: string; employee_name: string; type: string; ts: string; latitude: number | null; longitude: number | null; photo_path: string | null; }
interface Emp { email: string; name: string; }

const TYPE_LABEL: Record<string, { key: string; cls: string; icon: string }> = {
  check_in:    { key: 'admin.att.checkIn',    cls: 'bg-green-50 text-green-600',  icon: 'login' },
  check_out:   { key: 'admin.att.checkOut',   cls: 'bg-red-50 text-red-500',      icon: 'logout' },
  break_start: { key: 'admin.att.breakStart', cls: 'bg-amber-50 text-amber-600',  icon: 'lunch_dining' },
  break_end:   { key: 'admin.att.breakEnd',   cls: 'bg-blue-50 text-blue-600',    icon: 'play_arrow' },
};

function isoDaysAgo(n: number): string {
  const d = new Date(); d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

const AttendancePanel: React.FC = () => {
  const { t } = useTranslation();
  const [emps, setEmps] = useState<Emp[]>([]);
  const [email, setEmail] = useState('');
  const [from, setFrom] = useState(isoDaysAgo(30));
  const [to, setTo] = useState(isoDaysAgo(0));
  const [rows, setRows] = useState<Row[]>([]);
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
      const { data } = await supabase.rpc('admin_attendance_list', {
        p_email: email || null, p_from: from || null, p_to: to || null,
      });
      setRows((data as Row[]) ?? []);
      setLoading(false);
    })();
  }, [email, from, to]);

  // Agrupa por día para una lectura tipo calendario.
  const byDay = useMemo(() => {
    const map: Record<string, Row[]> = {};
    for (const r of rows) {
      const d = (r.ts || '').slice(0, 10);
      (map[d] = map[d] || []).push(r);
    }
    return Object.entries(map).sort((a, b) => b[0].localeCompare(a[0]));
  }, [rows]);

  const fmtTime = (iso: string) => { try { return new Date(iso).toLocaleString('es-ES', { hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };
  const fmtDay = (d: string) => { try { return new Date(d + 'T00:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: '2-digit', month: 'long' }); } catch { return d; } };

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
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="ml-1 bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm" />
        </label>
        <label className="text-xs text-primary/50 font-bold">{t('admin.att.to')}
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="ml-1 bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm" />
        </label>
        <span className="text-[10px] font-black uppercase tracking-widest text-primary/30 ml-auto">{t('admin.att.records', { n: rows.length })}</span>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">{t('admin.att.loading')}</p>
      ) : byDay.length === 0 ? (
        <p className="text-sm text-gray-300 italic">{t('admin.att.empty')}</p>
      ) : (
        <div className="space-y-4">
          {byDay.map(([day, list]) => (
            <div key={day} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-4 py-2.5 bg-gray-50 text-[11px] font-black uppercase tracking-widest text-primary/50 capitalize">{fmtDay(day)} · {list.length}</div>
              <table className="w-full text-sm">
                <tbody>
                  {list.map((r) => {
                    const meta = TYPE_LABEL[r.type] ?? { key: '', cls: 'bg-gray-100 text-gray-500', icon: 'schedule' };
                    return (
                      <tr key={r.id} className="border-t border-gray-50">
                        <td className="px-4 py-2.5 font-bold text-primary whitespace-nowrap">{fmtTime(r.ts)}</td>
                        <td className="px-4 py-2.5 text-primary/70">{r.employee_name || r.employee_email}</td>
                        <td className="px-4 py-2.5">
                          <span className={`inline-flex items-center gap-1 text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${meta.cls}`}>
                            <span className="material-symbols-outlined text-xs">{meta.icon}</span>{meta.key ? t(meta.key) : r.type}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          {r.latitude != null && r.longitude != null && (
                            <a href={`https://maps.google.com/?q=${r.latitude},${r.longitude}`} target="_blank" rel="noreferrer" className="text-primary/40 hover:text-primary inline-flex" title={t('admin.att.location')}>
                              <span className="material-symbols-outlined text-base">location_on</span>
                            </a>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AttendancePanel;
