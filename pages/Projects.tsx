import React, { useState, useEffect, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CURRENCIES, DEFAULT_CONFIG } from '../constants';
import { projectPath } from '../lib/projectUrl';
import { Project, AppConfig } from '../types';
import { useCurrency } from '../App';
import { supabase, getImageUrl, parseJsonField } from '../lib/supabase';
import { imgSrc, imgSrcSet, imgFallback } from '../lib/imageOptimize';
import { readSWR, writeSWR } from '../lib/swrCache';
import { translateStatus } from '../lib/statusI18n';
import { statusBadgeClass, statusDotClass } from '../lib/statusColor';
import { usePageMeta } from '../components/PageMeta';
import { isFinished, deliveryText } from '../lib/deliveryDate';

const ANY_ZONE = 'Cualquier zona';
const ANY_TYPE = 'Cualquier tipo';
const ANY_STATUS = 'Cualquier estado';
const ANY_BEDS = 'any';

// The 3 canonical states (2026-09-28). Each bucket also catches legacy raw
// labels so an un-migrated row still filters into the right group.
const STATUS_GROUPS: Record<string, string[]> = {
  off_plan: ['off plan', 'sobre plano', 'pre-venta', 'pre venta', 'en pre-venta', 'en pre venta', 'pre-construcción', 'pre-construccion'],
  en_construccion: ['en construcción', 'en construccion', 'estructura completa', 'últimas unidades', 'ultimas unidades'],
  obra_finalizada: ['obra finalizada', 'finalizado', 'entregado', 'listo para entrar', 'terminad'],
};

const localizedCompletion = (p: Project, lang: string): string => {
  const l = (lang || 'es').slice(0, 2);
  if (l === 'en') return (p as any).completion_date_en || p.completion_date || '';
  if (l === 'id') return (p as any).completion_date_id || p.completion_date || '';
  return p.completion_date || '';
};

const Projects: React.FC = () => {
  const { t, i18n } = useTranslation();
  usePageMeta({ title: t('projects.title'), description: t('projects.metaDescription') });
  const [searchParams, setSearchParams] = useSearchParams();
  // SWR — repeat visitors see the catalogue instantly from localStorage; we
  // refresh in the background. Same pattern as Home.tsx.
  const [projects, setProjects] = useState<Project[]>(() => readSWR<Project[]>('projects_list') ?? []);
  const [config, setConfig] = useState<AppConfig>(() => readSWR<AppConfig>('home_config') ?? DEFAULT_CONFIG);
  const { formatPrice, currency } = useCurrency();
  const [loading, setLoading] = useState<boolean>(() => (readSWR<Project[]>('projects_list') ?? []).length === 0);
  
  // Inicializar estado con formato de miles si existe en URL
  const formatInitialPrice = (val: string | null) => {
    if (!val) return '';
    return val.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  };

  const [filters, setFilters] = useState({
    zone: searchParams.get('zone') || ANY_ZONE,
    minPrice: formatInitialPrice(searchParams.get('minPrice')),
    maxPrice: formatInitialPrice(searchParams.get('maxPrice')),
    type: searchParams.get('type') || ANY_TYPE,
    status: searchParams.get('status') || ANY_STATUS,
    beds: searchParams.get('beds') || ANY_BEDS,
    sort: searchParams.get('sort') || 'asc'
  });

  useEffect(() => {
    const loadData = async () => {
      try {
        const { data: configRows } = await supabase.from('app_config').select('*');
        if (configRows && configRows.length > 0) {
             const configObj: any = {};
             configRows.forEach((row: any) => {
               configObj[row.key] = row.value;
             });
             const next = { ...DEFAULT_CONFIG, ...configObj } as AppConfig;
             setConfig(next);
             writeSWR('home_config', next);
        }

        const { data } = await supabase
          .from('projects')
          .select('*')
          .order('sort_order', { ascending: true });

        if (data) {
          const safeProjects = data.map((p: any) => ({
            ...p,
            gallery: parseJsonField(p.gallery, []),
            investor_tiers: parseJsonField(p.investor_tiers, [])
          })) as unknown as Project[];
          setProjects(safeProjects);
          writeSWR('projects_list', safeProjects);
        }
      } catch (error) {
        console.error('Error loading projects:', error);
      } finally {
        setLoading(false);
      }
    };
    void loadData();
  }, []);

  const filteredProjects = useMemo(() => {
    let result = projects.filter(p => {
      if (p.is_hidden) return false; // Hide hidden projects from main list
      // NOTA: se quitó el filtro `is_listed === false`. Causaba que una propiedad
      // PÚBLICA (is_hidden=false) saliera en el home pero NO en /proyectos (bug
      // reportado por Andreas con Amante Villas). `is_listed` no se setea en
      // ninguna UI (flag muerto). Ahora /proyectos usa la MISMA regla que el home:
      // visible = !is_hidden → toda propiedad pública aparece en todos los sitios.

      const zoneMatch = filters.zone === ANY_ZONE || (p.location || '').toLowerCase().includes(filters.zone.toLowerCase());
      const typeMatch = filters.type === ANY_TYPE || p.property_type === filters.type;

      const statusMatch = filters.status === ANY_STATUS || (() => {
        const raw = (p.status || '').toLowerCase().trim();
        const group = STATUS_GROUPS[filters.status] || [];
        return group.some(s => raw.includes(s));
      })();

      const bedsMatch = filters.beds === ANY_BEDS || (
        filters.beds === '3' ? Number(p.bedrooms) >= 3 : Number(p.bedrooms) === Number(filters.beds)
      );

      const rates = config.exchangeRates;
      const projectRate = rates[p.price_currency] || 1;
      const currentRate = rates[currency] || 1;
      
      const priceInCurrentCurrency = (p.investor_price / projectRate) * currentRate;

      // Parsear precios eliminando puntos
      const minVal = filters.minPrice.replace(/\./g, '');
      const maxVal = filters.maxPrice.replace(/\./g, '');

      const min = minVal ? parseFloat(minVal) : 0;
      const max = maxVal ? parseFloat(maxVal) : Infinity;
      
      const priceMatch = priceInCurrentCurrency >= min && priceInCurrentCurrency <= max;

      return zoneMatch && priceMatch && typeMatch && statusMatch && bedsMatch;
    });

    result.sort((a, b) => {
      if (filters.sort === 'featured') {
        if (a.is_featured && !b.is_featured) return -1;
        if (!a.is_featured && b.is_featured) return 1;
        return a.sort_order - b.sort_order;
      }
      
      if (filters.sort === 'roi') {
        const roiA = a.annual_rental_projection && a.investor_price ? a.annual_rental_projection / a.investor_price : 0;
        const roiB = b.annual_rental_projection && b.investor_price ? b.annual_rental_projection / b.investor_price : 0;
        return roiB - roiA;
      }

      const rates = config.exchangeRates;
      const currentRate = rates[currency] || 1;
      
      const priceA = (a.investor_price / (rates[a.price_currency] || 1)) * currentRate;
      const priceB = (b.investor_price / (rates[b.price_currency] || 1)) * currentRate;

      if (filters.sort === 'asc') return priceA - priceB;
      if (filters.sort === 'desc') return priceB - priceA;
      return 0;
    });

    return result;
  }, [projects, filters, currency, config]);

  const soldProjects = useMemo(() => {
    return projects.filter(p => p.is_hidden && ((p.status || '').toLowerCase() === 'vendido' || (p.status || '').toLowerCase() === 'sold'));
  }, [projects]);

  const handleFilterChange = (key: string, value: string) => {
    const newFilters = { ...filters, [key]: value };
    setFilters(newFilters);
    
    // Update URL params
    const params = new URLSearchParams();
    if (newFilters.zone !== ANY_ZONE) params.append('zone', newFilters.zone);
    if (newFilters.type !== ANY_TYPE) params.append('type', newFilters.type);
    if (newFilters.status !== ANY_STATUS) params.append('status', newFilters.status);
    if (newFilters.beds !== ANY_BEDS) params.append('beds', newFilters.beds);
    if (newFilters.minPrice) params.append('minPrice', newFilters.minPrice.replace(/\./g, ''));
    if (newFilters.maxPrice) params.append('maxPrice', newFilters.maxPrice.replace(/\./g, ''));
    params.append('sort', newFilters.sort);
    
    setSearchParams(params);
  };

  const handlePriceChange = (key: 'minPrice' | 'maxPrice', value: string) => {
    const rawValue = value.replace(/[^0-9]/g, '');
    const formatted = rawValue.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    handleFilterChange(key, formatted);
  };

  if (loading) {
      return (
          <div className="min-h-screen bg-almond flex flex-col items-center justify-center space-y-4">
              <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
              <p className="text-primary font-bold text-xs uppercase tracking-widest animate-pulse">{t('common.loading')}</p>
          </div>
      );
  }

  return (
    <div className="bg-almond transition-colors duration-300">
      <header className="px-6 md:px-12 pt-24 md:pt-28 pb-28 text-center relative overflow-hidden bg-almond">
        <div className="relative z-10 max-w-5xl mx-auto space-y-7">
          <span className="inline-flex items-center gap-2.5 text-[11px] md:text-xs font-black uppercase tracking-[0.22em] text-primary/45"><span className="h-px w-8 bg-primary/35"></span>Unreal Studio · Bali<span className="h-px w-8 bg-primary/35"></span></span>
          <h1 className="text-5xl md:text-7xl lg:text-8xl leading-[1.02] text-primary tracking-[-0.02em]">
            {t('projects.heroTitle')}
          </h1>
          <p className="text-lg md:text-2xl text-primary/70 max-w-3xl mx-auto leading-relaxed font-light">
            {t('projects.heroSubtitle')}
          </p>
        </div>
      </header>

      {/* Editorial filter bar — hairline brand borders, cream tones, no glossy SaaS pill */}
      <div className="px-4 md:px-12 relative z-30 -mt-10 mb-16 max-w-6xl mx-auto">
        <div className="bg-white/85 backdrop-blur-md rounded-2xl shadow-[0_16px_48px_-24px_rgba(63,35,5,0.28)] border border-primary/10 p-1.5 md:p-2.5">
          <div className="grid grid-cols-2 md:flex md:flex-row items-stretch md:items-center">

            {/* Sort Filter */}
            <div className="flex-1 flex items-center gap-2 md:gap-4 px-4 md:px-6 py-3 md:py-4 border-b md:border-b-0 md:border-r border-primary/10 group">
              <span className="material-symbols-outlined text-primary/30 group-hover:text-primary transition-colors">sort</span>
              <div className="flex-1 text-left">
                <label className="block text-[9px] uppercase text-primary/40 font-black tracking-widest mb-1">{t('projects.filters.sortBy')}</label>
                <div className="relative">
                  <select
                    aria-label={t('projects.filters.sortBy')}
                    value={filters.sort}
                    onChange={(e) => handleFilterChange('sort', e.target.value)}
                    className="w-full bg-transparent border-none p-0 text-primary focus:ring-0 font-bold text-sm cursor-pointer outline-none appearance-none pr-8 truncate"
                  >
                    <option value="featured">{t('projects.sort.featured')}</option>
                    <option value="roi">{t('projects.sort.roi')}</option>
                    <option value="asc">{t('projects.sort.asc')}</option>
                    <option value="desc">{t('projects.sort.desc')}</option>
                  </select>
                  <span className="material-symbols-outlined absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none text-primary/20 text-xs">expand_more</span>
                </div>
              </div>
            </div>

            {/* Price Filter */}
            <div className="flex-1 flex items-center gap-2 md:gap-4 px-4 md:px-6 py-3 md:py-4 border-b md:border-b-0 md:border-r border-primary/10 group">
              <span className="material-symbols-outlined text-primary/30 group-hover:text-primary transition-colors">payments</span>
              <div className="flex-1 text-left">
                <label className="block text-[9px] uppercase text-primary/40 font-black tracking-widest mb-1">{t('projects.filters.budget')}</label>
                <div className="flex items-center gap-2 bg-almond/50 rounded-xl px-3 py-1.5 border border-transparent hover:border-primary/10 transition-all">
                  <input
                    type="text"
                    placeholder={t('projects.filters.min')}
                    value={filters.minPrice}
                    onChange={(e) => handlePriceChange('minPrice', e.target.value)}
                    className="w-full bg-transparent border-none p-0 text-primary focus:ring-0 font-bold text-[13px] placeholder:text-primary/30 text-center"
                  />
                  <span className="text-primary/25 text-[10px]">•</span>
                  <input
                    type="text"
                    placeholder={t('projects.filters.max')}
                    value={filters.maxPrice}
                    onChange={(e) => handlePriceChange('maxPrice', e.target.value)}
                    className="w-full bg-transparent border-none p-0 text-primary focus:ring-0 font-bold text-[13px] placeholder:text-primary/30 text-center"
                  />
                </div>
              </div>
            </div>

            {/* Zone Filter */}
            <div className="flex-1 flex items-center gap-2 md:gap-4 px-4 md:px-6 py-3 md:py-4 border-b md:border-b-0 md:border-r border-primary/10 group">
              <span className="material-symbols-outlined text-primary/30 group-hover:text-primary transition-colors">location_on</span>
              <div className="flex-1 text-left">
                <label className="block text-[9px] uppercase text-primary/40 font-black tracking-widest mb-1">{t('projects.filters.zone')}</label>
                <div className="relative">
                  <select aria-label={t('projects.filters.zone')} value={filters.zone} onChange={(e) => handleFilterChange('zone', e.target.value)} className="w-full bg-transparent border-none p-0 text-primary focus:ring-0 font-bold text-sm cursor-pointer outline-none appearance-none pr-8 truncate">
                    <option value={ANY_ZONE}>{t('projects.filters.anyZone')}</option>
                    {config.customZones.map(z => <option key={z} value={z}>{z}</option>)}
                  </select>
                  <span className="material-symbols-outlined absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none text-primary/20 text-xs">expand_more</span>
                </div>
              </div>
            </div>

            {/* Type Filter */}
            <div className="flex-1 flex items-center gap-2 md:gap-4 px-4 md:px-6 py-3 md:py-4 border-b md:border-b-0 md:border-r border-primary/10 group">
              <span className="material-symbols-outlined text-primary/30 group-hover:text-primary transition-colors">home_work</span>
              <div className="flex-1 text-left">
                <label className="block text-[9px] uppercase text-primary/40 font-black tracking-widest mb-1">{t('projects.filters.type')}</label>
                <div className="relative">
                  <select aria-label={t('projects.filters.type')} value={filters.type} onChange={(e) => handleFilterChange('type', e.target.value)} className="w-full bg-transparent border-none p-0 text-primary focus:ring-0 font-bold text-sm cursor-pointer outline-none appearance-none pr-8 truncate">
                    <option value={ANY_TYPE}>{t('projects.filters.anyType')}</option>
                    <option value="Villa">Villa</option>
                    <option value="Loft">Loft</option>
                    {config.customTypes.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <span className="material-symbols-outlined absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none text-primary/20 text-xs">expand_more</span>
                </div>
              </div>
            </div>

            {/* Status Filter */}
            <div className="flex-1 flex items-center gap-2 md:gap-4 px-4 md:px-6 py-3 md:py-4 border-b md:border-b-0 md:border-r border-primary/10 group">
              <span className="material-symbols-outlined text-primary/30 group-hover:text-primary transition-colors">verified</span>
              <div className="flex-1 text-left">
                <label className="block text-[9px] uppercase text-primary/40 font-black tracking-widest mb-1">{t('projects.filters.status')}</label>
                <div className="relative">
                  <select aria-label={t('projects.filters.status')} value={filters.status} onChange={(e) => handleFilterChange('status', e.target.value)} className="w-full bg-transparent border-none p-0 text-primary focus:ring-0 font-bold text-sm cursor-pointer outline-none appearance-none pr-8 truncate">
                    <option value={ANY_STATUS}>{t('projects.filters.anyStatus')}</option>
                    <option value="off_plan">{t('admin.statusBadge.off_plan')}</option>
                    <option value="en_construccion">{t('admin.statusBadge.en_construccion')}</option>
                    <option value="obra_finalizada">{t('admin.statusBadge.obra_finalizada')}</option>
                  </select>
                  <span className="material-symbols-outlined absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none text-primary/20 text-xs">expand_more</span>
                </div>
              </div>
            </div>

            {/* Bedrooms Filter */}
            <div className="flex-1 flex items-center gap-2 md:gap-4 px-4 md:px-6 py-3 md:py-4 group">
              <span className="material-symbols-outlined text-primary/30 group-hover:text-primary transition-colors">bed</span>
              <div className="flex-1 text-left">
                <label className="block text-[9px] uppercase text-primary/40 font-black tracking-widest mb-1">{t('projects.filters.bedrooms')}</label>
                <div className="relative">
                  <select aria-label={t('projects.filters.bedrooms')} value={filters.beds} onChange={(e) => handleFilterChange('beds', e.target.value)} className="w-full bg-transparent border-none p-0 text-primary focus:ring-0 font-bold text-sm cursor-pointer outline-none appearance-none pr-8 truncate">
                    <option value={ANY_BEDS}>{t('projects.filters.anyBeds')}</option>
                    <option value="1">1</option>
                    <option value="2">2</option>
                    <option value="3">3+</option>
                  </select>
                  <span className="material-symbols-outlined absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none text-primary/20 text-xs">expand_more</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <section className="px-6 md:px-12 pb-32 max-w-7xl mx-auto">
        {filteredProjects.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-10">
            {filteredProjects.map((proj, idx) => (
              <Link key={proj.id} to={projectPath(proj)} className="bg-white rounded-2xl md:rounded-3xl overflow-hidden shadow-sm hover:shadow-2xl hover:-translate-y-1 transition-all duration-500 group flex flex-col h-full border border-primary/5 hover:border-primary/10 outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 focus-visible:ring-offset-almond">
                <div className="relative h-52 sm:h-56 md:h-80 overflow-hidden">
                  <img
                    loading={idx === 0 ? "eager" : "lazy"}
                    fetchPriority={idx === 0 ? "high" : "auto"}
                    alt={proj.name}
                    className="w-full h-full object-cover transition duration-1000 group-hover:scale-110"
                    src={imgSrc(getImageUrl(proj.image), 600)}
                    srcSet={imgSrcSet(getImageUrl(proj.image), [320, 600, 900, 1200])}
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    onError={imgFallback(getImageUrl(proj.image))}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" aria-hidden="true" />
                  <div className="absolute top-2 left-2 md:top-5 md:left-5 z-10">
                    <span className="inline-flex items-center gap-1.5 md:gap-2 bg-black/35 backdrop-blur-md text-white text-[8px] md:text-[9px] font-black px-2.5 py-1 md:px-3.5 md:py-1.5 uppercase tracking-widest rounded-full border border-white/15 shadow-lg">
                      <span className={`w-1.5 h-1.5 rounded-full ${statusDotClass(proj.status)}`} />{translateStatus(proj.status, t)}
                    </span>
                  </div>
                  {proj.has_real_photos && (
                    <div className="absolute top-2 right-2 md:top-5 md:right-5 z-10">
                      <span className="flex items-center gap-1 bg-white/95 text-emerald-700 text-[8px] md:text-[9px] font-black px-2 py-1 md:px-3 md:py-1.5 uppercase rounded-md md:rounded-full shadow-lg">
                        <span className="material-symbols-outlined text-[11px] md:text-sm">photo_camera</span>{t('projects.card.realPhotos')}
                      </span>
                    </div>
                  )}
                </div>
                <div className="p-4 md:p-8 flex-1 flex flex-col text-left">
                  <h3 className="text-base md:text-3xl font-serif text-primary mb-1 md:mb-2 leading-tight line-clamp-2 md:line-clamp-none">{proj.name}</h3>
                  {proj.location && (
                    <p className="flex items-center gap-1 text-[10px] md:text-xs text-primary/50 font-semibold mb-2">
                      <span className="material-symbols-outlined text-[13px] md:text-base">location_on</span>
                      <span className="truncate">{proj.location}</span>
                    </p>
                  )}
                  {/* Key specs row — beds / baths / area / tenure, like the top Bali agencies */}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] md:text-[11px] font-bold text-primary/70 mb-2">
                    {Number(proj.bedrooms) > 0 && (
                      <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[14px] md:text-base text-primary/40">bed</span>{proj.bedrooms}</span>
                    )}
                    {Number(proj.bathrooms) > 0 && (
                      <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[14px] md:text-base text-primary/40">bathtub</span>{proj.bathrooms}</span>
                    )}
                    {Number(proj.area_m2) > 0 && (
                      <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[14px] md:text-base text-primary/40">square_foot</span>{proj.area_m2} m²</span>
                    )}
                    {proj.tenure && (
                      <span className={`inline-flex items-center gap-1 font-black uppercase px-2 py-0.5 rounded-full ${(proj.tenure||'').toLowerCase()==='freehold' ? 'bg-emerald-50 text-emerald-700' : 'bg-primary/10 text-primary/70'}`}><span className="material-symbols-outlined text-[14px] md:text-base">key</span>{t(`projects.card.tenure.${(proj.tenure||'').toLowerCase()}`, proj.tenure)}</span>
                    )}
                  </div>
                  {!isFinished(proj.status) && localizedCompletion(proj, i18n.language) && (
                    <p className="flex items-center gap-1 text-[10px] md:text-xs text-primary/50 font-semibold mb-1">
                      <span className="material-symbols-outlined text-[13px] md:text-base">event_available</span>
                      {t('projects.card.delivery')}: {deliveryText(localizedCompletion(proj, i18n.language), t('projects.card.deliveryFrom'))}
                    </p>
                  )}
                  {proj.completion_percent > 0 && proj.completion_percent < 100 && (
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-[9px] font-black uppercase text-primary/30">{t('projects.card.work')}</span>
                      <div className="flex-1 bg-primary/10 rounded-full h-1.5 overflow-hidden">
                        <div className="bg-primary h-full rounded-full" style={{ width: `${proj.completion_percent}%` }}></div>
                      </div>
                      <span className="text-[10px] font-bold text-primary">{proj.completion_percent}%</span>
                    </div>
                  )}
                  <div className="mt-auto">
                    <div className="flex justify-between items-end border-t border-primary/5 pt-3 md:pt-6">
                      <div>
                        <p className="text-[8px] md:text-[9px] uppercase text-primary/40 font-black tracking-widest mb-0.5 md:mb-1">{t('projects.card.from')}</p>
                        <div className="flex items-baseline gap-2">
                          <p className="font-extrabold text-sm md:text-xl text-primary">{formatPrice(proj.investor_price, proj.price_currency)}</p>
                          {Number(proj.market_price) > Number(proj.investor_price) && (
                            <p className="text-[10px] md:text-xs text-primary/40 line-through font-bold">{formatPrice(Number(proj.market_price), proj.price_currency)}</p>
                          )}
                        </div>
                      </div>
                      <span className="flex items-center gap-1 text-xs md:text-xs font-black uppercase tracking-widest text-primary group-hover:gap-2 transition-all whitespace-nowrap bg-primary/5 rounded-full px-3 py-1.5 md:px-0 md:py-0 md:bg-transparent">
                        {t('projects.card.viewDetails', 'Ver detalles')}
                        <span className="material-symbols-outlined text-sm md:text-xl">arrow_forward</span>
                      </span>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-3xl p-12 text-center shadow-sm">
            <h3 className="text-2xl text-primary font-serif">{t('projects.noResults')}</h3>
            <button onClick={() => setFilters({zone:ANY_ZONE, minPrice:'', maxPrice:'', type:ANY_TYPE, status:ANY_STATUS, beds:ANY_BEDS, sort:'featured'})} className="mt-6 text-primary font-bold border-b border-primary">{t('projects.clearFilters')}</button>
          </div>
        )}

        {soldProjects.length > 0 && (
          <div className="mt-32">
            <h2 className="text-4xl text-primary mb-12 text-center font-serif">{t('projects.soldTitle')}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-10 opacity-70">
              {soldProjects.map((proj, idx) => (
                <div key={proj.id} className="bg-white rounded-2xl md:rounded-3xl overflow-hidden shadow-sm border border-white/50 flex flex-col h-full grayscale-[0.5]">
                  <div className="relative h-52 sm:h-56 md:h-80 overflow-hidden">
                    <img
                      loading="lazy"
                      alt={proj.name}
                      className="w-full h-full object-cover"
                      src={imgSrc(getImageUrl(proj.image), 600)}
                      srcSet={imgSrcSet(getImageUrl(proj.image), [320, 600, 900])}
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      onError={imgFallback(getImageUrl(proj.image))}
                    />
                    <div className="absolute top-2 left-2 md:top-5 md:left-5 z-10">
                      <span className="bg-red-600 text-white text-[8px] md:text-[9px] font-black px-2 py-1 md:px-4 md:py-2 uppercase rounded-md md:rounded-full shadow-lg">{t('projects.statusSold')}</span>
                    </div>
                  </div>
                  <div className="p-4 md:p-8 flex-1 flex flex-col text-left">
                    <h3 className="text-base md:text-3xl font-serif text-primary mb-2 md:mb-3 leading-tight line-clamp-2 md:line-clamp-none">{proj.name}</h3>
                    <div className="mt-auto">
                      <div className="flex justify-between items-end border-t border-primary/5 pt-3 md:pt-6">
                        <div>
                          <p className="text-[8px] md:text-[9px] uppercase text-primary/40 font-black tracking-widest mb-0.5 md:mb-1">{t('projects.card.finalPrice')}</p>
                          <p className="font-extrabold text-sm md:text-xl text-primary">{formatPrice(proj.investor_price, proj.price_currency)}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
};

export default Projects;