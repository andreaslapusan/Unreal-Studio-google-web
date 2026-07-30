/**
 * PortalLogin — login UNIFICADO y compartido por los 4 portales
 * (Cliente, Agencias, Team/Empleados, Admin).
 *
 * - Supabase Auth: email + contraseña (signInWithPassword) como método principal.
 * - Extras: ver contraseña (ojo), recordar sesión, recuperar contraseña, magic-link.
 * - Multi-rol: tras login llama a `get_my_portals()` y, si el usuario pertenece a
 *   varios portales, le deja elegir a cuál entrar.
 * - Mismo diseño/header/footer (PortalShell). Sin "Continuar con Google".
 *
 * Cada portal solo cambia el prop `portal` (destino por defecto + título).
 */
import React, { useEffect, useRef, useState } from 'react';
import { synthEmail } from '../lib/portalAuth';
import { startLoading, stopLoading } from '../lib/loading';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth-context';
import PortalShell from './PortalShell';

export type PortalKey = 'cliente' | 'agencias' | 'empleados' | 'admin';

const PORTAL_DASH: Record<PortalKey, string> = {
  cliente: '/cliente/dashboard',
  agencias: '/agencias/dashboard',
  empleados: '/empleados/dashboard',
  admin: '/admin',
};
const PORTAL_LABEL: Record<PortalKey, string> = {
  cliente: 'Clientes',
  agencias: 'Agencias',
  empleados: 'Team',
  admin: 'Admin',
};

const PortalLogin: React.FC<{ portal: PortalKey; dark?: boolean }> = ({ portal, dark }) => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [chooser, setChooser] = useState<PortalKey[] | null>(null);
  // Mientras verificamos una sesión ya existente (recordarme) → spinner, para no
  // mostrar el formulario de login unos segundos y que parezca que no recuerda.
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    document.title = `${PORTAL_LABEL[portal]} | Unreal Studio`;
  }, [portal]);

  // Si llegamos aquí porque el dashboard expulsó una sesión cuyo email/cuenta no
  // tiene acceso a este portal (p.ej. se inició con un email antiguo), mostramos
  // un ERROR claro de "sin acceso". Limpiamos el query de la URL.
  useEffect(() => {
    const e = new URLSearchParams(window.location.search).get('e');
    if (e === 'mismatch' || e === 'noaccess') {
      setError(t('auth.noAccessPortal', {
        portal: PORTAL_LABEL[portal],
        defaultValue: 'Esta cuenta no tiene acceso al portal de {{portal}}. Inicia sesión con tu email actual.',
      }));
      window.history.replaceState(null, '', window.location.pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // "Recordarme": prerrellena email Y contraseña guardados de ESTE portal (Andreas
  // lo pidió expresamente: que la contraseña quede guardada y visible/precargada
  // cuando "recordarme" está activo). Se guarda en localStorage (ofuscada en base64).
  useEffect(() => {
    try {
      const saved = localStorage.getItem(`ust_email_${portal}`);
      if (saved) {
        setEmail(saved); setRemember(true);
        const pw = localStorage.getItem(`ust_pw_${portal}`);
        if (pw) { try { setPassword(atob(pw)); } catch { setPassword(pw); } }
      } else setRemember(localStorage.getItem(`ust_remember_${portal}`) !== '0');
    } catch { /* ignore */ }
  }, [portal]);

  const persistRemember = () => {
    try {
      if (remember) {
        localStorage.setItem(`ust_email_${portal}`, email.trim().toLowerCase());
        try { localStorage.setItem(`ust_pw_${portal}`, btoa(password)); } catch { /* pw no-ascii */ }
        localStorage.removeItem(`ust_remember_${portal}`);
      } else {
        localStorage.removeItem(`ust_email_${portal}`);
        localStorage.removeItem(`ust_pw_${portal}`);
        localStorage.setItem(`ust_remember_${portal}`, '0');
      }
    } catch { /* ignore */ }
  };

  // Evita que routeAfterAuth corra dos veces a la vez (handlePassword + el
  // useEffect de cambio de `user` podrían dispararlo en paralelo → carrera).
  const routingRef = useRef(false);

  // Ya autenticado AL ENTRAR → solo redirigimos si la sesión actual YA
  // pertenece a ESTE portal (atajo cómodo: cliente logueado que pulsa
  // "Cliente" va directo a su dashboard).
  //
  // Si la sesión es de OTRO portal (p.ej. admin pulsando "Cliente" en el
  // footer) NO lo echamos a su portal: dejamos el formulario visible para que
  // entre como cliente sin tener que cerrar sesión a mano primero.
  useEffect(() => {
    if (loading || !user) return;
    void routeIfMember();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loading]);

  async function routeIfMember() {
    if (routingRef.current) return;
    routingRef.current = true;
    setChecking(true);
    try {
      const list = await getPortalsWithRetry();
      // Si pertenece a este portal, O no se pudo verificar (RPC lenta/caída),
      // redirige igualmente: la sesión ya existe y auth+RLS son la barrera real.
      // Así un usuario "recordado" NO se queda atascado en el login por un hipo
      // de la RPC (era la causa de "a veces no me recuerda").
      if (list === null || list.includes(portal)) {
        navigate(PORTAL_DASH[portal], { replace: true });
        return;
      }
      // Verificado y NO pertenece a este portal → se queda en el formulario.
    } finally {
      routingRef.current = false;
      setChecking(false);
    }
  }

  // Pide los portales con timeout generoso (15s) + 1 reintento. Devuelve la
  // lista, o `null` si NO se pudo verificar (sin tirar la sesión).
  async function getPortalsWithRetry(): Promise<PortalKey[] | null> {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const rpcCall = supabase.rpc('get_my_portals');
        const timeout = new Promise<never>((_, rej) =>
          setTimeout(() => rej(new Error('get_my_portals timeout')), 15000)
        );
        const { data, error } = (await Promise.race([rpcCall, timeout])) as { data: unknown; error: unknown };
        if (error) throw error;
        return (((data as string[]) || []).filter(Boolean)) as PortalKey[];
      } catch {
        // reintentar una vez antes de rendirse
      }
    }
    return null;
  }

  // Tras un login EXPLÍCITO en este portal. Requisito del dueño: cada login es
  // SOLO para su portal. Si la cuenta no pertenece a ESTE portal, NO la mandamos
  // a otro ni ofrecemos elegir: cerramos sesión y avisamos.
  async function routeAfterAuth() {
    if (routingRef.current) return;
    routingRef.current = true;
    try {
      const list = await getPortalsWithRetry();

      // Pertenece a ESTE portal → entra. Si no se pudo verificar (RPC lenta/caída)
      // tiramos al dashboard de ESTE portal (su auth + RLS son la barrera real);
      // nunca lo enviamos a OTRO portal.
      if (list === null || list.includes(portal)) {
        // Verificación FUERTE para clientes: el email de la sesión debe mapear a un
        // cliente real (p.ej. si se cambió el email del perfil, get_my_portals puede
        // decir 'cliente' por el metadata pero ya no hay cliente). Sin esto, entraría
        // al dashboard y rebotaría; aquí damos el error claro YA en el formulario.
        if (portal === 'cliente') {
          const { data: cid } = await supabase.rpc('client_my_id');
          if (!cid?.success) {
            try { await supabase.auth.signOut(); } catch { /* ignore */ }
            setError(t('auth.noAccessPortal', { portal: PORTAL_LABEL[portal], defaultValue: 'Esta cuenta no tiene acceso al portal de {{portal}}. Inicia sesión con tu email actual.' }));
            return;
          }
        }
        navigate(PORTAL_DASH[portal], { replace: true });
        return;
      }

      // Verificado y NO pertenece a este portal: no cruzamos de portal. Cerramos
      // la sesión recién creada y avisamos de que no tiene acceso aquí.
      try { await supabase.auth.signOut(); } catch { /* ignore */ }
      setError(t('auth.noAccessPortal', {
        portal: PORTAL_LABEL[portal],
        defaultValue: 'Esta cuenta no tiene acceso al portal de {{portal}}.',
      }));
    } finally {
      routingRef.current = false;
    }
  }

  const handlePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfo('');
    setBusy(true);
    startLoading();
    try {
      const real = email.trim().toLowerCase();
      // Fase B: intenta primero el usuario SINTÉTICO de ESTE portal (contraseña
      // propia por portal); si no existe (cuenta sin migrar), reintenta con el
      // email real → ningún usuario existente pierde acceso.
      let authErr = (await supabase.auth.signInWithPassword({ email: synthEmail(portal, real), password })).error;
      if (authErr) {
        authErr = (await supabase.auth.signInWithPassword({ email: real, password })).error;
      }
      if (authErr) {
        setError(t('auth.invalid'));
        setBusy(false);
        return;
      }
      persistRemember();
      await routeAfterAuth();
    } catch {
      setError(t('auth.genericError'));
    } finally {
      setBusy(false);
      stopLoading();
    }
  };

  const handleMagicLink = async () => {
    setError('');
    setInfo('');
    if (!email.trim().includes('@')) {
      setError(t('auth.enterEmailFirst'));
      return;
    }
    setBusy(true);
    try {
      // Magic link branded por nuestro transporte (el signInWithOtp nativo no
      // entrega: Auth sin SMTP propio). Igual que el reset.
      const { data, error: err } = await supabase.functions.invoke('send-magic-link', {
        body: { email: email.trim().toLowerCase(), portal, lang: i18n.language, redirectTo: `${window.location.origin}/auth/finish?portal=${portal}` },
      });
      if (err) throw err;
      if (!data?.success) {
        setError(data?.error === 'no_account' ? t('fix.login.noAccountForEmail', { portal: PORTAL_LABEL[portal] }) : t('auth.genericError'));
      } else setInfo(t('auth.magicSent'));
    } catch {
      setError(t('auth.genericError'));
    } finally {
      setBusy(false);
    }
  };

  const handleRecover = async () => {
    setError('');
    setInfo('');
    if (!email.trim().includes('@')) {
      setError(t('auth.enterEmailFirst'));
      return;
    }
    setBusy(true);
    try {
      // Reset con plantilla de marca: la edge fn send-password-reset genera el
      // enlace de recovery y manda el email branded desde no.reply@ (el reset
      // nativo de Supabase no entrega: Auth no tiene SMTP propio configurado).
      const { data, error: err } = await supabase.functions.invoke('send-password-reset', {
        body: { email: email.trim().toLowerCase(), portal, lang: i18n.language, redirectTo: `${window.location.origin}/auth/reset?portal=${portal}` },
      });
      if (err) throw err;
      if (!data?.success) {
        setError(data?.error === 'no_account' ? t('fix.login.noAccountForEmail', { portal: PORTAL_LABEL[portal] }) : t('auth.genericError'));
      } else setInfo(t('auth.recoverSent'));
    } catch {
      setError(t('auth.genericError'));
    } finally {
      setBusy(false);
    }
  };

  // Verificando sesión existente (recordarme) → spinner en vez del formulario,
  // para que no aparezca el login unos segundos antes de entrar.
  if (loading || checking) {
    return (
      <PortalShell dark={dark}>
        <div className="bg-white w-full max-w-md rounded-3xl p-10 shadow-2xl border border-primary/5 flex flex-col items-center gap-4">
          <span className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
          <p className="text-sm text-primary/50">{t('auth.loadingSession', { defaultValue: 'Iniciando sesión…' })}</p>
        </div>
      </PortalShell>
    );
  }

  // Selector multi-rol.
  if (chooser) {
    return (
      <PortalShell dark={dark}>
        <div className="bg-white w-full max-w-md rounded-3xl p-8 md:p-10 shadow-2xl border border-primary/5 text-center">
          <h1 className="text-2xl font-serif text-primary mb-2">{t('auth.choosePortalTitle')}</h1>
          <p className="text-sm text-primary/50 mb-6">{t('auth.choosePortalSub')}</p>
          <div className="space-y-3">
            {chooser.map((p) => (
              <button
                key={p}
                onClick={() => navigate(PORTAL_DASH[p])}
                className="w-full bg-primary text-white py-4 rounded-xl font-bold uppercase tracking-widest text-xs hover:bg-black transition"
              >
                {t(`auth.portal_${p}`)}
              </button>
            ))}
          </div>
        </div>
      </PortalShell>
    );
  }

  return (
    <PortalShell dark={dark}>
      <div className="bg-white w-full max-w-md rounded-3xl p-8 md:p-10 shadow-2xl border border-primary/5">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-serif text-primary mb-1">{t(`auth.portal_${portal}`)}</h1>
          <p className="text-[10px] font-bold uppercase tracking-widest text-primary/40">{t('auth.subtitle')}</p>
        </div>

        <form onSubmit={handlePassword} className="space-y-5">
          {error && <div className="bg-red-50 text-red-600 text-sm font-bold p-4 rounded-xl text-center">{error}</div>}
          {info && <div className="bg-green-50 text-green-700 text-sm font-bold p-4 rounded-xl text-center">{info}</div>}

          <div>
            <label className="block text-[10px] font-black uppercase text-gray-400 tracking-widest mb-2">
              {t('auth.email')}
            </label>
            <input
              type="email"
              required
              name="email"
              id="login-email"
              autoComplete="username"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@email.com"
              className="w-full px-4 sm:px-5 py-4 bg-gray-50 rounded-2xl font-bold text-sm sm:text-base border border-gray-200 focus:border-primary focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-[10px] font-black uppercase text-gray-400 tracking-widest mb-2">
              {t('auth.password')}
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                name="password"
                id="login-password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-5 py-4 pr-14 bg-gray-50 rounded-2xl font-bold border border-gray-200 focus:border-primary focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-primary/40 hover:text-primary transition p-1"
              >
                <span className="material-symbols-outlined">{showPassword ? 'visibility_off' : 'visibility'}</span>
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs">
            <label className="flex items-center gap-2 cursor-pointer text-primary/60">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="rounded border-gray-300" />
              {t('auth.remember')}
            </label>
            <button type="button" onClick={handleRecover} className="text-primary/60 hover:text-primary underline">
              {t('auth.forgot')}
            </button>
          </div>

          <button
            type="submit"
            disabled={busy}
            className="w-full bg-primary text-white py-4 rounded-xl font-bold uppercase tracking-widest text-xs shadow-lg hover:bg-black transition disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {busy ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : null}
            {t('auth.signin')}
          </button>

          <div className="flex items-center gap-3 my-2">
            <span className="flex-1 h-px bg-primary/10" />
            <span className="text-[10px] text-primary/40 uppercase tracking-widest">{t('auth.or')}</span>
            <span className="flex-1 h-px bg-primary/10" />
          </div>

          <button
            type="button"
            onClick={handleMagicLink}
            disabled={busy}
            className="w-full bg-white border border-primary/20 text-primary py-4 rounded-xl font-bold uppercase tracking-widest text-xs hover:bg-primary/5 transition disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <span className="material-symbols-outlined text-sm">mail</span>
            {t('auth.magicLink')}
          </button>
        </form>
      </div>
    </PortalShell>
  );
};

export default PortalLogin;
