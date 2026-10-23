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
import { translateStatus } from '../lib/statusI18n';
import { statusDotClass } from '../lib/statusColor';
import { usePageMeta } from '../components/PageMeta';
import PageLoader from '../components/PageLoader';
import Reveal from '../components/Reveal';
import WordReveal from '../components/WordReveal';
import ProjectCard from '../components/ProjectCard';
import FilterField, { filterControl, filterInput } from '../components/FilterField';

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
      const zoneMatch = filters.zone === ANY_ZONE || (p.location || '').toLowerCase().includes(filters.zone.toLowerCase());
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
      return <PageLoader />;
  }

  const ctaImage = getImageUrl(
    (featuredProject?.gallery && featuredProject.gallery[1]) ||
    projects.find(p => !p.is_hidden && p.id !== featuredProject?.id)?.image ||
    featuredProject?.image || ''
  );
  const valueItems = [
    { icon: 'construction', title: t('home.v1Title'), body: t('home.v1Body') },
    { icon: 'sell', title: t('home.v2Title'), body: t('home.v2Body') },
    { icon: 'payments', title: t('home.v3Title'), body: t('home.v3Body') },
  ];
  const reasons = [
    { icon: 'trending_down', title: t('home.b1Title'), body: t('home.b1Body') },
    { icon: 'shield', title: t('home.b2Title'), body: t('home.b2Body') },
    { icon: 'public', title: t('home.b3Title'), body: t('home.b3Body') },
  ];
  const gridProjects = filteredGridProjects.slice(0, 3);

  return (
    <div className="bg-almond overflow-x-hidden text-left relative">
      {/* Vídeo intro (modal) */}
      {isVideoOpen && (
        <div
          className="fixed inset-0 z-[100] bg-primary/90 backdrop-blur-sm flex items-center justify-center p-4 md:p-10"
          onClick={() => setIsVideoOpen(false)}
          role="dialog" aria-modal="true"
        >
          <div className="relative w-full max-w-5xl bg-black overflow-hidden" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setIsVideoOpen(false)}
              aria-label={t('common.close', { defaultValue: 'Cerrar' })}
              className="absolute top-3 right-3 z-20 w-11 h-11 bg-almond text-primary flex items-center justify-center rounded-full transition-transform duration-300 hover:rotate-90"
            >
              <span className="material-symbols-outlined">close</span>
            </button>
            <video
              autoPlay loop muted playsInline controls preload="none"
              className="w-full h-full object-cover"
              src={(config as any).brand?.intro_video_url || ''}
              onPlay={(e) => {
                const video = e.currentTarget;
                if (video.muted) setTimeout(() => { video.muted = false; }, 500);
              }}
            >
              {t("home.videoUnsupported", { defaultValue: "Tu navegador no soporta video HTML5." })}
            </video>
          </div>
        </div>
      )}

      {/* ── Héroe: la obra a sangre, el titular como rótulo de arquitectura ── */}
      <header className="relative min-h-[100svh] flex flex-col justify-end overflow-hidden bg-primary text-almond">
        {featuredProject && (
          <div className="absolute inset-0 us-curtain" aria-hidden="true">
            <img
              src={imgSrc(getImageUrl(featuredProject.image), 1920)}
              srcSet={imgSrcSet(getImageUrl(featuredProject.image), [800, 1200, 1600, 2200])}
              sizes="100vw"
              className="w-full h-full object-cover"
              alt=""
              loading="eager"
              fetchPriority="high"
              onError={imgFallback(getImageUrl(featuredProject.image))}
            />
          </div>
        )}
        {/* Lectura sobre la foto: sombra solo donde vive el texto. */}
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(30,27,22,0.55)_0%,rgba(30,27,22,0)_26%,rgba(30,27,22,0)_42%,rgba(30,27,22,0.82)_100%)]" aria-hidden="true" />

        <div className="relative z-10 w-full max-w-[1440px] mx-auto px-5 md:px-12 pt-32 pb-8 md:pb-12">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-end">
            <div className="lg:col-span-8">
              <h1 className="font-display uppercase text-almond text-[2.6rem] leading-[0.95] sm:text-6xl md:text-7xl xl:text-[6rem] xl:leading-[0.92] us-rise" style={{ animationDelay: '500ms' }}>
                <Trans
                  i18nKey="home.heroTitle"
                  values={{ price: minPriceDisplay }}
                  components={{ i: <span className="us-accent text-[1.08em] text-clay-light" /> }}
                />
              </h1>
              <p className="mt-7 md:mt-9 max-w-xl text-base md:text-lg leading-relaxed text-almond/80 us-rise" style={{ animationDelay: '750ms' }}>
                <Trans i18nKey="home.heroBody" components={{ b: <span className="text-almond font-semibold" /> }} />
              </p>
              <div className="mt-8 md:mt-10 flex flex-col sm:flex-row gap-3 us-rise" style={{ animationDelay: '900ms' }}>
                <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className="us-btn us-btn-light">
                  {t('home.ctaMeeting')} <span className="material-symbols-outlined">arrow_forward</span>
                </a>
                {(config as any).brand?.intro_video_url && (
                  <button onClick={() => setIsVideoOpen(true)} className="us-btn us-btn-ghost text-almond">
                    <span className="material-symbols-outlined">play_arrow</span> {t('home.ctaVideo')}
                  </button>
                )}
              </div>
            </div>

            {/* Lámina del proyecto destacado (pie de foto con ficha técnica). */}
            {featuredProject ? (
              <Link
                to={projectPath(featuredProject)}
                className="lg:col-span-4 group block bg-almond text-primary p-5 md:p-6 us-rise outline-none focus-visible:ring-2 focus-visible:ring-clay-light"
                style={{ animationDelay: '1100ms' }}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="us-label text-primary/50">{t('home.featuredTag')}</span>
                  <span className="inline-flex items-center gap-2 us-label text-primary/70"><span className={`w-1.5 h-1.5 rounded-full ${statusDotClass(featuredProject.status)}`} />{translateStatus(featuredProject.status, t)}</span>
                </div>
                <p className="font-serif text-2xl md:text-[1.7rem] leading-[1.08] mt-4 transition-colors group-hover:text-clay">{featuredProject.name}</p>
                <p className="text-sm text-primary/55 mt-1.5">
                  {featuredProject.location}
                  {featuredProject.tenure ? ` · ${t(`projects.card.tenure.${(featuredProject.tenure || '').toLowerCase()}`, featuredProject.tenure)}` : ''}
                </p>
                <div className="flex items-end justify-between gap-4 mt-5 pt-4 border-t border-primary/15">
                  <div>
                    <p className="us-label text-primary/45">{t('home.investmentFrom')}</p>
                    <div className="flex items-baseline gap-2 mt-1">
                      <p className="text-2xl font-medium us-num tracking-tight">{formatPrice(featuredProject.investor_price, featuredProject.price_currency)}</p>
                      {Number(featuredProject.market_price) > Number(featuredProject.investor_price) && (
                        <p className="text-xs text-primary/40 line-through us-num">{formatPrice(Number(featuredProject.market_price), featuredProject.price_currency)}</p>
                      )}
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-2 us-label text-primary">
                    <span className="hidden sm:inline">{t('home.viewProject')}</span>
                    <span className="w-10 h-10 rounded-full bg-primary text-almond flex items-center justify-center transition-colors duration-300 group-hover:bg-clay">
                      <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                    </span>
                  </span>
                </div>
              </Link>
            ) : (
              <div className="lg:col-span-4 bg-almond/10 border border-almond/20 p-8 text-center">
                <p className="us-label text-almond/60">{t('home.comingSoon')}</p>
              </div>
            )}
          </div>

          {/* Raíl inferior: posicionamiento + prueba social, sin rótulo sobre el titular. */}
          <div className="mt-10 md:mt-14 pt-5 border-t border-almond/20 flex flex-col sm:flex-row sm:items-center justify-between gap-2 us-label text-almond/60">
            <span>{t('home.heroEyebrow')}</span>
            <span className="text-almond/80">{t('home.investorsCount')}</span>
          </div>
        </div>
      </header>

      {/* ── Catálogo: buscador-instrumento + composición asimétrica ── */}
      <section className="pt-16 md:pt-28 pb-16 md:pb-24" aria-labelledby="home-projects">
        <div className="max-w-[1440px] mx-auto px-5 md:px-12">
          <div className="flex items-end justify-between gap-6 mb-8 md:mb-12">
            <h2 id="home-projects" className="font-display uppercase text-[2.4rem] leading-[0.95] md:text-7xl text-primary">{t('nav.projects')}</h2>
            <button onClick={handleSearch} className="us-link text-primary shrink-0 mb-2">
              <span className="hidden sm:inline">{t('home.viewMoreProperties')}</span><span className="sm:hidden">{t('home.viewShort')}</span>
              <span className="material-symbols-outlined text-base">arrow_forward</span>
            </button>
          </div>

          <div className="bg-paper border border-primary/15 rounded-[3px] grid grid-cols-2 md:flex md:items-stretch mb-12 md:mb-20">
            <FilterField icon="sort" label={t('projects.filters.sortBy')} className="flex-1 border-b border-r md:border-b-0">
              <select aria-label={t('projects.filters.sortBy')} value={filters.sort} onChange={(e) => setFilters({ ...filters, sort: e.target.value })} className={filterControl}>
                <option value="featured">{t('projects.sort.featured')}</option>
                <option value="roi">{t('projects.sort.roi')}</option>
                <option value="asc">{t('projects.sort.asc')}</option>
                <option value="desc">{t('projects.sort.desc')}</option>
              </select>
            </FilterField>
            <FilterField icon="payments" label={t('projects.filters.budget')} className="flex-1 border-b md:border-b-0 md:border-r">
              <div className="flex items-center gap-2">
                <input type="text" inputMode="numeric" aria-label={t('projects.filters.min')} placeholder={t('projects.filters.min')} value={filters.minPrice} onChange={(e) => handlePriceChange('minPrice', e.target.value)} className={filterInput} />
                <span className="text-primary/25" aria-hidden="true">—</span>
                <input type="text" inputMode="numeric" aria-label={t('projects.filters.max')} placeholder={t('projects.filters.max')} value={filters.maxPrice} onChange={(e) => handlePriceChange('maxPrice', e.target.value)} className={filterInput} />
              </div>
            </FilterField>
            <FilterField icon="location_on" label={t('projects.filters.zone')} className="flex-1 border-r">
              <select aria-label={t('projects.filters.zone')} value={filters.zone} onChange={(e) => setFilters({ ...filters, zone: e.target.value })} className={filterControl}>
                <option value={ANY_ZONE}>{t('projects.filters.anyZone')}</option>
                {config.customZones.map(z => <option key={z} value={z}>{z}</option>)}
              </select>
            </FilterField>
            <FilterField icon="home_work" label={t('projects.filters.type')} className="flex-1 md:border-r">
              <select aria-label={t('projects.filters.type')} value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value })} className={filterControl}>
                <option value={ANY_TYPE}>{t('projects.filters.anyType')}</option>
                <option value="Villa">Villa</option>
                <option value="Loft">Loft</option>
                {config.customTypes.map(ty => <option key={ty} value={ty}>{ty}</option>)}
              </select>
            </FilterField>
            <button onClick={handleSearch} className="us-btn col-span-2 md:col-span-1 rounded-none md:min-w-[11rem]">
              {t('home.searchBtn')} <span className="material-symbols-outlined">search</span>
            </button>
          </div>
        </div>

        {/* Móvil: carrusel con snap · Escritorio: 6/3/3 con desfase vertical */}
        <div className="flex lg:grid lg:grid-cols-12 gap-5 lg:gap-8 overflow-x-auto lg:overflow-visible snap-x snap-mandatory hide-scrollbar px-5 md:px-12 max-w-[1440px] mx-auto scroll-px-5">
          {gridProjects.map((proj, i) => (
            <Reveal
              key={proj.id}
              delay={i * 110}
              className={`snap-start shrink-0 w-[84%] sm:w-[46%] lg:w-auto ${i === 0 ? 'lg:col-span-6' : 'lg:col-span-3'} ${i === 1 ? 'lg:mt-20' : ''} ${i === 2 ? 'lg:mt-40' : ''}`}
            >
              <ProjectCard project={proj} tall={i === 0} sizes={i === 0 ? '(max-width: 1024px) 84vw, 50vw' : '(max-width: 1024px) 84vw, 25vw'} />
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── Por qué fuera de Europa: titular + lámina con el 28% superpuesto ── */}
      <section className="bg-paper py-20 md:py-32" aria-labelledby="home-why">
        <div className="max-w-[1440px] mx-auto px-5 md:px-12">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-12 items-end">
            <h2 id="home-why" className="lg:col-span-7 font-display uppercase text-[2.3rem] leading-[0.98] md:text-6xl xl:text-7xl text-primary">{t('home.section1Title')}</h2>
            <p className="lg:col-span-5 text-base md:text-lg text-primary/65 leading-relaxed max-w-xl lg:pb-2">{t('home.section1Body')}</p>
          </div>

          <div className="mt-12 md:mt-20 grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12">
            <Reveal className="lg:col-span-7 relative">
              <div className="us-zoom relative overflow-hidden aspect-[4/3] bg-primary/10">
                <img
                  loading="lazy"
                  src={imgSrc("/img/The%20Nook/1-04.webp", 1200)}
                  srcSet={imgSrcSet("/img/The%20Nook/1-04.webp", [600, 900, 1200, 1600])}
                  sizes="(max-width: 1024px) 100vw, 58vw"
                  className="absolute inset-0 w-full h-full object-cover"
                  alt="Interior Architecture"
                />
              </div>
              <div className="relative -mt-16 ml-auto mr-4 md:mr-0 md:absolute md:-bottom-10 md:-right-8 w-[78%] sm:w-auto sm:max-w-xs bg-primary text-almond p-6 md:p-8 shadow-[0_30px_60px_-30px_rgba(30,27,22,0.6)]">
                <p className="us-label text-almond/55">{t('home.roiAvgTag')}</p>
                <p className="font-display text-[4.5rem] md:text-[6rem] leading-[0.9] mt-3 text-clay-light us-num">28%</p>
                <p className="text-sm text-almond/70 mt-3">{t('home.roiAvgFooter')}</p>
              </div>
            </Reveal>

            <ul className="lg:col-span-5 lg:pt-6 divide-y divide-primary/15 border-y border-primary/15 self-start">
              {reasons.map((r, i) => (
                <Reveal as="li" key={r.title} delay={i * 110} className="py-6 md:py-8 grid grid-cols-[2.5rem_1fr] gap-4">
                  <span className="material-symbols-outlined text-[26px] text-clay mt-0.5" aria-hidden="true">{r.icon}</span>
                  <div>
                    <h3 className="font-serif text-xl md:text-2xl text-primary leading-snug">{r.title}</h3>
                    <p className="text-[15px] text-primary/60 leading-relaxed mt-2">{r.body}</p>
                  </div>
                </Reveal>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ── Cómo creamos valor: manifiesto palabra a palabra + libro de cuentas ── */}
      <section className="bg-moss text-almond py-20 md:py-32 overflow-hidden" aria-labelledby="home-value">
        <div className="max-w-[1440px] mx-auto px-5 md:px-12">
          <h2 id="home-value" className="us-label text-clay-light">{t('home.section2Title')}</h2>
          <WordReveal
            text={t('home.section2Body')}
            mutedClass="opacity-20"
            className="mt-6 md:mt-8 font-serif text-[1.65rem] leading-[1.18] sm:text-4xl md:text-5xl md:leading-[1.12] xl:text-[3.6rem] max-w-6xl text-almond"
          />

          <div className="mt-16 md:mt-24 grid grid-cols-1 md:grid-cols-3 gap-0 border-t border-almond/15">
            {valueItems.map((v, i) => (
              <Reveal key={v.title} delay={i * 110} className={`py-7 md:py-10 md:px-8 ${i > 0 ? 'border-t md:border-t-0 md:border-l border-almond/15' : 'md:pl-0'}`}>
                <span className="material-symbols-outlined text-[28px] text-clay-light" aria-hidden="true">{v.icon}</span>
                <h3 className="font-serif text-xl md:text-2xl mt-4">{v.title}</h3>
                <p className="text-[15px] text-almond/60 mt-2 leading-relaxed">{v.body}</p>
              </Reveal>
            ))}
          </div>

          {/* Desglose de rentabilidad como libro de cuentas: dos reglas medidas. */}
          <div className="mt-6 md:mt-10 bg-almond text-primary grid grid-cols-1 lg:grid-cols-12">
            <div className="lg:col-span-5 p-6 md:p-10 lg:p-12 flex flex-col justify-between gap-8 border-b lg:border-b-0 lg:border-r border-primary/15">
              <div>
                <h3 className="font-serif text-3xl md:text-4xl leading-tight">{t('home.profitTitle')}</h3>
                {featuredProject && <p className="us-label text-primary/50 mt-3">{featuredProject.name}</p>}
              </div>
              <div className="space-y-5">
                <p className="text-primary/75 font-medium">{t('home.profit.ctaQuestion', { defaultValue: '¿Quieres invertir en una unidad con esta rentabilidad?' })}</p>
                {featuredProject && (
                  <Link to={projectPath(featuredProject)} className="us-btn w-full sm:w-auto">
                    {t('home.profit.seeFeatured', { defaultValue: 'Ver propiedad destacada' })} <span className="material-symbols-outlined">arrow_forward</span>
                  </Link>
                )}
              </div>
            </div>
            <div className="lg:col-span-7 p-6 md:p-10 lg:p-12">
              {profitabilityData ? (
                <>
                  <div className="space-y-8">
                    <div>
                      <div className="flex justify-between items-baseline gap-4">
                        <span className="us-label text-primary/50">{t('home.marketValue')}</span>
                        <span className="text-lg font-medium us-num">{formatPrice(profitabilityData.marketPrice, profitabilityData.currency)}</span>
                      </div>
                      <div className="mt-3 h-3 bg-[repeating-linear-gradient(90deg,rgba(30,27,22,0.22)_0_1px,transparent_1px_10%)] border-b border-primary/30" aria-hidden="true" />
                    </div>
                    <div>
                      <div className="flex justify-between items-baseline gap-4">
                        <span className="us-label text-primary/50">{t('home.profitabilityUnrealPrice')}</span>
                        <span className="text-lg font-semibold us-num">{formatPrice(profitabilityData.investorPrice, profitabilityData.currency)}</span>
                      </div>
                      <div className="mt-3 h-3 relative border-b border-primary/15" aria-hidden="true">
                        <div className="absolute left-0 bottom-0 h-3 bg-primary" style={{ width: `${profitabilityData.barWidth}%` }} />
                        <div className="absolute bottom-0 h-3 bg-clay/80" style={{ left: `${profitabilityData.barWidth}%`, right: 0 }} />
                      </div>
                    </div>
                  </div>
                  <div className="mt-10 grid grid-cols-2 gap-6 pt-8 border-t border-primary/15">
                    <div>
                      <p className="us-label text-primary/50">{t('home.profit.immediateGain', { defaultValue: 'Plusvalía Inmediata' })}</p>
                      <p className="font-display text-5xl md:text-6xl text-clay mt-2 us-num">+{profitabilityData.gainPercent}%</p>
                    </div>
                    <div className="text-right">
                      <p className="us-label text-primary/50">{t('home.profit.estimatedGain', { defaultValue: 'Ganancia Estimada' })}</p>
                      <p className="font-display text-3xl md:text-5xl mt-2 us-num">{formatPrice(profitabilityData.capitalGain, profitabilityData.currency)}</p>
                    </div>
                  </div>
                  <p className="text-xs text-primary/45 mt-6">{t('home.profit.calcNote', { defaultValue: 'Calculado sobre modelo de venta sobre plano en zona de alta demanda.' })}</p>
                </>
              ) : (
                <p className="us-label text-primary/40 py-10">{t('home.noProjectData')}</p>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── Llamada final: fotografía a sangre y una sola acción ── */}
      <section className="relative overflow-hidden bg-primary text-almond" aria-labelledby="home-cta">
        {ctaImage && (
          <img loading="lazy" src={imgSrc(ctaImage, 1600)} srcSet={imgSrcSet(ctaImage, [800, 1200, 1600, 2200])} sizes="100vw" alt="" aria-hidden="true" className="absolute inset-0 w-full h-full object-cover opacity-45" onError={imgFallback(ctaImage)} />
        )}
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(30,27,22,0.85),rgba(30,27,22,0.35))]" aria-hidden="true" />
        <div className="relative max-w-[1440px] mx-auto px-5 md:px-12 py-24 md:py-40">
          <Reveal>
            <h2 id="home-cta" className="font-display uppercase text-[3rem] leading-[0.92] sm:text-7xl md:text-8xl xl:text-[6rem] max-w-5xl">{t('home.ctaSectionTitle')}</h2>
            <p className="mt-6 md:mt-8 text-base md:text-xl text-almond/75 max-w-xl leading-relaxed">{t('home.ctaSectionBody')}</p>
            <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className="us-btn us-btn-light mt-10 w-full sm:w-auto">
              {t('home.ctaWhatsapp')} <span className="material-symbols-outlined">arrow_forward</span>
            </a>
          </Reveal>
        </div>
      </section>

      {/* ── Diario: últimas novedades ── */}
      {blogs.length > 0 && (
        <section className="py-20 md:py-28" aria-labelledby="home-blog">
          <div className="max-w-[1440px] mx-auto px-5 md:px-12">
            <div className="flex items-end justify-between gap-6 mb-10 md:mb-14 pb-6 border-b border-primary/15">
              <h2 id="home-blog" className="font-display uppercase text-[2.3rem] leading-[0.95] md:text-6xl text-primary">{t('home.blogTitle')}</h2>
              <Link to="/blog" className="us-link text-primary shrink-0 mb-2">{t('home.blogCta')} <span className="material-symbols-outlined text-base">arrow_forward</span></Link>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-10 md:gap-8 lg:gap-12">
              {blogs.map((post, i) => (
                <Reveal key={post.id} delay={i * 100} className="h-full">
                  <Link to={`/blog/${post.slug}`} className="group flex flex-col h-full outline-none focus-visible:ring-2 focus-visible:ring-clay focus-visible:ring-offset-4 focus-visible:ring-offset-almond">
                    <div className="us-zoom relative overflow-hidden aspect-[3/2] bg-primary/10">
                      <img loading="lazy" src={imgSrc(getImageUrl(post.image), 700)} srcSet={imgSrcSet(getImageUrl(post.image), [400, 700, 1000])} sizes="(max-width: 768px) 100vw, 33vw" className="absolute inset-0 w-full h-full object-cover" onError={imgFallback(getImageUrl(post.image))} alt={post.title} />
                    </div>
                    <div className="flex justify-between items-center gap-3 mt-5 us-label text-primary/45">
                      <span className="text-clay">{post.tag}</span>
                      <time className="us-num">{formatDate(post.published_date)}</time>
                    </div>
                    <h3 className="font-serif text-xl md:text-2xl text-primary mt-3 leading-snug transition-colors group-hover:text-clay line-clamp-3">{post.title}</h3>
                    <p className="text-[15px] text-primary/60 leading-relaxed mt-3 line-clamp-3">{post.description}</p>
                  </Link>
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
};

export default Home;