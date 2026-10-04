/**
 * DashboardOverview — pantalla de inicio del panel admin (?view=dashboard).
 * Vista genérica de un vistazo: KPIs del negocio y lo que requiere atención.
 * Las cifras vienen de un RPC SECURITY DEFINER (las tablas tienen RLS que
 * bloquea el conteo directo desde el cliente).
 */
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';

interface Stats {
  properties: number; clients: number; employees: number; agencies: number;
  pending_applications: number; unread: number; tasks: number; pending_vacations: number; overdue: number;
}

const card = "group bg-white rounded-2xl p-5 shadow-sm border border-primary/5 text-left w-full hover:border-primary/15 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300";

const DashboardOverview: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [s, setS] = useState<Stats | null>(null);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.rpc('admin_dashboard_stats');
      if (data && !(data as any).error) setS(data as Stats);
    })();
  }, []);

  const Stat = ({ icon, label, value, to, alert }: { icon: string; label: string; value: number; to: string; alert?: boolean }) => (
    <button onClick={() => navigate(to)} className={card}>
      <div className="flex items-center justify-between">
        <span className={`flex items-center justify-center w-10 h-10 rounded-xl transition-colors ${alert && value > 0 ? 'bg-red-500/10 text-red-500' : 'bg-primary/5 text-primary/50 group-hover:bg-primary/10 group-hover:text-primary'}`}>
          <span className="material-symbols-outlined text-xl">{icon}</span>
        </span>
        <span className={`font-serif text-4xl leading-none tracking-[-0.02em] ${alert && value > 0 ? 'text-red-600' : 'text-primary'}`}>{s ? value : '—'}</span>
      </div>
      <p className="text-[11px] font-black uppercase tracking-widest text-primary/40 mt-4">{label}</p>
    </button>
  );

  // "Tareas" ya incluye pagos vencidos + obra + vacaciones pendientes + pagos reclamados.
  const attention = s ? ((s.tasks ?? 0) + s.pending_applications) : 0;

  return (
    <div className="animate-in fade-in duration-500">
      <div className="mb-8">
        <span className="inline-flex items-center gap-2.5 text-[10px] font-black uppercase tracking-[0.28em] text-primary/40 mb-2"><span className="h-px w-7 bg-primary/30" />Unreal Studio · Admin</span>
        <h1 className="font-serif text-4xl md:text-5xl text-primary tracking-[-0.02em] leading-none">{t('admin.overview.title', { defaultValue: 'Resumen' })}</h1>
      </div>

      {/* Requiere atención */}
      {s && attention > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 mb-8">
          <h2 className="text-sm font-black uppercase tracking-widest text-amber-700 mb-3 flex items-center gap-2">
            <span className="material-symbols-outlined text-base">priority_high</span> {t('admin.overview.needsAttention', { defaultValue: 'Requiere tu atención' })}
          </h2>
          <div className="flex flex-wrap gap-2">
            {(s.tasks ?? 0) > 0 && <button onClick={() => navigate('/admin?view=notifications')} className="text-xs font-bold bg-white border border-amber-200 text-primary px-3 py-1.5 rounded-full hover:bg-amber-100">{t('admin.overview.tasksPendingChip', { defaultValue: '{{n}} tarea(s) pendiente(s) →', n: s.tasks })}</button>}
            {s.pending_applications > 0 && <button onClick={() => navigate('/admin?view=agencias')} className="text-xs font-bold bg-white border border-amber-200 text-primary px-3 py-1.5 rounded-full hover:bg-amber-100">{t('admin.overview.agenciesReviewChip', { defaultValue: '{{n}} agencia(s) por revisar →', n: s.pending_applications })}</button>}
          </div>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        <Stat icon="home_work" label={t('admin.overview.properties', { defaultValue: 'Propiedades' })} value={s?.properties ?? 0} to="/admin?view=projects" />
        <Stat icon="person" label={t('admin.overview.clients', { defaultValue: 'Clientes' })} value={s?.clients ?? 0} to="/admin?view=clients" />
        <Stat icon="badge" label={t('admin.overview.employees', { defaultValue: 'Empleados' })} value={s?.employees ?? 0} to="/admin?view=employees" />
        <Stat icon="public" label={t('admin.overview.agencies', { defaultValue: 'Agencias' })} value={s?.agencies ?? 0} to="/admin?view=agencias" />
        <Stat icon="notifications" label={t('admin.overview.tasksPending', { defaultValue: 'Tareas pendientes' })} value={s?.tasks ?? 0} to="/admin?view=notifications" alert />
        <Stat icon="payments" label={t('admin.overview.overduePayments', { defaultValue: 'Pagos vencidos' })} value={s?.overdue ?? 0} to="/admin?view=notifications" alert />
        <Stat icon="beach_access" label={t('admin.overview.vacationsPending', { defaultValue: 'Vacaciones pend.' })} value={s?.pending_vacations ?? 0} to="/admin?view=calendar" alert />
        <Stat icon="public" label={t('admin.overview.agenciesReview', { defaultValue: 'Agencias por revisar' })} value={s?.pending_applications ?? 0} to="/admin?view=agencias" alert />
      </div>
    </div>
  );
};

export default DashboardOverview;
