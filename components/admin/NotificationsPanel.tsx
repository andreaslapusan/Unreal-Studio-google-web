/**
 * NotificationsPanel — centro de notificaciones del admin (?view=notifications).
 *
 * Fuente: RPCs SECURITY DEFINER sobre `admin_notifications` (deny-all por RLS):
 *   admin_notifications_list / _mark_read / _mark_all_read y admin_attention_panel.
 * Tipos: vacation_request, late_checkin, client_login, payment_claim, generic.
 * Filtros: por tipo, solo no leídas, y orden (recientes/antiguas).
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
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

// Emoji en vez de iconos de fuente: el subset de Material Symbols no incluye
// 'notifications'/'beach_access' y se rompían; los emoji siempre renderizan.
const TYPE_META: Record<string, { icon: string; label: string; color: string }> = {
  vacation_request: { icon: '🏖️', label: 'Vacaciones', color: 'bg-amber-50' },
  late_checkin:     { icon: '⏰', label: 'Fichaje tarde', color: 'bg-orange-50' },
  client_login:     { icon: '👤', label: 'Login cliente', color: 'bg-blue-50' },
  payment_claim:    { icon: '💰', label: 'Aviso de pago', color: 'bg-green-50' },
  generic:          { icon: '🔔', label: 'General', color: 'bg-gray-100' },
};
const metaFor = (t: string) => TYPE_META[t] ?? TYPE_META.generic;

function fmtWhen(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch { return iso; }
}
function fmtMoney(n: number, c: string): string {
  try { return new Intl.NumberFormat('es-ES', { style: 'currency', currency: c || 'EUR', maximumFractionDigits: 0 }).format(n); }
  catch { return `${c} ${n}`; }
}

const NotificationsPanel: React.FC = () => {
  const [items, setItems] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [order, setOrder] = useState<'recent' | 'old'>('recent');
  const [overdue, setOverdue] = useState<OverduePayment[]>([]);
  const [noProp, setNoProp] = useState<ClientLite[]>([]);
  const [vacActions, setVacActions] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
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
  // Aprobar/rechazar una solicitud de vacaciones desde su notificación.
  const resolveVacation = async (vacationId: string, status: string, notifId: string) => {
    setVacActions((prev) => ({ ...prev, [vacationId]: status }));
    await supabase.from('employee_vacations').update({ status }).eq('id', vacationId);
    await markRead(notifId, true);
  };

  const sorted = useMemo(() => {
    const arr = [...items];
    if (order === 'old') arr.reverse();
    return arr;
  }, [items, order]);

  const unreadCount = items.filter((n) => !n.is_read).length;
  const attentionCount = overdue.length + noProp.length;

  return (
    <div className="animate-in fade-in duration-500">
      <div className="flex flex-wrap justify-between items-end mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-widest text-primary/20">Notificaciones</h1>
          {unreadCount > 0 && <p className="text-xs text-primary/50 mt-1">{unreadCount} sin leer</p>}
        </div>
        <button onClick={markAll} className="text-[10px] font-black uppercase tracking-widest text-primary/50 hover:text-primary transition flex items-center gap-1">
          <span className="material-symbols-outlined text-sm">done_all</span> Marcar todo leído
        </button>
      </div>

      {/* Requiere tu atención */}
      {attentionCount > 0 && (
        <div className="bg-white rounded-3xl border border-amber-200 p-5 mb-8 shadow-sm">
          <h2 className="text-sm font-black uppercase tracking-widest text-amber-700 mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-base">priority_high</span> Requiere tu atención
          </h2>
          {overdue.length > 0 && (
            <div className="mb-4">
              <p className="text-[11px] font-bold uppercase tracking-widest text-primary/40 mb-2">Pagos vencidos ({overdue.length})</p>
              <ul className="space-y-1.5">
                {overdue.map((o) => (
                  <li key={o.id} className="flex items-center justify-between text-sm border-b border-gray-50 pb-1.5">
                    <span><b className="text-primary">{o.client_name}</b> · {o.label} · <span className="text-red-600 font-bold">{fmtMoney(Number(o.amount), o.currency)}</span></span>
                    <span className="text-xs text-red-500">venció {new Date(o.due_date).toLocaleDateString('es-ES')}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {noProp.length > 0 && (
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-primary/40 mb-2">Clientes sin propiedad ({noProp.length})</p>
              <div className="flex flex-wrap gap-2">
                {noProp.map((c) => (
                  <span key={c.id} className="text-xs bg-gray-50 text-primary/70 px-3 py-1 rounded-full">{c.name}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm bg-white">
          <option value="all">Todos los tipos</option>
          {Object.entries(TYPE_META).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
        </select>
        <select value={order} onChange={(e) => setOrder(e.target.value as any)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm bg-white">
          <option value="recent">Más recientes</option>
          <option value="old">Más antiguas</option>
        </select>
        <label className="flex items-center gap-2 text-sm text-primary/70 px-2 cursor-pointer">
          <input type="checkbox" checked={onlyUnread} onChange={(e) => setOnlyUnread(e.target.checked)} /> Solo sin leer
        </label>
        <span className="text-xs text-primary/40 ml-auto">{items.length} notificaciones</span>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="flex justify-center py-12"><span className="material-symbols-outlined animate-spin text-3xl text-primary/30">refresh</span></div>
      ) : sorted.length === 0 ? (
        <p className="text-center text-primary/40 py-12">No hay notificaciones con estos filtros.</p>
      ) : (
        <ul className="space-y-2">
          {sorted.map((n) => {
            const m = metaFor(n.type);
            return (
              <li key={n.id} className={`flex items-start gap-3 rounded-2xl border p-4 transition ${n.is_read ? 'bg-white border-gray-100' : 'bg-amber-50/40 border-amber-200'}`}>
                <span className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-lg ${m.color}`}>
                  {m.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-primary text-sm">{n.title}</span>
                    <span className="text-[10px] uppercase tracking-widest text-primary/30">{m.label}</span>
                    {!n.is_read && <span className="w-2 h-2 rounded-full bg-amber-500" />}
                  </div>
                  {n.body && <p className="text-sm text-primary/70 mt-0.5">{n.body}</p>}
                  <p className="text-[11px] text-primary/40 mt-1">{fmtWhen(n.created_at)}</p>
                  {/* Aprobar/rechazar vacaciones directamente desde la notificación */}
                  {n.type === 'vacation_request' && n.entity_id && (
                    vacActions[n.entity_id] ? (
                      <p className="text-xs font-bold mt-2" style={{ color: vacActions[n.entity_id] === 'aprobada' ? '#15803d' : '#b91c1c' }}>
                        {vacActions[n.entity_id] === 'aprobada' ? '✓ Aprobada' : '✗ Rechazada'}
                      </p>
                    ) : (
                      <div className="flex gap-2 mt-2">
                        <button onClick={() => void resolveVacation(n.entity_id!, 'aprobada', n.id)} className="text-[11px] font-bold bg-green-600 text-white px-3 py-1.5 rounded-full">Aprobar</button>
                        <button onClick={() => void resolveVacation(n.entity_id!, 'rechazada', n.id)} className="text-[11px] font-bold bg-red-600 text-white px-3 py-1.5 rounded-full">Rechazar</button>
                      </div>
                    )
                  )}
                </div>
                <button onClick={() => markRead(n.id, !n.is_read)} className="text-[10px] font-bold uppercase tracking-widest text-primary/40 hover:text-primary transition shrink-0">
                  {n.is_read ? 'No leído' : 'Leído'}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default NotificationsPanel;
