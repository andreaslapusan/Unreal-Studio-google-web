/** Proyectos asignados a la agencia: disponibilidad, precio agencia y comisión por unidad + material y link con su UTM. */
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { projectSeoSlug } from '../../lib/projectUrl';
import { AgencyData, PropertyRow, UnitRow, shortProjectName, unitLabel, copyText, fmtEUR, isUnitAvailable, partnerParam, unitCommission, unitPct } from './useAgencyData';
import { card, btnGhost, Empty, ListRow, SectionTitle } from './ui';

export default function AgencyProjects({ data }: { data: AgencyData }) {
  const { t } = useTranslation();
  const { partner, projects, units } = data;
  if (!partner) return null;

  const byProject = (id: string) => units.filter((u) => u.property_id === id);
  // Primero los que tienen unidades disponibles.
  const sorted = [...projects].sort((a, b) => byProject(b.id).filter(isUnitAvailable).length - byProject(a.id).filter(isUnitAvailable).length);

  return (
    <div className="animate-in fade-in duration-500">
      <SectionTitle title={t('agencyPortal.nav.projects')} sub={t('agencyPortal.projects.sub')} />
      {projects.length === 0 && <Empty icon="home_work" text={t('agenciasDashboard.noProjectsYet')} />}
      <div className="space-y-6">
        {sorted.map((p) => <ProjectCard key={p.id} p={p} units={byProject(p.id)} partnerId={partner.id} partnerRef={partnerParam(partner)} />)}
      </div>
    </div>
  );
}

interface CardProps { p: PropertyRow; units: UnitRow[]; partnerId: string; partnerRef: string }

const ProjectCard: React.FC<CardProps> = ({ p, units: all, partnerId, partnerRef }) => {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const avail = all.filter(isUnitAvailable);
  const soldN = all.filter((u) => u.sold).length;
  const publicUrl = p.slug
    ? `${window.location.origin}/proyecto/${projectSeoSlug({ slug: p.slug, location: p.area ?? null })}?utm_source=lister&utm_partner=${partnerRef}&utm_property=${p.slug}`
    : null;
  const share = async () => {
    if (publicUrl && await copyText(publicUrl, t('agenciasDashboard.copyPrompt'))) { setCopied(true); setTimeout(() => setCopied(false), 2200); }
  };

  return (
    <article className={`${card} !p-0 overflow-hidden`}>
      <div className="md:flex">
        {p.hero_image_url && (
          <img src={p.hero_image_url} alt={p.name} className="w-full md:w-72 h-44 md:h-auto object-cover shrink-0" loading="lazy" />
        )}
        <div className="p-5 flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="font-serif text-xl text-primary">{shortProjectName(p.name)}</h3>
              {p.area && <p className="text-xs text-primary/50 mt-0.5">{p.area}</p>}
            </div>
            <span className={`shrink-0 mt-1 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full whitespace-nowrap ${avail.length ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
              {avail.length ? t('agencyPortal.projects.availableN', { n: avail.length }) : t('agencyPortal.projects.soldOut')}
            </span>
          </div>
          {p.short_pitch && <p className="text-sm text-primary/70 mt-2 line-clamp-2">{p.short_pitch}</p>}
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-primary/60 mt-3">
            {typeof p.pct_progress === 'number' && <span>{t('agenciasDashboard.constructionProgress')}: <strong className="text-primary">{p.pct_progress}%</strong></span>}
            {p.delivery_date && <span>{t('agenciasDashboard.estimatedDelivery')} <strong className="text-primary">{p.delivery_date}</strong></span>}
            {soldN > 0 && <span>{t('agencyPortal.projects.soldN', { n: soldN })}</span>}
          </div>
          <div className="flex flex-wrap gap-2 mt-4">
            {publicUrl && (
              <button onClick={share} className={copied ? `${btnGhost} !bg-green-600 !text-white !border-green-600` : btnGhost}>
                <span className="material-symbols-outlined text-base">{copied ? 'check' : 'share'}</span>{copied ? t('agencyPortal.copiedShort') : t('agencyPortal.projects.copyLink')}
              </button>
            )}
            {p.slug && (
              <Link to={`/agencias/${p.slug}`} target="_blank" className={btnGhost}>
                <span className="material-symbols-outlined text-base">folder_open</span>{t('agencyPortal.projects.pack')}
              </Link>
            )}
            {p.brand_pdf_url && (
              <a href={p.brand_pdf_url} target="_blank" rel="noopener noreferrer" className={btnGhost}>
                <span className="material-symbols-outlined text-base">picture_as_pdf</span>{t('agencyPortal.projects.dossier')}
              </a>
            )}
            {p.walkthrough_url && (
              <a href={p.walkthrough_url} target="_blank" rel="noopener noreferrer" className={btnGhost}>
                <span className="material-symbols-outlined text-base">videocam</span>{t('agencyPortal.projects.tour')}
              </a>
            )}
          </div>
        </div>
      </div>

      {avail.length > 0 && (
        <div className="border-t border-gray-100">
          <p className="px-5 pt-4 pb-1 text-[10px] font-black uppercase tracking-widest text-primary/40">{t('agencyPortal.projects.unitsTitle')}</p>
          <ul className="divide-y divide-gray-50">
            {avail.map((u) => (
              <ListRow key={u.id}
                title={<>{unitLabel(u.unit_name, p.name)}{u.reserved && <span className="ml-2 text-[10px] font-black uppercase tracking-widest text-amber-600">{t('agencyPortal.projects.reserved')}</span>}</>}
                sub={[u.bedrooms ? t('agencyPortal.projects.bedsN', { n: u.bedrooms }) : null, u.price_agencia ? `${t('agencyPortal.projects.agencyPriceShort')} ${fmtEUR(u.price_agencia)}` : null].filter(Boolean).join(' · ') || undefined}
                right={<><span className="text-sm font-bold text-green-700 whitespace-nowrap">{u.price_agencia ? fmtEUR(unitCommission(u, partnerId)) : '—'}</span><span className="text-xs text-primary/40 whitespace-nowrap">{unitPct(u, partnerId)}%</span></>}
              />
            ))}
          </ul>
        </div>
      )}
    </article>
  );
};
