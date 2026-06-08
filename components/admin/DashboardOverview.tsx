/**
 * DashboardOverview — pantalla de inicio del panel admin (?view=dashboard).
 * Vista genérica de un vistazo: KPIs del negocio, lo que requiere atención y
 * accesos rápidos a cada sección. Es la PRIMERA sección y la vista por defecto.
 */
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';

interface Stats {
  properties: number; clients: number; employees: number; agencies: number;
  pendingApplications: number; unread: number; pendingVacations: number;
  overdue: number; noProperty: number;
}

const card = "bg-white rounded-2xl p-5 shadow-sm border border-primary/5 text-left w-full hover:border-primary/20 transition";

const DashboardOverview: React.FC = () => {
  const navigate = useNavigate();
  const [s, setS] = useState<Stats | null>(null);

  useEffect(() => {
    void (async () => {
      const countOf = async (table: string, filter?: (q: any) => any) => {
        let q = supabase.from(table).select('*', { count: 'exact', head: true });
        if (filter) q = filter(q);
        const { count } = await q;
        return count ?? 0;
      };
      const [properties, clients, employees, agencies, pendingApplications, pendingVacations, unreadRes, panelRes] = await Promise.all([
        countOf('properties'),
        countOf('clients', (q) => q.eq('is_active', true)),
        countOf('employees', (q) => q.eq('active', true)),
        countOf('listing_partners'),
        countOf('listing_partner_applications', (q) => q.eq('status', 'pending')),
        countOf('employee_vacations', (q) => q.in('status', ['pendiente', 'pending'])),
        supabase.rpc('admin_unread_count'),
        supabase.rpc('admin_attention_panel'),
      ]);
      const panel = (panelRes.data as any) ?? {};
      setS({
        properties, clients, employees, agencies, pendingApplications,
        unread: typeof unreadRes.data === 'number' ? unreadRes.data : 0,
        pendingVacations,
        overdue: (panel.overdue_payments ?? []).length,
        noProperty: (panel.clients_no_property ?? []).length,
      });
    })();
  }, []);

  const Stat = ({ icon, label, value, to, alert }: { icon: string; label: string; value: number; to: string; alert?: boolean }) => (
    <button onClick={() => navigate(to)} className={card}>
      <div className="flex items-center justify-between">
        <span className={`material-symbols-outlined text-2xl ${alert && value > 0 ? 'text-red-500' : 'text-primary/40'}`}>{icon}</span>
        <span className={`text-3xl font-serif ${alert && value > 0 ? 'text-red-600' : 'text-primary'}`}>{s ? value : '—'}</span>
      </div>
      <p className="text-[11px] font-black uppercase tracking-widest text-primary/40 mt-3">{label}</p>
    </button>
  );

  const attention = s ? (s.unread + s.pendingVacations + s.overdue + s.pendingApplications) : 0;

  return (
    <div className="animate-in fade-in duration-500">
      <h1 className="text-2xl font-black uppercase tracking-widest text-primary/20 mb-6">Resumen</h1>

      {/* Requiere atención */}
      {s && attention > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 mb-8">
          <h2 className="text-sm font-black uppercase tracking-widest text-amber-700 mb-3 flex items-center gap-2">
            <span className="material-symbols-outlined text-base">priority_high</span> Requiere tu atención
          </h2>
          <div className="flex flex-wrap gap-2">
            {s.unread > 0 && <button onClick={() => navigate('/admin?view=notifications')} className="text-xs font-bold bg-white border border-amber-200 text-primary px-3 py-1.5 rounded-full hover:bg-amber-100">{s.unread} notificación(es) sin leer →</button>}
            {s.overdue > 0 && <button onClick={() => navigate('/admin?view=notifications')} className="text-xs font-bold bg-white border border-red-200 text-red-600 px-3 py-1.5 rounded-full hover:bg-red-50">{s.overdue} pago(s) vencido(s) →</button>}
            {s.pendingVacations > 0 && <button onClick={() => navigate('/admin?view=calendar')} className="text-xs font-bold bg-white border border-amber-200 text-primary px-3 py-1.5 rounded-full hover:bg-amber-100">{s.pendingVacations} vacación(es) por aprobar →</button>}
            {s.pendingApplications > 0 && <button onClick={() => navigate('/admin?view=agencias')} className="text-xs font-bold bg-white border border-amber-200 text-primary px-3 py-1.5 rounded-full hover:bg-amber-100">{s.pendingApplications} agencia(s) por revisar →</button>}
          </div>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-8">
        <Stat icon="home_work" label="Propiedades" value={s?.properties ?? 0} to="/admin?view=projects" />
        <Stat icon="person" label="Clientes" value={s?.clients ?? 0} to="/admin?view=clients" />
        <Stat icon="badge" label="Empleados" value={s?.employees ?? 0} to="/admin?view=employees" />
        <Stat icon="public" label="Agencias" value={s?.agencies ?? 0} to="/admin?view=agencias" />
        <Stat icon="notifications" label="Sin leer" value={s?.unread ?? 0} to="/admin?view=notifications" alert />
        <Stat icon="payments" label="Pagos vencidos" value={s?.overdue ?? 0} to="/admin?view=notifications" alert />
        <Stat icon="beach_access" label="Vacaciones pend." value={s?.pendingVacations ?? 0} to="/admin?view=calendar" alert />
        <Stat icon="person_add" label="Clientes sin propiedad" value={s?.noProperty ?? 0} to="/admin?view=clients" alert />
      </div>

      {/* Accesos rápidos */}
      <h2 className="text-sm font-black uppercase tracking-widest text-primary/40 mb-3">Accesos rápidos</h2>
      <div className="flex flex-wrap gap-2">
        {[
          { l: 'Nueva propiedad', to: '/admin?view=projects', i: 'add' },
          { l: 'Clientes', to: '/admin?view=clients', i: 'person' },
          { l: 'Calendario de vacaciones', to: '/admin?view=calendar', i: 'calendar_month' },
          { l: 'Notificaciones', to: '/admin?view=notifications', i: 'notifications' },
          { l: 'Blog', to: '/admin?view=blogs', i: 'post_add' },
          { l: 'FAQs', to: '/admin?view=faqs', i: 'help' },
          { l: 'Configuración', to: '/admin?view=config', i: 'settings' },
        ].map((q) => (
          <button key={q.l} onClick={() => navigate(q.to)} className="flex items-center gap-2 bg-white border border-primary/10 text-primary text-sm font-medium px-4 py-2 rounded-xl hover:border-primary/30 transition">
            <span className="material-symbols-outlined text-base text-primary/50">{q.i}</span> {q.l}
          </button>
        ))}
      </div>
    </div>
  );
};

export default DashboardOverview;
