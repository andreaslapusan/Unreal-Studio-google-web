/** Disponibilidad: todas las unidades vendibles hoy de los proyectos asignados, en una sola lista. */
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { whatsappUrl } from '../../constants';
import { AgencyData, fmtEUR, isUnitAvailable, shortProjectName, groupUnits, unitCommission, unitPct } from './useAgencyData';
import { card, Empty, ListRow, SectionTitle, Stat } from './ui';

export default function AgencyAvailability({ data }: { data: AgencyData }) {
  const { t } = useTranslation();
  const { partner, projects, units } = data;
  const [project, setProject] = useState('all');
  const [sort, setSort] = useState<'commission' | 'price'>('commission');
  if (!partner) return null;

  const nameOf = (id: string) => shortProjectName(projects.find((p) => p.id === id)?.name ?? '');
  const avail = units.filter(isUnitAvailable);
  const withUnits = projects.filter((p) => avail.some((u) => u.property_id === p.id));
  const shown = groupUnits(avail.filter((u) => project === 'all' || u.property_id === project))
    .sort(({ u: a }, { u: b }) => (sort === 'commission'
      ? unitCommission(b, partner.id) - unitCommission(a, partner.id)
      : (a.price_agencia ?? Infinity) - (b.price_agencia ?? Infinity)));
  const best = Math.max(0, ...avail.map((u) => unitCommission(u, partner.id)));

  return (
    <div className="animate-in fade-in duration-500">
      <SectionTitle title={t('agencyPortal.nav.availability')} sub={t('agencyPortal.availability.sub')} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Stat icon="home_work" label={t('agencyPortal.availability.units')} value={avail.length} />
        <Stat icon="apartment" label={t('agencyPortal.nav.projects')} value={withUnits.length} />
        <Stat icon="bookmark" label={t('agencyPortal.availability.reservedN')} value={avail.filter((u) => u.reserved).length} />
        <Stat icon="payments" label={t('agencyPortal.availability.sortCommission')} value={fmtEUR(best)} accent={best > 0} />
      </div>

      {avail.length === 0 ? <Empty icon="home_work" text={t('agencyPortal.availability.empty')} /> : (
        <>
          <div className="flex flex-col md:flex-row md:items-center gap-3 mb-4">
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 flex-1">
              {[{ id: 'all', name: t('agencyPortal.availability.allProjects') }, ...withUnits.map((p) => ({ id: p.id, name: shortProjectName(p.name) }))].map((p) => (
                <button key={p.id} onClick={() => setProject(p.id)}
                  className={`shrink-0 px-3 py-2 rounded-full text-xs font-bold transition ${project === p.id ? 'bg-primary text-white' : 'bg-white border border-gray-200 text-primary/70 hover:bg-gray-50'}`}>
                  {p.name}
                </button>
              ))}
            </div>
            <select value={sort} onChange={(e) => setSort(e.target.value as 'commission' | 'price')} className="border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold text-primary bg-white md:w-48">
              <option value="commission">{t('agencyPortal.availability.sortCommission')}</option>
              <option value="price">{t('agencyPortal.availability.sortPrice')}</option>
            </select>
          </div>

          <div className={`${card} !p-0 overflow-hidden`}>
            <ul className="divide-y divide-gray-100">
              {shown.map(({ u, n }) => {
                const pName = nameOf(u.property_id);
                const uName = [pName, u.bedrooms ? t('agencyPortal.projects.bedrooms', { count: u.bedrooms }) : null].filter(Boolean).join(' · ');
                return (
                  <ListRow key={u.id}
                    title={<>{uName}{u.reserved && <span className="ml-2 text-[10px] font-black uppercase tracking-widest text-amber-600">{t('agencyPortal.projects.reserved')}</span>}</>}
                    sub={t('agencyPortal.projects.availableN', { n })}
                    extra={<>
                      {u.price_agencia ? `${t('agencyPortal.projects.agencyPriceShort')} ${fmtEUR(u.price_agencia)} · ` : ''}
                      <a href={whatsappUrl(t('agencyPortal.availability.waUnit', { agency: partner.agency_name, unit: uName, project: pName }))} target="_blank" rel="noopener noreferrer" className="font-bold text-primary/70 underline underline-offset-2">{t('agencyPortal.availability.ask')}</a>
                    </>}
                    right={<><span className="text-sm font-bold text-green-700 whitespace-nowrap">{u.price_agencia ? fmtEUR(unitCommission(u, partner.id)) : '—'}</span><span className="text-xs text-primary/40 whitespace-nowrap">{unitPct(u, partner.id)}%</span></>}
                  />
                );
              })}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
