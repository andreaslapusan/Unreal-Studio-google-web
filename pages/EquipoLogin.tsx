/**
 * /equipo — magic-link login for the internal team portal.
 *
 * Auth flow: enter your Unreal email → Supabase mails a magic link → click
 * it → /auth/finish lands the session → we redirect to /equipo/dashboard.
 *
 * Note: shouldCreateUser is false. Only emails already on the team_members
 * roster (seeded by the admin) can sign in.
 */
import React, { useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth-context";

export default function EquipoLogin() {
  const { user, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (loading) return null;
  if (user) return <Navigate to="/equipo/dashboard" replace />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const redirect = `${window.location.origin}/auth/finish`;
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirect, shouldCreateUser: false },
      });
      if (error) throw error;
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-almond flex items-center justify-center px-6">
      <div className="bg-white rounded-3xl shadow-xl border border-primary/10 max-w-md w-full p-10">
        <h1 className="text-3xl font-serif text-primary mb-2">Portal Equipo</h1>
        <p className="text-sm text-primary/60 mb-8">
          Acceso interno · Vacaciones · Calendario
        </p>
        {sent ? (
          <div className="text-sm text-primary">
            Te hemos enviado un enlace mágico a <b>{email}</b>. Abre el correo
            desde el dispositivo donde quieres iniciar sesión.
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@unrealstudiobali.com"
              className="w-full px-4 py-3 rounded-xl border border-primary/20 focus:border-primary focus:outline-none"
            />
            <button
              type="submit"
              disabled={busy}
              className="w-full bg-primary text-white py-3 rounded-xl font-bold disabled:opacity-50"
            >
              {busy ? "Enviando…" : "Enviar enlace mágico"}
            </button>
            {error && <p className="text-xs text-red-600">{error}</p>}
            <p className="text-[10px] text-primary/40 text-center pt-2">
              Solo emails autorizados por administración pueden entrar.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
