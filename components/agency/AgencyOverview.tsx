/** Inicio del portal de agencias: KPIs, accesos rápidos y actividad reciente. */
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCurrency } from '../../App';
import { AgencyData, catalogLink, copyText, fmtDate, isUnitAvailable, potentialEUR } from './useAgencyData';
import { card, btnPrimary, btnGhost, ListRow, Stat, StatusPill } from './ui';

interface Props { data: AgencyData; go: (view: string, extra?: Record<string, string>) => void }

export default function AgencyOverview({ data, go }: Props) {
  const { t } = useTranslation();
  const { formatPrice, convert } = useCurrency();
  const { partner, leads, events, units } = data;
  const [copied, setCopied] = useState(false);
  if (!partner) return null;

  const following = leads.filter((l) => l.status === 'new' || l.status === 'contacted').length;
  const won = leads.filter((l) => l.status === 'won').length;
  const visits = events.filter((e) => e.event_type === 'visit').length;
  const potential = potentialEUR(data, partner.id, convert);
  const projectName = (id: string | null) => data.nameOf(id);
  const slugName = (slug: string) => data.nameOf(slug) ?? slug;
  // Actividad: clientes registrados + eventos de su link, lo más reciente primero.
  const activity = [
    ...leads.map((l) => ({ id: `l-${l.id}`, at: l.created_at, icon: 'person_add', text: t('agencyPortal.overview.actLead', { name: l.client_name }), sub: projectName(l.property_id), status: l.status })),
    ...events.map((e) => ({ id: `e-${e.id}`, at: e.created_at, icon: 'ads_click', text: t(`agenciasStats.eventType.${e.event_type}`, { defaultValue: e.event_type }), sub: e.property_slug ? slugName(e.property_slug) : undefined, status: undefined as string | undefined })),
  ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 8);

  const copyLink = async () => {
    if (await copyText(catalogLink(partner), t('agenciasDashboard.copyPersonalLinkPrompt'))) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    }
  };

  return (
    <div className="animate-in fade-in duration-500 space-y-8">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-serif text-primary">{t('agencyPortal.overview.hello', { name: partner.manager_name || partner.agency_name })}</h1>
          <p className="text-sm text-primary/60 mt-1">{t('agencyPortal.overview.sub')}</p>
        </div>
        <div className="grid grid-cols-1 min-[420px]:grid-cols-2 sm:flex sm:flex-wrap gap-2">
          <button onClick={() => go('clients', { new: '1' })} className={btnPrimary}>
            <span className="material-symbols-outlined text-base">person_add</span>{t('agenciasDashboard.leads.register')}
          </button>
          <button onClick={copyLink} className={copied ? `${btnGhost} !bg-green-600 !text-white !border-green-600` : btnGhost}>
            <span className="material-symbols-outlined text-base">{copied ? 'check' : 'link'}</span>{copied ? t('agencyPortal.copiedShort') : t('agencyPortal.copyMyLink')}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Stat icon="group" label={t('agencyPortal.kpi.registered')} value={leads.length} onClick={() => go('clients')} />
        <Stat icon="pending_actions" label={t('agencyPortal.kpi.following')} value={following} onClick={() => go('clients', { status: 'open' })} />
        <Stat icon="emoji_events" label={t('agencyPortal.kpi.won')} value={won} onClick={() => go('commissions')} accent={won > 0} />
        <Stat icon="visibility" label={t('agencyPortal.kpi.visits')} value={visits} onClick={() => go('stats')} />
        <div className="col-span-2 lg:col-span-1">
          <Stat icon="payments" label={t('agencyPortal.kpi.potential')} value={formatPrice(potential, 'EUR')} onClick={() => go('commissions')} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 [&>*]:min-w-0">
        <section className={`${card} lg:col-span-2`}>
          <h3 className="text-sm font-black uppercase tracking-widest text-primary/40 mb-4">{t('agencyPortal.overview.activity')}</h3>
          {activity.length === 0 ? (
            <p className="text-sm text-primary/50">{t('agencyPortal.overview.noActivity')}</p>
          ) : (
            <ul className="divide-y divide-gray-100 -mx-5">
              {activity.map((a) => (
                <ListRow key={a.id} icon={a.icon}
                  title={a.text}
                  sub={a.sub}
                  right={<>{a.status && <StatusPill status={a.status} label={t(`agenciasDashboard.leads.status.${a.status}`)} />}<span className="text-xs text-primary/40 whitespace-nowrap">{fmtDate(a.at)}</span></>}
                />
              ))}
            </ul>
          )}
        </section>

        <section className={`${card} space-y-3`}>
          <h3 className="text-sm font-black uppercase tracking-widest text-primary/40">{t('agencyPortal.overview.shortcuts')}</h3>
          {[
            { v: 'availability', icon: 'sell', label: t('agencyPortal.nav.availability'), sub: t('agencyPortal.overview.availSub', { count: units.filter(isUnitAvailable).length }) },
            { v: 'kit', icon: 'folder_open', label: t('agencyPortal.nav.kit'), sub: t('agencyPortal.overview.kitSub') },
            { v: 'requests', icon: 'event_available', label: t('agencyPortal.nav.requests'), sub: t('agencyPortal.overview.requestsSub', { count: data.requests.filter((r) => r.status === 'pending' || r.status === 'scheduled').length }) },
            { v: 'news', icon: 'campaign', label: t('agencyPortal.nav.news'), sub: t('agencyPortal.news.sub') },
            { v: 'training', icon: 'school', label: t('agencyPortal.nav.training'), sub: t('agencyPortal.overview.trainingSub') },
          ].map((s) => (
            <button key={s.v} onClick={() => go(s.v)} className="w-full flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:border-primary/20 hover:bg-gray-50 transition text-left">
              <span className="material-symbols-outlined text-xl text-primary/50">{s.icon}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-primary">{s.label}</span>
                <span className="block text-xs text-primary/50 leading-snug line-clamp-2">{s.sub}</span>
              </span>
              <span className="material-symbols-outlined text-primary/30">chevron_right</span>
            </button>
          ))}
        </section>
      </div>
    </div>
  );
}
