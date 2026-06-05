import React, { createContext, useContext, useState, useEffect, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, useLocation, Navigate } from 'react-router-dom';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
// Home is eagerly imported because it's the landing route — lazy() would
// add a needless extra round-trip on first paint. Everything else is split:
// each page becomes its own JS chunk, only fetched when the user navigates
// there. Keeps the initial bundle tight and offloads admin/dashboard code
// from public-facing first paint.
import Home from './pages/Home';
const Projects = lazy(() => import('./pages/Projects'));
const ProjectDetail = lazy(() => import('./pages/ProjectDetail'));
const Contact = lazy(() => import('./pages/Contact'));
const AdminLogin = lazy(() => import('./pages/AdminLogin'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const AdminMarketing = lazy(() => import('./pages/AdminMarketing'));
const ClientLogin = lazy(() => import('./pages/ClientLogin'));
const ClientDashboard = lazy(() => import('./pages/ClientDashboard'));
const Privacy = lazy(() => import('./pages/Privacy'));
const Terms = lazy(() => import('./pages/Terms'));
const Blog = lazy(() => import('./pages/Blog'));
const BlogDetail = lazy(() => import('./pages/BlogDetail'));
const Faq = lazy(() => import('./pages/Faq'));
const Booking = lazy(() => import('./pages/Booking'));
const LandingGlobalitae = lazy(() => import('./pages/LandingGlobalitae'));
const AgenciasLogin = lazy(() => import('./pages/AgenciasLogin'));
const AgenciasPartnership = lazy(() => import('./pages/AgenciasPartnership'));
const AgenciasRegistrar = lazy(() => import('./pages/AgenciasRegistrar'));
const AgenciasDashboard = lazy(() => import('./pages/AgenciasDashboard'));
const AgenciasStats = lazy(() => import('./pages/AgenciasStats'));
const AuthFinish = lazy(() => import('./pages/AuthFinish'));
const EquipoUpload = lazy(() => import('./pages/EquipoUpload'));
const EquipoLogin = lazy(() => import('./pages/EquipoLogin'));
const EquipoDashboard = lazy(() => import('./pages/EquipoDashboard'));
const EmpleadosLogin = lazy(() => import('./pages/EmpleadosLogin'));
const EmpleadosDashboard = lazy(() => import('./pages/EmpleadosDashboard'));
const AdminPortalManager = lazy(() => import('./pages/AdminPortalManager'));
const AdminAgencias = lazy(() => import('./pages/AdminAgencias'));
const AgencyPack = lazy(() => import('./pages/AgencyPack'));
import AdminShell from './components/AdminShell';
import { AuthProvider, useAuth } from './lib/auth-context';
import { CurrencyCode, AppConfig } from './types';
import { DEFAULT_CONFIG } from './constants';
import { supabase } from './lib/supabase';
import { trackPageVisit } from './lib/attribution';
import { trackPageView } from './lib/fbPixel';
import { gtmPageView } from './lib/gtm';

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
  // Acceso admin: token legacy (_ust_sh_) O sesión Supabase Auth con rol admin/team.
  const { user, role, loading } = useAuth();
  const legacy = !!localStorage.getItem('_ust_sh_') || !!sessionStorage.getItem('_ust_sh_');
  if (legacy) return <>{children}</>;
  if (loading) return null;
  if (user && (role === 'admin' || role === 'team')) return <>{children}</>;
  return <Navigate to="/admin/login" replace />;
};

const ScrollToTop = () => {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
};

const AttributionTracker = () => {
  const { pathname, search, hash } = useLocation();
  useEffect(() => {
    // UTM/partner attribution into lead_attributions table
    void trackPageVisit();
    // Meta Pixel virtual pageview for SPA navigation. The initial pageview
    // already fires from index.html on first paint; this captures every
    // subsequent in-app route change.
    trackPageView(pathname);
    // GTM dataLayer pageview — central dispatcher that fans out to GA4,
    // Meta CAPI, Google Ads, etc. (configured tag-side in tagmanager.google.com).
    gtmPageView(pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, search, hash]);
  return null;
};

const Layout = ({ children }: { children?: React.ReactNode }) => {
  const location = useLocation();
  const isHiddenPath = location.pathname.startsWith('/admin')
    || location.pathname.startsWith('/cliente')
    || location.pathname.startsWith('/agencias/login')
    || location.pathname.startsWith('/agencias/dashboard')
    || location.pathname.startsWith('/agencias/stats')
    || location.pathname.startsWith('/inversores')
    || location.pathname.startsWith('/equipo')
    || location.pathname.startsWith('/empleados')
    || location.pathname.startsWith('/manager')
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
      <BrowserRouter>
        <ScrollToTop />
        <AttributionTracker />
        <Layout>
          <Suspense
            fallback={
              <div className="min-h-screen flex items-center justify-center bg-almond">
                <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
              </div>
            }
          >
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/proyectos" element={<Projects />} />
            <Route path="/proyecto/:slug" element={<ProjectDetail />} />
            <Route path="/blog" element={<Blog />} />
            <Route path="/blog/:slug" element={<BlogDetail />} />
            <Route path="/faq" element={<Faq />} />
            <Route path="/preguntas-frecuentes" element={<Faq />} />
            <Route path="/agendar" element={<Booking />} />
            <Route path="/booking" element={<Booking />} />
            <Route path="/contacto" element={<Contact />} />
            <Route path="/privacidad" element={<Privacy />} />
            <Route path="/terminos" element={<Terms />} />
            <Route path="/lofts-globalitae" element={<LandingGlobalitae />} />
            <Route path="/agencias" element={<AgenciasPartnership />} />
            <Route path="/agencias/login" element={<AgenciasLogin />} />
            <Route path="/agencias/registrar" element={<AgenciasRegistrar />} />
            <Route path="/agencias/dashboard" element={<AgenciasDashboard />} />
            <Route path="/agencias/stats" element={<AgenciasStats />} />
            {/* Inversores NO existe como portal aparte: ES el portal de Cliente.
                Redirigimos las rutas viejas a /cliente para no romper enlaces. */}
            <Route path="/inversores" element={<Navigate to="/cliente" replace />} />
            <Route path="/inversores/login" element={<Navigate to="/cliente" replace />} />
            <Route path="/inversores/dashboard" element={<Navigate to="/cliente/dashboard" replace />} />
            {/* Manager Portal — para trabajadores (Agun/Adam/Paris/Marc/Luis/Raul).
                Acceso por magic link al email registrado. NO tienen acceso a /admin.
                Las rutas legacy /equipo/* redirigen a /manager/* para no romper enlaces
                viejos en correos enviados o documentos. */}
            <Route path="/manager" element={<EquipoLogin />} />
            <Route path="/manager/dashboard" element={<EquipoDashboard />} />
            <Route path="/equipo" element={<Navigate to="/manager" replace />} />
            <Route path="/equipo/dashboard" element={<Navigate to="/manager/dashboard" replace />} />
            <Route path="/equipo/upload" element={<EquipoUpload />} />
            {/* Portal Empleados (fichaje check-in/check-out) */}
            <Route path="/empleados" element={<EmpleadosLogin />} />
            <Route path="/empleados/dashboard" element={<EmpleadosDashboard />} />
            <Route path="/auth/finish" element={<AuthFinish />} />
            <Route path="/admin/login" element={<AdminLogin />} />
            <Route path="/admin" element={<ProtectedRoute><AdminDashboard /></ProtectedRoute>} />
            <Route path="/admin/marketing" element={<AdminShell><AdminMarketing /></AdminShell>} />
            <Route path="/admin/portal" element={<AdminShell><AdminPortalManager /></AdminShell>} />
            <Route path="/admin/agencias" element={<ProtectedRoute><AdminShell><AdminAgencias /></AdminShell></ProtectedRoute>} />
            <Route path="/agencias/:slug" element={<AgencyPack />} />
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
          </Suspense>
        </Layout>
      </BrowserRouter>
      </AuthProvider>
    </CurrencyContext.Provider>
  );
};

export default App;