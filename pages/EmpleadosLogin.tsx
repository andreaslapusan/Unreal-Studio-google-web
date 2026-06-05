/**
 * /empleados — Login del portal Team (email + contraseña).
 *
 * Las cuentas las crea el admin desde el portal Admin (Supabase Auth).
 * Lleva header (logo + selector de idioma) y footer, como el resto de logins.
 */
import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth-context';
import LanguageSwitcher from '../components/LanguageSwitcher';
import Footer from '../components/Footer';

const EmpleadosLogin: React.FC = () => {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    document.title = 'Team | Unreal Studio';
  }, []);

  useEffect(() => {
    if (!loading && user) navigate('/empleados/dashboard', { replace: true });
  }, [user, loading, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const { error: authErr } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (authErr) {
        setError('Email o contraseña incorrectos.');
        setBusy(false);
        return;
      }
      navigate('/empleados/dashboard', { replace: true });
    } catch {
      setError('No se pudo iniciar sesión. Inténtalo de nuevo.');
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-almond">
      <header className="flex items-center justify-between px-6 md:px-12 py-5 border-b border-primary/5">
        <Link to="/" className="font-serif text-xl font-bold text-primary tracking-tight">
          Unreal Studio
        </Link>
        <LanguageSwitcher />
      </header>

      <main className="flex-grow flex items-center justify-center px-6 py-12">
        <div className="bg-white w-full max-w-md rounded-3xl p-8 md:p-10 shadow-2xl border border-primary/5">
          <div className="text-center mb-8">
            <span className="material-symbols-outlined text-4xl text-primary mb-3 block">badge</span>
            <h1 className="text-3xl font-serif text-primary mb-1">Team</h1>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="bg-red-50 text-red-600 text-sm font-bold p-4 rounded-xl text-center">{error}</div>
            )}
            <div>
              <label className="block text-[10px] font-black uppercase text-gray-400 tracking-widest mb-2">
                Email de trabajo
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
                Contraseña
              </label>
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-5 py-4 bg-gray-50 rounded-2xl font-bold border border-gray-200 focus:border-primary focus:outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={busy}
              className="w-full bg-primary text-white py-4 rounded-xl font-bold uppercase tracking-widest text-xs shadow-lg hover:bg-black transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {busy ? (
                <>
                  <span className="material-symbols-outlined animate-spin text-sm">refresh</span>
                  Entrando…
                </>
              ) : (
                'Entrar'
              )}
            </button>
          </form>
          <p className="text-center text-xs text-primary/30 mt-8">
            ¿Sin acceso? Pídele tus datos a tu responsable.
          </p>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default EmpleadosLogin;
