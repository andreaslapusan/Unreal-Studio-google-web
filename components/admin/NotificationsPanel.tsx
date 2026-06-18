/**
 * NotificationsPanel — centro de TAREAS del admin (?view=notifications).
 *
 * Dos pestañas:
 *  - TAREAS (acción): lo único que cuenta para el badge. Pagos vencidos, avisos de
 *    obra (sin reporte/estancada), pago reclamado a verificar, vacaciones por
 *    aprobar, (clientes sin propiedad, baja prioridad). Las CALCULADAS (vencidos,
 *    obra) se limpian solas al corregir la causa; las de EVENTO (pago reclamado,
 *    vacaciones) se cierran con "Hecho".
 *  - ACTIVIDAD (info): feed de solo lectura — logins de clientes, fichajes tarde,
 *    genéricas. Sin badge, sin botones. Auto-purga a 7 días.
 *
 * Fuente: RPCs SECURITY DEFINER admin_notifications_* + admin_attention_panel
 * (overdue_payments, construction_alerts, clients_no_property).
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { uiLocale } from '../../lib/dateLocale';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import AsyncButton from '../AsyncButton';

interface Notif {
  id: string; type: string; title: string; body: string | null; severity: string;
  entity_type: string | null; entity_id: string | null; actor_name: string | null;
  actor_email: string | null; metadata: Record<string, any> | null; is_read: boolean; created_at: string;
}
interface OverduePayment { id: string; label: string; amount: number; currency: string; due_date: string; client_name: string; client_id: string; }
interface ConstructionAlert { project_id: string; project_name: string; completion_percent: number | null; construction_update_date: string | null; has_report: boolean; days_since: number | null; }
interface ClientLite { id: string; name: string; email: string | null; }

const INFO_TYPES = new Set(['client_login', 'late_checkin', 'generic']);
const INFO_META: Record<string, { icon: string; labelKey: string; def: string; color: string }> = {
  client_login: { icon: 'login', labelKey: 'admin.notif.typeClientLogin', def: 'Acceso de cliente', color: 'text-blue-600 bg-blue-50' },
  late_checkin: { icon: 'schedule', labelKey: 'admin.notif.typeLateCheckin', def: 'Fichaje tarde', color: 'text-orange-600 bg-orange-50' },
  generic: { icon: 'notifications', labelKey: 'admin.notif.typeGeneric', def: 'Aviso', color: 'text-gray-600 bg-gray-100' },
};

function fmtWhen(iso: string): string {
  try { return new Date(iso).toLocaleString(uiLocale(), { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch { return iso; }
}
function fmtMoney(n: number, c: string): string {
  try { return new Intl.NumberFormat('es-ES', { style: 'currency', currency: c || 'EUR', maximumFractionDigits: 0 }).format(n); } catch { return `${c} ${n}`; }
}

const NotificationsPanel: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [tab, setTab] = useState<'tasks' | 'activity'>('tasks');
  const [items, setItems] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);
  const [overdue, setOverdue] = useState<OverduePayment[]>([]);
  const [missingReports, setMissingReports] = useState<ConstructionAlert[]>([]);
  const [staleProps, setStaleProps] = useState<ConstructionAlert[]>([]);
  const [noProp, setNoProp] = useState<ClientLite[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    await supabase.rpc('admin_notifications_cleanup');
    const [{ data: notifs }, { data: panel }] = await Promise.all([
      supabase.rpc('admin_notifications_list', { p_type: null, p_only_unread: false, p_limit: 300 }),
      supabase.rpc('admin_attention_panel'),
    ]);
    setItems((notifs as Notif[]) ?? []);
    const p = (panel as any) ?? {};
    setOverdue((p.overdue_payments as OverduePayment[]) ?? []);
    setStaleProps((p.stale_properties as ConstructionAlert[]) ?? []);
    setMissingReports((p.missing_reports as ConstructionAlert[]) ?? []);
    setNoProp((p.clients_no_property as ClientLite[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  // "Hecho": cierra una tarea de EVENTO (marca resuelta). No hay estado leído/no-leído.
  const resolve = async (id: string) => {
    setItems((prev) => prev.filter((n) => n.id !== id));
    await supabase.rpc('admin_notifications_mark_read', { p_id: id, p_read: true });
  };

  // Eventos abiertos por tipo (sin resolver).
  const claims = useMemo(() => items.filter((n) => n.type === 'payment_claim' && !n.is_read), [items]);
  const vacs = useMemo(() => items.filter((n) => n.type === 'vacation_request' && !n.is_read), [items]);
  const activity = useMemo(() => items.filter((n) => INFO_TYPES.has(n.type)), [items]);

  // Actividad agrupada por día y tipo ("5 clientes entraron al portal").
  const activityGroups = useMemo(() => {
    const dayKey = (iso: string) => { try { return new Date(iso).toLocaleDateString(uiLocale(), { day: '2-digit', month: 'short' }); } catch { return iso.slice(0, 10); } };
    const map = new Map<string, { type: string; day: string; count: number; last: string }>();
    const singles: Notif[] = [];
    for (const n of activity) {
      if (n.type === 'client_login' || n.type === 'late_checkin') {
        const k = `${n.type}|${dayKey(n.created_at)}`;
        const g = map.get(k) || { type: n.type, day: dayKey(n.created_at), count: 0, last: n.created_at };
        g.count++; if (n.created_at > g.last) g.last = n.created_at; map.set(k, g);
      } else singles.push(n);
    }
    return { agg: Array.from(map.values()).sort((a, b) => b.last.localeCompare(a.last)), singles };
  }, [activity]);

  const obraCount = missingReports.length + staleProps.length;
  const cobrosCount = overdue.length + claims.length;
  const equipoCount = vacs.length; // clients_no_property es baja prioridad, no cuenta
  const taskCount = cobrosCount + obraCount + equipoCount;

  // Resumen "empieza tu día"
  const summaryParts: string[] = [];
  if (overdue.length) summaryParts.push(t('admin.notif.sumOverdue', { defaultValue: '{{n}} por cobrar', n: overdue.length }));
  if (claims.length) summaryParts.push(t('admin.notif.sumClaims', { defaultValue: '{{n}} por verificar', n: claims.length }));
  if (vacs.length) summaryParts.push(t('admin.notif.sumVacs', { defaultValue: '{{n}} vacaciones', n: vacs.length }));
  if (obraCount) summaryParts.push(t('admin.notif.sumObra', { defaultValue: '{{n}} obra sin actualizar', n: obraCount }));

  const Chip: React.FC<{ n: number }> = ({ n }) => n > 0 ? <span className="text-[10px] font-black bg-primary/10 text-primary rounded-full px-2 py-0.5">{n}</span> : null;
  const groupTitle = (icon: string, title: string, n: number) => (
    <div className="flex items-center gap-2 mb-3 mt-1">
      <span className="material-symbols-outlined text-primary/60 text-base">{icon}</span>
      <h3 className="text-xs font-black uppercase tracking-widest text-primary/60">{title}</h3>
      <Chip n={n} />
    </div>
  );
  const Row: React.FC<{ icon: string; color: string; children: React.ReactNode; actions: React.ReactNode }> = ({ icon, color, children, actions }) => (
    <li className="flex items-start gap-3 rounded-2xl border border-gray-100 bg-white p-4">
      <span className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${color}`}><span className="material-symbols-outlined text-[20px]">{icon}</span></span>
      <div className="min-w-0 flex-1">{children}</div>
      <div className="flex flex-col items-end gap-2 shrink-0">{actions}</div>
    </li>
  );
  const PrimaryBtn: React.FC<{ onClick: () => void; label: string }> = ({ onClick, label }) => (
    <button onClick={onClick} className="inline-flex items-center gap-1 text-[11px] font-bold text-white bg-primary rounded-full px-3 py-1.5 hover:bg-black transition whitespace-nowrap">{label} <span className="material-symbols-outlined text-sm">arrow_forward</span></button>
  );

  return (
    <div className="animate-in fade-in duration-500">
      <div className="mb-5">
        <h1 className="text-2xl font-black uppercase tracking-widest text-primary/20">{t('admin.notif.title')}</h1>
        <p className="text-xs text-primary/50 mt-1">
          {taskCount > 0
            ? `${t('admin.notif.startDay', { defaultValue: 'Para hoy' })}: ${summaryParts.join(' · ')}`
            : t('admin.notif.allClear', { defaultValue: 'Todo al día. No tienes tareas pendientes.' })}
        </p>
      </div>

      {/* Pestañas */}
      <div className="flex items-center gap-1 mb-6 border-b border-gray-100">
        <button onClick={() => setTab('tasks')} className={`relative px-4 py-2.5 text-xs font-black uppercase tracking-widest transition ${tab === 'tasks' ? 'text-primary border-b-2 border-primary' : 'text-primary/40 hover:text-primary/70'}`}>
          {t('admin.notif.tabTasks', { defaultValue: 'Tareas' })}
          {taskCount > 0 && <span className="ml-2 text-[10px] bg-primary text-white rounded-full px-1.5 py-0.5">{taskCount}</span>}
        </button>
        <button onClick={() => setTab('activity')} className={`px-4 py-2.5 text-xs font-black uppercase tracking-widest transition ${tab === 'activity' ? 'text-primary border-b-2 border-primary' : 'text-primary/40 hover:text-primary/70'}`}>
          {t('admin.notif.tabActivity', { defaultValue: 'Actividad' })}
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><span className="material-symbols-outlined animate-spin text-3xl text-primary/30">refresh</span></div>
      ) : tab === 'tasks' ? (
        taskCount === 0 ? (
          <div className="text-center py-16">
            <span className="material-symbols-outlined text-5xl text-green-500/50">check_circle</span>
            <p className="text-sm font-bold text-primary mt-3">{t('admin.notif.allClear', { defaultValue: 'Todo al día. No tienes tareas pendientes.' })}</p>
          </div>
        ) : (
          <div className="space-y-8">
            {/* COBROS */}
            {cobrosCount > 0 && (
              <div>
                {groupTitle('payments', t('admin.notif.grpCobros', { defaultValue: 'Cobros' }), cobrosCount)}
                <ul className="space-y-2">
                  {overdue.map((o) => (
                    <Row key={`ov-${o.id}`} icon="priority_high" color="text-red-600 bg-red-50"
                      actions={<PrimaryBtn onClick={() => navigate('/admin?view=clients')} label={t('admin.notif.actViewPayment', { defaultValue: 'Ver cobro' })} />}>
                      <p className="font-bold text-primary text-sm">{o.client_name}</p>
                      <p className="text-sm text-primary/70">{o.label} · <span className="text-red-600 font-bold">{fmtMoney(Number(o.amount), o.currency)}</span></p>
                      <p className="text-[11px] text-red-500 mt-0.5">{t('admin.notif.expiredOn', { date: new Date(o.due_date).toLocaleDateString(uiLocale()) })}</p>
                    </Row>
                  ))}
                  {claims.map((n) => (
                    <Row key={n.id} icon="payments" color="text-green-700 bg-green-50"
                      actions={<>
                        <PrimaryBtn onClick={() => navigate('/admin?view=clients')} label={t('admin.notif.actVerify', { defaultValue: 'Verificar' })} />
                        <AsyncButton onClick={() => resolve(n.id)} className="text-[10px] font-bold uppercase tracking-widest text-primary/40 hover:text-primary transition">{t('admin.notif.done', { defaultValue: 'Hecho' })}</AsyncButton>
                      </>}>
                      <p className="font-bold text-primary text-sm">{n.title}</p>
                      {n.body && <p className="text-sm text-primary/70 mt-0.5">{n.body}</p>}
                      <p className="text-[11px] text-primary/40 mt-1">{fmtWhen(n.created_at)}</p>
                    </Row>
                  ))}
                </ul>
              </div>
            )}

            {/* OBRA — estancada (>30d) primero, luego reporte faltante */}
            {obraCount > 0 && (
              <div>
                {groupTitle('construction', t('admin.notif.grpObra', { defaultValue: 'Obra' }), obraCount)}
                <ul className="space-y-2">
                  {staleProps.map((c) => (
                    <Row key={`st-${c.project_id}`} icon="priority_high" color="text-red-600 bg-red-50"
                      actions={<PrimaryBtn onClick={() => navigate('/admin?view=projects')} label={t('admin.notif.actUpdateObra', { defaultValue: 'Actualizar estado' })} />}>
                      <p className="font-bold text-primary text-sm">{c.project_name}</p>
                      <p className="text-sm text-primary/70">{t('admin.notif.obraStale', { defaultValue: 'Obra sin novedades hace {{n}} días', n: c.days_since })}{typeof c.completion_percent === 'number' ? ` · ${c.completion_percent}%` : ''}</p>
                    </Row>
                  ))}
                  {missingReports.map((c) => (
                    <Row key={`mr-${c.project_id}`} icon="construction" color="text-amber-700 bg-amber-50"
                      actions={<PrimaryBtn onClick={() => navigate('/admin?view=projects')} label={t('admin.notif.actUploadReport', { defaultValue: 'Subir reporte' })} />}>
                      <p className="font-bold text-primary text-sm">{c.project_name}</p>
                      <p className="text-sm text-primary/70">
                        {c.days_since == null
                          ? t('admin.notif.obraNever', { defaultValue: 'Nunca se ha subido reporte de obra' })
                          : t('admin.notif.obraMissing', { defaultValue: 'Sin reporte nuevo hace {{n}} días', n: c.days_since })}
                        {typeof c.completion_percent === 'number' ? ` · ${c.completion_percent}%` : ''}
                      </p>
                    </Row>
                  ))}
                </ul>
              </div>
            )}

            {/* EQUIPO */}
            {(vacs.length > 0 || noProp.length > 0) && (
              <div>
                {groupTitle('groups', t('admin.notif.grpEquipo', { defaultValue: 'Equipo' }), equipoCount)}
                <ul className="space-y-2">
                  {vacs.map((n) => (
                    <Row key={n.id} icon="beach_access" color="text-amber-600 bg-amber-50"
                      actions={<>
                        <PrimaryBtn onClick={() => navigate('/admin?view=calendar')} label={t('admin.notif.actApprove', { defaultValue: 'Aprobar' })} />
                        <AsyncButton onClick={() => resolve(n.id)} className="text-[10px] font-bold uppercase tracking-widest text-primary/40 hover:text-primary transition">{t('admin.notif.done', { defaultValue: 'Hecho' })}</AsyncButton>
                      </>}>
                      <p className="font-bold text-primary text-sm">{n.title}</p>
                      {n.body && <p className="text-sm text-primary/70 mt-0.5">{n.body}</p>}
                      <p className="text-[11px] text-primary/40 mt-1">{fmtWhen(n.created_at)}</p>
                    </Row>
                  ))}
                </ul>
                {noProp.length > 0 && (
                  <div className="mt-3">
                    <p className="text-[11px] font-bold uppercase tracking-widest text-primary/30 mb-2">{t('admin.notif.clientsNoProperty', { count: noProp.length })}</p>
                    <div className="flex flex-wrap gap-2">
                      {noProp.map((c) => (
                        <button key={c.id} onClick={() => navigate('/admin?view=clients')} className="text-xs bg-gray-50 text-primary/70 px-3 py-1 rounded-full hover:bg-primary/10">{c.name}</button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      ) : (
        // ACTIVIDAD — agrupada por día (logins/fichajes) + genéricas sueltas
        activity.length === 0 ? (
          <p className="text-center text-primary/40 py-12">{t('admin.notif.noActivity', { defaultValue: 'Sin actividad reciente.' })}</p>
        ) : (
          <ul className="space-y-2">
            {activityGroups.agg.map((g) => {
              const m = INFO_META[g.type] || INFO_META.generic;
              const label = g.type === 'client_login'
                ? t('admin.notif.aggLogins', { defaultValue: '{{n}} accesos de clientes al portal', n: g.count })
                : t('admin.notif.aggLate', { defaultValue: '{{n}} fichajes tarde', n: g.count });
              return (
                <li key={`${g.type}-${g.day}`} className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-white/60 p-3.5">
                  <span className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${m.color}`}><span className="material-symbols-outlined text-[18px]">{m.icon}</span></span>
                  <div className="min-w-0 flex-1">
                    <span className="font-semibold text-primary text-sm">{g.count > 1 ? label : ''}</span>
                    {g.count === 1 && <span className="font-semibold text-primary text-sm">{t(m.labelKey, { defaultValue: m.def })}</span>}
                  </div>
                  <span className="text-[11px] text-primary/40 shrink-0">{g.day}</span>
                </li>
              );
            })}
            {activityGroups.singles.map((n) => {
              const m = INFO_META[n.type] || INFO_META.generic;
              return (
                <li key={n.id} className="flex items-start gap-3 rounded-2xl border border-gray-100 bg-white/60 p-3.5">
                  <span className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${m.color}`}><span className="material-symbols-outlined text-[18px]">{m.icon}</span></span>
                  <div className="min-w-0 flex-1">
                    <span className="font-semibold text-primary text-sm">{n.title}</span>
                    {n.body && <p className="text-sm text-primary/60 mt-0.5">{n.body}</p>}
                    <p className="text-[11px] text-primary/40 mt-1">{fmtWhen(n.created_at)}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )
      )}
    </div>
  );
};

export default NotificationsPanel;
