import React, { useState, useEffect, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CURRENCIES, DEFAULT_CONFIG } from '../constants';
import { projectPath } from '../lib/projectUrl';
import { Project, AppConfig } from '../types';
import { useCurrency } from '../App';
import { supabase, getImageUrl, parseJsonField } from '../lib/supabase';
import { imgSrc, imgSrcSet } from '../lib/imageOptimize';
import { readSWR, writeSWR } from '../lib/swrCache';
import { translateStatus } from '../lib/statusI18n';
import { usePageMeta } from '../components/PageMeta';

const ANY_ZONE = 'Cualquier zona';
const ANY_TYPE = 'Cualquier tipo';

const Projects: React.FC = () => {
  const { t } = useTranslation();
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
      
      const zoneMatch = filters.zone === ANY_ZONE || p.location.toLowerCase().includes(filters.zone.toLowerCase());
      const typeMatch = filters.type === ANY_TYPE || p.property_type === filters.type;
      
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

      return zoneMatch && priceMatch && typeMatch;
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
    return projects.filter(p => p.is_hidden && (p.status.toLowerCase() === 'vendido' || p.status.toLowerCase() === 'sold'));
  }, [projects]);

  const handleFilterChange = (key: string, value: string) => {
    const newFilters = { ...filters, [key]: value };
    setFilters(newFilters);
    
    // Update URL params
    const params = new URLSearchParams();
    if (newFilters.zone !== ANY_ZONE) params.append('zone', newFilters.zone);
    if (newFilters.type !== ANY_TYPE) params.append('type', newFilters.type);
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
      <header className="px-6 md:px-12 pt-20 pb-28 text-center relative overflow-hidden bg-almond">
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none opacity-10">
          <div className="absolute -top-24 -right-24 w-96 h-96 bg-primary rounded-full blur-[100px]"></div>
        </div>
        <div className="relative z-10 max-w-5xl mx-auto space-y-8">
          <h1 className="text-5xl md:text-7xl lg:text-8xl leading-[1.1] text-primary tracking-tight">
            {t('projects.heroTitle')}
          </h1>
          <p className="text-lg md:text-2xl text-primary/70 max-w-3xl mx-auto leading-relaxed font-light">
            {t('projects.heroSubtitle')}
          </p>
        </div>
      </header>

      {/* Redesigned Filter Bar for Consistency and Modern Look */}
      <div className="px-4 md:px-12 relative z-30 -mt-12 mb-16 max-w-7xl mx-auto">
        <div className="bg-white rounded-[2rem] md:rounded-[3rem] shadow-[0_32px_64px_-16px_rgba(63,35,5,0.15)] border border-primary/5 p-2 md:p-4">
          <div className="flex flex-col md:flex-row items-stretch md:items-center">
            
            {/* Sort Filter */}
            <div className="flex-1 flex items-center gap-4 px-6 py-4 border-b md:border-b-0 md:border-r border-gray-100 group">
              <span className="material-symbols-outlined text-primary/30 group-hover:text-primary transition-colors">sort</span>
              <div className="flex-1 text-left">
                <label className="block text-[9px] uppercase text-gray-400 font-black tracking-widest mb-1">{t('projects.filters.sortBy')}</label>
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
            <div className="flex-1 flex items-center gap-4 px-6 py-4 border-b md:border-b-0 md:border-r border-gray-100 group">
              <span className="material-symbols-outlined text-primary/30 group-hover:text-primary transition-colors">payments</span>
              <div className="flex-1 text-left">
                <label className="block text-[9px] uppercase text-gray-400 font-black tracking-widest mb-1">{t('projects.filters.budget')}</label>
                <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-1.5 border border-transparent hover:border-primary/10 transition-all">
                  <input
                    type="text"
                    placeholder={t('projects.filters.min')}
                    value={filters.minPrice}
                    onChange={(e) => handlePriceChange('minPrice', e.target.value)}
                    className="w-full bg-transparent border-none p-0 text-primary focus:ring-0 font-bold text-[13px] placeholder:text-gray-300 text-center"
                  />
                  <span className="text-gray-300 text-[10px]">•</span>
                  <input
                    type="text"
                    placeholder={t('projects.filters.max')}
                    value={filters.maxPrice}
                    onChange={(e) => handlePriceChange('maxPrice', e.target.value)}
                    className="w-full bg-transparent border-none p-0 text-primary focus:ring-0 font-bold text-[13px] placeholder:text-gray-300 text-center"
                  />
                </div>
              </div>
            </div>

            {/* Zone Filter */}
            <div className="flex-1 flex items-center gap-4 px-6 py-4 border-b md:border-b-0 md:border-r border-gray-100 group">
              <span className="material-symbols-outlined text-primary/30 group-hover:text-primary transition-colors">location_on</span>
              <div className="flex-1 text-left">
                <label className="block text-[9px] uppercase text-gray-400 font-black tracking-widest mb-1">{t('projects.filters.zone')}</label>
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
            <div className="flex-1 flex items-center gap-4 px-6 py-4 group">
              <span className="material-symbols-outlined text-primary/30 group-hover:text-primary transition-colors">home_work</span>
              <div className="flex-1 text-left">
                <label className="block text-[9px] uppercase text-gray-400 font-black tracking-widest mb-1">{t('projects.filters.type')}</label>
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
          </div>
        </div>
      </div>

      <section className="px-6 md:px-12 pb-32 max-w-7xl mx-auto">
        {filteredProjects.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-10">
            {filteredProjects.map((proj, idx) => (
              <Link key={proj.id} to={projectPath(proj)} className="bg-white rounded-2xl md:rounded-3xl overflow-hidden shadow-sm hover:shadow-2xl transition-all duration-500 group flex flex-col h-full border border-white/50">
                <div className="relative h-32 md:h-80 overflow-hidden">
                  <img
                    loading={idx === 0 ? "eager" : "lazy"}
                    fetchPriority={idx === 0 ? "high" : "auto"}
                    alt={proj.name}
                    className="w-full h-full object-cover transition duration-1000 group-hover:scale-110"
                    src={imgSrc(getImageUrl(proj.image), 600)}
                    srcSet={imgSrcSet(getImageUrl(proj.image), [320, 600, 900, 1200])}
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  />
                  <div className="absolute top-2 left-2 md:top-5 md:left-5 z-10">
                    <span className="bg-primary/90 text-white text-[8px] md:text-[9px] font-black px-2 py-1 md:px-4 md:py-2 uppercase rounded-md md:rounded-full shadow-lg">{translateStatus(proj.status, t)}</span>
                  </div>
                </div>
                <div className="p-4 md:p-8 flex-1 flex flex-col text-left">
                  <h3 className="text-sm md:text-3xl font-serif text-primary mb-2 md:mb-3 leading-tight line-clamp-2 md:line-clamp-none">{proj.name}</h3>
                  {proj.completion_percent > 0 && (
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-[9px] font-black uppercase text-primary/30">{t('projects.card.work')}</span>
                      <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
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
                            <p className="text-[10px] md:text-xs text-gray-400 line-through font-bold">{formatPrice(Number(proj.market_price), proj.price_currency)}</p>
                          )}
                        </div>
                      </div>
                      <span className="material-symbols-outlined text-primary text-sm md:text-2xl">arrow_forward</span>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-3xl p-12 text-center shadow-sm">
            <h3 className="text-2xl text-primary font-serif">{t('projects.noResults')}</h3>
            <button onClick={() => setFilters({zone:ANY_ZONE, minPrice:'', maxPrice:'', type:ANY_TYPE, sort:'featured'})} className="mt-6 text-primary font-bold border-b border-primary">{t('projects.clearFilters')}</button>
          </div>
        )}

        {soldProjects.length > 0 && (
          <div className="mt-32">
            <h2 className="text-4xl text-primary mb-12 text-center font-serif">{t('projects.soldTitle')}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-10 opacity-70">
              {soldProjects.map((proj, idx) => (
                <div key={proj.id} className="bg-white rounded-2xl md:rounded-3xl overflow-hidden shadow-sm border border-white/50 flex flex-col h-full grayscale-[0.5]">
                  <div className="relative h-32 md:h-80 overflow-hidden">
                    <img
                      loading="lazy"
                      alt={proj.name}
                      className="w-full h-full object-cover"
                      src={imgSrc(getImageUrl(proj.image), 600)}
                      srcSet={imgSrcSet(getImageUrl(proj.image), [320, 600, 900])}
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    />
                    <div className="absolute top-2 left-2 md:top-5 md:left-5 z-10">
                      <span className="bg-red-600 text-white text-[8px] md:text-[9px] font-black px-2 py-1 md:px-4 md:py-2 uppercase rounded-md md:rounded-full shadow-lg">{t('projects.statusSold')}</span>
                    </div>
                  </div>
                  <div className="p-4 md:p-8 flex-1 flex flex-col text-left">
                    <h3 className="text-sm md:text-3xl font-serif text-primary mb-2 md:mb-3 leading-tight line-clamp-2 md:line-clamp-none">{proj.name}</h3>
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