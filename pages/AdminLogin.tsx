import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

const AdminLogin: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Si ya hay una sesión válida, redirigir al dashboard directamente
    const session = localStorage.getItem('_ust_sh_') || sessionStorage.getItem('_ust_sh_');
    if (session) {
      navigate('/admin');
    }
  }, [navigate]);

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
        
        <button onClick={() => navigate('/')} className="mt-8 text-[10px] font-bold uppercase tracking-widest text-primary/40 hover:text-primary transition flex items-center justify-center gap-1 mx-auto">
          <span className="material-symbols-outlined text-xs">arrow_back</span> Volver a la web
        </button>
      </div>
    </div>
  );
};

export default AdminLogin;