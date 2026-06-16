/**
 * NotificationsPanel — centro de notificaciones del admin (?view=notifications).
 *
 * Fuente: RPCs SECURITY DEFINER sobre `admin_notifications` (deny-all por RLS):
 *   admin_notifications_list / _mark_read / _mark_all_read y admin_attention_panel.
 * Tipos: vacation_request, late_checkin, client_login, payment_claim, generic.
 * Cada tipo tiene una ACCIÓN para resolverlo (ir al cliente / a empleados).
 * Las vacaciones se APRUEBAN en la sección Empleados; aquí solo se notifican.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { uiLocale } from '../../lib/dateLocale';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';

interface Notif {
  id: string;
  type: string;
  title: string;
  body: string | null;
  severity: string;
  entity_type: string | null;
  entity_id: string | null;
  actor_name: string | null;
  actor_email: string | null;
  metadata: Record<string, any> | null;
  is_read: boolean;
  created_at: string;
}

interface OverduePayment { id: string; label: string; amount: number; currency: string; due_date: string; client_name: string; client_id: string; }
interface ClientLite { id: string; name: string; email: string | null; }

interface TypeMeta { icon: string; labelKey: string; color: string; actionLabelKey?: string; actionTo?: string; }
const TYPE_META: Record<string, TypeMeta> = {
  vacation_request: { icon: 'beach_access', labelKey: 'admin.notif.typeVacation', color: 'text-amber-600 bg-amber-50', actionLabelKey: 'admin.notif.goToCalendar', actionTo: '/admin?view=calendar' },
  late_checkin:     { icon: 'schedule',     labelKey: 'admin.notif.typeLateCheckin', color: 'text-orange-600 bg-orange-50', actionLabelKey: 'admin.notif.viewAttendance', actionTo: '/admin?view=employees' },
  client_login:     { icon: 'login',        labelKey: 'admin.notif.typeClientLogin', color: 'text-blue-600 bg-blue-50', actionLabelKey: 'admin.notif.goToClient', actionTo: '/admin?view=clients' },
  payment_claim:    { icon: 'payments',     labelKey: 'admin.notif.typePaymentClaim', color: 'text-green-700 bg-green-50', actionLabelKey: 'admin.notif.goToClient', actionTo: '/admin?view=clients' },
  generic:          { icon: 'notifications', labelKey: 'admin.notif.typeGeneric', color: 'text-gray-600 bg-gray-100' },
};
const metaFor = (t: string) => TYPE_META[t] ?? TYPE_META.generic;
// Tipos que REQUIEREN ATENCIÓN: permanentes (no se borran a mano ni se auto-eliminan).
const PROTECTED = new Set(['vacation_request', 'payment_claim']);

function fmtWhen(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(uiLocale(), { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch { return iso; }
}
function fmtMoney(n: number, c: string): string {
  try { return new Intl.NumberFormat('es-ES', { style: 'currency', currency: c || 'EUR', maximumFractionDigits: 0 }).format(n); }
  catch { return `${c} ${n}`; }
}

// La flecha + padding de los <select> los pone una regla global en index.css.
const SELECT_CLS = "rounded-lg border border-gray-200 py-1.5 text-sm bg-white";

const NotificationsPanel: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [items, setItems] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [order, setOrder] = useState<'recent' | 'old'>('recent');
  const [overdue, setOverdue] = useState<OverduePayment[]>([]);
  const [noProp, setNoProp] = useState<ClientLite[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    // Auto-limpieza: borra notificaciones NO-atención de más de 7 días (ficho tarde,
    // login cliente, genéricas). Las de atención (vacaciones, pagos) son permanentes.
    await supabase.rpc('admin_notifications_cleanup');
    const [{ data: notifs }, { data: panel }] = await Promise.all([
      supabase.rpc('admin_notifications_list', {
        p_type: typeFilter === 'all' ? null : typeFilter,
        p_only_unread: onlyUnread,
        p_limit: 300,
      }),
      supabase.rpc('admin_attention_panel'),
    ]);
    setItems((notifs as Notif[]) ?? []);
    const p = (panel as any) ?? {};
    setOverdue((p.overdue_payments as OverduePayment[]) ?? []);
    setNoProp((p.clients_no_property as ClientLite[]) ?? []);
    setLoading(false);
  }, [typeFilter, onlyUnread]);

  useEffect(() => { void load(); }, [load]);

  const markRead = async (id: string, read: boolean) => {
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: read } : n)));
    await supabase.rpc('admin_notifications_mark_read', { p_id: id, p_read: read });
  };
  const markAll = async () => {
    setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
    await supabase.rpc('admin_notifications_mark_all_read');
  };
  // Acción de una notificación: marca leída y navega a donde se resuelve.
  const act = (n: Notif, to: string) => { void markRead(n.id, true); navigate(to); };
  // Borrado manual (solo tipos NO-atención; las protegidas no muestran el botón).
  const del = async (id: string) => {
    setItems((prev) => prev.filter((n) => n.id !== id));
    await supabase.rpc('admin_notifications_delete', { p_id: id });
  };

  const sorted = useMemo(() => {
    const arr = [...items];
    if (order === 'old') arr.reverse();
    return arr;
  }, [items, order]);

  const unreadCount = items.filter((n) => !n.is_read).length;
  const attentionCount = overdue.length + noProp.length;
  // El filtro de tipo también controla los bloques de "atención":
  const showOverdue = typeFilter === 'all' || typeFilter === 'payment_overdue';
  const showNoProp = typeFilter === 'all' || typeFilter === 'no_property';
  const showList = typeFilter !== 'payment_overdue' && typeFilter !== 'no_property';
  const showAttention = (showOverdue && overdue.length > 0) || (showNoProp && noProp.length > 0);

  return (
    <div className="animate-in fade-in duration-500">
      <div className="flex flex-wrap justify-between items-end mb-5 gap-4">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-widest text-primary/20">{t('admin.notif.title')}</h1>
          {unreadCount > 0 && <p className="text-xs text-primary/50 mt-1">{t('admin.notif.unreadCount', { count: unreadCount })}</p>}
        </div>
        <button onClick={markAll} className="text-[10px] font-black uppercase tracking-widest text-primary/50 hover:text-primary transition flex items-center gap-1">
          <span className="material-symbols-outlined text-sm">done_all</span> {t('admin.notif.markAllRead')}
        </button>
      </div>

      {/* Filtros — ARRIBA, antes de la lista */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className={SELECT_CLS}>
          <option value="all">{t('admin.notif.allTypes')}</option>
          {Object.entries(TYPE_META).map(([k, m]) => <option key={k} value={k}>{t(m.labelKey)}</option>)}
          <option value="payment_overdue">{t('admin.notif.typePaymentOverdue', { defaultValue: 'Pagos vencidos' })}</option>
          <option value="no_property">{t('admin.notif.typeNoProperty', { defaultValue: 'Clientes sin propiedad' })}</option>
        </select>
        <select value={order} onChange={(e) => setOrder(e.target.value as any)} className={SELECT_CLS}>
          <option value="recent">{t('admin.notif.orderRecent')}</option>
          <option value="old">{t('admin.notif.orderOld')}</option>
        </select>
        <label className="flex items-center gap-2 text-sm text-primary/70 px-2 cursor-pointer">
          <input type="checkbox" checked={onlyUnread} onChange={(e) => setOnlyUnread(e.target.checked)} /> {t('admin.notif.onlyUnread')}
        </label>
        <span className="text-xs text-primary/40 ml-auto">{t('admin.notif.notifCount', { count: items.length })}</span>
      </div>

      {/* Requiere tu atención */}
      {showAttention && (
        <div className="bg-white rounded-3xl border border-amber-200 p-5 mb-8 shadow-sm">
          <h2 className="text-sm font-black uppercase tracking-widest text-amber-700 mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-base">priority_high</span> {t('admin.notif.requiresAttention')}
          </h2>
          {showOverdue && overdue.length > 0 && (
            <div className="mb-4">
              <p className="text-[11px] font-bold uppercase tracking-widest text-primary/40 mb-2">{t('admin.notif.overduePayments', { count: overdue.length })}</p>
              <ul className="space-y-1.5">
                {overdue.map((o) => (
                  <li key={o.id} className="flex items-center justify-between text-sm border-b border-gray-50 pb-1.5 gap-3">
                    <span className="min-w-0"><b className="text-primary">{o.client_name}</b> · {o.label} · <span className="text-red-600 font-bold">{fmtMoney(Number(o.amount), o.currency)}</span></span>
                    <button onClick={() => navigate('/admin?view=clients')} className="text-xs text-primary/60 hover:text-primary underline shrink-0">{t('admin.notif.expiredOn', { date: new Date(o.due_date).toLocaleDateString(uiLocale()) })} →</button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {showNoProp && noProp.length > 0 && (
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-primary/40 mb-2">{t('admin.notif.clientsNoProperty', { count: noProp.length })}</p>
              <div className="flex flex-wrap gap-2">
                {noProp.map((c) => (
                  <button key={c.id} onClick={() => navigate('/admin?view=clients')} className="text-xs bg-gray-50 text-primary/70 px-3 py-1 rounded-full hover:bg-primary/10">{c.name}</button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Lista (oculta si el filtro es un tipo de "atención") */}
      {showList && (loading ? (
        <div className="flex justify-center py-12"><span className="material-symbols-outlined animate-spin text-3xl text-primary/30">refresh</span></div>
      ) : sorted.length === 0 ? (
        <p className="text-center text-primary/40 py-12">{t('admin.notif.emptyFiltered')}</p>
      ) : (
        <ul className="space-y-2">
          {sorted.map((n) => {
            const m = metaFor(n.type);
            return (
              <li key={n.id} className={`flex items-start gap-3 rounded-2xl border p-4 transition ${n.is_read ? 'bg-white border-gray-100' : 'bg-amber-50/40 border-amber-200'}`}>
                <span className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${m.color}`}>
                  <span className="material-symbols-outlined text-[20px]">{m.icon}</span>
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-primary text-sm">{n.title}</span>
                    <span className="text-[10px] uppercase tracking-widest text-primary/30">{t(m.labelKey)}</span>
                    {!n.is_read && <span className="w-2 h-2 rounded-full bg-amber-500" />}
                  </div>
                  {n.body && <p className="text-sm text-primary/70 mt-0.5">{n.body}</p>}
                  <p className="text-[11px] text-primary/40 mt-1">{fmtWhen(n.created_at)}</p>
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  {m.actionTo && (
                    <button onClick={() => act(n, m.actionTo!)} className="inline-flex items-center gap-1 text-[11px] font-bold text-white bg-primary rounded-full px-3 py-1.5 hover:bg-black transition whitespace-nowrap">
                      {m.actionLabelKey && t(m.actionLabelKey)} <span className="material-symbols-outlined text-sm">arrow_forward</span>
                    </button>
                  )}
                  <div className="flex items-center gap-2">
                    <button onClick={() => markRead(n.id, !n.is_read)} className="text-[10px] font-bold uppercase tracking-widest text-primary/40 hover:text-primary transition">
                      {n.is_read ? t('admin.notif.markUnread') : t('admin.notif.markRead')}
                    </button>
                    {!PROTECTED.has(n.type) && (
                      <button onClick={() => del(n.id)} title={t('admin.notif.delete')} className="text-primary/30 hover:text-red-500 transition">
                        <span className="material-symbols-outlined text-base">delete</span>
                      </button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      ))}
    </div>
  );
};

export default NotificationsPanel;
