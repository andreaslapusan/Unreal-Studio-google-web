import React, { createContext, useContext, useState, useEffect, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, useLocation, Navigate } from 'react-router-dom';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import ManifestSwitcher from './components/ManifestSwitcher';
import PullToRefresh from './components/PullToRefresh';
import GlobalLoading from './components/GlobalLoading';
import LocaleSeo from './components/LocaleSeo';
// FloatingWhatsApp importado bajo demanda (ver Layout); desactivado por defecto.
import { SUPPORTED_LANGS, LangSetter, BareRedirect } from './components/LocaleRoute';
import NotFound from './components/NotFound';
import { PORTAL_SEGMENTS, portalPath, matchPortalPath, type Portal } from './lib/portalUrls';
// Home is eagerly imported because it's the landing route — lazy() would
// add a needless extra round-trip on first paint. Everything else is split:
// each page becomes its own JS chunk, only fetched when the user navigates
// there. Keeps the initial bundle tight and offloads admin/dashboard code
// from public-facing first paint.
import Home from './pages/Home';

// Tras un deploy, los chunks con hash viejo dejan de existir (404/502). Si una
// importación dinámica falla por eso, recargamos UNA vez para traer el index
// nuevo en lugar de mostrar la pantalla de error. Evita romper sesiones abiertas.
function lazyWithReload<T extends React.ComponentType<any>>(factory: () => Promise<{ default: T }>) {
  return lazy(() =>
    factory().catch((err: any) => {
      const msg = String((err && err.message) || '');
      const isChunkError = /dynamically imported module|Importing a module script failed|error loading dynamically imported|Failed to fetch/i.test(msg);
      const last = Number(sessionStorage.getItem('chunk_reload_ts') || 0);
      if (isChunkError && Date.now() - last > 10000) {
        sessionStorage.setItem('chunk_reload_ts', String(Date.now()));
        window.location.reload();
        return new Promise<{ default: T }>(() => {}); // nunca resuelve; la página se recarga
      }
      throw err;
    })
  );
}

const Projects = lazyWithReload(() => import('./pages/Projects'));
const ProjectDetail = lazyWithReload(() => import('./pages/ProjectDetail'));
const Contact = lazyWithReload(() => import('./pages/Contact'));
const AdminLogin = lazyWithReload(() => import('./pages/AdminLogin'));
const AdminDashboard = lazyWithReload(() => import('./pages/AdminDashboard'));
const AdminMarketing = lazyWithReload(() => import('./pages/AdminMarketing'));
const DemoPortal = lazyWithReload(() => import('./pages/DemoPortal'));
const ClientLogin = lazyWithReload(() => import('./pages/ClientLogin'));
const ClientDashboard = lazyWithReload(() => import('./pages/ClientDashboard'));
const Privacy = lazyWithReload(() => import('./pages/Privacy'));
const Terms = lazyWithReload(() => import('./pages/Terms'));
const Blog = lazyWithReload(() => import('./pages/Blog'));
const BlogDetail = lazyWithReload(() => import('./pages/BlogDetail'));
const Faq = lazyWithReload(() => import('./pages/Faq'));
const Booking = lazyWithReload(() => import('./pages/Booking'));
const LandingGlobalitae = lazyWithReload(() => import('./pages/LandingGlobalitae'));
const AgenciasLogin = lazyWithReload(() => import('./pages/AgenciasLogin'));
const AgenciasPartnership = lazyWithReload(() => import('./pages/AgenciasPartnership'));
const AgenciasRegistrar = lazyWithReload(() => import('./pages/AgenciasRegistrar'));
const AgenciasDashboard = lazyWithReload(() => import('./pages/AgenciasDashboard'));
const AgenciasStats = lazyWithReload(() => import('./pages/AgenciasStats'));
const AuthFinish = lazyWithReload(() => import('./pages/AuthFinish'));
const ResetPassword = lazyWithReload(() => import('./pages/ResetPassword'));
const EquipoUpload = lazyWithReload(() => import('./pages/EquipoUpload'));
const EquipoProperties = lazyWithReload(() => import('./pages/EquipoProperties'));
const EmpleadosLogin = lazyWithReload(() => import('./pages/EmpleadosLogin'));
const EmpleadosDashboard = lazyWithReload(() => import('./pages/EmpleadosDashboard'));
const AdminPortalManager = lazyWithReload(() => import('./pages/AdminPortalManager'));
const AdminAgencias = lazyWithReload(() => import('./pages/AdminAgencias'));
const AgencyPack = lazyWithReload(() => import('./pages/AgencyPack'));
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
  // Convierte de fromCurrency a la divisa de visualización seleccionada (SOLO
  // para el catálogo público de Proyectos, donde tiene sentido comparar).
  formatPrice: (amount: number, fromCurrency: CurrencyCode) => string;
  // Formatea en la divisa indicada SIN convertir. Para importes "fijos" como
  // la inversión del cliente y el calendario de pagos: se muestran siempre en
  // la divisa con la que se guardaron, nunca se reconvierten.
  formatMoney: (amount: number, currency: CurrencyCode) => string;
}

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined);

export const useCurrency = () => {
  const context = useContext(CurrencyContext);
  if (!context) throw new Error("useCurrency must be used within a CurrencyProvider");
  return context;
};

const ProtectedRoute = ({ children }: { children?: React.ReactNode }) => {
  // Acceso admin SOLO con sesión Supabase Auth y rol admin/team. Se elimina el
  // atajo por token localStorage `_ust_sh_` (era base64 sin firmar y falsificable).
  const { user, role, loading } = useAuth();
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
  // Las pantallas de LOGIN localizadas (/es/clientes, /en/employees, /es/admin/login…)
  // son portales → sin Navbar/Footer de marketing (igual que las rutas antiguas).
  const isHiddenPath = !!matchPortalPath(location.pathname)
    || location.pathname.startsWith('/admin')
    || location.pathname.startsWith('/cliente')
    || location.pathname.startsWith('/agencias/login')
    || location.pathname.startsWith('/agencias/dashboard')
    || location.pathname.startsWith('/agencias/stats')
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
      {/* FloatingWhatsApp listo pero DESACTIVADO: la web ya tiene un CTA flotante
          (botón "Agendar" del Navbar). Activar solo si Andreas lo aprueba, para no
          meter 2 botones flotantes en su diseño sin su visto bueno.
          {!isHiddenPath && <FloatingWhatsApp />} */}
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
      maximumFractionDigits: 0,
      useGrouping: 'always',
    } as any).format(convertedAmount);
  };

  // Sin conversión: respeta la divisa con la que se guardó el importe.
  const formatMoney = (amount: number, currency: CurrencyCode) => {
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: currency || 'EUR',
      maximumFractionDigits: 0,
      useGrouping: 'always',
    } as any).format(Number(amount) || 0);
  };

  // Páginas de marketing públicas que se sirven con prefijo de idioma
  // (/es/proyectos, /en/proyectos…). Las versiones sin prefijo redirigen al
  // idioma actual. Los portales (admin/cliente/empleados/agencias-login) NO
  // llevan prefijo y se definen aparte más abajo.
  const PUBLIC: { path: string; element: React.ReactNode }[] = [
    { path: '', element: <Home /> },
    { path: 'proyectos', element: <Projects /> },
    { path: 'projects', element: <Projects /> },
    { path: 'proyecto/:slug', element: <ProjectDetail /> },
    { path: 'blog', element: <Blog /> },
    { path: 'blog/:slug', element: <BlogDetail /> },
    { path: 'faq', element: <Faq /> },
    { path: 'preguntas-frecuentes', element: <Faq /> },
    { path: 'agendar', element: <Booking /> },
    { path: 'booking', element: <Booking /> },
    { path: 'contacto', element: <Contact /> },
    { path: 'contact', element: <Contact /> },
    { path: 'privacidad', element: <Privacy /> },
    { path: 'terminos', element: <Terms /> },
    { path: 'agencias', element: <AgenciasPartnership /> },
  ];

  return (
    <CurrencyContext.Provider value={{ currency: currentCurrency, setCurrency: setCurrentCurrency, formatPrice, formatMoney }}>
      <AuthProvider>
      <BrowserRouter>
        <ScrollToTop />
        <ManifestSwitcher />
        <PullToRefresh />
        <GlobalLoading />
        <LocaleSeo />
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
            {/* Marketing público con prefijo de idioma: /es/…, /en/…, /ro/…, /id/… */}
            {SUPPORTED_LANGS.map((l) =>
              PUBLIC.map((r) => (
                <Route
                  key={`${l}/${r.path}`}
                  path={`/${l}${r.path ? '/' + r.path : ''}`}
                  element={<LangSetter lang={l}>{r.element}</LangSetter>}
                />
              ))
            )}
            {/* URLs sin prefijo (enlaces antiguos / <Link> internos) → al idioma actual. */}
            {PUBLIC.map((r) => (
              <Route key={`bare/${r.path}`} path={`/${r.path}`} element={<BareRedirect />} />
            ))}
            <Route path="/lofts-globalitae" element={<LandingGlobalitae />} />
            <Route path="/agencias/login" element={<Navigate to={portalPath('agencias')} replace />} />
            <Route path="/agencias/registrar" element={<AgenciasRegistrar />} />
            <Route path="/agencias/dashboard" element={<AgenciasDashboard />} />
            <Route path="/agencias/stats" element={<AgenciasStats />} />
            {/* Portal Empleados (ÚNICO portal de equipo). Roster único = tabla
                `employees`. Fichaje + vacaciones + edición de propiedades + subir
                partes. Las rutas legacy /manager/* y /equipo/* redirigen aquí para
                no romper enlaces viejos en correos o documentos. */}
            <Route path="/empleados" element={<Navigate to={portalPath('empleados')} replace />} />
            <Route path="/empleados/dashboard" element={<EmpleadosDashboard />} />
            <Route path="/empleados/propiedades" element={<EquipoProperties />} />
            <Route path="/empleados/upload" element={<EquipoUpload />} />
            <Route path="/manager" element={<Navigate to="/empleados" replace />} />
            <Route path="/manager/dashboard" element={<Navigate to="/empleados/dashboard" replace />} />
            <Route path="/manager/propiedades" element={<EquipoProperties />} />
            <Route path="/equipo" element={<Navigate to="/empleados" replace />} />
            <Route path="/equipo/dashboard" element={<Navigate to="/empleados/dashboard" replace />} />
            <Route path="/equipo/upload" element={<EquipoUpload />} />
            <Route path="/auth/finish" element={<AuthFinish />} />
            <Route path="/auth/reset" element={<ResetPassword />} />
            <Route path="/admin/login" element={<Navigate to={portalPath('admin', undefined, 'login')} replace />} />
            <Route path="/admin" element={<ProtectedRoute><AdminDashboard /></ProtectedRoute>} />
            <Route path="/admin/marketing" element={<ProtectedRoute><AdminShell><AdminMarketing /></AdminShell></ProtectedRoute>} />
            <Route path="/admin/portal" element={<ProtectedRoute><AdminShell><AdminPortalManager /></AdminShell></ProtectedRoute>} />
            <Route path="/admin/agencias" element={<ProtectedRoute><AdminShell><AdminAgencias /></AdminShell></ProtectedRoute>} />
            <Route path="/agencias/:slug" element={<AgencyPack />} />
            <Route path="/demo" element={<DemoPortal />} />
            <Route path="/cliente" element={<Navigate to={portalPath('cliente')} replace />} />
            <Route path="/cliente/dashboard" element={<ClientDashboard />} />

            {/* URLs de LOGIN localizadas: /{idioma}/{segmento-traducido}
                (/es/cliente, /en/clients, /ro/clienti, /id/klien, etc.). El prefijo
                fija el idioma (LangSetter). Aditivo: las rutas antiguas siguen y
                redirigen aquí (abajo). El flujo post-login no cambia. */}
            {(SUPPORTED_LANGS as readonly ('es' | 'en' | 'ro' | 'id')[]).flatMap((L) => [
              <Route key={`pl-${L}-cli`} path={`/${L}/${PORTAL_SEGMENTS.cliente[L]}`} element={<LangSetter lang={L}><ClientLogin /></LangSetter>} />,
              <Route key={`pl-${L}-emp`} path={`/${L}/${PORTAL_SEGMENTS.empleados[L]}`} element={<LangSetter lang={L}><EmpleadosLogin /></LangSetter>} />,
              <Route key={`pl-${L}-ag`} path={`/${L}/${PORTAL_SEGMENTS.agencias[L]}`} element={<LangSetter lang={L}><AgenciasLogin /></LangSetter>} />,
              <Route key={`pl-${L}-adm`} path={`/${L}/admin/login`} element={<LangSetter lang={L}><AdminLogin /></LangSetter>} />,
            ])}

            <Route path="*" element={<NotFound />} />
          </Routes>
          </Suspense>
        </Layout>
      </BrowserRouter>
      </AuthProvider>
    </CurrencyContext.Provider>
  );
};

export default App;