/**
 * /empleados — Login del portal de Empleados (fichaje).
 *
 * Flujo: el empleado introduce su email. Se valida contra la allowlist
 * (RPC `is_active_employee`); si está autorizado se le envía un magic-link
 * de Supabase Auth con redirect a /auth/finish, que enruta a
 * /empleados/dashboard. No hay contraseñas.
 */
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth-context';

const EmpleadosLogin: React.FC = () => {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [message, setMessage] = useState('');

  useEffect(() => {
    document.title = 'Portal Empleados | Unreal Studio';
  }, []);

  // Ya autenticado → al dashboard.
  useEffect(() => {
    if (!loading && user) navigate('/empleados/dashboard', { replace: true });
  }, [user, loading, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = email.trim().toLowerCase();
    if (!clean.includes('@')) {
      setStatus('error');
      setMessage('Introduce un email válido.');
      return;
    }
    setStatus('sending');
    setMessage('');
    try {
      const { data: allowed, error: rpcErr } = await supabase.rpc('is_active_employee', {
        p_email: clean,
      });
      if (rpcErr) throw rpcErr;
      if (!allowed) {
        setStatus('error');
        setMessage('Este email no está autorizado. Pide acceso a tu responsable.');
        return;
      }
      const redirect = `${window.location.origin}/auth/finish`;
      const { error } = await supabase.auth.signInWithOtp({
        email: clean,
        options: { emailRedirectTo: redirect, shouldCreateUser: true },
      });
      if (error) throw error;
      setStatus('sent');
    } catch (err) {
      setStatus('error');
      setMessage('No se pudo enviar el enlace. Inténtalo de nuevo.');
    }
  };

  return (
    <div className="min-h-screen bg-almond flex items-center justify-center px-6">
      <div className="bg-white w-full max-w-md rounded-3xl p-8 md:p-10 shadow-2xl border border-primary/5">
        <div className="text-center mb-8">
          <span className="material-symbols-outlined text-4xl text-primary mb-3 block">badge</span>
          <h1 className="text-3xl font-serif text-primary mb-1">Portal Empleados</h1>
          <p className="text-sm text-primary/50">Fichaje de entrada y salida · Check-in / Check-out</p>
        </div>

        {status === 'sent' ? (
          <div className="text-center">
            <div className="bg-green-50 text-green-700 font-bold p-5 rounded-2xl mb-4">
              <span className="material-symbols-outlined text-2xl block mb-1">mark_email_read</span>
              Te enviamos un enlace a <b>{email.trim().toLowerCase()}</b>.
            </div>
            <p className="text-sm text-primary/50">
              Ábrelo en este móvil para entrar. Si no lo ves, revisa spam.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            {status === 'error' && (
              <div className="bg-red-50 text-red-600 text-sm font-bold p-4 rounded-xl text-center">
                {message}
              </div>
            )}
            <div>
              <label className="block text-[10px] font-black uppercase text-gray-400 tracking-widest mb-2">
                Tu email de trabajo
              </label>
              <input
                type="email"
                required
                autoComplete="email"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nombre@unrealstudiobali.com"
                className="w-full px-5 py-4 bg-gray-50 rounded-2xl font-bold border border-gray-200 focus:border-primary focus:outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={status === 'sending'}
              className="w-full bg-primary text-white py-4 rounded-xl font-bold uppercase tracking-widest text-xs shadow-lg hover:bg-black transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {status === 'sending' ? (
                <>
                  <span className="material-symbols-outlined animate-spin text-sm">refresh</span>
                  Enviando…
                </>
              ) : (
                'Enviarme enlace de acceso'
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default EmpleadosLogin;
