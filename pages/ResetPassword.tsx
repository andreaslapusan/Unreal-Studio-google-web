/**
 * /auth/reset — página para fijar una NUEVA contraseña tras pulsar el enlace del
 * email de "restablecer contraseña" (lo manda la edge fn send-password-reset con
 * la plantilla de marca). El enlace de recovery trae los tokens en el hash; los
 * canjeamos por sesión y mostramos el formulario de nueva contraseña.
 */
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

function extractTokens(href: string): { access_token: string; refresh_token: string } | null {
  const hashIdx = href.indexOf('#');
  if (hashIdx < 0) return null;
  const params = new URLSearchParams(href.slice(hashIdx + 1));
  const access_token = params.get('access_token');
  const refresh_token = params.get('refresh_token');
  if (!access_token || !refresh_token) return null;
  return { access_token, refresh_token };
}

const ResetPassword: React.FC = () => {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [fatal, setFatal] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [show, setShow] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const tokens = extractTokens(window.location.href);
    if (tokens) {
      void supabase.auth.setSession(tokens).then(({ error }) => {
        if (error) setFatal('El enlace ha expirado o ya se usó.');
        else { setReady(true); window.history.replaceState({}, '', window.location.pathname); }
      }).catch(() => setFatal('El enlace ha expirado o ya se usó.'));
    } else {
      void supabase.auth.getSession().then(({ data }) => {
        if (data.session) setReady(true);
        else setFatal('Enlace no válido. Solicita uno nuevo desde la pantalla de acceso.');
      });
    }
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    if (pw.length < 8) { setErr('La contraseña debe tener al menos 8 caracteres.'); return; }
    if (pw !== pw2) { setErr('Las contraseñas no coinciden.'); return; }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) { setErr('No se pudo actualizar. El enlace puede haber caducado; pide uno nuevo.'); return; }
    setDone(true);
    setTimeout(() => navigate('/cliente', { replace: true }), 2600);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-almond px-6 py-12">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-sm p-8 md:p-10">
        <div className="text-center mb-6">
          <span className="font-serif text-3xl font-bold text-primary tracking-tight">Unreal Studio</span>
          <p className="font-serif italic text-primary/50 text-xs mt-1">Beyond the Ordinary, Inside the Unreal</p>
        </div>

        {fatal ? (
          <div className="text-center">
            <h1 className="text-xl font-serif text-primary mb-3">Algo no va bien</h1>
            <p className="text-sm text-red-700 mb-5">{fatal}</p>
            <a href="/cliente" className="inline-block bg-primary text-white px-5 py-3 rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-black transition">Volver al acceso</a>
          </div>
        ) : done ? (
          <div className="text-center">
            <span className="material-symbols-outlined text-green-600 text-5xl mb-2">check_circle</span>
            <h1 className="text-xl font-serif text-primary mb-2">Contraseña actualizada</h1>
            <p className="text-sm text-primary/60">Te llevamos a tu portal…</p>
          </div>
        ) : !ready ? (
          <p className="text-center text-sm text-primary/50 py-6">Validando tu enlace…</p>
        ) : (
          <form onSubmit={submit}>
            <h1 className="text-2xl font-serif text-primary mb-1 text-center">Nueva contraseña</h1>
            <p className="text-sm text-primary/50 mb-6 text-center">Elige una contraseña nueva para tu cuenta.</p>

            <label className="block text-[11px] font-black uppercase tracking-widest text-primary/50 mb-1">Contraseña</label>
            <div className="relative mb-3">
              <input
                type={show ? 'text' : 'password'}
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                autoComplete="new-password"
                className="w-full bg-almond/40 border border-primary/10 rounded-xl px-4 py-3 text-primary outline-none focus:border-primary/40"
                placeholder="Mínimo 8 caracteres"
              />
              <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-primary/40 hover:text-primary">
                <span className="material-symbols-outlined text-lg">{show ? 'visibility_off' : 'visibility'}</span>
              </button>
            </div>

            <label className="block text-[11px] font-black uppercase tracking-widest text-primary/50 mb-1">Repetir contraseña</label>
            <input
              type={show ? 'text' : 'password'}
              value={pw2}
              onChange={(e) => setPw2(e.target.value)}
              autoComplete="new-password"
              className="w-full bg-almond/40 border border-primary/10 rounded-xl px-4 py-3 text-primary outline-none focus:border-primary/40 mb-4"
              placeholder="Repite la contraseña"
            />

            {err && <p className="text-sm text-red-700 mb-3">{err}</p>}

            <button type="submit" disabled={busy} className="w-full bg-primary text-white py-3.5 rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-black transition disabled:opacity-50">
              {busy ? 'Guardando…' : 'Guardar contraseña'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default ResetPassword;
