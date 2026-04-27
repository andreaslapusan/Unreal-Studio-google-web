import React, { createContext, useContext, useState, useEffect } from 'react';
import { HashRouter, Routes, Route, useLocation, Navigate } from 'react-router-dom';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import Home from './pages/Home';
import Projects from './pages/Projects';
import ProjectDetail from './pages/ProjectDetail';
import Contact from './pages/Contact';
import AdminLogin from './pages/AdminLogin';
import AdminDashboard from './pages/AdminDashboard';
import ClientLogin from './pages/ClientLogin';
import ClientDashboard from './pages/ClientDashboard';
import Privacy from './pages/Privacy';
import Terms from './pages/Terms';
import Blog from './pages/Blog';
import BlogDetail from './pages/BlogDetail';
import LandingGlobalitae from './pages/LandingGlobalitae';
import AgenciasLogin from './pages/AgenciasLogin';
import AgenciasPartnership from './pages/AgenciasPartnership';
import AgenciasRegistrar from './pages/AgenciasRegistrar';
import AgenciasDashboard from './pages/AgenciasDashboard';
import AgenciasStats from './pages/AgenciasStats';
import InversoresLogin from './pages/InversoresLogin';
import InversoresPartnership from './pages/InversoresPartnership';
import InversoresDashboard from './pages/InversoresDashboard';
import AuthFinish from './pages/AuthFinish';
import EquipoUpload from './pages/EquipoUpload';
import AdminPortalManager from './pages/AdminPortalManager';
import { AuthProvider } from './lib/auth-context';
import { CurrencyCode, AppConfig } from './types';
import { DEFAULT_CONFIG } from './constants';
import { supabase } from './lib/supabase';

interface CurrencyContextType {
  currency: CurrencyCode;
  setCurrency: (code: CurrencyCode) => void;
  formatPrice: (amount: number, fromCurrency: CurrencyCode) => string;
}

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined);

export const useCurrency = () => {
  const context = useContext(CurrencyContext);
  if (!context) throw new Error("useCurrency must be used within a CurrencyProvider");
  return context;
};

const ProtectedRoute = ({ children }: { children?: React.ReactNode }) => {
  // Comprobar tanto en localStorage (Recordar sesión) como sessionStorage (Sesión temporal)
  const isAuth = !!localStorage.getItem('_ust_sh_') || !!sessionStorage.getItem('_ust_sh_');
  if (!isAuth) return <Navigate to="/admin/login" replace />;
  return <>{children}</>;
};

const ScrollToTop = () => {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
};

const Layout = ({ children }: { children?: React.ReactNode }) => {
  const location = useLocation();
  const isHiddenPath = location.pathname.startsWith('/admin')
    || location.pathname.startsWith('/cliente')
    || location.pathname.startsWith('/agencias')
    || location.pathname.startsWith('/inversores')
    || location.pathname.startsWith('/equipo')
    || location.pathname.startsWith('/auth')
    || location.pathname === '/lofts-globalitae';
  return (
    <div className="flex flex-col min-h-screen">
      {!isHiddenPath && <Navbar />}
      <main className="flex-grow">{children}</main>
      {!isHiddenPath && <Footer />}
    </div>
  );
};

const App: React.FC = () => {
  const [currentCurrency, setCurrentCurrency] = useState<CurrencyCode>('EUR');
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);

  useEffect(() => {
    // Cargar configuración desde Supabase
    const fetchConfig = async () => {
      try {
        const { data: configRows } = await supabase.from('app_config').select('*');
        if (configRows && configRows.length > 0) {
          const configObj: Record<string, any> = {};
          configRows.forEach((row: any) => {
            configObj[row.key] = row.value;
          });
          setConfig({ ...DEFAULT_CONFIG, ...configObj });
        }
      } catch (error) {
        console.error("Error loading app config:", error);
      }
    };

    fetchConfig();

    // Cargar tasas de cambio
    const fetchRates = async () => {
      try {
        const res = await fetch('https://open.er-api.com/v6/latest/EUR');
        const data = await res.json();
        if (data && data.rates) {
          const newRates = {
            EUR: 1,
            USD: data.rates.USD || 1.08,
            IDR: data.rates.IDR || 17200,
            GBP: data.rates.GBP || 0.83,
            AUD: data.rates.AUD || 1.65
          };
          setConfig(prev => ({ ...prev, exchangeRates: newRates }));
        }
      } catch (e) {
        console.warn("No se pudieron cargar tasas en tiempo real, usando defaults.");
      }
    };
    fetchRates();
  }, []);

  const formatPrice = (amount: number, fromCurrency: CurrencyCode) => {
    const rates = config.exchangeRates;
    const amountInEur = amount / rates[fromCurrency];
    const convertedAmount = amountInEur * rates[currentCurrency];
    
    // Force 'es-ES' locale to ensure thousands are separated by dots (e.g. 100.000 €)
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: currentCurrency,
      maximumFractionDigits: 0
    }).format(convertedAmount);
  };

  return (
    <CurrencyContext.Provider value={{ currency: currentCurrency, setCurrency: setCurrentCurrency, formatPrice }}>
      <AuthProvider>
      <HashRouter>
        <ScrollToTop />
        <Layout>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/proyectos" element={<Projects />} />
            <Route path="/proyecto/:slug" element={<ProjectDetail />} />
            <Route path="/blog" element={<Blog />} />
            <Route path="/blog/:slug" element={<BlogDetail />} />
            <Route path="/contacto" element={<Contact />} />
            <Route path="/privacidad" element={<Privacy />} />
            <Route path="/terminos" element={<Terms />} />
            <Route path="/lofts-globalitae" element={<LandingGlobalitae />} />
            <Route path="/agencias" element={<AgenciasPartnership />} />
            <Route path="/agencias/login" element={<AgenciasLogin />} />
            <Route path="/agencias/registrar" element={<AgenciasRegistrar />} />
            <Route path="/agencias/dashboard" element={<AgenciasDashboard />} />
            <Route path="/agencias/stats" element={<AgenciasStats />} />
            <Route path="/inversores" element={<InversoresPartnership />} />
            <Route path="/inversores/login" element={<InversoresLogin />} />
            <Route path="/inversores/dashboard" element={<InversoresDashboard />} />
            <Route path="/equipo/upload" element={<EquipoUpload />} />
            <Route path="/auth/finish" element={<AuthFinish />} />
            <Route path="/admin/login" element={<AdminLogin />} />
            <Route path="/admin" element={<ProtectedRoute><AdminDashboard /></ProtectedRoute>} />
            <Route path="/admin/portal" element={<AdminPortalManager />} />
            <Route path="/cliente" element={<ClientLogin />} />
            <Route path="/cliente/dashboard" element={<ClientDashboard />} />
            <Route path="*" element={
              <div className="min-h-screen flex flex-col items-center justify-center bg-almond px-6 text-center">
                <h1 className="text-8xl font-serif text-primary mb-4">404</h1>
                <p className="text-2xl text-primary/70 mb-8">Esta página no existe o ha sido movida.</p>
                <a href="/#/" className="bg-primary text-white px-8 py-4 rounded-full font-bold hover:translate-y-[-2px] transition">
                  Volver al inicio
                </a>
              </div>
            } />
          </Routes>
        </Layout>
      </HashRouter>
      </AuthProvider>
    </CurrencyContext.Provider>
  );
};

export default App;