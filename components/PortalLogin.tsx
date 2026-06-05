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
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth-context';
import PortalShell from './PortalShell';

export type PortalKey = 'cliente' | 'agencias' | 'empleados' | 'inversores' | 'admin';

const PORTAL_DASH: Record<PortalKey, string> = {
  cliente: '/cliente/dashboard',
  agencias: '/agencias/dashboard',
  empleados: '/empleados/dashboard',
  inversores: '/inversores/dashboard',
  admin: '/admin',
};
const PORTAL_LABEL: Record<PortalKey, string> = {
  cliente: 'Clientes',
  agencias: 'Agencias',
  empleados: 'Team',
  inversores: 'Inversores',
  admin: 'Admin',
};

const PortalLogin: React.FC<{ portal: PortalKey; dark?: boolean }> = ({ portal, dark }) => {
  const { t } = useTranslation();
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

  useEffect(() => {
    document.title = `${PORTAL_LABEL[portal]} | Unreal Studio`;
  }, [portal]);

  // Evita que routeAfterAuth corra dos veces a la vez (handlePassword + el
  // useEffect de cambio de `user` podrían dispararlo en paralelo → carrera).
  const routingRef = useRef(false);

  // Ya autenticado → resolver portales.
  useEffect(() => {
    if (!loading && user) void routeAfterAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loading]);

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

  async function routeAfterAuth() {
    if (routingRef.current) return;
    routingRef.current = true;
    try {
      const list = await getPortalsWithRetry();

      // No se pudo verificar (RPC lenta/caída en conexiones lentas). NUNCA
      // cerramos sesión por esto — sería echar a un empleado legítimo por una
      // verificación lenta. Llevamos al portal pedido; el dashboard + las RLS
      // de la base de datos son la barrera de seguridad real.
      if (list === null) {
        navigate(PORTAL_DASH[portal], { replace: true });
        return;
      }
      // Pertenece a ESTE portal → entra.
      if (list.includes(portal)) {
        navigate(PORTAL_DASH[portal], { replace: true });
        return;
      }
      // Tiene exactamente UN portal (otro) → lo llevamos al suyo (no lo echamos).
      if (list.length === 1) {
        navigate(PORTAL_DASH[list[0]], { replace: true });
        return;
      }
      // Varios portales → que elija.
      if (list.length > 1) {
        setChooser(list);
        return;
      }
      // Lista VACÍA y verificada → de verdad no tiene ningún portal: aquí sí
      // cerramos la sesión huérfana.
      try { await supabase.auth.signOut(); } catch { /* ignore */ }
      setError(t('auth.noPortals'));
    } finally {
      routingRef.current = false;
    }
  }

  const handlePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfo('');
    setBusy(true);
    try {
      const { error: authErr } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (authErr) {
        setError(t('auth.invalid'));
        setBusy(false);
        return;
      }
      await routeAfterAuth();
    } catch {
      setError(t('auth.genericError'));
    } finally {
      setBusy(false);
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
      const { error: err } = await supabase.auth.signInWithOtp({
        email: email.trim().toLowerCase(),
        options: { emailRedirectTo: `${window.location.origin}/auth/finish` },
      });
      if (err) throw err;
      setInfo(t('auth.magicSent'));
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
      const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
        redirectTo: `${window.location.origin}/auth/finish`,
      });
      if (err) throw err;
      setInfo(t('auth.recoverSent'));
    } catch {
      setError(t('auth.genericError'));
    } finally {
      setBusy(false);
    }
  };

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
              autoComplete="username"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nombre@unrealstudiobali.com"
              className="w-full px-5 py-4 bg-gray-50 rounded-2xl font-bold border border-gray-200 focus:border-primary focus:outline-none"
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
            {busy ? <span className="material-symbols-outlined animate-spin text-sm">refresh</span> : null}
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
