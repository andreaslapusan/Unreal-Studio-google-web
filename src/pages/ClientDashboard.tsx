import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { supabase, getImageUrl } from '../lib/supabase';
import { useCurrency } from '../App';
import { CURRENCIES } from '../constants';
import Footer from '../components/Footer';

const CLIENT_GUIDE_STEPS = [
  { title: "Tu panel de inversiones", text: "Aquí verás un resumen de todas tus inversiones: el total invertido (convertido a tu divisa preferida), número de proyectos activos, estado general y rentabilidad media prevista." },
  { title: "Selector de divisa", text: "Arriba a la derecha puedes cambiar la divisa. Todos los importes se convertirán automáticamente a la divisa que elijas, usando tasas de cambio actualizadas." },
  { title: "Tus inversiones", text: "Cada proyecto muestra la unidad asignada, importe invertido, fecha de compra, avance de obra y la rentabilidad prevista (alquiler y reventa). Pulsa 'Ver Proyecto' para ver todos los detalles." },
  { title: "Documentos", text: "Descarga el brochure del proyecto y el informe de obra actualizado directamente desde cada tarjeta de inversión." },
  { title: "¡Listo!", text: "Ya conoces tu portal. Si necesitas ayuda, usa el botón de WhatsApp o contacta con tu asesor. Puedes volver a ver esta guía pulsando 'Ver guía' en el header." }
];

const ClientDashboard: React.FC = () => {
  useEffect(() => { document.title = 'Mi Portal | Unreal Studio Madrid'; }, []);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { currency, setCurrency, formatPrice } = useCurrency();

  const [clientData, setClientData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [allProjects, setAllProjects] = useState<Record<string, any>>({});
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [passwords, setPasswords] = useState({ current: '', newPass: '', confirm: '' });
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [walkthroughStep, setWalkthroughStep] = useState<number | null>(null);
  const [calculatorProject, setCalculatorProject] = useState<any>(null);

  const formatDate = (dateString: string | undefined) => {
    if (!dateString) return '';
    try {
        return new Date(dateString).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch {
        return dateString;
    }
  };

  const getClientId = (): string | null => {
    const session = localStorage.getItem('_ust_client_');
    if (!session) return null;
    try {
      const decoded = atob(session);
      return decoded.split('_')[1] || null;
    } catch { return null; }
  };

  const loadDashboard = useCallback(async () => {
    const clientId = getClientId();
    if (!clientId) { navigate('/cliente'); return; }
    try {
      const { data, error } = await supabase.rpc('client_get_dashboard', { p_client_id: clientId });
      if (error || !data || !data.success) {
        localStorage.removeItem('_ust_client_');
        navigate('/cliente');
        return;
      }
      setClientData(data);

      // Fetch all projects to ensure we have all fields (like URLs)
      const { data: projectsData } = await supabase.from('projects').select('*');
      if (projectsData) {
          const projMap: Record<string, any> = {};
          projectsData.forEach((p: any) => projMap[p.id] = p);
          setAllProjects(projMap);
      }

    } catch (err) {
      console.error('Error loading dashboard:', err);
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    const session = localStorage.getItem('_ust_client_');
    if (!session) { navigate('/cliente'); return; }
    loadDashboard();
    if (searchParams.get('change_password') === 'true') {
      setShowChangePassword(true);
    }
  }, [navigate, loadDashboard, searchParams]);

  useEffect(() => {
    if (!localStorage.getItem('unreal_client_guide_seen')) {
      setWalkthroughStep(0);
    }
  }, []);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');
    if (passwords.newPass !== passwords.confirm) {
      setPasswordError('Las contraseñas no coinciden.');
      return;
    }
    if (passwords.newPass.length < 6) {
      setPasswordError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }
    const clientId = getClientId();
    if (!clientId) return;
    try {
      const { data, error } = await supabase.rpc('client_change_password', {
        p_client_id: clientId,
        p_old_password: passwords.current,
        p_new_password: passwords.newPass
      });
      if (error || !data || !data.success) {
        setPasswordError(data?.error || 'Contraseña actual incorrecta.');
        return;
      }
      setPasswordSuccess('Contraseña actualizada correctamente.');
      setPasswords({ current: '', newPass: '', confirm: '' });
      setTimeout(() => { setShowChangePassword(false); setPasswordSuccess(''); }, 2000);
    } catch (err) {
      setPasswordError('Error al cambiar contraseña.');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('_ust_client_');
    navigate('/cliente');
  };

  const finishWalkthrough = () => {
    localStorage.setItem('unreal_client_guide_seen', 'true');
    setWalkthroughStep(null);
  };

  const nextGuideStep = () => {
    if (walkthroughStep !== null && walkthroughStep < CLIENT_GUIDE_STEPS.length - 1) {
      setWalkthroughStep(walkthroughStep + 1);
    } else {
      finishWalkthrough();
    }
  };

  const prevGuideStep = () => {
    if (walkthroughStep !== null && walkthroughStep > 0) {
      setWalkthroughStep(walkthroughStep - 1);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-almond flex flex-col items-center justify-center space-y-4">
        <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
        <p className="text-primary font-bold text-xs uppercase tracking-widest animate-pulse">Cargando tu portal...</p>
      </div>
    );
  }

  if (!clientData) {
    return (
      <div className="min-h-screen bg-almond flex items-center justify-center">
        <p className="text-primary/50">Error al cargar datos. <button onClick={handleLogout} className="underline">Volver al login</button></p>
      </div>
    );
  }

  const client = clientData.client || {};
  const projects = (clientData.projects || []).map((cp: any) => {
      const full = allProjects[cp.project_id] || {};
      return {
          ...full,
          ...cp,
          project_image: full.image || cp.project_image,
          project_name: full.name || cp.project_name,
          project_location: full.location || cp.project_location,
          project_slug: full.slug || full.id
      };
  });
  
  const getTotalConverted = () => {
    let total = 0;
    projects.forEach((p: any) => {
      const amt = Number(p.investment_amount) || 0;
      const from = p.investment_currency || 'EUR';
      const formatted = formatPrice(amt, from);
      const num = parseFloat(formatted.replace(/[^\d,-]/g, '').replace(/\./g, '').replace(',', '.'));
      if (!isNaN(num)) total += num;
    });
    return total.toLocaleString('es-ES', {maximumFractionDigits: 0}) + ' ' + (CURRENCIES.find(c => c.code === currency)?.symbol || '€');
  };

  const getWeightedRentalROI = () => {
    const withRoi = projects.filter((p: any) => p.annual_rental_projection && p.investor_price);
    if (withRoi.length === 0) return '—';
    const weightedSum = withRoi.reduce((sum: number, p: any) => sum + (p.annual_rental_projection / p.investor_price) * Number(p.investment_amount), 0);
    const totalWeight = withRoi.reduce((sum: number, p: any) => sum + Number(p.investment_amount), 0);
    return totalWeight > 0 ? ((weightedSum / totalWeight) * 100).toFixed(1) + '%' : '—';
  };

  const totalInvested = projects.reduce((sum: number, p: any) => sum + (Number(p.investment_amount) || 0), 0);

  return (
    <div className="min-h-screen bg-almond">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-30 shadow-sm">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <Link to="/" className="flex items-center">
            <img src="https://storage.googleapis.com/ai-studio-bucket-343975482095-us-west1/services/unreal-studio-madrid/Images/Logos/logo-06.png" alt="Unreal Studio" className="h-10 w-auto object-contain" />
          </Link>
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-black uppercase text-primary/40 tracking-widest hidden md:block">{client.name}</span>
            <select value={currency} onChange={(e) => setCurrency(e.target.value as any)} className="bg-white/50 border border-primary/10 rounded-full px-3 py-1.5 text-[10px] font-bold text-primary focus:ring-0 cursor-pointer hover:bg-white transition">
              {CURRENCIES.map(c => (<option key={c.code} value={c.code}>{c.code} ({c.symbol})</option>))}
            </select>
            <button onClick={() => setWalkthroughStep(0)} className="text-[10px] font-black uppercase tracking-widest text-primary/40 hover:text-primary transition flex items-center gap-1">
              <span className="material-symbols-outlined text-xs">help</span> Ver guía
            </button>
            <button onClick={() => setShowChangePassword(true)} className="text-[10px] font-black uppercase tracking-widest text-primary/40 hover:text-primary transition flex items-center gap-1">
              <span className="material-symbols-outlined text-xs">lock</span> Contraseña
            </button>
            <button onClick={handleLogout} className="bg-red-50 text-red-600 px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-red-600 hover:text-white transition">Salir</button>
          </div>
        </div>
      </header>

      {walkthroughStep !== null && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm transition-opacity duration-300">
          <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full relative animate-in zoom-in-95 duration-300 mx-4 border border-gray-100">
            <button onClick={() => finishWalkthrough()} className="absolute top-4 right-4 text-gray-400 hover:text-primary transition" title="Cerrar guía">
              <span className="material-symbols-outlined">close</span>
            </button>
            <div className="mb-6">
              <span className="text-[10px] font-black uppercase text-primary/40 tracking-widest block mb-2">Paso {walkthroughStep + 1} de {CLIENT_GUIDE_STEPS.length}</span>
              <h2 className="text-2xl font-serif text-primary mb-4 leading-tight">{CLIENT_GUIDE_STEPS[walkthroughStep].title}</h2>
              <p className="text-primary/70 text-sm font-medium leading-relaxed">{CLIENT_GUIDE_STEPS[walkthroughStep].text}</p>
            </div>
            <div className="flex justify-between items-center pt-4 border-t border-gray-100">
              <div className="flex gap-2">
                {CLIENT_GUIDE_STEPS.map((_: any, i: number) => (
                  <div key={i} className={`w-2 h-2 rounded-full transition-colors duration-300 ${i === walkthroughStep ? 'bg-primary' : 'bg-gray-200'}`} />
                ))}
              </div>
              <div className="flex gap-3">
                {walkthroughStep > 0 && (
                  <button onClick={prevGuideStep} className="text-primary font-bold text-xs uppercase tracking-widest hover:text-primary/70 px-2">Anterior</button>
                )}
                <button onClick={nextGuideStep} className="bg-primary text-white px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-widest shadow-lg hover:bg-black transition-all">
                  {walkthroughStep < CLIENT_GUIDE_STEPS.length - 1 ? 'Siguiente' : 'Finalizar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <main className="max-w-6xl mx-auto px-6 py-12">
        {/* Resumen */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          <div className="bg-white p-8 rounded-2xl shadow-sm border border-primary/5">
            <p className="text-[10px] font-black uppercase text-primary/40 tracking-widest mb-2">Total invertido</p>
            <p className="text-3xl font-serif text-primary">{getTotalConverted()}</p>
          </div>
          <div className="bg-white p-8 rounded-2xl shadow-sm border border-primary/5">
            <p className="text-[10px] font-black uppercase text-primary/40 tracking-widest mb-2">Proyectos activos</p>
            <p className="text-3xl font-serif text-primary">{projects.length}</p>
          </div>
          <div className="bg-white p-8 rounded-2xl shadow-sm border border-primary/5">
            <p className="text-[10px] font-black uppercase text-primary/40 tracking-widest mb-2">ROI Medio Alquiler</p>
            <p className="text-3xl font-serif text-green-600">{getWeightedRentalROI()}</p>
          </div>
          <div className="bg-white p-8 rounded-2xl shadow-sm border border-primary/5">
            <p className="text-[10px] font-black uppercase text-primary/40 tracking-widest mb-2">Estado general</p>
            <p className="text-3xl font-serif text-primary">{projects.length > 0 ? 'Activo' : 'Sin inversiones'}</p>
          </div>
        </div>

        {/* Proyectos */}
        <h2 className="text-2xl font-serif text-primary mb-8">Mis Inversiones</h2>
        {projects.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center border border-primary/5">
            <span className="material-symbols-outlined text-4xl text-primary/20 mb-4">home_work</span>
            <p className="text-primary/40 font-bold">Aún no tienes proyectos asignados.</p>
            <p className="text-primary/30 text-sm mt-2">Tu asesor te asignará proyectos cuando formalices tu inversión.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {projects.map((proj: any, idx: number) => (
              <div key={idx} className="bg-white rounded-2xl overflow-hidden shadow-sm border border-primary/5">
                <div className="flex flex-col md:flex-row">
                  {proj.project_image && (
                    <div className="w-full md:w-64 h-48 md:h-auto shrink-0">
                      <img src={getImageUrl(proj.project_image)} className="w-full h-full object-cover" alt={proj.project_name} />
                    </div>
                  )}
                  <div className="p-8 flex-1">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="text-xl font-bold text-primary">
                          <Link to={`/proyecto/${proj.project_slug}`} className="hover:underline">{proj.project_name}</Link>
                        </h3>
                        <p className="text-sm text-primary/50">{proj.project_location}</p>
                      </div>
                      <span className={`text-[9px] font-black uppercase px-3 py-1 rounded-full ${proj.status === 'Completado' ? 'bg-green-50 text-green-600' : proj.status === 'Pagado' ? 'bg-blue-50 text-blue-600' : 'bg-yellow-50 text-yellow-600'}`}>{proj.status}</span>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
                      {proj.unit_number && (
                        <div>
                          <p className="text-[9px] font-black uppercase text-primary/30 tracking-widest">Unidad</p>
                          <p className="text-sm font-bold text-primary">{proj.unit_number}</p>
                        </div>
                      )}
                      {proj.investment_amount > 0 && (
                        <div>
                          <p className="text-[9px] font-black uppercase text-primary/30 tracking-widest">Inversión</p>
                          <p className="text-sm font-bold text-primary">{formatPrice(Number(proj.investment_amount), proj.investment_currency || 'EUR')}</p>
                        </div>
                      )}
                      {proj.purchase_date && (
                        <div>
                          <p className="text-[9px] font-black uppercase text-primary/30 tracking-widest">Fecha compra</p>
                          <p className="text-sm font-bold text-primary">{formatDate(proj.purchase_date)}</p>
                        </div>
                      )}
                      {proj.completion_percent !== undefined && (
                        <div>
                          <p className="text-[9px] font-black uppercase text-primary/30 tracking-widest">Avance obra</p>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                              <div className="bg-primary h-full rounded-full" style={{ width: `${proj.completion_percent}%` }}></div>
                            </div>
                            <span className="text-sm font-bold text-primary">{proj.completion_percent}%</span>
                          </div>
                        </div>
                      )}
                    </div>

                    {(proj.annual_rental_projection || proj.market_price) && (
                      <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-gray-100">
                        {proj.annual_rental_projection && proj.investor_price && (
                          <div>
                            <p className="text-[9px] font-black uppercase text-primary/30 tracking-widest">ROI Alquiler Previsto</p>
                            <p className="text-sm font-bold text-green-600">{((proj.annual_rental_projection / proj.investor_price) * 100).toFixed(1)}% <span className="text-[9px] text-primary/40">bruto/año</span></p>
                          </div>
                        )}
                        {proj.market_price && proj.investor_price && proj.market_price > proj.investor_price && (
                          <div>
                            <p className="text-[9px] font-black uppercase text-primary/30 tracking-widest">ROI Reventa Previsto</p>
                            <p className="text-sm font-bold text-blue-600">{(((proj.market_price - proj.investor_price) / proj.investor_price) * 100).toFixed(1)}% <span className="text-[9px] text-primary/40">plusvalía</span></p>
                          </div>
                        )}
                      </div>
                    )}

                    {(proj.brochure_url || proj.construction_update_url || proj.project_slug) && (
                      <div className="flex flex-wrap gap-3 mt-6 pt-6 border-t border-gray-100">
                          {proj.brochure_url && (
                              <a href={getImageUrl(proj.brochure_url)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 bg-primary/5 hover:bg-primary hover:text-white text-primary px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition">
                                  <span className="material-symbols-outlined text-sm">download</span> Brochure
                              </a>
                          )}
                          {proj.construction_update_url && (
                              <a href={getImageUrl(proj.construction_update_url)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 bg-green-50 hover:bg-green-600 hover:text-white text-green-700 px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition">
                                  <span className="material-symbols-outlined text-sm">construction</span> Informe de Obra
                                  {proj.construction_update_date && <span className="text-[8px] opacity-70 ml-1">({formatDate(proj.construction_update_date)})</span>}
                              </a>
                          )}
                          {proj.project_slug && (
                              <Link to={`/proyecto/${proj.project_slug}`} className="flex items-center gap-2 px-5 py-3 rounded-xl border border-primary/20 text-primary text-xs font-bold uppercase hover:bg-primary hover:text-white transition">
                                  <span className="material-symbols-outlined text-sm">visibility</span> Ver Proyecto
                              </Link>
                          )}
                          <button onClick={() => setCalculatorProject(proj)} className="flex items-center gap-2 px-5 py-3 rounded-xl bg-primary/5 text-primary text-xs font-bold uppercase hover:bg-primary hover:text-white transition">
                            <span className="material-symbols-outlined text-sm">calculate</span> Calculadora ROI
                          </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Contacto */}
        <div className="mt-16 bg-primary text-white rounded-2xl p-10 text-center">
          <h3 className="text-2xl font-serif mb-4">¿Necesitas ayuda?</h3>
          <p className="text-white/70 text-sm mb-6">Nuestro equipo está disponible para resolver cualquier duda sobre tus inversiones.</p>
          <a href="https://wa.me/34625710770?text=Hola, soy inversor de Unreal Studio y necesito ayuda." target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 bg-white text-primary px-8 py-4 rounded-xl font-bold text-sm hover:brightness-95 transition">
            <span className="material-symbols-outlined">chat</span> Contactar por WhatsApp
          </a>
        </div>
      </main>

      <Footer />

      {/* Modal Cambio Contraseña */}
      {showChangePassword && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={(e) => { if (e.target === e.currentTarget) setShowChangePassword(false); }}>
          <div className="bg-white w-full max-w-md rounded-3xl p-10 shadow-2xl">
            <h2 className="text-2xl font-serif text-primary mb-6">Cambiar Contraseña</h2>
            {passwordError && <div className="bg-red-50 text-red-600 text-sm font-bold p-3 rounded-xl mb-4">{passwordError}</div>}
            {passwordSuccess && <div className="bg-green-50 text-green-600 text-sm font-bold p-3 rounded-xl mb-4">{passwordSuccess}</div>}
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div>
                <label className="block text-[10px] font-black uppercase text-gray-400 tracking-widest mb-2">Contraseña Actual</label>
                <input type="password" required value={passwords.current} onChange={(e) => setPasswords({...passwords, current: e.target.value})} className="w-full px-5 py-4 bg-gray-50 rounded-2xl font-bold border border-gray-200 focus:outline-none focus:border-primary" />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase text-gray-400 tracking-widest mb-2">Nueva Contraseña</label>
                <input type="password" required value={passwords.newPass} onChange={(e) => setPasswords({...passwords, newPass: e.target.value})} className="w-full px-5 py-4 bg-gray-50 rounded-2xl font-bold border border-gray-200 focus:outline-none focus:border-primary" />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase text-gray-400 tracking-widest mb-2">Confirmar Nueva Contraseña</label>
                <input type="password" required value={passwords.confirm} onChange={(e) => setPasswords({...passwords, confirm: e.target.value})} className="w-full px-5 py-4 bg-gray-50 rounded-2xl font-bold border border-gray-200 focus:outline-none focus:border-primary" />
              </div>
              <div className="flex gap-4 pt-4">
                <button type="button" onClick={() => setShowChangePassword(false)} className="flex-1 py-4 rounded-xl text-xs font-bold uppercase tracking-widest border border-gray-200 text-gray-400 hover:bg-gray-50">Cancelar</button>
                <button type="submit" className="flex-1 py-4 rounded-xl text-xs font-bold uppercase tracking-widest bg-primary text-white hover:bg-black">Guardar</button>
              </div>
            </form>
          </div>
        </div>
      )}

{calculatorProject && (() => {
  const proj = calculatorProject;
  const investmentAmount = Number(proj.investment_amount) || 0;
  const annualRental = Number(proj.annual_rental_projection) || 0;
  const marketPrice = Number(proj.market_price) || 0;
  const baseYears = Number(proj.years_contract) || 25;
  const extensionYears = Number(proj.years_extension) || 0;
  const maxBaseYears = baseYears + extensionYears;
  const projCurrency = proj.investment_currency || proj.price_currency || 'EUR';
  const landRatio = (Number(proj.land_ratio) || 30) / 100;
  const landBase = marketPrice * landRatio;
  const buildingValue = marketPrice * (1 - landRatio);
  const MAINTENANCE_PCT = 0.05;
  const DEFAULT_OPEX = 15;

  const CalcContent = () => {
    const [isAdvanced, setIsAdvanced] = React.useState(false);
    const [selectedYears, setSelectedYears] = React.useState(baseYears);
    const [extraYears, setExtraYears] = React.useState(0);
    const [maxAppreciation, setMaxAppreciation] = React.useState(150);
    const [occupancyRate, setOccupancyRate] = React.useState(80);
    const [inflationRate, setInflationRate] = React.useState(3);
    const [opexRate, setOpexRate] = React.useState(DEFAULT_OPEX);
    const [includeResale, setIncludeResale] = React.useState(true);

    const totalLeaseYears = maxBaseYears + extraYears;
    const displayYears = Math.min(selectedYears, totalLeaseYears);
    const totalDeductions = MAINTENANCE_PCT + (opexRate / 100);

    const getLandAppreciation = (year: number) => {
      const maxPct = maxAppreciation / 100;
      const k = 0.35;
      return maxPct * (1 - Math.exp(-k * year));
    };

    const calcYear = (year: number) => {
      const appreciation = getLandAppreciation(year);
      const landAppreciated = landBase * (1 + appreciation);
      const leaseRemaining = totalLeaseYears - year;
      const leaseFactor = leaseRemaining / totalLeaseYears;
      const landVal = landAppreciated * leaseFactor;
      const resaleValue = buildingValue + landVal;
      let cumulativeRentalGross = 0;
      let cumulativeRentalNet = 0;
      for (let j = 0; j < year; j++) {
        const yearlyGross = annualRental * (occupancyRate / 100) * Math.pow(1 + (inflationRate / 100), j);
        cumulativeRentalGross += yearlyGross;
        cumulativeRentalNet += yearlyGross * (1 - totalDeductions);
      }
      const totalReturn = cumulativeRentalNet + (includeResale ? resaleValue : 0) - investmentAmount;
      return { year, landVal, landAppreciated, leaseFactor, resaleValue, cumulativeRentalGross, cumulativeRentalNet, totalReturn };
    };

    const yearlyData = Array.from({ length: displayYears }, (_, i) => calcYear(i + 1));
    const last = yearlyData.length > 0 ? yearlyData[yearlyData.length - 1] : null;
    const totalRentalGross = last ? last.cumulativeRentalGross : 0;
    const totalRentalNet = last ? last.cumulativeRentalNet : 0;
    const resaleEnd = last ? last.resaleValue : 0;
    const totalReturn = last ? last.totalReturn : 0;
    const totalROI = investmentAmount > 0 ? ((totalReturn / investmentAmount) * 100) : 0;
    const annualizedROI = displayYears > 0 ? (totalROI / displayYears) : 0;
    const roiRental = investmentAmount > 0 ? ((totalRentalNet / investmentAmount) * 100) : 0;
    const roiResale = investmentAmount > 0 ? (((resaleEnd - investmentAmount) / investmentAmount) * 100) : 0;
    const maxChart = yearlyData.length > 0 ? Math.max(...yearlyData.map(d => d.cumulativeRentalNet + (includeResale ? d.resaleValue : 0))) : 1;
    const paybackYear = yearlyData.find(d => d.cumulativeRentalNet + (includeResale ? d.resaleValue : 0) >= investmentAmount * 2)?.year || null;

    return (
      <div className="space-y-6">
        <div className="flex justify-center">
          <div className="bg-gray-100 rounded-full p-1 flex gap-1">
            <button onClick={() => setIsAdvanced(false)} className={`px-5 py-2 rounded-full text-xs font-bold uppercase tracking-widest transition ${!isAdvanced ? 'bg-primary text-white shadow' : 'text-primary/50 hover:text-primary'}`}>Simple</button>
            <button onClick={() => setIsAdvanced(true)} className={`px-5 py-2 rounded-full text-xs font-bold uppercase tracking-widest transition ${isAdvanced ? 'bg-primary text-white shadow' : 'text-primary/50 hover:text-primary'}`}>Avanzado</button>
          </div>
        </div>

        <div className={`grid ${isAdvanced ? 'grid-cols-2 md:grid-cols-3 lg:grid-cols-5' : 'grid-cols-2 md:grid-cols-4'} gap-3`}>
          <div className="bg-primary/5 p-4 rounded-xl">
            <p className="text-[9px] font-black uppercase text-primary/40 tracking-widest">Tu inversión</p>
            <p className="text-lg font-serif text-primary">{formatPrice(investmentAmount, projCurrency)}</p>
          </div>
          <div className={`p-4 rounded-xl ${totalReturn >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
            <p className={`text-[9px] font-black uppercase tracking-widest ${totalReturn >= 0 ? 'text-green-600/60' : 'text-red-600/60'}`}>Beneficio neto</p>
            <p className={`text-lg font-serif ${totalReturn >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatPrice(totalReturn, projCurrency)}</p>
          </div>
          <div className="bg-green-50 p-4 rounded-xl">
            <p className="text-[9px] font-black uppercase text-green-600/60 tracking-widest">ROI Alquiler</p>
            <p className="text-lg font-serif text-green-600">{roiRental.toFixed(0)}%</p>
          </div>
          <div className="bg-blue-50 p-4 rounded-xl">
            <p className="text-[9px] font-black uppercase text-blue-600/60 tracking-widest">ROI Reventa</p>
            <p className={`text-lg font-serif ${roiResale >= 0 ? 'text-blue-600' : 'text-red-600'}`}>{roiResale.toFixed(0)}%</p>
          </div>
          {isAdvanced && (
            <div className="bg-purple-50 p-4 rounded-xl">
              <p className="text-[9px] font-black uppercase text-purple-600/60 tracking-widest">ROI Anualizado</p>
              <p className="text-lg font-serif text-purple-600">{annualizedROI.toFixed(1)}%</p>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-green-50/50 border border-green-100 p-3 rounded-xl">
            <p className="text-[9px] font-black uppercase text-green-600/50 tracking-widest">Alquiler neto ({displayYears}a)</p>
            <p className="text-sm font-bold text-green-600">{formatPrice(totalRentalNet, projCurrency)}</p>
            {isAdvanced && <p className="text-[8px] text-green-600/40 mt-1">Bruto: {formatPrice(totalRentalGross, projCurrency)} | Deduc: {((totalDeductions) * 100).toFixed(0)}%</p>}
          </div>
          <div className="bg-blue-50/50 border border-blue-100 p-3 rounded-xl">
            <p className="text-[9px] font-black uppercase text-blue-600/50 tracking-widest">Valor reventa año {displayYears}</p>
            <p className="text-sm font-bold text-blue-600">{formatPrice(resaleEnd, projCurrency)}</p>
            {paybackYear && <p className="text-[8px] text-blue-600/40 mt-1">Payback estimado: año {paybackYear}</p>}
          </div>
        </div>

        <div>
          <div className="flex justify-between items-center mb-2">
            <p className="text-[10px] font-black uppercase text-primary/40 tracking-widest">Horizonte: {displayYears} años</p>
            <div className="flex gap-2 text-[8px] font-bold">
              <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Contrato: {baseYears}a</span>
              {extensionYears > 0 && <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Ext: +{extensionYears}a</span>}
              {extraYears > 0 && <span className="bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">Extra: +{extraYears}a</span>}
            </div>
          </div>
          <div className="relative h-8 flex items-center">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full h-3 rounded-full overflow-hidden bg-gray-100 flex">
                <div className="bg-green-400 h-full" style={{width: `${(baseYears / totalLeaseYears) * 100}%`}}></div>
                <div className="bg-blue-400 h-full" style={{width: `${(extensionYears / totalLeaseYears) * 100}%`}}></div>
                {extraYears > 0 && <div className="bg-orange-300 h-full" style={{width: `${(extraYears / totalLeaseYears) * 100}%`}}></div>}
              </div>
            </div>
            <input type="range" min={1} max={totalLeaseYears} value={displayYears} onChange={(e) => setSelectedYears(parseInt(e.target.value))} className="absolute inset-0 w-full opacity-0 cursor-pointer h-full z-10" />
            <div className="absolute h-6 w-6 bg-primary rounded-full shadow-lg border-2 border-white pointer-events-none z-20 flex items-center justify-center" style={{left: `calc(${((displayYears - 1) / Math.max(totalLeaseYears - 1, 1)) * 100}% - 12px)`}}>
              <span className="text-white text-[8px] font-black">{displayYears}</span>
            </div>
          </div>
        </div>

        <div>
          <p className="text-[10px] font-black uppercase text-primary/40 tracking-widest mb-2">Años extra de lease (opcional)</p>
          <div className="flex gap-2">
            {[0, 5, 10, 15, 20].map(y => (
              <button key={y} onClick={() => setExtraYears(y)} className={`px-3 py-2 rounded-lg text-xs font-bold transition ${extraYears === y ? 'bg-primary text-white' : 'bg-gray-100 text-primary/60 hover:bg-gray-200'}`}>+{y}</button>
            ))}
          </div>
        </div>

        {isAdvanced && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-gray-50 rounded-xl">
              <div>
                <p className="text-[10px] font-black uppercase text-primary/40 tracking-widest mb-1">Aprec. terreno max.</p>
                <input type="range" min={0} max={300} step={10} value={maxAppreciation} onChange={(e) => setMaxAppreciation(parseInt(e.target.value))} className="w-full" />
                <p className="text-xs font-bold text-primary text-center">{maxAppreciation}%</p>
              </div>
              <div>
                <p className="text-[10px] font-black uppercase text-primary/40 tracking-widest mb-1">Ocupación</p>
                <input type="range" min={0} max={100} step={5} value={occupancyRate} onChange={(e) => setOccupancyRate(parseInt(e.target.value))} className="w-full" />
                <p className="text-xs font-bold text-primary text-center">{occupancyRate}%</p>
              </div>
              <div>
                <p className="text-[10px] font-black uppercase text-primary/40 tracking-widest mb-1">Inflación alquiler</p>
                <input type="range" min={0} max={10} step={0.5} value={inflationRate} onChange={(e) => setInflationRate(parseFloat(e.target.value))} className="w-full" />
                <p className="text-xs font-bold text-primary text-center">{inflationRate}%</p>
              </div>
              <div>
                <p className="text-[10px] font-black uppercase text-primary/40 tracking-widest mb-1">OPEX (% alquiler)</p>
                <input type="range" min={0} max={50} step={1} value={opexRate} onChange={(e) => setOpexRate(parseInt(e.target.value))} className="w-full" />
                <p className="text-xs font-bold text-primary text-center">{opexRate}%</p>
              </div>
            </div>
            <div className="flex items-center justify-between p-3 bg-white rounded-xl border border-gray-100">
              <div>
                <p className="text-[10px] font-black uppercase text-primary/40 tracking-widest">Incluir venta del inmueble</p>
                <p className="text-[8px] text-primary/30">Si se desactiva, el beneficio solo cuenta ingresos por alquiler</p>
              </div>
              <button onClick={() => setIncludeResale(!includeResale)} className={`relative w-12 h-6 rounded-full transition-colors ${includeResale ? 'bg-primary' : 'bg-gray-300'}`}>
                <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${includeResale ? 'left-7' : 'left-1'}`}></span>
              </button>
            </div>
          </div>
        )}

        <div>
          <p className="text-[10px] font-black uppercase text-primary/40 tracking-widest mb-3">Evolución del retorno</p>
          <div className="flex items-end gap-[2px] h-40 bg-gray-50 rounded-xl p-3">
            {yearlyData.map((d, i) => {
              const rentalH = maxChart > 0 ? (d.cumulativeRentalNet / maxChart) * 100 : 0;
              const resaleH = includeResale && maxChart > 0 ? (d.resaleValue / maxChart) * 100 : 0;
              const totalH = rentalH + resaleH;
              const scale = totalH > 100 ? 100 / totalH : 1;
              const isBase = d.year <= baseYears;
              const isExt = d.year > baseYears && d.year <= maxBaseYears;
              return (
                <div key={i} className="flex flex-col items-center flex-1 min-w-[6px] group relative">
                  <div className="w-full flex flex-col justify-end" style={{height: '120px'}}>
                    {includeResale && <div className={`w-full rounded-t-sm ${isBase ? 'bg-blue-400' : isExt ? 'bg-blue-300' : 'bg-blue-200'}`} style={{height: `${resaleH * scale}%`}}></div>}
                    <div className={`w-full ${!includeResale ? 'rounded-t-sm' : ''} ${isBase ? 'bg-green-400' : isExt ? 'bg-green-300' : 'bg-green-200'}`} style={{height: `${rentalH * scale}%`}}></div>
                  </div>
                  {(d.year === 1 || d.year === baseYears || d.year === maxBaseYears || d.year === totalLeaseYears || d.year % 5 === 0) && (
                    <span className="text-[7px] text-primary/30 mt-1">{d.year}</span>
                  )}
                  {isAdvanced && (
                    <div className="absolute bottom-full mb-2 bg-primary text-white text-[8px] px-2 py-1 rounded shadow-lg opacity-0 group-hover:opacity-100 transition pointer-events-none whitespace-nowrap z-30">
                      A. {d.year}: Neto {formatPrice(d.cumulativeRentalNet, projCurrency)}{includeResale ? ` | Rev. ${formatPrice(d.resaleValue, projCurrency)}` : ''}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="flex gap-4 mt-2 justify-center">
            <span className="flex items-center gap-1 text-[8px] text-primary/50"><span className="w-3 h-3 bg-green-400 rounded-sm inline-block"></span> Alquiler neto acumulado</span>
            {includeResale && <span className="flex items-center gap-1 text-[8px] text-primary/50"><span className="w-3 h-3 bg-blue-400 rounded-sm inline-block"></span> Valor reventa</span>}
          </div>
        </div>

        {isAdvanced && (
          <div className="bg-gray-50 rounded-xl p-4 space-y-2">
            <p className="text-[10px] font-black uppercase text-primary/40 tracking-widest mb-2">Desglose a {displayYears} años</p>
            <div className="flex justify-between text-sm">
              <span className="text-primary/60">Valor mercado actual</span>
              <span className="font-bold text-primary">{formatPrice(marketPrice, projCurrency)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-primary/60">&ensp;Terreno ({(landRatio * 100).toFixed(0)}%)</span>
              <span className="font-bold text-primary/70">{formatPrice(landBase, projCurrency)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-primary/60">&ensp;Edificio ({((1 - landRatio) * 100).toFixed(0)}%)</span>
              <span className="font-bold text-primary/70">{formatPrice(buildingValue, projCurrency)}</span>
            </div>
            <div className="border-t border-gray-200 my-2"></div>
            <div className="flex justify-between text-sm">
              <span className="text-primary/60">Alquiler bruto acumulado</span>
              <span className="font-bold text-primary/70">{formatPrice(totalRentalGross, projCurrency)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-primary/60">- Mantenimiento (5%)</span>
              <span className="font-bold text-red-400">-{formatPrice(totalRentalGross * MAINTENANCE_PCT, projCurrency)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-primary/60">- OPEX ({opexRate}%)</span>
              <span className="font-bold text-red-400">-{formatPrice(totalRentalGross * (opexRate / 100), projCurrency)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-primary/60">= Alquiler neto acumulado</span>
              <span className="font-bold text-green-600">{formatPrice(totalRentalNet, projCurrency)}</span>
            </div>
            {includeResale && (
              <>
                <div className="border-t border-gray-200 my-2"></div>
                <div className="flex justify-between text-sm">
                  <span className="text-primary/60">Terreno año {displayYears} (aprec. {(getLandAppreciation(displayYears) * 100).toFixed(0)}% x lease {(last ? (last.leaseFactor * 100).toFixed(0) : 0)}%)</span>
                  <span className="font-bold text-primary">{formatPrice(last ? last.landVal : 0, projCurrency)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-primary/60">Edificio año {displayYears} (constante)</span>
                  <span className="font-bold text-primary">{formatPrice(buildingValue, projCurrency)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-primary/60">= Valor reventa total</span>
                  <span className="font-bold text-blue-600">{formatPrice(resaleEnd, projCurrency)}</span>
                </div>
              </>
            )}
            <div className="flex justify-between text-sm pt-2 border-t border-gray-200">
              <span className="font-bold text-primary">BENEFICIO NETO ESTIMADO</span>
              <span className={`font-black text-lg ${totalReturn >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatPrice(totalReturn, projCurrency)}</span>
            </div>
            {paybackYear && (
              <div className="flex justify-between text-sm">
                <span className="text-primary/60">Payback estimado</span>
                <span className="font-bold text-primary">Año {paybackYear}</span>
              </div>
            )}
          </div>
        )}

        <p className="text-[8px] text-primary/30 text-center italic leading-relaxed">* Estimaciones orientativas basadas en proyecciones. El alquiler neto incluye deducciones por mantenimiento (5%) y gastos operativos (OPEX {opexRate}%). El edificio mantiene su valor pero puede requerir reformas periodicas no incluidas. La apreciacion del terreno sigue una curva logaritmica orientativa. La renovacion/extension del lease puede implicar costes adicionales. Unreal Studio no es responsable de las fluctuaciones en los tipos de cambio (FX) ni de variaciones en las condiciones de mercado. Rentabilidades pasadas no garantizan resultados futuros. Consulta con tu asesor.</p>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={(e) => { if (e.target === e.currentTarget) setCalculatorProject(null); }}>
      <div className="bg-white w-full max-w-2xl max-h-[90vh] rounded-3xl shadow-2xl overflow-hidden">
        <div className="px-8 py-5 border-b border-gray-100 flex justify-between items-center sticky top-0 bg-white z-10">
          <div>
            <h2 className="text-xl font-serif text-primary">Calculadora de Inversión</h2>
            <p className="text-sm text-primary/50">{proj.project_name}</p>
          </div>
          <button onClick={() => setCalculatorProject(null)} className="text-gray-400 hover:text-primary transition">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="p-8 overflow-y-auto" style={{maxHeight: 'calc(90vh - 80px)'}}>
          <CalcContent />
        </div>
      </div>
    </div>
  );
})()}
    </div>
  );
};

export default ClientDashboard;