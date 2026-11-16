import React, { useState, useEffect, useMemo } from 'react';
import { uiLocale } from '../lib/dateLocale';
import { dateOnly } from '../lib/timezone';
import { Link, useNavigate } from 'react-router-dom';
import { Trans, useTranslation } from 'react-i18next';
import { DEFAULT_CONFIG, WHATSAPP_URL, PUBLIC_PROJECT_COLS } from '../constants';
import { Project, AppConfig, BlogPost } from '../types';
import { useCurrency } from '../App';
import { supabase, getImageUrl, parseJsonField } from '../lib/supabase';
import { imgSrc, imgSrcSet, imgFallback } from '../lib/imageOptimize';
import { readSWR, writeSWR } from '../lib/swrCache';
import { projectPath } from '../lib/projectUrl';
import { langPath } from '../components/LocaleRoute';
import { translateStatus } from '../lib/statusI18n';
import { localizeFields, blogTagLabel, propertyTypeKey, propertyTypeLabel, propertyTypeOptions } from '../lib/projectTerms';
import { usePageMeta } from '../components/PageMeta';
import LandingLinks from '../components/LandingLinks';
import FeaturedStrip, { type FeaturedVariant } from '../components/FeaturedStrip';

// Dónde va la franja "Aparecemos en": 'A' encima del buscador / bajo la tarjeta destacada (móvil) · 'B' banda al final del hero · 'C' tras la rejilla de proyectos
const FEATURED_AT = 'C' as FeaturedVariant;

const ANY_ZONE = 'Cualquier zona';
const ANY_TYPE = 'Cualquier tipo';

const Home: React.FC = () => {
  const { t, i18n } = useTranslation();
  // SWR: hydrate from localStorage cache so the first paint already has the
  // featured project + grid + blog teasers. Background fetch refreshes.
  const [projects, setProjects] = useState<Project[]>(() => readSWR<Project[]>('home_projects') ?? []);
  const [blogs, setBlogs] = useState<BlogPost[]>(() => readSWR<BlogPost[]>('home_blogs') ?? []);
  const [config, setConfig] = useState<AppConfig>(() => readSWR<AppConfig>('home_config') ?? DEFAULT_CONFIG);
  // Only show the full-page loader when we have absolutely nothing to render.
  const [loading, setLoading] = useState<boolean>(() => (readSWR<Project[]>('home_projects') ?? []).length === 0);
  
  const { formatPrice, currency, rates: liveRates } = useCurrency();
  
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
        return new Date(dateOnly(dateString)).toLocaleDateString(uiLocale(), { day: '2-digit', month: '2-digit', year: 'numeric' });
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
            .select(PUBLIC_PROJECT_COLS)
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
            .eq('is_published', true)
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
    const visibleProjects = projects.filter(p => !p.is_hidden && p.visibility_status !== 'sold_out');
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
    const visibleProjects = projects.filter(p => !p.is_hidden && p.visibility_status !== 'sold_out');
    if (visibleProjects.length === 0) return "90.000€";

    const rates = liveRates;
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

    if (minEur === Infinity || !minProject) return "90.000€";

    return formatPrice(minProject.investor_price, minProject.price_currency);
  }, [projects, config, formatPrice]);
  usePageMeta({ title: t('home.title'), description: t('home.metaDescription', { price: minPriceDisplay }), image: '/img/og-image.webp' });

  const filteredGridProjects = useMemo(() => {
    let result = projects.filter(p => {
      if (p.is_hidden || p.visibility_status === 'sold_out') return false; // ocultas y sold out fuera del home
      
      // Filtro de Zona
      const zoneMatch = filters.zone === ANY_ZONE || (p.location || '').toLowerCase().includes(filters.zone.toLowerCase());
      // Filtro de Tipo
      const typeMatch = filters.type === ANY_TYPE || propertyTypeKey(p.property_type) === propertyTypeKey(filters.type);
      
      // Filtro de Precio (con conversión de divisa)
      const rates = liveRates;
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

      const rates = liveRates;
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
    
    navigate(langPath(`/proyectos?${params.toString()}`));
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
    <div className="bg-white overflow-x-hidden text-left relative">
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
               {t("home.videoUnsupported", { defaultValue: "Tu navegador no soporta video HTML5." })}
             </video>
          </div>
        </div>
      )}

      {/* Hero estilo Apple/Movelta: eyebrow + titular enorme + subtítulo gris + píldora + enlace con chevron */}
      <header className="px-5 sm:px-8 pt-14 sm:pt-24 pb-10 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="max-w-4xl">
            <p className="eyebrow">{t('home.heroEyebrow')}</p>
            <h1 className="headline mt-3 text-[44px] sm:text-[72px] lg:text-[96px]">
              <Trans
                i18nKey="home.heroTitle"
                values={{ price: minPriceDisplay }}
                components={{ i: <span className="italic text-brand" /> }}
              />
            </h1>
            <p className="subhead mt-6 text-[19px] sm:text-[22px] max-w-2xl">
              <Trans i18nKey="home.heroBody" components={{ b: <span className="text-ink font-semibold" /> }} />
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-4">
              <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className="h-12 px-7 rounded-full bg-brand text-white text-[17px] font-semibold inline-flex items-center hover:bg-[#2c1803] transition">
                {t('home.ctaMeeting')}
              </a>
              <Link to={langPath('/proyectos')} className="link-chevron text-[17px]">
                {t('home.viewAllProperties')} <span className="material-symbols-outlined text-[20px]">chevron_right</span>
              </Link>
              {(config as any).brand?.intro_video_url && (
                <button onClick={() => setIsVideoOpen(true)} className="link-chevron text-[17px] cursor-pointer">
                  {t('home.ctaVideo')} <span className="material-symbols-outlined text-[20px]">play_circle</span>
                </button>
              )}
            </div>
            <div className="mt-8 flex items-center gap-3">
              <div className="flex -space-x-2">
                <img loading="lazy" src="https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&q=80&w=150&h=150" className="w-8 h-8 rounded-full border-2 border-white object-cover" alt="Investor 1" />
                <img loading="lazy" src="https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&q=80&w=150&h=150" className="w-8 h-8 rounded-full border-2 border-white object-cover" alt="Investor 2" />
                <img loading="lazy" src="https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&q=80&w=150&h=150" className="w-8 h-8 rounded-full border-2 border-white object-cover" alt="Investor 3" />
              </div>
              <p className="text-[14px] text-mute">{t('home.investorsCount')}</p>
            </div>
          </div>

          {/* Tarjeta multimedia grande: proyecto destacado a todo el ancho */}
          <div className="mt-14 sm:mt-20">
            {featuredProject ? (
              <Link to={projectPath(featuredProject)} className="group relative block rounded-[28px] overflow-hidden bg-black shadow-[0_30px_80px_-30px_rgba(0,0,0,0.35)] ring-1 ring-black/5">
                <img
                  src={imgSrc(getImageUrl(featuredProject.image), 1400)}
                  srcSet={imgSrcSet(getImageUrl(featuredProject.image), [800, 1000, 1400, 2000])}
                  sizes="(max-width: 1200px) 100vw, 1152px"
                  className="w-full h-[440px] sm:h-[560px] lg:h-[640px] object-cover transition duration-[1400ms] ease-out group-hover:scale-[1.03]"
                  alt={featuredProject.name}
                  onError={imgFallback(getImageUrl(featuredProject.image))}
                  loading="eager"
                  fetchPriority="high"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
                <div className="absolute top-5 left-5 sm:top-7 sm:left-7 flex gap-2">
                  <span className="h-7 px-3 rounded-full bg-white/90 backdrop-blur text-ink text-[12px] font-semibold inline-flex items-center">{t('home.featuredTag')}</span>
                  <span className="h-7 px-3 rounded-full bg-black/40 backdrop-blur text-white text-[12px] font-semibold inline-flex items-center">{translateStatus(featuredProject.status, t)}</span>
                </div>
                <div className="absolute inset-x-0 bottom-0 p-6 sm:p-10 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-5 text-white">
                  <div className="min-w-0">
                    <p className="text-[14px] sm:text-[15px] text-white/70">{featuredProject.location}{featuredProject.tenure ? ` · ${t(`projects.card.tenure.${(featuredProject.tenure||'').toLowerCase()}`, featuredProject.tenure)}` : ''}</p>
                    <h2 className="mt-1 text-[32px] sm:text-[52px] leading-[1.02] text-white">{featuredProject.name}</h2>
                    <p className="mt-3 text-[15px] text-white/75">
                      {t('home.investmentFrom')} <span className="text-white font-semibold text-[20px] sm:text-[24px] tracking-[-0.02em]">{formatPrice(featuredProject.investor_price, featuredProject.price_currency)}</span>
                      {Number(featuredProject.market_price) > Number(featuredProject.investor_price) && (
                        <span className="ml-2 line-through text-white/50">{formatPrice(Number(featuredProject.market_price), featuredProject.price_currency)}</span>
                      )}
                    </p>
                  </div>
                  <span className="h-11 px-6 rounded-full bg-white text-ink text-[15px] font-semibold inline-flex items-center gap-1 self-start sm:self-auto group-hover:gap-2 transition-all">
                    {t('home.viewProject')} <span className="material-symbols-outlined text-[20px]">chevron_right</span>
                  </span>
                </div>
              </Link>
            ) : (
              <div className="tile p-16 text-center">
                <span className="material-symbols-outlined text-4xl text-mute mb-2">home_work</span>
                <p className="text-mute text-[15px]">{t('home.comingSoon')}</p>
              </div>
            )}
          </div>
        </div>
        {FEATURED_AT === 'B' && <FeaturedStrip variant="B" />}
      </header>

      {FEATURED_AT === 'A' && <FeaturedStrip variant="A" />}

      {/* Oportunidades: sección gris con eyebrow + titular + filtros en píldora + rejilla de tarjetas limpias */}
      <section className="px-5 sm:px-8 py-20 sm:py-28 bg-almond">
        <div className="max-w-6xl mx-auto">
          <div className="max-w-3xl">
            <p className="eyebrow">{t('nav.projects')}</p>
            <h2 className="headline text-[36px] sm:text-[56px] mt-2">{t('home.opportunitiesTitle')}</h2>
          </div>

          {/* Filtros (solo tablet/escritorio; en móvil el filtro está en /proyectos — Andreas 30-oct) */}
          <div className="hidden md:flex mt-10 bg-white rounded-full p-2 items-stretch gap-1 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-12px_rgba(0,0,0,0.08)]">
            <label className="flex-1 flex flex-col justify-center px-6 py-2 rounded-full hover:bg-[#f5f5f7] transition cursor-pointer">
              <span className="text-[12px] text-mute">{t('projects.filters.sortBy')}</span>
              <select aria-label={t('projects.filters.sortBy')} value={filters.sort} onChange={(e) => setFilters({...filters, sort: e.target.value})} className="w-full bg-transparent bg-none border-none p-0 text-ink focus:ring-0 font-semibold text-[15px] cursor-pointer outline-none appearance-none truncate">
                <option value="featured">{t('projects.sort.featured')}</option>
                <option value="roi">{t('projects.sort.roi')}</option>
                <option value="asc">{t('projects.sort.asc')}</option>
                <option value="desc">{t('projects.sort.desc')}</option>
              </select>
            </label>
            <div className="flex-1 flex flex-col justify-center px-6 py-2 rounded-full hover:bg-[#f5f5f7] transition">
              <span className="text-[12px] text-mute">{t('projects.filters.budget')}</span>
              <div className="flex items-center gap-2">
                <input type="text" placeholder={t('projects.filters.min')} value={filters.minPrice} onChange={(e) => handlePriceChange('minPrice', e.target.value)} className="w-full bg-transparent border-none p-0 text-ink focus:ring-0 font-semibold text-[15px] placeholder:text-black/25 !shadow-none" />
                <span className="text-black/20">–</span>
                <input type="text" placeholder={t('projects.filters.max')} value={filters.maxPrice} onChange={(e) => handlePriceChange('maxPrice', e.target.value)} className="w-full bg-transparent border-none p-0 text-ink focus:ring-0 font-semibold text-[15px] placeholder:text-black/25 !shadow-none" />
              </div>
            </div>
            <label className="flex-1 flex flex-col justify-center px-6 py-2 rounded-full hover:bg-[#f5f5f7] transition cursor-pointer">
              <span className="text-[12px] text-mute">{t('projects.filters.zone')}</span>
              <select aria-label={t('projects.filters.zone')} value={filters.zone} onChange={(e) => setFilters({...filters, zone: e.target.value})} className="w-full bg-transparent bg-none border-none p-0 text-ink focus:ring-0 font-semibold text-[15px] cursor-pointer outline-none appearance-none truncate">
                <option value={ANY_ZONE}>{t('projects.filters.anyZone')}</option>
                {config.customZones.map(z => <option key={z} value={z}>{z}</option>)}
              </select>
            </label>
            <label className="flex-1 flex flex-col justify-center px-6 py-2 rounded-full hover:bg-[#f5f5f7] transition cursor-pointer">
              <span className="text-[12px] text-mute">{t('projects.filters.type')}</span>
              <select aria-label={t('projects.filters.type')} value={filters.type} onChange={(e) => setFilters({...filters, type: e.target.value})} className="w-full bg-transparent bg-none border-none p-0 text-ink focus:ring-0 font-semibold text-[15px] cursor-pointer outline-none appearance-none truncate">
                <option value={ANY_TYPE}>{t('projects.filters.anyType')}</option>
                {propertyTypeOptions(['Villa', 'Loft', ...config.customTypes]).map(ty => <option key={ty} value={ty}>{propertyTypeLabel(ty, i18n.language)}</option>)}
              </select>
            </label>
            <button onClick={handleSearch} className="h-14 px-7 rounded-full bg-brand text-white text-[15px] font-semibold inline-flex items-center gap-2 hover:bg-[#2c1803] transition">
              <span className="material-symbols-outlined text-[20px]">search</span>{t('home.searchBtn')}
            </button>
          </div>

          <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
            {filteredGridProjects.slice(0, 3).map((proj) => (
              <Link key={proj.id} to={projectPath(proj)} className="group bg-white rounded-[22px] overflow-hidden flex flex-col shadow-[0_1px_2px_rgba(0,0,0,0.04)] hover:shadow-[0_24px_48px_-20px_rgba(0,0,0,0.18)] transition-shadow duration-500">
                <div className="aspect-[4/3] relative overflow-hidden">
                  <img loading="lazy" src={imgSrc(getImageUrl(proj.image), 600)} srcSet={imgSrcSet(getImageUrl(proj.image), [320, 600, 900, 1200])} sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw" className="w-full h-full object-cover transition duration-[1200ms] ease-out group-hover:scale-[1.04]" onError={imgFallback(getImageUrl(proj.image))} alt={proj.name} />
                  <span className="absolute top-4 left-4 h-7 px-3 rounded-full bg-white/90 backdrop-blur text-ink text-[12px] font-semibold inline-flex items-center">{translateStatus(proj.status, t)}</span>
                </div>
                <div className="p-6 flex-grow flex flex-col">
                  <p className="text-[13px] text-mute truncate">{proj.location}{proj.tenure ? ` · ${t(`projects.card.tenure.${(proj.tenure||'').toLowerCase()}`, proj.tenure)}` : ''}</p>
                  <h3 className="mt-1 text-[22px] text-ink leading-tight">{proj.name}</h3>
                  {proj.completion_percent > 0 && (
                    <div className="flex items-center gap-3 mt-4">
                      <span className="text-[12px] text-mute">{t('projects.card.work')}</span>
                      <div className="flex-1 bg-[#f5f5f7] rounded-full h-1 overflow-hidden"><div className="bg-brand h-full rounded-full" style={{ width: `${proj.completion_percent}%` }} /></div>
                      <span className="text-[12px] font-semibold text-ink tabular-nums">{proj.completion_percent}%</span>
                    </div>
                  )}
                  <div className="mt-auto pt-6 flex justify-between items-end">
                    <div>
                      <p className="text-[12px] text-mute">{t('home.investFrom')}</p>
                      <p className="text-[22px] font-semibold tracking-[-0.02em] text-ink tabular-nums">{formatPrice(proj.investor_price, proj.price_currency)}
                        {Number(proj.market_price) > Number(proj.investor_price) && <span className="ml-2 text-[13px] font-normal text-mute line-through">{formatPrice(Number(proj.market_price), proj.price_currency)}</span>}
                      </p>
                    </div>
                    <span className="link-chevron text-[15px]">{t('home.viewShort')}<span className="material-symbols-outlined text-[18px]">chevron_right</span></span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
          <div className="mt-10 text-center">
            <button onClick={handleSearch} className="link-chevron text-[17px]">{t('home.viewAllProperties')} <span className="material-symbols-outlined text-[20px]">chevron_right</span></button>
          </div>
        </div>
      </section>

      {FEATURED_AT === 'C' && <FeaturedStrip variant="C" />}

      {/* Por qué fuera de Europa: blanco, titular + rejilla de tiles + imagen con dato grande */}
      <section className="px-5 sm:px-8 py-20 sm:py-28 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="max-w-3xl">
            <p className="eyebrow">{t('home.section1Tag')}</p>
            <h2 className="headline text-[36px] sm:text-[56px] mt-2">{t('home.section1Title')}</h2>
            <p className="subhead mt-5 text-[17px] sm:text-[21px]">{t('home.section1Body')}</p>
          </div>
          <div className="mt-12 grid grid-cols-1 lg:grid-cols-5 gap-5">
            <div className="lg:col-span-2 grid grid-cols-1 gap-5">
              {[['trending_down', 'b1'], ['security', 'b2'], ['public', 'b3']].map(([icon, k]) => (
                <div key={k} className="tile p-7">
                  <span className="material-symbols-outlined text-brand text-[26px]">{icon}</span>
                  <h3 className="mt-3 text-[20px] text-ink">{t(`home.${k}Title`)}</h3>
                  <p className="mt-1.5 text-[15px] text-mute leading-relaxed">{t(`home.${k}Body`)}</p>
                </div>
              ))}
            </div>
            <div className="lg:col-span-3 relative rounded-[28px] overflow-hidden min-h-[420px]">
              <img loading="lazy" src={imgSrc("/img/The%20Nook/1-04.webp", 1200)} srcSet={imgSrcSet("/img/The%20Nook/1-04.webp", [600, 900, 1200])} sizes="(max-width: 1024px) 100vw, 60vw" className="absolute inset-0 w-full h-full object-cover" alt="Interior Architecture" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/0 to-transparent" />
              <div className="absolute left-0 bottom-0 p-8 sm:p-10 text-white">
                <p className="text-[15px] text-white/70">{t('home.roiAvgTag')}</p>
                <p className="text-[72px] sm:text-[96px] font-bold tracking-[-0.05em] leading-none tabular-nums">28%</p>
                <p className="text-[15px] text-white/70 mt-1">{t('home.roiAvgFooter')}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Cómo creamos valor: gris, pasos numerados + desglose de rentabilidad */}
      <section className="px-5 sm:px-8 py-20 sm:py-28 bg-almond">
        <div className="max-w-6xl mx-auto">
          <div className="max-w-3xl">
            <p className="eyebrow">{t('home.section2Tag')}</p>
            <h2 className="headline text-[36px] sm:text-[56px] mt-2">{t('home.section2Title')}</h2>
            <p className="subhead mt-5 text-[17px] sm:text-[21px]">{t('home.section2Body')}</p>
          </div>
          <div className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-8">
            {['v1', 'v2', 'v3'].map((k, i) => (
              <div key={k} className={`pt-5 border-t-2 ${i === 0 ? 'border-brand' : 'border-black/10'}`}>
                <p className="text-[13px] font-semibold text-mute tabular-nums">0{i + 1}</p>
                <h3 className="mt-2 text-[20px] text-ink">{t(`home.${k}Title`)}</h3>
                <p className="mt-1.5 text-[15px] text-mute leading-relaxed">{t(`home.${k}Body`)}</p>
              </div>
            ))}
          </div>

          <div className="mt-14 bg-white rounded-[28px] p-7 sm:p-12 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            <div className="flex flex-col lg:flex-row gap-10 lg:gap-16">
              <div className="lg:w-2/5">
                <h3 className="text-[28px] sm:text-[36px] text-ink leading-tight">{t('home.profitTitle')}</h3>
                <p className="mt-3 text-[15px] text-mute">{t('home.profit.calcNote', { defaultValue: 'Calculado sobre modelo de venta sobre plano en zona de alta demanda.' })}</p>
                {featuredProject && (
                  <Link to={projectPath(featuredProject)} className="mt-6 h-11 px-6 rounded-full bg-brand text-white text-[15px] font-semibold inline-flex items-center hover:bg-[#2c1803] transition">
                    {t('home.profit.seeFeatured', { defaultValue: 'Ver propiedad destacada' })}
                  </Link>
                )}
              </div>
              {profitabilityData ? (
                <div className="lg:w-3/5 space-y-7">
                  <div>
                    <div className="flex justify-between text-[15px] text-mute mb-2"><span>{t('home.marketValue')}</span><span className="text-ink font-semibold tabular-nums">{formatPrice(profitabilityData.marketPrice, profitabilityData.currency)}</span></div>
                    <div className="w-full bg-[#f5f5f7] h-2 rounded-full overflow-hidden"><div className="bg-black/20 h-full w-full" /></div>
                  </div>
                  <div>
                    <div className="flex justify-between text-[15px] text-mute mb-2"><span>{t('home.profitabilityUnrealPrice')}</span><span className="text-ink font-semibold tabular-nums">{formatPrice(profitabilityData.investorPrice, profitabilityData.currency)}</span></div>
                    <div className="w-full bg-[#f5f5f7] h-2 rounded-full overflow-hidden"><div className="bg-brand h-full rounded-full transition-all duration-1000" style={{ width: `${profitabilityData.barWidth}%` }} /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-6 pt-6 border-t border-black/[0.06]">
                    <div>
                      <p className="text-[13px] text-mute">{t('home.profit.immediateGain', { defaultValue: 'Plusvalía Inmediata' })}</p>
                      <p className="text-[40px] sm:text-[56px] font-bold tracking-[-0.04em] text-emerald-600 leading-none mt-1 tabular-nums">+{profitabilityData.gainPercent}%</p>
                    </div>
                    <div>
                      <p className="text-[13px] text-mute">{t('home.profit.estimatedGain', { defaultValue: 'Ganancia Estimada' })}</p>
                      <p className="text-[28px] sm:text-[40px] font-bold tracking-[-0.04em] text-ink leading-none mt-1 tabular-nums">{formatPrice(profitabilityData.capitalGain, profitabilityData.currency)}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-mute text-[15px] py-10">{t('home.noProjectData')}</p>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Sección oscura a sangre (marrón de marca) */}
      <section className="px-5 sm:px-8 py-24 sm:py-36 bg-brand text-white text-center">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-[48px] sm:text-[80px] leading-[1.02] text-white">{t('home.ctaSectionTitle')}</h2>
          <p className="mt-6 text-[17px] sm:text-[21px] text-white/65 leading-relaxed">{t('home.ctaSectionBody')}</p>
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className="h-12 px-7 rounded-full bg-white text-ink text-[17px] font-semibold inline-flex items-center gap-2 hover:bg-white/90 transition">
              {t('home.ctaWhatsapp')} <span className="material-symbols-outlined text-[20px]">chat</span>
            </a>
          </div>
        </div>
      </section>

      {/* Blog */}
      <section className="px-5 sm:px-8 py-20 sm:py-28 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
            <div>
              <p className="eyebrow">{t('nav.blog')}</p>
              <h2 className="headline text-[36px] sm:text-[56px] mt-2">{t('home.blogTitle')}</h2>
            </div>
            <Link to={langPath("/blog")} className="link-chevron text-[17px] shrink-0">{t('home.blogCta')} <span className="material-symbols-outlined text-[20px]">chevron_right</span></Link>
          </div>
          <div className="mt-12 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {blogs.map((b) => localizeFields(b, ['title', 'description', 'content'], i18n.language)).map((post) => (
              <Link key={post.id} to={langPath(`/blog/${post.slug}`)} className="group tile overflow-hidden flex flex-col">
                <div className="aspect-[16/10] overflow-hidden">
                  <img loading="lazy" src={imgSrc(getImageUrl(post.image), 600)} srcSet={imgSrcSet(getImageUrl(post.image), [320, 600, 900])} sizes="(max-width: 768px) 100vw, 33vw" className="w-full h-full object-cover transition duration-[1200ms] ease-out group-hover:scale-[1.04]" onError={imgFallback(getImageUrl(post.image))} alt={post.title} />
                </div>
                <div className="p-6 flex flex-col flex-grow">
                  <p className="text-[13px] text-mute">{blogTagLabel(post.tag, t)} · {formatDate(post.published_date)}</p>
                  <h3 className="mt-2 text-[20px] text-ink leading-snug line-clamp-3">{post.title}</h3>
                  <p className="mt-2 text-[15px] text-mute leading-relaxed line-clamp-3 flex-grow">{post.description}</p>
                </div>
              </Link>
            ))}
          </div>
        <LandingLinks className="mt-12 text-center" />
        </div>
      </section>
    </div>
  );
};

export default Home;