import React, { useState, useEffect, useMemo } from 'react';
import { uiLocale } from '../lib/dateLocale';
import { Link, useNavigate } from 'react-router-dom';
import { Trans, useTranslation } from 'react-i18next';
import { DEFAULT_CONFIG, WHATSAPP_URL } from '../constants';
import { Project, AppConfig, BlogPost } from '../types';
import { useCurrency } from '../App';
import { supabase, getImageUrl, parseJsonField } from '../lib/supabase';
import { imgSrc, imgSrcSet, imgFallback } from '../lib/imageOptimize';
import { readSWR, writeSWR } from '../lib/swrCache';
import { projectPath } from '../lib/projectUrl';
import { translateStatus } from '../lib/statusI18n';
import { usePageMeta } from '../components/PageMeta';

const ANY_ZONE = 'Cualquier zona';
const ANY_TYPE = 'Cualquier tipo';

const Home: React.FC = () => {
  const { t } = useTranslation();
  usePageMeta({ title: t('home.title'), description: t('home.metaDescription'), image: '/img/og-image.webp' });
  // SWR: hydrate from localStorage cache so the first paint already has the
  // featured project + grid + blog teasers. Background fetch refreshes.
  const [projects, setProjects] = useState<Project[]>(() => readSWR<Project[]>('home_projects') ?? []);
  const [blogs, setBlogs] = useState<BlogPost[]>(() => readSWR<BlogPost[]>('home_blogs') ?? []);
  const [config, setConfig] = useState<AppConfig>(() => readSWR<AppConfig>('home_config') ?? DEFAULT_CONFIG);
  // Only show the full-page loader when we have absolutely nothing to render.
  const [loading, setLoading] = useState<boolean>(() => (readSWR<Project[]>('home_projects') ?? []).length === 0);
  
  const { formatPrice, currency } = useCurrency();
  
  // Estado para el modal de video
  const [isVideoOpen, setIsVideoOpen] = useState(false);

  // Nuevos estados para los filtros mejorados
  const [filters, setFilters] = useState({
    minPrice: '',
    maxPrice: '',
    zone: ANY_ZONE,
    type: ANY_TYPE,
    sort: 'asc' // asc | desc
  });

  const navigate = useNavigate();

  // Helper date formatter
  const formatDate = (dateString: string) => {
    if (!dateString) return '';
    try {
        return new Date(dateString).toLocaleDateString(uiLocale(), { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch {
        return dateString;
    }
  };

  useEffect(() => {
    // Only flip into a blocking loading state when there's no cached data
    // to render. With SWR, repeat visitors render instantly from
    // localStorage and we silently refresh in the background.
    const fetchData = async () => {
      try {
        const { data: configRows } = await supabase.from('app_config').select('*');
        if (configRows && configRows.length > 0) {
            const configObj: Record<string, any> = {};
            configRows.forEach((row: any) => {
              configObj[row.key] = row.value;
            });
            const next = { ...DEFAULT_CONFIG, ...configObj } as AppConfig;
            setConfig(next);
            writeSWR('home_config', next);
        }

        const { data: projectsData } = await supabase
            .from('projects')
            .select('*')
            .order('sort_order', { ascending: true });

        if (projectsData) {
            const safeProjects = projectsData.map((p: any) => ({
                ...p,
                gallery: parseJsonField(p.gallery, []),
                investor_tiers: parseJsonField(p.investor_tiers, [])
            })) as unknown as Project[];
            setProjects(safeProjects);
            writeSWR('home_projects', safeProjects);
        }

        const { data: blogsData } = await supabase
            .from('blogs')
            .select('*')
            .order('published_date', { ascending: false })
            .limit(3);

        if (blogsData) {
            const fresh = blogsData as unknown as BlogPost[];
            setBlogs(fresh);
            writeSWR('home_blogs', fresh);
        }

      } catch (error) {
        console.error('Error loading data from Supabase:', error);
      } finally {
        setLoading(false);
      }
    };

    void fetchData();
  }, []);

  const featuredProject = useMemo(() => {
    const visibleProjects = projects.filter(p => !p.is_hidden);
    if (visibleProjects.length === 0) return null;
    return visibleProjects.find(p => p.is_featured) || visibleProjects[0];
  }, [projects]);

  // Desglose de Rentabilidad sobre la PROPIEDAD DESTACADA (decisión de Andreas:
  // mantenerlo en el destacado, no en el más rentable).
  const profitabilityData = useMemo(() => {
    if (!featuredProject) return null;

    const investorPrice = featuredProject.investor_price;
    // Si market_price es 0 o null, simulamos un 59% de plusvalía como respaldo
    const marketPrice = featuredProject.market_price && featuredProject.market_price > 0
      ? featuredProject.market_price
      : investorPrice * 1.59;

    const capitalGain = marketPrice - investorPrice;
    const gainPercent = ((marketPrice - investorPrice) / investorPrice) * 100;
    const barWidth = (investorPrice / marketPrice) * 100;

    return {
      investorPrice,
      marketPrice,
      capitalGain,
      gainPercent: gainPercent.toFixed(1),
      barWidth: Math.min(barWidth, 100),
      currency: featuredProject.price_currency,
    };
  }, [featuredProject]);

  // Cálculo del precio mínimo dinámico
  const minPriceDisplay = useMemo(() => {
    const visibleProjects = projects.filter(p => !p.is_hidden);
    if (visibleProjects.length === 0) return "80.000€";

    const rates = config.exchangeRates;
    let minEur = Infinity;
    let minProject = null;

    visibleProjects.forEach(p => {
        const rate = rates[p.price_currency] || 1;
        const priceInEur = p.investor_price / rate;
        
        if (priceInEur < minEur) {
            minEur = priceInEur;
            minProject = p;
        }
    });

    if (minEur === Infinity || !minProject) return "80.000€";

    return formatPrice(minProject.investor_price, minProject.price_currency);
  }, [projects, config, formatPrice]);

  const filteredGridProjects = useMemo(() => {
    let result = projects.filter(p => {
      if (p.is_hidden) return false; // Hide hidden projects from main list
      
      // Filtro de Zona
      const zoneMatch = filters.zone === ANY_ZONE || p.location.toLowerCase().includes(filters.zone.toLowerCase());
      // Filtro de Tipo
      const typeMatch = filters.type === ANY_TYPE || p.property_type === filters.type;
      
      // Filtro de Precio (con conversión de divisa)
      const rates = config.exchangeRates;
      const projectRate = rates[p.price_currency] || 1;
      const currentRate = rates[currency] || 1;
      
      // Convertir precio del proyecto a la divisa seleccionada por el usuario
      const priceInCurrentCurrency = (p.investor_price / projectRate) * currentRate;

      // Parsear precio eliminando puntos de miles
      const minVal = filters.minPrice.replace(/\./g, '');
      const maxVal = filters.maxPrice.replace(/\./g, '');

      const min = minVal ? parseFloat(minVal) : 0;
      const max = maxVal ? parseFloat(maxVal) : Infinity;
      
      const priceMatch = priceInCurrentCurrency >= min && priceInCurrentCurrency <= max;
      
      return zoneMatch && priceMatch && typeMatch;
    });

    // Ordenar resultados
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

  const handleSearch = () => {
    // Redirigir a la página de proyectos con los filtros aplicados
    const params = new URLSearchParams();
    if (filters.zone !== ANY_ZONE) params.append('zone', filters.zone);
    if (filters.type !== ANY_TYPE) params.append('type', filters.type);
    if (filters.minPrice) params.append('minPrice', filters.minPrice.replace(/\./g, ''));
    if (filters.maxPrice) params.append('maxPrice', filters.maxPrice.replace(/\./g, ''));
    params.append('sort', filters.sort);
    
    navigate(`/proyectos?${params.toString()}`);
  };

  const handlePriceChange = (field: 'minPrice' | 'maxPrice', value: string) => {
    // Eliminar cualquier caracter que no sea número
    const rawValue = value.replace(/[^0-9]/g, '');
    // Formatear con puntos de mil
    const formatted = rawValue.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    setFilters({ ...filters, [field]: formatted });
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
    <div className="bg-almond transition-colors duration-300 overflow-x-hidden text-left relative">
      {/* Video Modal Overlay */}
      {isVideoOpen && (
        <div 
            className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 md:p-8 animate-in fade-in duration-300"
            onClick={() => setIsVideoOpen(false)}
        >
          <div 
            className="relative w-full max-w-4xl bg-black rounded-3xl overflow-hidden shadow-2xl border border-white/10"
            onClick={e => e.stopPropagation()}
          >
             <button 
               onClick={() => setIsVideoOpen(false)}
               className="absolute top-4 right-4 z-20 bg-black/50 hover:bg-black text-white p-2 rounded-full transition-colors backdrop-blur-sm group"
             >
               <span className="material-symbols-outlined group-hover:rotate-90 transition-transform">close</span>
             </button>
             {/* Self-hosted Video */}
             <video 
               autoPlay 
               loop 
               muted 
               playsInline
               controls
               preload="none"
               className="w-full h-full object-cover"
               src={(config as any).brand?.intro_video_url || ''}
               onPlay={(e) => {
                 const video = e.currentTarget;
                 if (video.muted) {
                   setTimeout(() => { video.muted = false; }, 500);
                 }
               }}
             >
               Tu navegador no soporta video HTML5.
             </video>
          </div>
        </div>
      )}

      {/* Hero Section */}
      <header className="px-6 md:px-12 pb-24 md:pb-32 pt-4 md:pt-8 grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center max-w-7xl mx-auto">
        <div className="space-y-8 md:space-y-10 z-10">
          <div className="max-w-xl">
            <h1 className="text-5xl md:text-6xl lg:text-7xl leading-[1.1] text-primary mb-8">
              <Trans
                i18nKey="home.heroTitle"
                values={{ price: minPriceDisplay }}
                components={{ i: <span className="italic font-extralight" /> }}
              />
            </h1>
            <p className="text-lg md:text-xl text-primary/70 mb-10 leading-relaxed font-medium">
              <Trans i18nKey="home.heroBody" components={{ b: <span className="font-bold" /> }} />
            </p>
            <div className="flex flex-col sm:flex-row gap-5">
              <a 
                href={WHATSAPP_URL} 
                target="_blank" 
                rel="noopener noreferrer" 
                className="bg-primary text-white px-10 py-5 rounded-full font-bold shadow-xl hover:translate-y-[-2px] transition flex items-center justify-center gap-2"
              >
                {t('home.ctaMeeting')} <span className="material-symbols-outlined">arrow_forward</span>
              </a>
              {(config as any).brand?.intro_video_url && (
                <button
                  onClick={() => setIsVideoOpen(true)}
                  className="flex items-center justify-center gap-3 px-8 py-5 rounded-full border border-primary/20 font-bold text-primary hover:bg-white transition text-sm cursor-pointer"
                >
                  <span className="material-symbols-outlined text-primary">play_circle</span> {t('home.ctaVideo')}
                </button>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-4 pl-1">
             <div className="flex -space-x-3">
               <img loading="lazy" src="https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&q=80&w=150&h=150" className="w-10 h-10 rounded-full border-2 border-almond object-cover shadow-sm" alt="Investor 1" />
               <img loading="lazy" src="https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&q=80&w=150&h=150" className="w-10 h-10 rounded-full border-2 border-almond object-cover shadow-sm" alt="Investor 2" />
               <img loading="lazy" src="https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&q=80&w=150&h=150" className="w-10 h-10 rounded-full border-2 border-almond object-cover shadow-sm" alt="Investor 3" />
             </div>
             <p className="text-[11px] font-black uppercase tracking-widest text-primary/40">{t('home.investorsCount')}</p>
          </div>
        </div>
        
        {/* Featured Project Card */}
        <div className="w-full">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary/40 mb-4 text-left">{t('home.featuredTag')}</p>
          {featuredProject ? (
              <Link to={projectPath(featuredProject)} className="bg-white rounded-3xl md:rounded-[3rem] overflow-hidden shadow-2xl hover:shadow-3xl transition-all duration-700 flex flex-row md:flex-col group h-full md:h-auto items-stretch">
                <div className="w-[40%] md:w-full relative md:h-[500px] shrink-0 overflow-hidden">
                  <img
                    src={imgSrc(getImageUrl(featuredProject.image), 1000)}
                    srcSet={imgSrcSet(getImageUrl(featuredProject.image), [480, 800, 1000, 1400])}
                    sizes="(max-width: 768px) 40vw, 50vw"
                    className="absolute inset-0 md:relative w-full h-full object-cover group-hover:scale-105 transition duration-1000"
                    alt={featuredProject.name}
                    onError={imgFallback(getImageUrl(featuredProject.image))}
                    loading="eager"
                    fetchPriority="high"
                  />
                  <div className="absolute top-3 left-3 md:top-8 md:left-8">
                    <span className="bg-primary text-white text-[8px] md:text-[10px] font-black px-3 py-1.5 md:px-6 md:py-3 uppercase rounded-lg md:rounded-2xl shadow-2xl">
                      {translateStatus(featuredProject.status, t)}
                    </span>
                  </div>
                </div>
                
                <div className="p-4 md:p-8 lg:p-12 w-[60%] md:w-full flex flex-col justify-center text-left">
                  <p className="text-[9px] md:text-[11px] font-black text-gray-400 uppercase tracking-[0.2em] mb-2 md:mb-4 truncate">{featuredProject.location}</p>
                  <h3 className="text-xl md:text-4xl lg:text-5xl font-bold mb-3 md:mb-10 text-primary leading-tight line-clamp-2">{featuredProject.name}</h3>
                  
                  <div className="mt-auto pt-3 md:pt-10 border-t border-gray-100 flex flex-col md:flex-row md:justify-between md:items-center gap-2 md:gap-4">
                    <div>
                      <p className="text-[8px] md:text-[10px] uppercase text-gray-400 font-black mb-1 md:mb-2 tracking-widest">{t('home.investmentFrom')}</p>
                      <div className="flex items-baseline gap-2">
                        <p className="font-bold text-lg md:text-3xl text-primary leading-none">{formatPrice(featuredProject.investor_price, featuredProject.price_currency)}</p>
                        {Number(featuredProject.market_price) > Number(featuredProject.investor_price) && (
                          <p className="text-xs md:text-sm text-gray-400 line-through font-bold">{formatPrice(Number(featuredProject.market_price), featuredProject.price_currency)}</p>
                        )}
                      </div>
                    </div>
                    
                    <div className="hidden md:flex items-center justify-center gap-3 bg-almond/30 px-6 py-4 rounded-2xl group-hover:bg-primary group-hover:text-white transition-all duration-500 self-start sm:self-auto w-full sm:w-auto">
                      <span className="text-primary group-hover:text-white font-bold text-xs uppercase tracking-widest">{t('home.viewProject')}</span>
                      <span className="material-symbols-outlined text-xl group-hover:translate-x-1 transition-transform">arrow_forward</span>
                    </div>

                    <div className="md:hidden flex items-center gap-1 text-primary mt-1">
                      <span className="text-[9px] font-bold uppercase tracking-widest">{t('home.viewShort')}</span>
                      <span className="material-symbols-outlined text-sm">arrow_forward</span>
                    </div>
                  </div>
                </div>
              </Link>
          ) : (
             <div className="bg-white rounded-3xl p-12 text-center shadow-lg h-full flex flex-col items-center justify-center">
                 <span className="material-symbols-outlined text-4xl text-gray-300 mb-2">home_work</span>
                 <p className="text-primary/40 font-bold uppercase tracking-widest text-xs">{t('home.comingSoon')}</p>
             </div>
          )}
        </div>
      </header>

      {/* Filter Bar */}
      <div className="px-4 md:px-12 relative z-30 -mt-12 md:-mt-16 mb-12 md:mb-16 max-w-7xl mx-auto">
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
                    onChange={(e) => setFilters({...filters, sort: e.target.value})}
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
                <div className="flex items-center gap-2 bg-primary/5 rounded-full px-4 py-2.5 border border-primary/10 hover:border-primary/30 focus-within:border-primary/40 transition-all">
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
                  <select aria-label={t('projects.filters.zone')} value={filters.zone} onChange={(e) => setFilters({...filters, zone: e.target.value})} className="w-full bg-transparent border-none p-0 text-primary focus:ring-0 font-bold text-sm cursor-pointer outline-none appearance-none pr-8 truncate">
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
                  <select aria-label={t('projects.filters.type')} value={filters.type} onChange={(e) => setFilters({...filters, type: e.target.value})} className="w-full bg-transparent border-none p-0 text-primary focus:ring-0 font-bold text-sm cursor-pointer outline-none appearance-none pr-8 truncate">
                    <option value={ANY_TYPE}>{t('projects.filters.anyType')}</option>
                    <option value="Villa">Villa</option>
                    <option value="Loft">Loft</option>
                    {config.customTypes.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <span className="material-symbols-outlined absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none text-primary/20 text-xs">expand_more</span>
                </div>
              </div>
            </div>

            <button 
              onClick={handleSearch}
              className="bg-primary text-white m-2 px-8 py-4 rounded-2xl md:rounded-[2rem] font-black text-[10px] uppercase tracking-widest hover:brightness-125 transition-all shadow-xl shadow-primary/20 flex items-center justify-center gap-2"
            >
              <span>{t('home.searchBtn')}</span>
              <span className="material-symbols-outlined text-sm">search</span>
            </button>
          </div>
        </div>
      </div>

      {/* Listings Section */}
      <section className="px-6 md:px-12 pb-12 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-10">
          {filteredGridProjects.slice(0, 3).map((proj) => (
            <Link key={proj.id} to={projectPath(proj)} className="bg-white rounded-2xl md:rounded-3xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-500 flex flex-col group border border-primary/5">
              <div className="h-32 md:h-64 relative overflow-hidden">
                <img
                  loading="lazy"
                  src={imgSrc(getImageUrl(proj.image), 600)}
                  srcSet={imgSrcSet(getImageUrl(proj.image), [320, 600, 900])}
                  sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                  className="w-full h-full object-cover group-hover:scale-110 transition duration-700"
                  onError={imgFallback(getImageUrl(proj.image))}
                  alt={proj.name}
                />
                <span className="absolute top-2 left-2 md:top-4 md:left-4 bg-primary text-white text-[8px] md:text-[9px] font-black px-2 py-1 md:px-4 md:py-2 uppercase rounded-md md:rounded-lg shadow-xl">{translateStatus(proj.status, t)}</span>
              </div>
              <div className="p-4 md:p-8 flex-grow flex flex-col text-left">
                <p className="text-[8px] md:text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 md:mb-2 truncate">{proj.location}</p>
                <h3 className="text-sm md:text-2xl font-bold mb-3 md:mb-6 text-primary line-clamp-2 md:line-clamp-none leading-tight">{proj.name}</h3>
                {proj.completion_percent > 0 && (
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-[9px] font-black uppercase text-primary/30">{t('projects.card.work')}</span>
                    <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                      <div className="bg-primary h-full rounded-full" style={{ width: `${proj.completion_percent}%` }}></div>
                    </div>
                    <span className="text-[10px] font-bold text-primary">{proj.completion_percent}%</span>
                  </div>
                )}
                <div className="mt-auto pt-3 md:pt-6 border-t border-gray-100 flex justify-between items-center">
                  <div>
                    <p className="text-[8px] md:text-[10px] uppercase text-gray-400 font-black mb-0.5 md:mb-1">{t('home.investFrom')}</p>
                    <div className="flex items-baseline gap-2">
                      <p className="font-bold text-sm md:text-xl text-primary">{formatPrice(proj.investor_price, proj.price_currency)}</p>
                      {Number(proj.market_price) > Number(proj.investor_price) && (
                        <p className="text-[10px] md:text-xs text-gray-400 line-through font-bold">{formatPrice(Number(proj.market_price), proj.price_currency)}</p>
                      )}
                    </div>
                  </div>
                  <span className="text-primary font-bold text-[8px] md:text-[10px] uppercase tracking-widest flex items-center gap-1 group-hover:gap-3 transition-all">
                     <span className="hidden md:inline">{t('home.viewShort')}</span>
                     <span className="material-symbols-outlined text-sm md:text-base">add</span>
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
        
        <div className="mt-12 md:mt-16 text-center">
          <button onClick={handleSearch} className="inline-flex items-center gap-2 border-b-2 border-primary text-primary font-bold pb-1 uppercase tracking-widest text-xs hover:text-primary/70 hover:border-primary/70 transition">
            {t('home.viewMoreProperties')} <span className="material-symbols-outlined text-sm">arrow_forward</span>
          </button>
        </div>
      </section>

      {/* Sección 1: Por qué salir de Europa */}
      <section className="py-12 md:py-24 bg-white px-6 md:px-12">
        <div className="max-w-7xl mx-auto flex flex-col lg:flex-row gap-8 lg:gap-20 items-center">
          <div className="lg:w-1/2 space-y-5 md:space-y-8 text-left">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary/40">{t('home.section1Tag')}</p>
            <h2 className="text-3xl md:text-5xl lg:text-6xl text-primary leading-tight">{t('home.section1Title')}</h2>
            <p className="text-base md:text-lg text-primary/60 font-light leading-relaxed max-w-xl">
              {t('home.section1Body')}
            </p>
            <div className="space-y-5 md:space-y-8">
              <div className="flex gap-4 items-start">
                <div className="shrink-0">
                  <span className="material-symbols-outlined text-primary text-3xl">trending_down</span>
                </div>
                <div>
                  <h4 className="text-xl font-bold text-primary mb-2">{t('home.b1Title')}</h4>
                  <p className="text-sm text-primary/60 font-medium leading-relaxed">{t('home.b1Body')}</p>
                </div>
              </div>
              <div className="flex gap-4 items-start">
                <div className="shrink-0">
                  <span className="material-symbols-outlined text-primary text-3xl">security</span>
                </div>
                <div>
                  <h4 className="text-xl font-bold text-primary mb-2">{t('home.b2Title')}</h4>
                  <p className="text-sm text-primary/60 font-medium leading-relaxed">{t('home.b2Body')}</p>
                </div>
              </div>
              <div className="flex gap-4 items-start">
                <div className="shrink-0">
                  <span className="material-symbols-outlined text-primary text-3xl">public</span>
                </div>
                <div>
                  <h4 className="text-xl font-bold text-primary mb-2">{t('home.b3Title')}</h4>
                  <p className="text-sm text-primary/60 font-medium leading-relaxed">{t('home.b3Body')}</p>
                </div>
              </div>
            </div>
          </div>
          <div className="lg:w-1/2 relative">
            <div className="relative w-full">
              <div className="rounded-3xl overflow-hidden shadow-2xl h-56 sm:h-72 md:h-auto md:aspect-square relative group">
                <img
                  loading="lazy"
                  src={imgSrc("/img/The%20Nook/1-04.webp", 800)}
                  srcSet={imgSrcSet("/img/The%20Nook/1-04.webp", [400, 800, 1200])}
                  sizes="(max-width: 1024px) 100vw, 50vw"
                  className="w-full h-full object-cover"
                  alt="Interior Architecture"
                />
                <div className="absolute inset-0 bg-black/10"></div>
              </div>
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 md:top-auto md:bottom-10 md:translate-y-0 bg-primary p-6 md:p-8 rounded-3xl shadow-2xl text-left min-w-[200px] md:min-w-[280px] z-10 border border-white/10 backdrop-blur-md bg-primary/95">
                <p className="text-[8px] md:text-[10px] font-black uppercase tracking-[0.2em] text-almond/40 mb-1 md:mb-2">{t('home.roiAvgTag')}</p>
                <p className="text-4xl md:text-6xl text-almond font-serif mb-1 md:mb-2 leading-none">28%</p>
                <p className="text-[8px] md:text-[10px] font-bold text-almond/60 uppercase tracking-wider">{t('home.roiAvgFooter')}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Sección 2: Cómo creamos valor */}
      <section className="py-12 md:py-24 bg-[#F3E5D8] px-6 md:px-12">
        <div className="max-w-7xl mx-auto flex flex-col lg:flex-row gap-8 lg:gap-16 items-center">
          <div className="lg:w-1/2 text-left space-y-5 md:space-y-8">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary/40">{t('home.section2Tag')}</p>
            <h2 className="text-3xl md:text-5xl text-primary leading-tight">{t('home.section2Title')}</h2>
            <p className="text-base md:text-lg text-primary/70 font-light leading-relaxed max-w-lg">
              {t('home.section2Body')}
            </p>
            <div className="space-y-3 md:space-y-4">
              <div className="flex items-center gap-5 p-5 bg-white/40 rounded-2xl border border-primary/5">
                <span className="material-symbols-outlined text-primary bg-primary/10 p-3 rounded-xl">construction</span>
                <div>
                  <h5 className="font-bold text-primary">{t('home.v1Title')}</h5>
                  <p className="text-xs text-primary/60">{t('home.v1Body')}</p>
                </div>
              </div>
              <div className="flex items-center gap-5 p-5 bg-white/40 rounded-2xl border border-primary/5">
                <span className="material-symbols-outlined text-primary bg-primary/10 p-3 rounded-xl">sell</span>
                <div>
                  <h5 className="font-bold text-primary">{t('home.v2Title')}</h5>
                  <p className="text-xs text-primary/60">{t('home.v2Body')}</p>
                </div>
              </div>
              <div className="flex items-center gap-5 p-5 bg-white/40 rounded-2xl border border-primary/5">
                <span className="material-symbols-outlined text-primary bg-primary/10 p-3 rounded-xl">payments</span>
                <div>
                  <h5 className="font-bold text-primary">{t('home.v3Title')}</h5>
                  <p className="text-xs text-primary/60">{t('home.v3Body')}</p>
                </div>
              </div>
            </div>
          </div>
          <div className="lg:w-1/2 w-full">
            <div className="bg-white p-6 md:p-12 rounded-[2rem] md:rounded-[3rem] shadow-2xl border border-primary/5 text-center space-y-6 md:space-y-10">
              <h3 className="text-2xl text-primary font-serif">{t('home.profitTitle')}</h3>

              {profitabilityData ? (
                <div className="space-y-6 md:space-y-10 text-left">
                  <div className="space-y-5">
                    <div className="flex justify-between text-[11px] font-bold uppercase text-gray-400 tracking-wider">
                      <span>{t('home.marketValue')}</span>
                      <span className="text-primary font-black">
                        {formatPrice(profitabilityData.marketPrice, profitabilityData.currency)}
                      </span>
                    </div>
                    <div className="w-full bg-gray-100 h-2.5 rounded-full overflow-hidden">
                      <div className="bg-gray-400 h-full w-full opacity-30"></div>
                    </div>
                  </div>
                  <div className="space-y-5">
                    <div className="flex justify-between text-[11px] font-bold uppercase text-gray-400 tracking-wider">
                      <span>{t('home.profitabilityUnrealPrice')}</span>
                      <span className="text-primary font-black">
                        {formatPrice(profitabilityData.investorPrice, profitabilityData.currency)}
                      </span>
                    </div>
                    <div className="w-full bg-gray-100 h-2.5 rounded-full overflow-hidden">
                      <div 
                        className="bg-primary h-full transition-all duration-1000" 
                        style={{ width: `${profitabilityData.barWidth}%` }}
                      ></div>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-6 pt-6 border-t border-gray-50">
                    <div className="text-left">
                      <p className="text-[9px] font-black uppercase text-gray-400 tracking-widest mb-1">{t('home.profit.immediateGain', { defaultValue: 'Plusvalía Inmediata' })}</p>
                      <p className="text-4xl font-serif text-green-600 font-bold">+{profitabilityData.gainPercent}%</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[9px] font-black uppercase text-gray-400 tracking-widest mb-1">{t('home.profit.estimatedGain', { defaultValue: 'Ganancia Estimada' })}</p>
                      <p className="text-4xl font-serif text-primary font-bold">
                        {formatPrice(profitabilityData.capitalGain, profitabilityData.currency)}
                      </p>
                    </div>
                  </div>
                  
                  <div className="space-y-4 pt-2">
                    <p className="text-[10px] text-gray-400 font-medium italic">{t('home.profit.calcNote', { defaultValue: 'Calculado sobre modelo de venta sobre plano en zona de alta demanda.' })}</p>
                    <div className="space-y-4 text-center">
                      <p className="text-primary font-bold text-sm">{t('home.profit.ctaQuestion', { defaultValue: '¿Quieres invertir en una unidad con esta rentabilidad?' })}</p>
                      {featuredProject && (
                        <Link
                          to={projectPath(featuredProject)}
                          className="bg-primary text-white px-10 py-4 rounded-full font-bold shadow-xl hover:translate-y-[-2px] transition flex items-center justify-center gap-2 mx-auto w-fit"
                        >
                          {t('home.profit.seeFeatured', { defaultValue: 'Ver propiedad destacada' })} <span className="material-symbols-outlined">arrow_forward</span>
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-primary/40 font-bold uppercase tracking-widest text-xs py-10">{t('home.noProjectData')}</p>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Sección 3: No pierdas tiempo */}
      <section className="py-24 md:py-32 bg-primary px-6 relative overflow-hidden text-center">
        <div className="absolute inset-0 opacity-10 pointer-events-none">
           <div className="absolute top-0 right-0 w-[500px] h-[500px] border border-white rounded-full -translate-y-1/2 translate-x-1/2"></div>
           <div className="absolute bottom-0 left-0 w-[500px] h-[500px] border border-white rounded-full translate-y-1/2 -translate-x-1/2"></div>
        </div>
        <div className="max-w-4xl mx-auto space-y-8 relative z-10">
          <h2 className="text-6xl md:text-8xl text-almond font-serif leading-none">{t('home.ctaSectionTitle')}</h2>
          <p className="text-lg md:text-xl text-almond/70 font-light max-w-2xl mx-auto leading-relaxed px-4">
            {t('home.ctaSectionBody')}
          </p>
          
          <div className="flex flex-col items-center justify-center gap-6 mt-16 px-4">
            <a 
              href={WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full max-w-sm bg-almond text-primary px-12 py-5 rounded-full font-black text-xs uppercase tracking-[0.2em] hover:scale-105 transition-all duration-300 shadow-2xl flex items-center justify-center gap-3"
            >
              {t('home.ctaWhatsapp')} <span className="material-symbols-outlined text-base">chat</span>
            </a>
          </div>
        </div>
      </section>

      {/* Sección 4: Últimas Novedades - Most Recent Blogs */}
      <section className="py-12 md:py-24 px-6 md:px-12 max-w-7xl mx-auto">
        <div className="flex justify-between items-end mb-8 md:mb-12 border-b border-primary/5 pb-5 md:pb-8">
          <div className="text-left">
            <h2 className="text-4xl md:text-5xl text-primary font-serif">{t('home.blogTitle')}</h2>
          </div>
          <Link to="/blog" className="text-[11px] font-black uppercase tracking-widest text-primary/40 hover:text-primary transition flex items-center gap-2 mb-2 group">
            {t('home.blogCta')} <span className="material-symbols-outlined text-sm group-hover:translate-x-1 transition-transform">arrow_forward</span>
          </Link>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 md:gap-12 lg:gap-16">
          {blogs.map((post) => (
            <Link key={post.id} to={`/blog/${post.slug}`} className="group cursor-pointer text-left flex flex-col h-full hover:translate-y-[-5px] transition-transform duration-500">
              {/* Imagen */}
              <div className="order-1 md:order-2">
                 <div className="aspect-[16/10] rounded-[2rem] overflow-hidden relative shadow-lg">
                    <img
                      loading="lazy"
                      src={imgSrc(getImageUrl(post.image), 600)}
                      srcSet={imgSrcSet(getImageUrl(post.image), [320, 600, 900])}
                      sizes="(max-width: 768px) 100vw, 33vw"
                      className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition duration-1000 group-hover:scale-105"
                      onError={imgFallback(getImageUrl(post.image))}
                      alt={post.title}
                    />
                 </div>
              </div>

              {/* Texto */}
              <div className="order-2 md:order-1 mt-4 md:mt-0 mb-4 md:mb-8 flex flex-col flex-grow">
                  <div className="flex justify-between items-center mb-3">
                    <p className="text-[10px] font-black text-primary/40 uppercase tracking-[0.2em]">{post.tag}</p>
                    <p className="text-[10px] font-bold text-primary/30 uppercase tracking-widest">{formatDate(post.published_date)}</p>
                  </div>
                  <h4 className="text-2xl font-bold text-primary mb-4 leading-snug group-hover:text-primary/70 transition line-clamp-3">{post.title}</h4>
                  <p className="text-sm text-primary/60 font-medium leading-relaxed line-clamp-3 flex-grow">{post.description}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
};

export default Home;