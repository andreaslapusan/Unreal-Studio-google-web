/**
 * AgencyApplications — gestión de agencias en el admin principal (vista 'agencias').
 * Arriba las solicitudes de alta (AgencyApplicationsList) y debajo las agencias activas (AgencyPartnersList).
 * Leads y solicitudes de cada agencia van DENTRO de su ficha (botones con contador), no en tablas globales.
 */
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import AgencyApplicationsList from './AgencyApplicationsList';
import AgencyPartnersList from './AgencyPartnersList';
import { useToast } from './agencyAdminUi';

const AgencyApplications: React.FC = () => {
  const { t } = useTranslation();
  const [toastNode, toast] = useToast();
  const [pending, setPending] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);
  useEffect(() => {
    void supabase.from('listing_partner_applications').select('id', { count: 'exact', head: true }).eq('status', 'pending').then(({ count }) => setPending(count ?? 0));
  }, [refreshKey]);
  const H3 = ({ children }: { children: React.ReactNode }) => <h3 className="text-sm font-black uppercase tracking-widest text-primary/40 mb-4">{children}</h3>;
  return (
    <>
      <div className="animate-in fade-in duration-500 space-y-10 min-w-0">
        <h2 className="text-2xl font-serif text-primary">{t('admin.agencyApps.title')}{pending > 0 ? ` · ${t('admin.agencyApps.pendingCount', { n: pending })}` : ''}</h2>
        <section><H3>{t('admin.agencyApps.applications')}</H3><AgencyApplicationsList toast={toast} onChanged={() => setRefreshKey((k) => k + 1)} /></section>
        <section><H3>{t('admin.agencyApps.activePartners')}</H3><AgencyPartnersList toast={toast} refreshKey={refreshKey} /></section>
      </div>
      {toastNode}
    </>
  );
};

export default AgencyApplications;
