import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import LanguageSwitcher from '../components/LanguageSwitcher';

interface ProjectAgencyRow {
  id: string;
  name: string;
  slug: string;
  owner_name: string | null;
  location: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  area_m2: number | null;
  land_size_m2: number | null;
  pool_size_m2: number | null;
  has_powder_room: boolean | null;
  has_rooftop: boolean | null;
  parking: string | null;
  view: string | null;
  living_room_style: string | null;
  furnishing: string | null;
  furnishing_pack_cost_usd: number | null;
  investor_price: number | null;
  price_currency: string | null;
  payment_plan_off_plan: string | null;
  years_contract: number | null;
  years_extension: number | null;
  extension_cost_usd: number | null;
  lease_end_date: string | null;
  lease_years_paid: boolean | null;
  zoning_type: string | null;
  building_permit_status: string | null;
  structural_warranty: string | null;
  water_supply: string | null;
  completion_date: string | null;
  google_maps_url: string | null;
  brochure_url: string | null;
  drive_brochure_folder_url: string | null;
  drive_renders_url: string | null;
  drive_2d_plans_url: string | null;
  drive_permits_url: string | null;
  drive_legal_url: string | null;
  video_url: string | null;
  gallery: string[] | null;
  floor_plans: string[] | null;
  status: string | null;
  is_hidden: boolean | null;
}

interface ChecklistGroup {
  title: string;
  items: { label: string; value: any; href?: string | null }[];
}

const ok = (v: any): boolean => {
  if (v === null || v === undefined) return false;
  if (typeof v === 'string') return v.trim().length > 0;
  if (typeof v === 'number') return true;
  if (typeof v === 'boolean') return true;
  if (Array.isArray(v)) return v.length > 0;
  return false;
};

const buildChecklist = (p: ProjectAgencyRow, t: (k: string) => string): ChecklistGroup[] => [
  {
    title: 'groupIdentification',
    items: [
      { label: t('admin.agc.labelOwner'), value: p.owner_name },
      { label: t('admin.agc.labelLocation'), value: p.location },
      { label: t('admin.agc.labelGooglePin'), value: p.google_maps_url, href: p.google_maps_url },
      { label: t('admin.agc.labelStatus'), value: p.status },
    ],
  },
  {
    title: 'groupLeasehold',
    items: [
      { label: t('admin.agc.labelLeaseEndDate'), value: p.lease_end_date },
      { label: t('admin.agc.labelYearsContract'), value: p.years_contract },
      { label: t('admin.agc.labelYearsExtension'), value: p.years_extension },
      { label: t('admin.agc.labelExtensionCost'), value: p.extension_cost_usd },
      { label: t('admin.agc.labelLeaseYearsPaid'), value: p.lease_years_paid },
      { label: t('admin.agc.labelZoningType'), value: p.zoning_type },
      { label: t('admin.agc.labelBuildingPermit'), value: p.building_permit_status },
      { label: t('admin.agc.labelStructuralWarranty'), value: p.structural_warranty },
    ],
  },
  {
    title: 'groupProduct',
    items: [
      { label: t('admin.agc.labelBedrooms'), value: p.bedrooms },
      { label: t('admin.agc.labelBathrooms'), value: p.bathrooms },
      { label: t('admin.agc.labelPowderRoom'), value: p.has_powder_room },
      { label: t('admin.agc.labelRooftop'), value: p.has_rooftop },
      { label: t('admin.agc.labelBuildingSize'), value: p.area_m2 },
      { label: t('admin.agc.labelLandSize'), value: p.land_size_m2 },
      { label: t('admin.agc.labelPoolSize'), value: p.pool_size_m2 },
      { label: t('admin.agc.labelParking'), value: p.parking },
      { label: t('admin.agc.labelView'), value: p.view },
      { label: t('admin.agc.labelLivingRoomStyle'), value: p.living_room_style },
      { label: t('admin.agc.labelWaterSupply'), value: p.water_supply },
    ],
  },
  {
    title: 'groupPricing',
    items: [
      { label: t('admin.agc.labelNetSalePrice'), value: p.investor_price ? `${p.investor_price} ${p.price_currency || 'USD'}` : null },
      { label: t('admin.agc.labelFurnishing'), value: p.furnishing },
      { label: t('admin.agc.labelFurnishingPack'), value: p.furnishing_pack_cost_usd },
      { label: t('admin.agc.labelPaymentPlan'), value: p.payment_plan_off_plan },
      { label: t('admin.agc.labelEstimatedDelivery'), value: p.completion_date },
    ],
  },
  {
    title: 'groupMedia',
    items: [
      { label: t('admin.agc.labelPhotoGallery'), value: p.gallery, href: null },
      { label: t('admin.agc.label2dPlansWeb'), value: p.floor_plans, href: null },
      { label: t('admin.agc.labelBrochureUrlWeb'), value: p.brochure_url, href: p.brochure_url },
      { label: t('admin.agc.labelDriveMainFolder'), value: p.drive_brochure_folder_url, href: p.drive_brochure_folder_url },
      { label: t('admin.agc.labelDriveRendersFolder'), value: p.drive_renders_url, href: p.drive_renders_url },
      { label: t('admin.agc.labelDrive2dPlansFolder'), value: p.drive_2d_plans_url, href: p.drive_2d_plans_url },
      { label: t('admin.agc.labelDrivePermitsFolder'), value: p.drive_permits_url, href: p.drive_permits_url },
      { label: t('admin.agc.labelDriveLegalFolder'), value: p.drive_legal_url, href: p.drive_legal_url },
      { label: t('admin.agc.labelVideoUrl'), value: p.video_url, href: p.video_url },
    ],
  },
];

const AdminAgencias: React.FC = () => {
  const { t } = useTranslation();
  const [projects, setProjects] = useState<ProjectAgencyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    document.title = 'Admin · Pack Agencias';
    (async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .order('name');
      if (error) {
        setError(error.message);
      } else {
        setProjects((data || []) as ProjectAgencyRow[]);
      }
      setLoading(false);
    })();
  }, []);

  const totalsFor = (p: ProjectAgencyRow) => {
    const groups = buildChecklist(p, t);
    const total = groups.reduce((s, g) => s + g.items.length, 0);
    const done = groups.reduce(
      (s, g) => s + g.items.filter((it) => ok(it.value)).length,
      0,
    );
    return { total, done, pct: Math.round((done / total) * 100) };
  };

  if (loading) return <div className="p-12 text-center text-primary/60">{t('admin.common.loading')}</div>;
  if (error) return <div className="p-12 text-red-600">{t('admin.agencias.loadError')}: {error}</div>;

  return (
    <div className="bg-almond min-h-screen px-6 md:px-12 py-12">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8 gap-3 flex-wrap">
          <div>
            <h1 className="text-4xl md:text-5xl font-serif text-primary">{t('admin.agencias.title')}</h1>
            <p className="text-primary/60 mt-2">
              {t('admin.agencias.subtitle')}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <LanguageSwitcher />
            <Link
              to="/admin"
              className="text-sm font-bold text-primary/60 hover:text-primary"
            >
              {t('admin.agencias.backToAdmin')}
            </Link>
          </div>
        </div>

        <div className="grid gap-6">
          {projects.map((p) => {
            const totals = totalsFor(p);
            const isOpen = !!expanded[p.id];
            const groups = buildChecklist(p, t);
            return (
              <div
                key={p.id}
                className="bg-white rounded-3xl shadow-lg border border-primary/5 overflow-hidden"
              >
                <button
                  onClick={() => setExpanded((s) => ({ ...s, [p.id]: !isOpen }))}
                  className="w-full px-6 md:px-10 py-6 flex items-center justify-between hover:bg-gray-50 transition"
                >
                  <div className="flex items-center gap-6 text-left">
                    <span
                      className={`text-2xl font-black ${
                        totals.pct === 100
                          ? 'text-green-600'
                          : totals.pct >= 70
                          ? 'text-amber-500'
                          : 'text-red-500'
                      }`}
                    >
                      {totals.pct}%
                    </span>
                    <div>
                      <h2 className="text-2xl font-serif text-primary">{p.name}</h2>
                      <p className="text-sm text-primary/50">
                        {t('admin.agencias.fieldsComplete', { done: totals.done, total: totals.total })} · {p.location || '—'}
                      </p>
                    </div>
                  </div>
                  <span className="text-primary/40 text-2xl">{isOpen ? '▾' : '▸'}</span>
                </button>

                {isOpen && (
                  <div className="border-t border-primary/5 px-6 md:px-10 py-6 grid md:grid-cols-2 gap-6">
                    {groups.map((g) => (
                      <div key={g.title}>
                        <h3 className="text-xs font-black uppercase tracking-widest text-primary/60 mb-3">
                          {t(`admin.agencias.${g.title}`)}
                        </h3>
                        <ul className="space-y-2">
                          {g.items.map((it) => {
                            const filled = ok(it.value);
                            return (
                              <li
                                key={it.label}
                                className="flex items-start gap-3 text-sm"
                              >
                                <span
                                  className={`mt-0.5 inline-flex w-5 h-5 items-center justify-center rounded-full text-[10px] font-black flex-shrink-0 ${
                                    filled
                                      ? 'bg-green-100 text-green-700'
                                      : 'bg-red-100 text-red-700'
                                  }`}
                                >
                                  {filled ? '✓' : '✕'}
                                </span>
                                <span className="text-primary/80 font-medium">
                                  {it.label}:
                                </span>
                                <span className="text-primary flex-1 break-words">
                                  {!filled && '—'}
                                  {filled && it.href && (
                                    <a
                                      href={it.href}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-primary underline hover:text-primary/70"
                                    >
                                      {String(it.value).length > 60
                                        ? `${String(it.value).slice(0, 60)}…`
                                        : String(it.value)}
                                    </a>
                                  )}
                                  {filled && !it.href && Array.isArray(it.value) && (
                                    <span>{it.value.length} items</span>
                                  )}
                                  {filled &&
                                    !it.href &&
                                    !Array.isArray(it.value) &&
                                    typeof it.value !== 'boolean' && (
                                      <span>{String(it.value)}</span>
                                    )}
                                  {filled && typeof it.value === 'boolean' && (
                                    <span>{it.value ? t('common.yes') : t('common.no')}</span>
                                  )}
                                </span>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    ))}
                    <div className="md:col-span-2 pt-4 border-t border-primary/5 flex flex-wrap gap-3">
                      <a
                        href={`/proyecto/${p.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-5 py-2 bg-primary text-white rounded-full text-sm font-bold hover:opacity-90"
                      >
                        {t('admin.agencias.viewPublic')}
                      </a>
                      {p.drive_brochure_folder_url && (
                        <a
                          href={p.drive_brochure_folder_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-5 py-2 border border-primary text-primary rounded-full text-sm font-bold hover:bg-primary/5"
                        >
                          {t('admin.agencias.openDrive')}
                        </a>
                      )}
                      <button
                        onClick={() => {
                          const url = `${window.location.origin}/proyecto/${p.slug}`;
                          navigator.clipboard.writeText(url);
                        }}
                        className="px-5 py-2 border border-primary/20 text-primary rounded-full text-sm font-bold hover:bg-primary/5"
                      >
                        {t('admin.agencias.copyPublic')}
                      </button>
                      <a
                        href={`/agencias/${p.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-5 py-2 bg-amber-500 text-white rounded-full text-sm font-bold hover:opacity-90"
                      >
                        {t('admin.agencias.agencyPack')}
                      </a>
                      <button
                        onClick={() => {
                          const url = `${window.location.origin}/agencias/${p.slug}`;
                          navigator.clipboard.writeText(url);
                        }}
                        className="px-5 py-2 border border-amber-500 text-amber-600 rounded-full text-sm font-bold hover:bg-amber-50"
                      >
                        {t('admin.agencias.copyAgency')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default AdminAgencias;
