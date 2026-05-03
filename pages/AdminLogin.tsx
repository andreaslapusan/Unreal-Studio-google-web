import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth-context';

const AdminLogin: React.FC = () => {
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
        setError('Acceso denegado. Credenciales incorrectas.');
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

      navigate('/admin');
    } catch (err) {
      console.error('Login error:', err);
      setError('Error de conexión o credenciales inválidas.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-primary flex items-center justify-center p-6">
      <div className="bg-almond p-8 md:p-12 rounded-3xl shadow-2xl max-w-md w-full text-center border border-white/10 animate-in zoom-in-95 duration-500">
        <div className="mb-8 flex flex-col items-center">
          <h1 className="font-serif text-4xl font-bold text-primary mb-4">Unreal Studio</h1>
          <p className="text-[10px] font-bold uppercase tracking-widest text-primary/40">CMS - Acceso Restringido</p>
        </div>
        
        <form onSubmit={handleLogin} className="space-y-6">
          <div className="text-left">
            <label className="block text-[10px] font-black uppercase tracking-widest text-primary/60 mb-2">Usuario</label>
            <div className="relative">
              <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-primary/30 text-xl">person</span>
              <input 
                type="text" 
                required
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  if(error) setError('');
                }}
                className="w-full pl-12 pr-5 py-4 rounded-xl bg-white border border-primary/10 outline-none transition text-primary font-bold focus:ring-2 focus:ring-primary/10"
                placeholder="USUARIO"
                disabled={loading}
              />
            </div>
          </div>

          <div className="text-left">
            <label className="block text-[10px] font-black uppercase tracking-widest text-primary/60 mb-2">Contraseña</label>
            <div className="relative">
              <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-primary/30 text-xl">lock</span>
              <input 
                type={showPassword ? "text" : "password"} 
                required
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
              <span className="text-[10px] font-black uppercase tracking-widest text-primary/40 group-hover:text-primary transition">Recordar mi sesión</span>
            </label>
          </div>
          
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
            {loading ? 'Verificando...' : 'Entrar al Panel'}
          </button>
        </form>

        <div className="flex items-center gap-3 my-6">
          <span className="flex-1 h-px bg-primary/15" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-primary/40">o entra con Supabase</span>
          <span className="flex-1 h-px bg-primary/15" />
        </div>

        {magicStatus === 'sent' ? (
          <div className="bg-green-50 border border-green-200 text-green-900 p-4 rounded-xl text-left">
            <p className="text-[10px] font-black uppercase tracking-widest">Magic link enviado</p>
            <p className="text-xs mt-1 font-medium">Abre el correo de <strong>{magicEmail}</strong> y haz click en el enlace.</p>
          </div>
        ) : (
          <form onSubmit={handleMagicLink} className="space-y-4 text-left">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-primary/60 mb-2">Email para magic link</label>
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
              {magicStatus === 'sending' ? 'Enviando…' : 'Enviar magic link'}
            </button>
          </form>
        )}

        <button
          type="button"
          onClick={handleGoogle}
          className="w-full mt-4 flex items-center justify-center gap-3 bg-white border border-primary/20 text-primary py-3 rounded-xl font-bold text-sm hover:bg-primary/5 transition"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
            <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.616z" fill="#4285F4"/>
            <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.331C2.438 15.983 5.482 18 9 18z" fill="#34A853"/>
            <path d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.962H.957A8.997 8.997 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.331z" fill="#FBBC05"/>
            <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.962L3.964 7.293C4.672 5.166 6.656 3.58 9 3.58z" fill="#EA4335"/>
          </svg>
          Continuar con Google
        </button>

        {magicError && <p className="text-red-600 text-xs mt-3">{magicError}</p>}

        <button onClick={() => navigate('/')} className="mt-8 text-[10px] font-bold uppercase tracking-widest text-primary/40 hover:text-primary transition flex items-center justify-center gap-1 mx-auto">
          <span className="material-symbols-outlined text-xs">arrow_back</span> Volver a la web
        </button>
      </div>
    </div>
  );
};

export default AdminLogin;