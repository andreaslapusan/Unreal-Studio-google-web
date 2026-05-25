/**
 * /equipo — magic-link login for the internal team portal.
 *
 * Auth flow: enter your Unreal email → Supabase mails a magic link → click
 * it → /auth/finish lands the session → we redirect to /manager/dashboard.
 *
 * Note: shouldCreateUser is false. Only emails already on the team_members
 * roster (seeded by the admin) can sign in.
 */
import React, { useState } from "react";
import { Navigate } from "react-router-dom";
import { useTranslation, Trans } from "react-i18next";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth-context";
import LanguageSwitcher from "../components/LanguageSwitcher";

export default function EquipoLogin() {
  const { t } = useTranslation();
  const { user, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (loading) return null;
  if (user) return <Navigate to="/manager/dashboard" replace />;

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
        <div className="flex justify-end mb-2">
          <LanguageSwitcher />
        </div>
        <h1 className="text-3xl font-serif text-primary mb-2">{t('admin.equipoLogin.title')}</h1>
        <p className="text-sm text-primary/60 mb-8">
          {t('admin.equipoLogin.subtitle')}
        </p>
        {sent ? (
          <div className="text-sm text-primary">
            <Trans i18nKey="admin.equipoLogin.sentMessage" values={{ email }} />
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('admin.equipoLogin.emailPlaceholder')}
              className="w-full px-4 py-3 rounded-xl border border-primary/20 focus:border-primary focus:outline-none"
            />
            <button
              type="submit"
              disabled={busy}
              className="w-full bg-primary text-white py-3 rounded-xl font-bold disabled:opacity-50"
            >
              {busy ? t('admin.equipoLogin.submitting') : t('admin.equipoLogin.submit')}
            </button>
            {error && <p className="text-xs text-red-600">{error}</p>}
            <p className="text-[10px] text-primary/40 text-center pt-2">
              {t('admin.equipoLogin.rosterHint')}
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
