import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation, Trans } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth-context';
import { gtmLogin } from '../lib/gtm';
import PortalShell from '../components/PortalShell';

const AdminLogin: React.FC = () => {
  const { t } = useTranslation();
  const { sendMagicLink, signInWithGoogle, user, role } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [magicEmail, setMagicEmail] = useState('');
  const [magicStatus, setMagicStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [magicError, setMagicError] = useState('');
  const [forgotOpen, setForgotOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const session = localStorage.getItem('_ust_sh_') || sessionStorage.getItem('_ust_sh_');
    if (session) {
      navigate('/admin');
      return;
    }
    if (user && (role === 'admin' || role === 'team')) {
      navigate('/admin/marketing');
    }
  }, [navigate, user, role]);

  const handleGoogle = async () => {
    setMagicError('');
    try {
      gtmLogin({ method: 'google' });
      await signInWithGoogle();
    } catch (err) {
      setMagicError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!magicEmail.includes('@')) return;
    setMagicStatus('sending');
    setMagicError('');
    try {
      await sendMagicLink(magicEmail);
      gtmLogin({ method: 'magic_link' });
      setMagicStatus('sent');
    } catch (err) {
      setMagicStatus('error');
      setMagicError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
      const { data, error } = await supabase.rpc('verify_admin_login', {
        p_username: username,
        p_password: password
      });

      if (error || !data || !data.success) {
        setError(t('admin.login.errorInvalid'));
        setPassword('');
        setLoading(false);
        return;
      }

      const validUser = data;
      // Generar token de sesión simple basado en ID y timestamp
      const sessionToken = btoa(`session_${validUser.user_id}_${username.toLowerCase().trim()}_${Date.now()}`);
      
      // Limpiar sesiones anteriores por seguridad
      localStorage.removeItem('_ust_sh_');
      sessionStorage.removeItem('_ust_sh_');

      if (rememberMe) {
        localStorage.setItem('_ust_sh_', sessionToken);
      } else {
        sessionStorage.setItem('_ust_sh_', sessionToken);
      }

      // Ask the browser's password manager to remember these credentials.
      // Safe-guarded: not all browsers expose PasswordCredential (Safari/older).
      try {
        const w = window as unknown as { PasswordCredential?: new (init: { id: string; password: string; name?: string }) => Credential };
        if (w.PasswordCredential && navigator.credentials?.store) {
          const cred = new w.PasswordCredential({
            id: username.trim(),
            password,
            name: username.trim(),
          });
          await navigator.credentials.store(cred);
        }
      } catch {
        // Browser doesn't support it or denied — autocomplete attributes are
        // already enough for native save prompts. Silent fallback.
      }

      navigate('/admin');
    } catch (err) {
      console.error('Login error:', err);
      setError(t('admin.login.errorConnection'));
      setLoading(false);
    }
  };

  return (
    <PortalShell dark>
      <div className="bg-almond p-8 md:p-12 rounded-3xl shadow-2xl max-w-md w-full text-center border border-white/10 animate-in zoom-in-95 duration-500">
        <div className="mb-8 flex flex-col items-center">
          <h1 className="font-serif text-4xl font-bold text-primary mb-4">Unreal Studio</h1>
          <p className="text-[10px] font-bold uppercase tracking-widest text-primary/40">{t('admin.login.title')}</p>
        </div>
        
        <form
          onSubmit={handleLogin}
          className="space-y-6"
          method="post"
          action="/admin/login"
          autoComplete="on"
        >
          <div className="text-left">
            <label htmlFor="admin-username" className="block text-[10px] font-black uppercase tracking-widest text-primary/60 mb-2">{t('admin.login.username')}</label>
            <div className="relative">
              <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-primary/30 text-xl">person</span>
              <input
                id="admin-username"
                name="username"
                type="text"
                required
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  if(error) setError('');
                }}
                className="w-full pl-12 pr-5 py-4 rounded-xl bg-white border border-primary/10 outline-none transition text-primary font-bold focus:ring-2 focus:ring-primary/10"
                placeholder={t('admin.login.usernamePlaceholder')}
                disabled={loading}
              />
            </div>
          </div>

          <div className="text-left">
            <label htmlFor="admin-password" className="block text-[10px] font-black uppercase tracking-widest text-primary/60 mb-2">{t('admin.login.password')}</label>
            <div className="relative">
              <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-primary/30 text-xl">lock</span>
              <input
                id="admin-password"
                name="password"
                type={showPassword ? "text" : "password"}
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if(error) setError('');
                }}
                className="w-full pl-12 pr-14 py-4 rounded-xl bg-white border border-primary/10 outline-none transition text-primary font-bold focus:ring-2 focus:ring-primary/10"
                placeholder="••••••••"
                disabled={loading}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-primary/40 hover:text-primary transition p-1"
                title={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
              >
                <span className="material-symbols-outlined">
                  {showPassword ? 'visibility_off' : 'visibility'}
                </span>
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between px-1">
            <label className="flex items-center gap-2 cursor-pointer group">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-4 h-4 rounded border-primary/20 text-primary focus:ring-primary/20 cursor-pointer"
                disabled={loading}
              />
              <span className="text-[10px] font-black uppercase tracking-widest text-primary/40 group-hover:text-primary transition">{t('admin.login.rememberMe')}</span>
            </label>
            <button
              type="button"
              onClick={() => setForgotOpen(!forgotOpen)}
              className="text-[10px] font-black uppercase tracking-widest text-primary/40 hover:text-primary transition"
            >
              {t('admin.login.forgotPassword')}
            </button>
          </div>

          {forgotOpen && (
            <div className="bg-primary/5 border border-primary/10 rounded-xl p-4 text-left text-[11px] text-primary/80 space-y-2 animate-in fade-in slide-in-from-top-2">
              <p className="font-black uppercase tracking-widest text-[10px] text-primary">{t('admin.login.recoveryTitle')}</p>
              <p>{t('admin.login.recoveryIntro')}</p>
              <ol className="list-decimal list-inside space-y-1 pl-1">
                <li><Trans i18nKey="admin.login.recoveryMagic" /></li>
                <li><Trans i18nKey="admin.login.recoveryGoogle" /></li>
                <li><Trans i18nKey="admin.login.recoveryManual" /></li>
              </ol>
              <p className="pt-1 text-primary/60">{t('admin.login.recoveryHint')}</p>
            </div>
          )}
          
          {error && (
            <div className="bg-red-50 border border-red-100 p-3 rounded-xl animate-in fade-in slide-in-from-top-2">
              <p className="text-red-600 text-[10px] font-black uppercase tracking-widest">{error}</p>
            </div>
          )}
          
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary text-white py-4 rounded-xl font-black uppercase tracking-widest shadow-xl hover:bg-black transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-70 disabled:pointer-events-none"
          >
            {loading ? t('admin.login.submitting') : t('admin.login.submit')}
          </button>
        </form>

        <div className="flex items-center gap-3 my-6">
          <span className="flex-1 h-px bg-primary/15" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-primary/40">{t('admin.login.orSupabase')}</span>
          <span className="flex-1 h-px bg-primary/15" />
        </div>

        {magicStatus === 'sent' ? (
          <div className="bg-green-50 border border-green-200 text-green-900 p-4 rounded-xl text-left">
            <p className="text-[10px] font-black uppercase tracking-widest">{t('admin.login.magicSentTitle')}</p>
            <p className="text-xs mt-1 font-medium"><Trans i18nKey="admin.login.magicSentBody" values={{ email: magicEmail }} /></p>
          </div>
        ) : (
          <form onSubmit={handleMagicLink} className="space-y-4 text-left">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-primary/60 mb-2">{t('admin.login.magicEmail')}</label>
              <input
                type="email"
                value={magicEmail}
                onChange={(e) => setMagicEmail(e.target.value)}
                placeholder="tu@email.com"
                className="w-full px-4 py-3 rounded-xl bg-white border border-primary/10 outline-none text-primary font-medium focus:ring-2 focus:ring-primary/10"
              />
            </div>
            <button
              type="submit"
              disabled={magicStatus === 'sending'}
              className="w-full bg-primary/90 text-white py-3 rounded-xl font-black uppercase tracking-widest text-[10px] hover:bg-primary transition disabled:opacity-50"
            >
              {magicStatus === 'sending' ? t('admin.login.magicSending') : t('admin.login.magicSend')}
            </button>
          </form>
        )}

        {magicError && <p className="text-red-600 text-xs mt-3">{magicError}</p>}

        <button onClick={() => navigate('/')} className="mt-8 text-[10px] font-bold uppercase tracking-widest text-primary/40 hover:text-primary transition flex items-center justify-center gap-1 mx-auto">
          <span className="material-symbols-outlined text-xs">arrow_back</span> {t('admin.login.backHome')}
        </button>
      </div>
    </PortalShell>
  );
};

export default AdminLogin;