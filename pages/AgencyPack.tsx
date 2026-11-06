import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase, getImageUrl } from '../lib/supabase';
import { localizeMonthYear, propertyTypeLabel } from '../lib/projectTerms';
import { uiLocale } from '../lib/dateLocale';
import { translateStatus } from '../lib/statusI18n';
import BrandLogo from '../components/BrandLogo';
import { useCurrency } from '../App';
import { fmtDate, shortProjectName } from '../components/agency/useAgencyData';

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
  area_m2_label?: string | null;
  land_m2_label?: string | null;
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
  visibility_status: string | null;
}

const ACCENT = 'text-[#A0522D]';
const cardCls = 'bg-white rounded-3xl p-6 md:p-8 shadow-[0_1px_2px_rgba(63,35,5,0.04),0_8px_24px_-12px_rgba(63,35,5,0.12)] border border-primary/5';

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) =>
  children == null || children === '' ? null : (
    <div className="flex items-baseline justify-between gap-4 py-3 border-b border-primary/5 last:border-0">
      <dt className="flex-1 min-w-0 text-[11px] font-bold uppercase text-primary/50 tracking-wider">{label}</dt>
      <dd className="max-w-[60%] text-sm text-primary text-right break-words">{children}</dd>
    </div>
  );

const Card: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className={cardCls}>
    <h2 className="font-serif text-2xl text-primary mb-3">{title}</h2>
    <dl>{children}</dl>
  </section>
);

const Kicker: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h2 className={`text-[11px] font-black uppercase tracking-[0.25em] ${ACCENT} mb-4`}>{children}</h2>
);

const DocRow: React.FC<{ href: string | null | undefined; icon: string; children: React.ReactNode }> = ({ href, icon, children }) =>
  !href ? null : (
    <a href={href} target="_blank" rel="noopener noreferrer"
      className="flex items-center gap-3 px-4 py-3.5 rounded-2xl border border-primary/10 bg-white hover:border-primary/30 hover:shadow-sm transition text-sm font-bold text-primary">
      <span className={`material-symbols-outlined text-[22px] ${ACCENT}`}>{icon}</span>
      <span className="flex-1 min-w-0 truncate">{children}</span>
      <span className="material-symbols-outlined text-[18px] text-primary/30">open_in_new</span>
    </a>
  );

const AgencyPack: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const { t, i18n } = useTranslation();
  const { formatPrice: webFormat } = useCurrency();
  const [project, setProject] = useState<ProjectAgencyRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Resolve translatable field by current language. Falls back to ES (base).
  const tr = (p: ProjectAgencyRow | null, base: keyof ProjectAgencyRow): string | null => {
    if (!p) return null;
    const lang = (i18n.language || 'es').slice(0, 2);
    if (lang === 'en') return ((p as any)[`${String(base)}_en`] as string) || (p[base] as any) || null;
    if (lang === 'ro') return ((p as any)[`${String(base)}_ro`] as string) || (p[base] as any) || null;
    if (lang === 'id') return ((p as any)[`${String(base)}_id`] as string) || (p[base] as any) || null;
    return (p[base] as any) || null;
  };

  useEffect(() => {
    document.title = t('agencyPack.pageTitle');
    if (!slug) return;
    (async () => {
      // Datos internos del pack: solo staff o agencia con sesión (RPC agency_pack_get)
      const { data: rows, error } = await supabase.rpc('agency_pack_get', { p_slug: slug });
      const data = Array.isArray(rows) ? rows[0] ?? null : null;
      if (error) {
        setError(t('agencyPack.loginRequired'));
      } else if (!data) {
        setError(t('agencyPack.notFound'));
      } else {
        setProject(data as ProjectAgencyRow);
        document.title = t('agencyPack.pageTitleProject', { name: shortProjectName((data as ProjectAgencyRow).name) });
      }
      setLoading(false);
    })();
  }, [slug]);

  if (loading)
    return <div className="min-h-screen flex items-center justify-center bg-almond text-primary/60">{t('agencyPack.loading')}</div>;
  if (error || !project)
    return (
      <div className="min-h-screen flex items-center justify-center bg-almond p-6">
        <div className="bg-white rounded-3xl p-8 shadow-sm border border-primary/5 text-center max-w-md">
          <span className="material-symbols-outlined text-4xl text-primary/20">lock</span>
          <p className="text-primary/70 mt-2 leading-relaxed">{error || t('agencyPack.notFound')}</p>
          <Link to="/agencias/login" className="inline-flex mt-5 bg-primary text-white px-5 py-3 rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-black transition">{t('agencyPack.goLogin')}</Link>
        </div>
      </div>
    );

  const money = (v: number | null | undefined, cur?: string | null) =>
    v == null ? null : new Intl.NumberFormat(uiLocale(), { style: 'currency', currency: cur || 'EUR', maximumFractionDigits: 0, useGrouping: 'always' } as any).format(v);
  // Precio = el de la web: mismo campo (investor_price) y mismo formato que la ficha pública.
  const formatPrice = (v: number | null) => (v == null ? null : webFormat(Number(v), (project.price_currency || 'EUR') as any));
  const soldOut = project.visibility_status === 'sold_out'; // como la web: agotado → sin precio de venta
  // Mismas claves que el formulario de auto-alta (semi/furnished/turnkey), como en ProjectDetail.
  const furnishingLabel = (() => {
    const v = String(project.furnishing || '').toLowerCase();
    const map: Record<string, string> = { semi: t('listingIntake.semiFurnished'), furnished: t('listingIntake.furnished'), turnkey: t('listingIntake.turnkey'), unfurnished: t('listingIntake.unfurnished') };
    return map[v] || tr(project, 'furnishing') || '';
  })();
  const title = shortProjectName(project.name);
  const floorPlans = (project.floor_plans || []).filter((u) => typeof u === 'string' && u.trim()).slice(0, 3);
  const beds = project.bedrooms ? t('agencyPortal.projects.bedrooms', { count: project.bedrooms }) : null;
  const planSteps = (tr(project, 'payment_plan_off_plan') || '').split(/\s*,\s*/).filter(Boolean);
  const gallery = (project.gallery || []).filter(Boolean);

  return (
    <div className="bg-almond min-h-screen text-primary">
      <div className="bg-white/70 backdrop-blur border-b border-primary/5 sticky top-0 z-30 print:hidden">
        <div className="max-w-6xl mx-auto px-4 md:px-8 h-14 flex items-center justify-between gap-3">
          <Link to="/" className="shrink-0"><BrandLogo imgClassName="h-7 w-auto object-contain" textClassName="font-serif text-primary text-xl tracking-tight" /></Link>
          <Link to="/agencias/dashboard?view=projects" className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-widest text-primary/60 hover:text-primary transition">
            <span className="material-symbols-outlined text-[18px]">arrow_back</span>{t('agencyPack.backToPortal')}
          </Link>
        </div>
      </div>

      <header className="max-w-6xl mx-auto px-4 md:px-8 pt-8 md:pt-14 pb-8">
        <div className="grid md:grid-cols-[minmax(0,1fr)_320px] gap-6 md:gap-10 md:items-end">
          <div className="min-w-0">
            <p className={`text-[11px] font-black uppercase tracking-[0.3em] ${ACCENT} mb-3`}>{t('agencyPack.headerKicker')}</p>
            <h1 className="font-serif font-normal text-4xl md:text-6xl leading-[1.05] tracking-tight">{title}</h1>
            <p className="text-primary/60 mt-3 text-sm md:text-base">
              {[project.location, beds, project.property_type && propertyTypeLabel(project.property_type, i18n.language)].filter(Boolean).join(' · ')}
            </p>
          </div>
          <div className={cardCls + ' !p-5 md:!p-6'}>
            <p className="text-[11px] font-black uppercase tracking-widest text-primary/50">{t('agencyPack.priceLabel')}</p>
            <p className="font-serif text-4xl md:text-5xl mt-1 leading-none">{soldOut ? t('projects.soldOutBadge') : formatPrice(project.investor_price) ?? '—'}</p>
            <p className="text-xs text-primary/60 mt-3 leading-relaxed">{t('agencyPack.commissionIncluded', { furnishing: furnishingLabel })}</p>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 md:px-8 pb-12 space-y-8 md:space-y-10">
        {gallery.length > 0 && (
          <section className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
            {gallery.slice(0, 5).map((src, i) => (
              <img key={i} src={getImageUrl(src)} alt={`${title} ${i + 1}`} loading={i === 0 ? 'eager' : 'lazy'}
                className={`w-full object-cover rounded-2xl bg-primary/5 ${i === 0 ? 'col-span-2 row-span-2 aspect-[4/3] md:aspect-auto md:h-full' : 'aspect-[4/3]'}`} />
            ))}
          </section>
        )}

        {tr(project, 'description') && (
          <section className="max-w-3xl">
            <Kicker>{t('agencyPack.summaryTitle')}</Kicker>
            <p className="text-base md:text-lg leading-relaxed text-primary/80">{tr(project, 'description')}</p>
          </section>
        )}

        <div className="grid md:grid-cols-2 gap-5 md:gap-6 items-start">
          <Card title={t('agencyPack.sectionPricing')}>
            <Field label={t('agencyPack.fieldNetSalePrice')}>{soldOut ? null : formatPrice(project.investor_price)}</Field>
            <Field label={t('agencyPack.fieldFurnishing')}>{furnishingLabel || null}</Field>
            <Field label={t('agencyPack.fieldPackFurnished')}>{project.furnishing_pack_cost_usd != null ? `+ ${money(project.furnishing_pack_cost_usd, 'USD')}` : null}</Field>
            <Field label={t('agencyPack.fieldEstimatedDelivery')}>{localizeMonthYear(tr(project, 'completion_date') || '', i18n.language) || null}</Field>
            {planSteps.length > 0 && (
              <div className="pt-4">
                <dt className="text-[11px] font-bold uppercase text-primary/50 tracking-wider mb-2">{t('agencyPack.fieldPaymentPlan')}</dt>
                <dd><ol className="space-y-1.5">
                  {planSteps.map((st, i) => (
                    <li key={i} className="flex items-start gap-3 text-sm">
                      <span className="mt-0.5 w-5 h-5 shrink-0 rounded-full bg-almond text-[10px] font-black flex items-center justify-center">{i + 1}</span>
                      <span>{st.charAt(0).toUpperCase() + st.slice(1)}</span>
                    </li>
                  ))}
                </ol></dd>
              </div>
            )}
          </Card>

          <Card title={t('agencyPack.sectionProduct')}>
            <Field label={t('agencyPack.fieldBedrooms')}>{project.bedrooms}</Field>
            <Field label={t('agencyPack.fieldBathrooms')}>{project.bathrooms}</Field>
            <Field label={t('agencyPack.fieldPowderRoom')}>{project.has_powder_room == null ? null : project.has_powder_room ? t('agencyPack.yes') : t('agencyPack.no')}</Field>
            <Field label={t('agencyPack.fieldRooftop')}>{project.has_rooftop == null ? null : project.has_rooftop ? t('agencyPack.yes') : t('agencyPack.no')}</Field>
            <Field label={t('agencyPack.fieldBuildingM2')}>{project.area_m2_label?.trim() || project.area_m2}</Field>
            <Field label={t('agencyPack.fieldLandM2')}>{project.land_m2_label?.trim() || project.land_size_m2}</Field>
            <Field label={t('agencyPack.fieldPoolM2')}>{project.pool_size_m2}</Field>
            <Field label={t('agencyPack.fieldParking')}>{tr(project, 'parking')}</Field>
            <Field label={t('agencyPack.fieldView')}>{tr(project, 'view')}</Field>
            <Field label={t('agencyPack.fieldLivingRoom')}>{tr(project, 'living_room_style')}</Field>
            <Field label={t('agencyPack.fieldWaterSupply')}>{tr(project, 'water_supply')}</Field>
          </Card>

          <Card title={t('agencyPack.sectionContract')}>
            <Field label={t('agencyPack.fieldLeaseEnd')}>{tr(project, 'lease_end_date')}</Field>
            <Field label={t('agencyPack.fieldYearsContract')}>{project.years_contract}</Field>
            <Field label={t('agencyPack.fieldYearsExtension')}>{project.years_extension}</Field>
            <Field label={t('agencyPack.fieldExtensionCost')}>
              {project.extension_cost_usd != null ? (project.extension_cost_usd === 0 ? t('agencyPack.atMarketPrice') : money(project.extension_cost_usd, 'USD')) : null}
            </Field>
            <Field label={t('agencyPack.fieldLeasePaid')}>{project.lease_years_paid == null ? null : project.lease_years_paid ? t('agencyPack.yesFull') : t('agencyPack.no')}</Field>
            <Field label={t('agencyPack.fieldZoning')}>{tr(project, 'zoning_type')}</Field>
            <Field label={t('agencyPack.fieldPermit')}>{tr(project, 'building_permit_status')}</Field>
            <Field label={t('agencyPack.fieldStructuralWarranty')}>{tr(project, 'structural_warranty')}</Field>
          </Card>

          <Card title={t('agencyPack.sectionIdentification')}>
            <Field label={t('agencyPack.fieldOwner')}>{project.owner_name}</Field>
            <Field label={t('agencyPack.fieldZone')}>{project.zone}</Field>
            <Field label={t('agencyPack.fieldStatus')}>{project.status ? translateStatus(project.status, t) : null}</Field>
            <Field label={t('agencyPack.fieldProgress')}>{project.completion_percent != null ? `${project.completion_percent} %` : null}</Field>
            <Field label={t('agencyPack.fieldLastUpdate')}>{project.construction_update_date ? fmtDate(project.construction_update_date) : null}</Field>
            <Field label={t('agencyPack.fieldGooglePin')}>
              {project.google_maps_url ? <a className="underline underline-offset-4 hover:text-primary/70" href={project.google_maps_url} target="_blank" rel="noopener noreferrer">{t('agencyPack.viewMap')}</a> : null}
            </Field>
          </Card>
        </div>

        {[project.brochure_url, project.drive_renders_url, project.drive_2d_plans_url, project.drive_permits_url, project.drive_legal_url, project.video_url, project.construction_update_url, project.drive_brochure_folder_url].some(Boolean) && (
          <section>
            <Kicker>{t('agencyPack.sectionDocs')}</Kicker>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
              <DocRow href={project.brochure_url} icon="picture_as_pdf">{t('agencyPack.docBrochure')}</DocRow>
              <DocRow href={project.drive_renders_url} icon="photo_library">{t('agencyPack.docRenders')}</DocRow>
              <DocRow href={project.drive_2d_plans_url} icon="architecture">{t('agencyPack.doc2dPlans')}</DocRow>
              <DocRow href={project.drive_permits_url} icon="verified">{t('agencyPack.docPermits')}</DocRow>
              <DocRow href={project.drive_legal_url} icon="gavel">{t('agencyPack.docLegal')}</DocRow>
              <DocRow href={project.video_url} icon="play_circle">{t('agencyPack.docVideo')}</DocRow>
              <DocRow href={project.construction_update_url} icon="construction">{t('agencyPack.docConstruction')}</DocRow>
              <DocRow href={project.drive_brochure_folder_url} icon="folder_open">{t('agencyPack.docDriveFolder')}</DocRow>
            </div>
          </section>
        )}

        {floorPlans.length > 0 && (
          <section>
            <Kicker>{t('agencyPack.floorPlansTitle')}</Kicker>
            <div className="grid gap-4">
              {floorPlans.map((src, i) => {
                const label = `${t('agencyPack.floorPlansTitle')} ${i + 1}`;
                // Drive: miniatura (el iframe de Drive salía en blanco en móvil → bloque vacío gigante)
                const driveId = src.match(/drive\.google\.com\/file\/d\/([^/?#]+)/)?.[1];
                if (driveId)
                  return (
                    <a key={i} href={src} target="_blank" rel="noopener noreferrer" className="block">
                      <img src={`https://drive.google.com/thumbnail?id=${driveId}&sz=w1600`} alt={label} className="w-full rounded-3xl bg-white" loading="lazy"
                        onError={(e) => { (e.currentTarget.parentElement as HTMLElement).style.display = 'none'; }} />
                    </a>
                  );
                // PDF u otro documento: enlace (un <img> de un PDF sale roto)
                if (/^https?:/i.test(src) && !/\.(png|jpe?g|webp|avif|gif)(\?|$)/i.test(src))
                  return <DocRow key={i} href={src} icon="architecture">{label}</DocRow>;
                return <img key={i} src={getImageUrl(src)} alt={label} className="w-full rounded-3xl bg-white" loading="lazy" />;
              })}
            </div>
          </section>
        )}

        <p className="text-center text-xs text-primary/40 pt-6 border-t border-primary/10 leading-relaxed">
          {t('agencyPack.footerLine1')}<br />{t('agencyPack.footerLine2')}
        </p>
      </main>
    </div>
  );
};

export default AgencyPack;
