/**
 * EmployeeEditModal — alta/edición de empleado en un pop-up con submenú lateral
 * (Datos · Permisos · Horario), siguiendo el estándar de modales al 70%.
 * Guarda vía RPC admin_save_employee (crea también el usuario de login con
 * ensure_auth_user) y permite eliminar vía admin_delete_employee.
 */
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { EMPLOYEE_PERMISSIONS, hasPermission } from '../../lib/permissions';
import { uiLocale, weekdaysFor } from '../../lib/dateLocale';

export interface EmployeeRow {
  id: string;
  email: string;
  full_name: string | null;
  password: string | null;
  active: boolean;
  can_upload_reports: boolean;
  permissions: Record<string, boolean> | null;
  work_start_time: string | null;
  work_end_time: string | null;
  work_days: number[] | null;
  late_margin_min: number | null;
  phone?: string | null;
}

type Tab = 'datos' | 'permisos' | 'horario';
const DAYS: [string, number][] = [['L', 1], ['M', 2], ['X', 3], ['J', 4], ['V', 5], ['S', 6], ['D', 7]];
const genPassword = () => Math.random().toString(36).slice(2, 6) + Math.random().toString(36).slice(2, 6);

interface Props { emp: EmployeeRow | null; onClose: () => void; onSaved: (info?: { email: string; active: boolean }) => void; }

export default function EmployeeEditModal({ emp, onClose, onSaved }: Props) {
  const { t } = useTranslation();
  const isNew = !emp;
  const [tab, setTab] = useState<Tab>('datos');
  const [fullName, setFullName] = useState(emp?.full_name ?? '');
  const [email, setEmail] = useState(emp?.email ?? '');
  const [phone, setPhone] = useState((emp as any)?.phone ?? '');
  const [password, setPassword] = useState(isNew ? genPassword() : '');
  const [active, setActive] = useState(emp?.active ?? true);
  const [lang, setLang] = useState<string>((emp as any)?.preferred_language ?? 'es');
  const [perms, setPerms] = useState<Record<string, boolean>>(() => {
    const m: Record<string, boolean> = {};
    EMPLOYEE_PERMISSIONS.forEach((p) => { m[p.key] = hasPermission(emp, p.key); });
    return m;
  });
  const [start, setStart] = useState((emp?.work_start_time ?? '09:00').slice(0, 5));
  const [end, setEnd] = useState((emp?.work_end_time ?? '17:00').slice(0, 5));
  const [margin, setMargin] = useState(emp?.late_margin_min ?? 15);
  const [days, setDays] = useState<number[]>(emp?.work_days ?? [1, 2, 3, 4, 5]);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [err, setErr] = useState('');

  const save = async () => {
    setErr('');
    if (!fullName.trim()) { setErr(t('fix.emp.errNameRequired')); setTab('datos'); return; }
    if (!email.trim() || !email.includes('@')) { setErr(t('fix.emp.errEmailRequired')); setTab('datos'); return; }
    if (isNew && !password.trim()) { setErr(t('fix.emp.errPasswordRequired')); setTab('datos'); return; }
    setSaving(true);
    const { error } = await supabase.rpc('admin_save_employee', {
      p_id: emp?.id ?? null,
      p_email: email.trim(),
      p_full_name: fullName.trim(),
      p_password: password.trim() || null,
      p_active: active,
      p_permissions: perms,
      p_work_start: start || null,
      p_work_end: end || null,
      p_work_days: days.length ? days : null,
      p_late_margin: margin,
      p_lang: lang || 'es',
      p_phone: phone.trim() || null,
    });
    setSaving(false);
    if (error) {
      setErr(error.message?.includes('email_exists') ? t('fix.emp.errEmailExists') : (error.message || t('fix.emp.errSave')));
      return;
    }
    onSaved({ email: email.trim(), active });
    onClose();
  };

  const del = async () => {
    if (!emp) return;
    if (!window.confirm(t('fix.emp.confirmDelete', { name: emp.full_name || emp.email }))) return;
    setDeleting(true);
    const { error } = await supabase.rpc('admin_delete_employee', { p_id: emp.id });
    setDeleting(false);
    if (error) { setErr(error.message || t('fix.emp.errDelete')); return; }
    onSaved();
    onClose();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'BUTTON' && !saving) { e.preventDefault(); void save(); }
  };

  const TABS: [Tab, string, string][] = [['datos', t('fix.emp.tabData'), 'badge'], ['permisos', t('fix.emp.tabPermissions'), 'key'], ['horario', t('fix.emp.tabSchedule'), 'schedule']];

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="ust-modal bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()} onKeyDown={onKeyDown}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-xl font-serif text-primary">{isNew ? t('fix.emp.titleNew') : (fullName || t('fix.emp.titleEdit'))}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-primary"><span className="material-symbols-outlined">close</span></button>
        </div>

        <div className="flex flex-col sm:flex-row flex-1 min-h-0">
          {/* Submenú lateral */}
          <nav className="w-full sm:w-40 shrink-0 border-b sm:border-r border-gray-100 p-3 flex flex-row sm:flex-col gap-1 overflow-x-auto sm:overflow-x-visible bg-gray-50/50">
            {TABS.map(([k, label, icon]) => (
              <button key={k} onClick={() => setTab(k)}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-bold text-left transition ${tab === k ? 'bg-primary text-white' : 'text-primary/60 hover:bg-gray-100'}`}>
                <span className="material-symbols-outlined text-[18px]">{icon}</span>{label}
              </button>
            ))}
          </nav>

          {/* Contenido */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {tab === 'datos' && (
              <>
                <label className="block">
                  <span className="text-xs font-bold text-primary/50 uppercase tracking-widest">{t('fix.emp.labelFullName')}</span>
                  <input value={fullName} onChange={(e) => setFullName(e.target.value)} className="mt-1 w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm" />
                </label>
                <label className="block">
                  <span className="text-xs font-bold text-primary/50 uppercase tracking-widest">{t('fix.emp.labelEmail')}</span>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm" />
                </label>
                <label className="block">
                  <span className="text-xs font-bold text-primary/50 uppercase tracking-widest">{t('fix.emp.labelPhone', { defaultValue: 'Teléfono (WhatsApp)' })}</span>
                  <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+62..." className="mt-1 w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm" />
                </label>
                <label className="block">
                  <span className="text-xs font-bold text-primary/50 uppercase tracking-widest">{t('fix.emp.labelPassword')} {isNew ? '' : t('fix.emp.labelPasswordHint')}</span>
                  <div className="mt-1 flex gap-2">
                    <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder={isNew ? '' : '••••••••'} className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-mono" />
                    <button onClick={() => setPassword(genPassword())} className="px-3 py-2 rounded-xl bg-gray-100 text-primary/70 text-xs font-bold hover:bg-gray-200">{t('fix.emp.generate')}</button>
                  </div>
                </label>
                <label className="block">
                  <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">{t('fix.emp.language', { defaultValue: 'Idioma preferido' })}</span>
                  <select value={lang} onChange={(e) => setLang(e.target.value)} className="mt-1 w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-bold">
                    <option value="es">Español</option><option value="en">English</option><option value="ro">Română</option><option value="id">Indonesia</option>
                  </select>
                </label>
                <button onClick={() => setActive((a) => !a)} className={`px-3 py-1.5 rounded-full text-xs font-bold transition ${active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                  {active ? t('fix.emp.active') : t('fix.emp.inactive')}
                </button>
              </>
            )}

            {tab === 'permisos' && (
              <div className="flex flex-wrap gap-2">
                {EMPLOYEE_PERMISSIONS.map((p) => {
                  const on = perms[p.key];
                  return (
                    <button key={p.key} title={t('admin.perms.' + p.key, p.description || p.label)} onClick={() => setPerms((m) => ({ ...m, [p.key]: !on }))}
                      className={`px-3 py-1.5 rounded-full text-[12px] font-bold transition ${on ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'}`}>
                      <span className="material-symbols-outlined text-[14px] align-middle mr-1">{on ? 'check_circle' : 'radio_button_unchecked'}</span>{t('admin.perms.' + p.key, p.label)}
                    </button>
                  );
                })}
              </div>
            )}

            {tab === 'horario' && (
              <>
                <div className="flex items-center gap-2">
                  <label className="text-xs font-bold text-primary/50">{t('fix.emp.startTime')}
                    <input type="time" value={start} onChange={(e) => setStart(e.target.value)} className="ml-1 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 text-sm" />
                  </label>
                  <span className="text-gray-300">→</span>
                  <label className="text-xs font-bold text-primary/50">{t('fix.emp.endTime')}
                    <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="ml-1 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 text-sm" />
                  </label>
                </div>
                <label className="flex items-center gap-2 text-xs font-bold text-primary/50">{t('fix.emp.tolerance')}
                  <input type="number" min={0} max={120} value={margin} onChange={(e) => setMargin(parseInt(e.target.value) || 0)} className="bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 text-sm w-16" /> {t('fix.emp.minutes')}
                </label>
                <div>
                  <span className="text-xs font-bold text-primary/50 uppercase tracking-widest block mb-1.5">{t('fix.emp.workDays')}</span>
                  <div className="flex gap-1.5">
                    {DAYS.map(([, dow]) => {
                      const on = days.includes(dow);
                      return (
                        <button key={dow} onClick={() => setDays((d) => on ? d.filter((x) => x !== dow) : [...d, dow].sort())}
                          className={`w-8 h-8 rounded-lg text-xs font-bold transition ${on ? 'bg-primary text-white' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'}`}>{weekdaysFor(uiLocale())[dow-1]}</button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            {err && <p className="text-red-600 text-sm font-medium">{err}</p>}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-gray-100">
          {!isNew ? (
            <button onClick={del} disabled={deleting} className="text-red-600 text-xs font-bold uppercase tracking-widest hover:text-red-700 inline-flex items-center gap-1 disabled:opacity-40">
              <span className="material-symbols-outlined text-sm">{deleting ? 'progress_activity' : 'delete'}</span> {t('fix.emp.delete')}
            </button>
          ) : <span />}
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2.5 rounded-xl text-primary/60 text-xs font-bold uppercase tracking-widest hover:bg-gray-100">{t('fix.emp.cancel')}</button>
            <button onClick={save} disabled={saving} className="bg-primary text-white px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-black transition inline-flex items-center gap-1.5 disabled:opacity-50">
              {saving && <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>}
              {saving ? t('fix.emp.saving') : t('fix.emp.save')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
