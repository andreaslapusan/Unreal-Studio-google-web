import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { DEFAULT_CONFIG, WHATSAPP_URL } from '../constants';
import { Project, AppConfig, BlogPost } from '../types';
import { useCurrency } from '../App';
import { supabase, getImageUrl, parseJsonField } from '../lib/supabase';

const Home: React.FC = () => {
  useEffect(() => { document.title = 'Unreal Studio Madrid | Inversiones Inmobiliarias en Bali'; }, []);
  const [projects, setProjects] = useState<Project[]>([]);
  const [blogs, setBlogs] = useState<BlogPost[]>([]);
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  
  const { formatPrice, currency } = useCurrency();
  
  // Estado para el modal de video
  const [isVideoOpen, setIsVideoOpen] = useState(false);

  // Nuevos estados para los filtros mejorados
  const [filters, setFilters] = useState({
    minPrice: '',
    maxPrice: '',
    zone: 'Cualquier zona',
    type: 'Cualquier tipo',
    sort: 'asc' // asc | desc
  });

  const navigate = useNavigate();

  // Helper date formatter
  const formatDate = (dateString: string) => {
    if (!dateString) return '';
    try {
        return new Date(dateString).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch {
        return dateString;
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        // Carga de Configuración
        const { data: configRows } = await supabase.from('app_config').select('*');
        if (configRows && configRows.length > 0) {
            const configObj: Record<string, any> = {};
            configRows.forEach((row: any) => {
              configObj[row.key] = row.value;
            });
            setConfig({ ...DEFAULT_CONFIG, ...configObj } as AppConfig);
        }

        // Carga de Proyectos
        const { data: projectsData } = await supabase
            .from('projects')
            .select('*')
            .order('sort_order', { ascending: true });

        if (projectsData) {
            const safeProjects = projectsData.map((p: any) => ({
                ...p,
                gallery: parseJsonField(p.gallery, []),
                investor_tiers: parseJsonField(p.investor_tiers, [])
            }));
            setProjects(safeProjects as unknown as Project[]);
        }

        // Carga de Blogs (Recientes)
        const { data: blogsData } = await supabase
            .from('blogs')
            .select('*')
            .order('published_date', { ascending: false })
            .limit(3);

        if (blogsData) {
            setBlogs(blogsData as unknown as BlogPost[]);
        }

      } catch (error) {
        console.error('Error loading data from Supabase:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const featuredProject = useMemo(() => {
    const visibleProjects = projects.filter(p => !p.is_hidden);
    if (visibleProjects.length === 0) return null;
    return visibleProjects.find(p => p.is_featured) || visibleProjects[0];
  }, [projects]);

  // Cálculos dinámicos para el Desglose de Rentabilidad basados en el proyecto destacado
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
      currency: featuredProject.price_currency
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
      const zoneMatch = filters.zone === 'Cualquier zona' || p.location.toLowerCase().includes(filters.zone.toLowerCase());
      // Filtro de Tipo
      const typeMatch = filters.type === 'Cualquier tipo' || p.property_type === filters.type;
      
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
    if (filters.zone !== 'Cualquier zona') params.append('zone', filters.zone);
    if (filters.type !== 'Cualquier tipo') params.append('type', filters.type);
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
              <p className="text-primary font-bold text-xs uppercase tracking-widest animate-pulse">Cargando...</p>
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
               src="https://storage.googleapis.com/ai-studio-bucket-343975482095-us-west1/services/unreal-studio-madrid/Images/VIDEO/welcome.mp4"
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
              Invierte en <span className="italic font-extralight">Bali</span> desde {minPriceDisplay} con <span className="italic font-extralight">Unreal Studio</span>
            </h1>
            <p className="text-lg md:text-xl text-primary/70 mb-10 leading-relaxed font-medium">
              Genera hasta un <span className="font-bold">28% anual bruto</span> invirtiendo a coste directo de promotor junto a nuestro estudio propio de arquitectura en Bali.
            </p>
            <div className="flex flex-col sm:flex-row gap-5">
              <a 
                href={WHATSAPP_URL} 
                target="_blank" 
                rel="noopener noreferrer" 
                className="bg-primary text-white px-10 py-5 rounded-full font-bold shadow-xl hover:translate-y-[-2px] transition flex items-center justify-center gap-2"
              >
                Agenda una reunión <span className="material-symbols-outlined">arrow_forward</span>
              </a>
              <button 
                onClick={() => setIsVideoOpen(true)}
                className="flex items-center justify-center gap-3 px-8 py-5 rounded-full border border-primary/20 font-bold text-primary hover:bg-white transition text-sm cursor-pointer"
              >
                <span className="material-symbols-outlined text-primary">play_circle</span> Ver video intro
              </button>
            </div>
          </div>
          
          <div className="flex items-center gap-4 pl-1">
             <div className="flex -space-x-3">
               <img loading="lazy" src="https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&q=80&w=150&h=150" className="w-10 h-10 rounded-full border-2 border-almond object-cover shadow-sm" alt="Investor 1" />
               <img loading="lazy" src="https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&q=80&w=150&h=150" className="w-10 h-10 rounded-full border-2 border-almond object-cover shadow-sm" alt="Investor 2" />
               <img loading="lazy" src="https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&q=80&w=150&h=150" className="w-10 h-10 rounded-full border-2 border-almond object-cover shadow-sm" alt="Investor 3" />
             </div>
             <p className="text-[11px] font-black uppercase tracking-widest text-primary/40">+150 inversores en todo el mundo.</p>
          </div>
        </div>
        
        {/* Featured Project Card */}
        <div className="w-full">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary/40 mb-4 text-left">Proyecto Destacado</p>
          {featuredProject ? (
              <Link to={`/proyecto/${featuredProject.slug}`} className="bg-white rounded-3xl md:rounded-[3rem] overflow-hidden shadow-2xl hover:shadow-3xl transition-all duration-700 flex flex-row md:flex-col group h-full md:h-auto items-stretch">
                <div className="w-[40%] md:w-full relative md:h-[500px] shrink-0 overflow-hidden">
                  <img src={getImageUrl(featuredProject.image)} className="absolute inset-0 md:relative w-full h-full object-cover group-hover:scale-105 transition duration-1000" alt={featuredProject.name} />
                  <div className="absolute top-3 left-3 md:top-8 md:left-8">
                    <span className="bg-primary text-white text-[8px] md:text-[10px] font-black px-3 py-1.5 md:px-6 md:py-3 uppercase rounded-lg md:rounded-2xl shadow-2xl">
                      {featuredProject.status}
                    </span>
                  </div>
                </div>
                
                <div className="p-4 md:p-8 lg:p-12 w-[60%] md:w-full flex flex-col justify-center text-left">
                  <p className="text-[9px] md:text-[11px] font-black text-gray-400 uppercase tracking-[0.2em] mb-2 md:mb-4 truncate">{featuredProject.location}</p>
                  <h3 className="text-xl md:text-4xl lg:text-5xl font-bold mb-3 md:mb-10 text-primary leading-tight line-clamp-2">{featuredProject.name}</h3>
                  
                  <div className="mt-auto pt-3 md:pt-10 border-t border-gray-100 flex flex-col md:flex-row md:justify-between md:items-center gap-2 md:gap-4">
                    <div>
                      <p className="text-[8px] md:text-[10px] uppercase text-gray-400 font-black mb-1 md:mb-2 tracking-widest">Inversión desde</p>
                      <div className="flex items-baseline gap-2">
                        <p className="font-bold text-lg md:text-3xl text-primary leading-none">{formatPrice(featuredProject.investor_price, featuredProject.price_currency)}</p>
                        {Number(featuredProject.market_price) > Number(featuredProject.investor_price) && (
                          <p className="text-xs md:text-sm text-gray-400 line-through font-bold">{formatPrice(Number(featuredProject.market_price), featuredProject.price_currency)}</p>
                        )}
                      </div>
                    </div>
                    
                    <div className="hidden md:flex items-center justify-center gap-3 bg-almond/30 px-6 py-4 rounded-2xl group-hover:bg-primary group-hover:text-white transition-all duration-500 self-start sm:self-auto w-full sm:w-auto">
                      <span className="text-primary group-hover:text-white font-bold text-xs uppercase tracking-widest">Ver Proyecto</span>
                      <span className="material-symbols-outlined text-xl group-hover:translate-x-1 transition-transform">arrow_forward</span>
                    </div>

                    <div className="md:hidden flex items-center gap-1 text-primary mt-1">
                      <span className="text-[9px] font-bold uppercase tracking-widest">Ver</span>
                      <span className="material-symbols-outlined text-sm">arrow_forward</span>
                    </div>
                  </div>
                </div>
              </Link>
          ) : (
             <div className="bg-white rounded-3xl p-12 text-center shadow-lg h-full flex flex-col items-center justify-center">
                 <span className="material-symbols-outlined text-4xl text-gray-300 mb-2">home_work</span>
                 <p className="text-primary/40 font-bold uppercase tracking-widest text-xs">Próximamente</p>
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
                <label className="block text-[9px] uppercase text-gray-400 font-black tracking-widest mb-1">Ordenar por</label>
                <div className="relative">
                  <select 
                    value={filters.sort} 
                    onChange={(e) => setFilters({...filters, sort: e.target.value})} 
                    className="w-full bg-transparent border-none p-0 text-primary focus:ring-0 font-bold text-sm cursor-pointer outline-none appearance-none pr-8 truncate"
                  >
                    <option value="featured">Destacados</option>
                    <option value="roi">Mayor ROI alquiler</option>
                    <option value="asc">Menor precio</option>
                    <option value="desc">Mayor precio</option>
                  </select>
                  <span className="material-symbols-outlined absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none text-primary/20 text-xs">expand_more</span>
                </div>
              </div>
            </div>

            {/* Price Filter */}
            <div className="flex-1 flex items-center gap-4 px-6 py-4 border-b md:border-b-0 md:border-r border-gray-100 group">
              <span className="material-symbols-outlined text-primary/30 group-hover:text-primary transition-colors">payments</span>
              <div className="flex-1 text-left">
                <label className="block text-[9px] uppercase text-gray-400 font-black tracking-widest mb-1">Presupuesto (€)</label>
                <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-1.5 border border-transparent hover:border-primary/10 transition-all">
                  <input 
                    type="text" 
                    placeholder="Min" 
                    value={filters.minPrice}
                    onChange={(e) => handlePriceChange('minPrice', e.target.value)}
                    className="w-full bg-transparent border-none p-0 text-primary focus:ring-0 font-bold text-[13px] placeholder:text-gray-300 text-center"
                  />
                  <span className="text-gray-300 text-[10px]">•</span>
                  <input 
                    type="text" 
                    placeholder="Max" 
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
                <label className="block text-[9px] uppercase text-gray-400 font-black tracking-widest mb-1">Zona</label>
                <div className="relative">
                  <select value={filters.zone} onChange={(e) => setFilters({...filters, zone: e.target.value})} className="w-full bg-transparent border-none p-0 text-primary focus:ring-0 font-bold text-sm cursor-pointer outline-none appearance-none pr-8 truncate">
                    <option>Cualquier zona</option>
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
                <label className="block text-[9px] uppercase text-gray-400 font-black tracking-widest mb-1">Tipo</label>
                <div className="relative">
                  <select value={filters.type} onChange={(e) => setFilters({...filters, type: e.target.value})} className="w-full bg-transparent border-none p-0 text-primary focus:ring-0 font-bold text-sm cursor-pointer outline-none appearance-none pr-8 truncate">
                    <option>Cualquier tipo</option>
                    <option>Co-Inversión</option>
                    <option>Propiedad Única</option>
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
              <span>Buscar</span>
              <span className="material-symbols-outlined text-sm">search</span>
            </button>
          </div>
        </div>
      </div>

      {/* Listings Section */}
      <section className="px-6 md:px-12 pb-12 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-10">
          {filteredGridProjects.slice(0, 3).map((proj) => (
            <Link key={proj.id} to={`/proyecto/${proj.slug}`} className="bg-white rounded-2xl md:rounded-3xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-500 flex flex-col group border border-primary/5">
              <div className="h-32 md:h-64 relative overflow-hidden">
                <img loading="lazy" src={getImageUrl(proj.image)} className="w-full h-full object-cover group-hover:scale-110 transition duration-700" alt={proj.name} />
                <span className="absolute top-2 left-2 md:top-4 md:left-4 bg-primary text-white text-[8px] md:text-[9px] font-black px-2 py-1 md:px-4 md:py-2 uppercase rounded-md md:rounded-lg shadow-xl">{proj.status}</span>
              </div>
              <div className="p-4 md:p-8 flex-grow flex flex-col text-left">
                <p className="text-[8px] md:text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 md:mb-2 truncate">{proj.location}</p>
                <h3 className="text-sm md:text-2xl font-bold mb-3 md:mb-6 text-primary line-clamp-2 md:line-clamp-none leading-tight">{proj.name}</h3>
                {proj.completion_percent > 0 && (
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-[9px] font-black uppercase text-primary/30">Obra</span>
                    <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                      <div className="bg-primary h-full rounded-full" style={{ width: `${proj.completion_percent}%` }}></div>
                    </div>
                    <span className="text-[10px] font-bold text-primary">{proj.completion_percent}%</span>
                  </div>
                )}
                <div className="mt-auto pt-3 md:pt-6 border-t border-gray-100 flex justify-between items-center">
                  <div>
                    <p className="text-[8px] md:text-[10px] uppercase text-gray-400 font-black mb-0.5 md:mb-1">Inversión desde</p>
                    <div className="flex items-baseline gap-2">
                      <p className="font-bold text-sm md:text-xl text-primary">{formatPrice(proj.investor_price, proj.price_currency)}</p>
                      {Number(proj.market_price) > Number(proj.investor_price) && (
                        <p className="text-[10px] md:text-xs text-gray-400 line-through font-bold">{formatPrice(Number(proj.market_price), proj.price_currency)}</p>
                      )}
                    </div>
                  </div>
                  <span className="text-primary font-bold text-[8px] md:text-[10px] uppercase tracking-widest flex items-center gap-1 group-hover:gap-3 transition-all">
                     <span className="hidden md:inline">Ver más</span> 
                     <span className="material-symbols-outlined text-sm md:text-base">add</span>
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
        
        <div className="mt-12 md:mt-16 text-center">
          <button onClick={handleSearch} className="inline-flex items-center gap-2 border-b-2 border-primary text-primary font-bold pb-1 uppercase tracking-widest text-xs hover:text-primary/70 hover:border-primary/70 transition">
            Ver más propiedades <span className="material-symbols-outlined text-sm">arrow_forward</span>
          </button>
        </div>
      </section>

      {/* Sección 1: Por qué salir de Europa */}
      <section className="py-24 md:py-32 bg-white px-6 md:px-12">
        <div className="max-w-7xl mx-auto flex flex-col lg:flex-row gap-16 lg:gap-24 items-center">
          <div className="lg:w-1/2 space-y-10 text-left">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary/40">LA DIFERENCIA UNREAL</p>
            <h2 className="text-4xl md:text-5xl lg:text-6xl text-primary leading-tight">Por qué invertir fuera de Europa</h2>
            <p className="text-lg text-primary/60 font-light leading-relaxed max-w-xl">
              La presión fiscal y regulatoria reduce cada vez más la rentabilidad inmobiliaria en Europa. Te damos acceso a mercados emergentes con mayor potencial y gestión profesional.
            </p>
            <div className="space-y-10">
              <div className="flex gap-6 items-start">
                <div className="shrink-0">
                  <span className="material-symbols-outlined text-primary text-3xl">trending_down</span>
                </div>
                <div>
                  <h4 className="text-xl font-bold text-primary mb-2">40% por debajo del mercado</h4>
                  <p className="text-sm text-primary/60 font-medium leading-relaxed">Precios directos de desarrollo, sin márgenes inflados, optimizando la relación riesgo–rentabilidad desde el inicio.</p>
                </div>
              </div>
              <div className="flex gap-6 items-start">
                <div className="shrink-0">
                  <span className="material-symbols-outlined text-primary text-3xl">security</span>
                </div>
                <div>
                  <h4 className="text-xl font-bold text-primary mb-2">Marco legal claro desde Madrid</h4>
                  <p className="text-sm text-primary/60 font-medium leading-relaxed">Procesos estructurados, contratos claros y soporte legal continuo para invertir con mayor tranquilidad.</p>
                </div>
              </div>
              <div className="flex gap-6 items-start">
                <div className="shrink-0">
                  <span className="material-symbols-outlined text-primary text-3xl">public</span>
                </div>
                <div>
                  <h4 className="text-xl font-bold text-primary mb-2">Diversificación internacional efectiva</h4>
                  <p className="text-sm text-primary/60 font-medium leading-relaxed">Protege tu capital accediendo a activos inmobiliarios en destinos con crecimiento sostenido y demanda real.</p>
                </div>
              </div>
            </div>
          </div>
          <div className="lg:w-1/2 relative">
            <div className="relative w-full">
              <div className="rounded-3xl overflow-hidden shadow-2xl h-96 md:h-auto md:aspect-square relative group">
                <img loading="lazy" src={getImageUrl("https://storage.googleapis.com/ai-studio-bucket-343975482095-us-west1/services/unreal-studio-madrid/Images/The%20Nook/1-04.png")} className="w-full h-full object-cover" alt="Interior Architecture" />
                <div className="absolute inset-0 bg-black/10"></div>
              </div>
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 md:top-auto md:bottom-10 md:translate-y-0 bg-primary p-6 md:p-8 rounded-3xl shadow-2xl text-left min-w-[200px] md:min-w-[280px] z-10 border border-white/10 backdrop-blur-md bg-primary/95">
                <p className="text-[8px] md:text-[10px] font-black uppercase tracking-[0.2em] text-almond/40 mb-1 md:mb-2">ROI MEDIO PROYECTADO</p>
                <p className="text-4xl md:text-6xl text-almond font-serif mb-1 md:mb-2 leading-none">28%</p>
                <p className="text-[8px] md:text-[10px] font-bold text-almond/60 uppercase tracking-wider">Rentabilidad bruta anual</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Sección 2: Cómo creamos valor */}
      <section className="py-24 md:py-32 bg-[#F3E5D8] px-6 md:px-12">
        <div className="max-w-7xl mx-auto flex flex-col lg:flex-row gap-20 items-center">
          <div className="lg:w-1/2 text-left space-y-10">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary/40">CASO DE USO DEFINIDO</p>
            <h2 className="text-4xl md:text-5xl text-primary leading-tight">¿Cómo creamos valor?</h2>
            <p className="text-lg text-primary/70 font-light leading-relaxed max-w-lg">
              Eliminamos intermediarios y optimizamos todo el proceso. Diseñamos, desarrollamos y comercializamos activos por debajo del mercado, generando valor desde la fase inicial del proyecto
            </p>
            <div className="space-y-6">
              <div className="flex items-center gap-5 p-5 bg-white/40 rounded-2xl border border-primary/5">
                <span className="material-symbols-outlined text-primary bg-primary/10 p-3 rounded-xl">construction</span>
                <div>
                  <h5 className="font-bold text-primary">Desarrollo propio</h5>
                  <p className="text-xs text-primary/60">Costes controlados mediante gestión directa</p>
                </div>
              </div>
              <div className="flex items-center gap-5 p-5 bg-white/40 rounded-2xl border border-primary/5">
                <span className="material-symbols-outlined text-primary bg-primary/10 p-3 rounded-xl">sell</span>
                <div>
                  <h5 className="font-bold text-primary">Comercialización eficiente</h5>
                  <p className="text-xs text-primary/60">Precios ajustados frente al mercado</p>
                </div>
              </div>
              <div className="flex items-center gap-5 p-5 bg-white/40 rounded-2xl border border-primary/5">
                <span className="material-symbols-outlined text-primary bg-primary/10 p-3 rounded-xl">payments</span>
                <div>
                  <h5 className="font-bold text-primary">Plusvalía Inmediata</h5>
                  <p className="text-xs text-primary/60">Compras a precio de promotor. Tú capturas la diferencia sobre mercado.</p>
                </div>
              </div>
            </div>
          </div>
          <div className="lg:w-1/2 w-full">
            <div className="bg-white p-10 md:p-14 rounded-[3rem] shadow-2xl border border-primary/5 text-center space-y-12">
              <h3 className="text-2xl text-primary font-serif">Desglose de Rentabilidad</h3>
              
              {profitabilityData ? (
                <div className="space-y-12 text-left">
                  <div className="space-y-5">
                    <div className="flex justify-between text-[11px] font-bold uppercase text-gray-400 tracking-wider">
                      <span>Valor de Mercado</span>
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
                      <span>Precio Unreal (Tu Inversión)</span>
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
                  
                  <div className="grid grid-cols-2 gap-8 pt-10 border-t border-gray-50">
                    <div className="text-left">
                      <p className="text-[9px] font-black uppercase text-gray-400 tracking-widest mb-1">Plusvalía Inmediata</p>
                      <p className="text-4xl font-serif text-green-600 font-bold">+{profitabilityData.gainPercent}%</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[9px] font-black uppercase text-gray-400 tracking-widest mb-1">Ganancia Estimada</p>
                      <p className="text-4xl font-serif text-primary font-bold">
                        {formatPrice(profitabilityData.capitalGain, profitabilityData.currency)}
                      </p>
                    </div>
                  </div>
                  
                  <div className="space-y-6 pt-4">
                    <p className="text-[10px] text-gray-400 font-medium italic">Calculado sobre modelo de venta sobre plano en zona de alta demanda.</p>
                    <div className="space-y-6 text-center">
                      <p className="text-primary font-bold text-sm">¿Quieres invertir en una unidad con esta rentabilidad?</p>
                      <Link 
                        to={`/proyecto/${featuredProject.slug}`}
                        className="bg-primary text-white px-10 py-4 rounded-full font-bold shadow-xl hover:translate-y-[-2px] transition flex items-center justify-center gap-2 mx-auto w-fit"
                      >
                        Ver propiedad destacada <span className="material-symbols-outlined">arrow_forward</span>
                      </Link>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-primary/40 font-bold uppercase tracking-widest text-xs py-10">Sin datos de proyecto disponibles</p>
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
          <h2 className="text-6xl md:text-8xl text-almond font-serif leading-none">No pierdas tiempo.</h2>
          <p className="text-lg md:text-xl text-almond/70 font-light max-w-2xl mx-auto leading-relaxed px-4">
            Agenda una reunión de 15 minutos sin compromiso. Evaluamos tu perfil inversor y te mostramos oportunidades reales.
          </p>
          
          <div className="flex flex-col items-center justify-center gap-6 mt-16 px-4">
            <a 
              href={WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full max-w-sm bg-almond text-primary px-12 py-5 rounded-full font-black text-xs uppercase tracking-[0.2em] hover:scale-105 transition-all duration-300 shadow-2xl flex items-center justify-center gap-3"
            >
              CONTACTAR POR WHATSAPP <span className="material-symbols-outlined text-base">chat</span>
            </a>
          </div>
        </div>
      </section>

      {/* Sección 4: Últimas Novedades - Most Recent Blogs */}
      <section className="py-24 md:py-32 px-6 md:px-12 max-w-7xl mx-auto">
        <div className="flex justify-between items-end mb-16 border-b border-primary/5 pb-8">
          <div className="text-left">
            <h2 className="text-4xl md:text-5xl text-primary font-serif">Últimas Novedades</h2>
          </div>
          <Link to="/blog" className="text-[11px] font-black uppercase tracking-widest text-primary/40 hover:text-primary transition flex items-center gap-2 mb-2 group">
            Ver Blog <span className="material-symbols-outlined text-sm group-hover:translate-x-1 transition-transform">arrow_forward</span>
          </Link>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12 lg:gap-16">
          {blogs.map((post) => (
            <Link key={post.id} to={`/blog/${post.slug}`} className="group cursor-pointer text-left flex flex-col h-full hover:translate-y-[-5px] transition-transform duration-500">
              {/* Imagen */}
              <div className="order-1 md:order-2">
                 <div className="aspect-[16/10] rounded-[2rem] overflow-hidden relative shadow-lg">
                    <img loading="lazy" src={getImageUrl(post.image)} className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition duration-1000 group-hover:scale-105" alt={post.title} />
                 </div>
              </div>

              {/* Texto */}
              <div className="order-2 md:order-1 mb-8 flex flex-col flex-grow">
                  <div className="flex justify-between items-center mb-4">
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