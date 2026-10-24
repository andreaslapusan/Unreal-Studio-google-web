import React, { useState, useEffect, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CURRENCIES, DEFAULT_CONFIG, PUBLIC_PROJECT_COLS } from '../constants';
import { projectPath } from '../lib/projectUrl';
import { Project, AppConfig } from '../types';
import { useCurrency } from '../App';
import { supabase, getImageUrl, parseJsonField } from '../lib/supabase';
import { imgSrc, imgSrcSet, imgFallback } from '../lib/imageOptimize';
import { readSWR, writeSWR } from '../lib/swrCache';
import { translateStatus } from '../lib/statusI18n';
import { statusBadgeClass, statusDotClass } from '../lib/statusColor';
import { usePageMeta } from '../components/PageMeta';
import PageLoader from '../components/PageLoader';
import Reveal from '../components/Reveal';
import ProjectCard from '../components/ProjectCard';
import FilterField, { filterControl, filterInput } from '../components/FilterField';
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
          .select(PUBLIC_PROJECT_COLS)
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
      return <PageLoader />;
  }

  const resetFilters = () => setFilters({zone:ANY_ZONE, minPrice:'', maxPrice:'', type:ANY_TYPE, status:ANY_STATUS, beds:ANY_BEDS, sort:'featured'});

  return (
    <div className="bg-almond">
      <header className="max-w-[1440px] mx-auto px-5 md:px-12 pt-10 md:pt-16 pb-10 md:pb-14">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-12 items-end">
          <h1 className="lg:col-span-8 font-display uppercase text-primary text-[2.6rem] leading-[0.95] sm:text-6xl md:text-7xl xl:text-[5.25rem] xl:leading-[0.92] us-rise">
            {t('projects.heroTitle')}
          </h1>
          <div className="lg:col-span-4 lg:pb-3">
            <p className="text-base md:text-lg text-primary/65 leading-relaxed">{t('projects.heroSubtitle')}</p>
            <p className="us-label text-primary/45 mt-5 us-num">{filteredProjects.length} · {t('nav.projects')}</p>
          </div>
        </div>
      </header>

      {/* Barra de filtros: instrumento de piedra, fija bajo la cabecera al hacer scroll en escritorio */}
      <div className="max-w-[1440px] mx-auto px-5 md:px-12 mb-12 md:mb-16 relative z-30">
        <div className="bg-paper border border-primary/15 rounded-2xl grid grid-cols-2 lg:flex lg:items-stretch">
          <FilterField icon="sort" label={t('projects.filters.sortBy')} className="flex-1 border-b border-r lg:border-b-0">
            <select aria-label={t('projects.filters.sortBy')} value={filters.sort} onChange={(e) => handleFilterChange('sort', e.target.value)} className={filterControl}>
              <option value="featured">{t('projects.sort.featured')}</option>
              <option value="roi">{t('projects.sort.roi')}</option>
              <option value="asc">{t('projects.sort.asc')}</option>
              <option value="desc">{t('projects.sort.desc')}</option>
            </select>
          </FilterField>
          <FilterField icon="payments" label={t('projects.filters.budget')} className="flex-1 border-b lg:border-b-0 lg:border-r">
            <div className="flex items-center gap-2">
              <input type="text" inputMode="numeric" aria-label={t('projects.filters.min')} placeholder={t('projects.filters.min')} value={filters.minPrice} onChange={(e) => handlePriceChange('minPrice', e.target.value)} className={filterInput} />
              <span className="text-primary/25" aria-hidden="true">—</span>
              <input type="text" inputMode="numeric" aria-label={t('projects.filters.max')} placeholder={t('projects.filters.max')} value={filters.maxPrice} onChange={(e) => handlePriceChange('maxPrice', e.target.value)} className={filterInput} />
            </div>
          </FilterField>
          <FilterField icon="location_on" label={t('projects.filters.zone')} className="flex-1 border-b border-r lg:border-b-0">
            <select aria-label={t('projects.filters.zone')} value={filters.zone} onChange={(e) => handleFilterChange('zone', e.target.value)} className={filterControl}>
              <option value={ANY_ZONE}>{t('projects.filters.anyZone')}</option>
              {config.customZones.map(z => <option key={z} value={z}>{z}</option>)}
            </select>
          </FilterField>
          <FilterField icon="home_work" label={t('projects.filters.type')} className="flex-1 border-b lg:border-b-0 lg:border-r">
            <select aria-label={t('projects.filters.type')} value={filters.type} onChange={(e) => handleFilterChange('type', e.target.value)} className={filterControl}>
              <option value={ANY_TYPE}>{t('projects.filters.anyType')}</option>
              <option value="Villa">Villa</option>
              <option value="Loft">Loft</option>
              {config.customTypes.map(ty => <option key={ty} value={ty}>{ty}</option>)}
            </select>
          </FilterField>
          <FilterField icon="verified" label={t('projects.filters.status')} className="flex-1 border-r">
            <select aria-label={t('projects.filters.status')} value={filters.status} onChange={(e) => handleFilterChange('status', e.target.value)} className={filterControl}>
              <option value={ANY_STATUS}>{t('projects.filters.anyStatus')}</option>
              <option value="off_plan">{t('admin.statusBadge.off_plan')}</option>
              <option value="en_construccion">{t('admin.statusBadge.en_construccion')}</option>
              <option value="obra_finalizada">{t('admin.statusBadge.obra_finalizada')}</option>
            </select>
          </FilterField>
          <FilterField icon="bed" label={t('projects.filters.bedrooms')} className="flex-1">
            <select aria-label={t('projects.filters.bedrooms')} value={filters.beds} onChange={(e) => handleFilterChange('beds', e.target.value)} className={filterControl}>
              <option value={ANY_BEDS}>{t('projects.filters.anyBeds')}</option>
              <option value="1">1</option>
              <option value="2">2</option>
              <option value="3">3+</option>
            </select>
          </FilterField>
        </div>
      </div>

      <section className="max-w-[1440px] mx-auto px-5 md:px-12 pb-24 md:pb-36">
        {filteredProjects.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 lg:gap-x-8 gap-y-14 md:gap-y-20">
            {filteredProjects.map((proj, idx) => (
              <Reveal key={proj.id} className="h-full" delay={(idx % 3) * 90}>
                <ProjectCard project={proj} eager={idx === 0} />
              </Reveal>
            ))}
          </div>
        ) : (
          <div className="border-y border-primary/15 py-20 md:py-28 text-center max-w-3xl mx-auto motion-safe:animate-[fadeInUp_0.5s_cubic-bezier(0.23,1,0.32,1)]">
            <span className="material-symbols-outlined text-clay text-4xl mb-6 block" aria-hidden="true">travel_explore</span>
            <h2 className="font-serif text-3xl md:text-4xl text-primary">{t('projects.noResults')}</h2>
            <p className="text-primary/55 max-w-md mx-auto mt-4 mb-10 leading-relaxed">{t('projects.noResultsHint')}</p>
            <button onClick={resetFilters} className="us-btn">
              <span className="material-symbols-outlined">restart_alt</span>{t('projects.clearFilters')}
            </button>
          </div>
        )}

        {soldProjects.length > 0 && (
          <div className="mt-24 md:mt-36 pt-10 border-t border-primary/15">
            <h2 className="font-display uppercase text-[2.2rem] leading-[0.95] md:text-6xl text-primary mb-10 md:mb-14">{t('projects.soldTitle')}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 lg:gap-x-8 gap-y-14">
              {soldProjects.map((proj) => (
                <ProjectCard key={proj.id} project={proj} sold />
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
};

export default Projects;