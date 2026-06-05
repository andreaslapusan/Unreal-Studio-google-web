import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';

interface ProjectAgencyRow {
  id: string;
  name: string;
  slug: string;
  owner_name: string | null;
  location: string | null;
  zone: string | null;
  property_type: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  area_m2: number | null;
  land_size_m2: number | null;
  pool_size_m2: number | null;
  has_powder_room: boolean | null;
  has_rooftop: boolean | null;
  parking: string | null;
  parking_en: string | null;
  parking_id: string | null;
  view: string | null;
  view_en: string | null;
  view_id: string | null;
  living_room_style: string | null;
  living_room_style_en: string | null;
  living_room_style_id: string | null;
  furnishing: string | null;
  furnishing_en: string | null;
  furnishing_id: string | null;
  furnishing_pack_cost_usd: number | null;
  investor_price: number | null;
  market_price: number | null;
  price_currency: string | null;
  payment_plan_off_plan: string | null;
  payment_plan_off_plan_en: string | null;
  payment_plan_off_plan_id: string | null;
  years_contract: number | null;
  years_extension: number | null;
  extension_cost_usd: number | null;
  lease_end_date: string | null;
  lease_end_date_en: string | null;
  lease_end_date_id: string | null;
  lease_years_paid: boolean | null;
  zoning_type: string | null;
  zoning_type_en: string | null;
  zoning_type_id: string | null;
  building_permit_status: string | null;
  building_permit_status_en: string | null;
  building_permit_status_id: string | null;
  structural_warranty: string | null;
  structural_warranty_en: string | null;
  structural_warranty_id: string | null;
  water_supply: string | null;
  water_supply_en: string | null;
  water_supply_id: string | null;
  completion_date: string | null;
  completion_date_en: string | null;
  completion_date_id: string | null;
  completion_percent: number | null;
  status: string | null;
  status_en: string | null;
  status_id: string | null;
  distance_beach: string | null;
  distance_beach_en: string | null;
  distance_beach_id: string | null;
  google_maps_url: string | null;
  brochure_url: string | null;
  drive_brochure_folder_url: string | null;
  drive_renders_url: string | null;
  drive_2d_plans_url: string | null;
  drive_permits_url: string | null;
  drive_legal_url: string | null;
  video_url: string | null;
  construction_update_url: string | null;
  construction_update_date: string | null;
  gallery: string[] | null;
  floor_plans: string[] | null;
  description: string | null;
  description_en: string | null;
  description_id: string | null;
  annual_rental_projection: number | null;
  agency_pack_status: Record<string, any> | null;
}

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex justify-between items-start py-2 border-b border-primary/5 gap-4">
    <span className="text-xs font-bold uppercase text-primary/60 tracking-wide flex-shrink-0">{label}</span>
    <span className="text-sm text-primary text-right">{children || <span className="text-primary/30">—</span>}</span>
  </div>
);

const LinkBtn: React.FC<{ href: string | null | undefined; children: React.ReactNode }> = ({ href, children }) => {
  const { t } = useTranslation();
  return href ? (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="px-4 py-2 bg-primary text-white rounded-full text-xs font-bold hover:opacity-90 inline-block"
    >
      {children}
    </a>
  ) : (
    <span className="px-4 py-2 bg-gray-100 text-gray-400 rounded-full text-xs font-bold inline-block cursor-not-allowed">
      {children} ({t('agencyPack.notAvailable')})
    </span>
  );
};

const AgencyPack: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const { t, i18n } = useTranslation();
  const [project, setProject] = useState<ProjectAgencyRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Resolve translatable field by current language. Falls back to ES (base).
  const tr = (p: ProjectAgencyRow | null, base: keyof ProjectAgencyRow): string | null => {
    if (!p) return null;
    const lang = (i18n.language || 'es').slice(0, 2);
    if (lang === 'en') return ((p as any)[`${String(base)}_en`] as string) || (p[base] as any) || null;
    if (lang === 'id') return ((p as any)[`${String(base)}_id`] as string) || (p[base] as any) || null;
    return (p[base] as any) || null;
  };

  useEffect(() => {
    document.title = t('agencyPack.pageTitle');
    if (!slug) return;
    (async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('slug', slug)
        .maybeSingle();
      if (error) {
        setError(error.message);
      } else if (!data) {
        setError(t('agencyPack.notFound'));
      } else {
        setProject(data as ProjectAgencyRow);
        document.title = t('agencyPack.pageTitleProject', { name: (data as ProjectAgencyRow).name });
      }
      setLoading(false);
    })();
  }, [slug]);

  if (loading)
    return <div className="min-h-screen flex items-center justify-center bg-almond text-primary/60">{t('agencyPack.loading')}</div>;
  if (error || !project)
    return (
      <div className="min-h-screen flex items-center justify-center bg-almond text-red-600 p-12 text-center">
        {error || t('agencyPack.notFound')}
      </div>
    );

  const formatPrice = (v: number | null) =>
    v == null ? null : `${(project.price_currency || 'USD')} ${v.toLocaleString('en-US')}`;

  return (
    <div className="bg-almond min-h-screen">
      <header className="bg-primary text-white px-6 md:px-16 py-8 print:py-4">
        <div className="max-w-6xl mx-auto flex items-start justify-between gap-6 flex-wrap">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.3em] text-white/60 mb-2">
              {t('agencyPack.headerKicker')}
            </p>
            <h1 className="text-3xl md:text-5xl font-serif">{project.name}</h1>
            <p className="text-white/70 mt-2">{project.location}</p>
          </div>
          <div className="text-right">
            <p className="text-xs font-black uppercase tracking-widest text-white/60 mb-1">{t('agencyPack.priceLabel')}</p>
            <p className="text-3xl md:text-4xl font-serif">{formatPrice(project.investor_price)}</p>
            <p className="text-xs text-white/60 mt-1">{t('agencyPack.commissionIncluded', { furnishing: tr(project,'furnishing') || '' })}</p>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 md:px-16 py-10 print:py-6 space-y-10">
        {tr(project,'description') && (
          <section>
            <h2 className="text-xs font-black uppercase tracking-widest text-primary/60 mb-3">{t('agencyPack.summaryTitle')}</h2>
            <p className="text-primary/90 leading-relaxed">{tr(project,'description')}</p>
          </section>
        )}

        {project.gallery && project.gallery.length > 0 && (
          <section>
            <h2 className="text-xs font-black uppercase tracking-widest text-primary/60 mb-3">{t('agencyPack.galleryTitle')}</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {project.gallery.slice(0, 8).map((src, i) => (
                <img
                  key={i}
                  src={src}
                  alt={`${project.name} ${i + 1}`}
                  className="w-full h-32 md:h-40 object-cover rounded-xl"
                  loading="lazy"
                />
              ))}
            </div>
          </section>
        )}

        <div className="grid md:grid-cols-2 gap-8">
          <section className="bg-white rounded-3xl p-6 shadow-sm border border-primary/5">
            <h2 className="text-base font-serif text-primary mb-4">{t('agencyPack.sectionIdentification')}</h2>
            <Field label={t('agencyPack.fieldOwner')}>{project.owner_name}</Field>
            <Field label={t('agencyPack.fieldType')}>{project.property_type}</Field>
            <Field label={t('agencyPack.fieldZone')}>{project.zone}</Field>
            <Field label={t('agencyPack.fieldStatus')}>{tr(project,'status')}</Field>
            <Field label={t('agencyPack.fieldProgress')}>
              {project.completion_percent != null ? `${project.completion_percent}%` : null}
            </Field>
            <Field label={t('agencyPack.fieldLastUpdate')}>{project.construction_update_date}</Field>
            <Field label={t('agencyPack.fieldGooglePin')}>
              {project.google_maps_url ? (
                <a className="text-blue-600 underline" href={project.google_maps_url} target="_blank" rel="noopener noreferrer">
                  {t('agencyPack.viewMap')}
                </a>
              ) : null}
            </Field>
          </section>

          <section className="bg-white rounded-3xl p-6 shadow-sm border border-primary/5">
            <h2 className="text-base font-serif text-primary mb-4">{t('agencyPack.sectionContract')}</h2>
            <Field label={t('agencyPack.fieldLeaseEnd')}>{tr(project,'lease_end_date')}</Field>
            <Field label={t('agencyPack.fieldYearsContract')}>{project.years_contract}</Field>
            <Field label={t('agencyPack.fieldYearsExtension')}>{project.years_extension}</Field>
            <Field label={t('agencyPack.fieldExtensionCost')}>
              {project.extension_cost_usd != null
                ? project.extension_cost_usd === 0
                  ? t('agencyPack.atMarketPrice')
                  : `USD ${project.extension_cost_usd.toLocaleString('en-US')}`
                : null}
            </Field>
            <Field label={t('agencyPack.fieldLeasePaid')}>
              {project.lease_years_paid == null ? null : project.lease_years_paid ? t('agencyPack.yesFull') : t('agencyPack.no')}
            </Field>
            <Field label={t('agencyPack.fieldZoning')}>{tr(project,'zoning_type')}</Field>
            <Field label={t('agencyPack.fieldPermit')}>{tr(project,'building_permit_status')}</Field>
            <Field label={t('agencyPack.fieldStructuralWarranty')}>{tr(project,'structural_warranty')}</Field>
          </section>

          <section className="bg-white rounded-3xl p-6 shadow-sm border border-primary/5">
            <h2 className="text-base font-serif text-primary mb-4">{t('agencyPack.sectionProduct')}</h2>
            <Field label={t('agencyPack.fieldBedrooms')}>{project.bedrooms}</Field>
            <Field label={t('agencyPack.fieldBathrooms')}>{project.bathrooms}</Field>
            <Field label={t('agencyPack.fieldPowderRoom')}>
              {project.has_powder_room == null ? null : project.has_powder_room ? t('agencyPack.yes') : t('agencyPack.no')}
            </Field>
            <Field label={t('agencyPack.fieldRooftop')}>
              {project.has_rooftop == null ? null : project.has_rooftop ? t('agencyPack.yes') : t('agencyPack.no')}
            </Field>
            <Field label={t('agencyPack.fieldBuildingM2')}>{project.area_m2}</Field>
            <Field label={t('agencyPack.fieldLandM2')}>{project.land_size_m2}</Field>
            <Field label={t('agencyPack.fieldPoolM2')}>{project.pool_size_m2}</Field>
            <Field label={t('agencyPack.fieldParking')}>{tr(project,'parking')}</Field>
            <Field label={t('agencyPack.fieldView')}>{tr(project,'view')}</Field>
            <Field label={t('agencyPack.fieldLivingRoom')}>{tr(project,'living_room_style')}</Field>
            <Field label={t('agencyPack.fieldWaterSupply')}>{tr(project,'water_supply')}</Field>
          </section>

          <section className="bg-white rounded-3xl p-6 shadow-sm border border-primary/5">
            <h2 className="text-base font-serif text-primary mb-4">{t('agencyPack.sectionPricing')}</h2>
            <Field label={t('agencyPack.fieldNetSalePrice')}>{formatPrice(project.investor_price)}</Field>
            <Field label={t('agencyPack.fieldFurnishing')}>{tr(project,'furnishing')}</Field>
            <Field label={t('agencyPack.fieldPackFurnished')}>
              {project.furnishing_pack_cost_usd != null
                ? `+ USD ${project.furnishing_pack_cost_usd.toLocaleString('en-US')}`
                : null}
            </Field>
            <Field label={t('agencyPack.fieldPaymentPlan')}>{tr(project,'payment_plan_off_plan')}</Field>
            <Field label={t('agencyPack.fieldEstimatedDelivery')}>{tr(project,'completion_date')}</Field>
            <Field label={t('agencyPack.fieldRoiProjected')}>
              {project.annual_rental_projection != null
                ? t('agencyPack.roiPerYear', { value: project.annual_rental_projection.toLocaleString('en-US') })
                : null}
            </Field>
          </section>
        </div>

        <section className="bg-white rounded-3xl p-6 shadow-sm border border-primary/5">
          <h2 className="text-base font-serif text-primary mb-4">{t('agencyPack.sectionDocs')}</h2>
          <div className="flex flex-wrap gap-3">
            <LinkBtn href={project.brochure_url}>{t('agencyPack.docBrochure')}</LinkBtn>
            <LinkBtn href={project.drive_renders_url}>{t('agencyPack.docRenders')}</LinkBtn>
            <LinkBtn href={project.drive_2d_plans_url}>{t('agencyPack.doc2dPlans')}</LinkBtn>
            <LinkBtn href={project.drive_permits_url}>{t('agencyPack.docPermits')}</LinkBtn>
            <LinkBtn href={project.drive_legal_url}>{t('agencyPack.docLegal')}</LinkBtn>
            <LinkBtn href={project.video_url}>{t('agencyPack.docVideo')}</LinkBtn>
            <LinkBtn href={project.construction_update_url}>{t('agencyPack.docConstruction')}</LinkBtn>
            <LinkBtn href={project.drive_brochure_folder_url}>{t('agencyPack.docDriveFolder')}</LinkBtn>
          </div>
        </section>

        {project.floor_plans && project.floor_plans.length > 0 && (
          <section>
            <h2 className="text-xs font-black uppercase tracking-widest text-primary/60 mb-3">{t('agencyPack.floorPlansTitle')}</h2>
            <div className="grid gap-4">
              {project.floor_plans.slice(0, 3).map((src, i) =>
                src.includes('drive.google.com') ? (
                  <iframe
                    key={i}
                    src={src}
                    className="w-full h-[600px] rounded-2xl border border-primary/5"
                    title={`Floor plan ${i + 1}`}
                  />
                ) : (
                  <img key={i} src={src} alt={`Floor plan ${i + 1}`} className="w-full rounded-2xl" loading="lazy" />
                ),
              )}
            </div>
          </section>
        )}

        <footer className="text-center text-xs text-primary/40 pt-8 border-t border-primary/5">
          {t('agencyPack.footerLine1')}
          <br />
          {t('agencyPack.footerLine2')}
        </footer>
      </main>
    </div>
  );
};

export default AgencyPack;
