/**
 * /auth/reset — página para fijar una NUEVA contraseña tras pulsar el enlace del
 * email de "restablecer contraseña" (lo manda la edge fn send-password-reset con
 * la plantilla de marca). El enlace de recovery trae los tokens en el hash; los
 * canjeamos por sesión y mostramos el formulario de nueva contraseña.
 */
import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { portalPath, type Portal } from '../lib/portalUrls';

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
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [fatal, setFatal] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [show, setShow] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  // El portal de origen viene en ?portal=... (lo pone PortalLogin). Lo capturamos
  // AL MONTAR, antes de que replaceState borre el query string, para redirigir
  // luego al portal correcto y no siempre a /cliente.
  const portalRef = useRef<string>('');

  useEffect(() => {
    portalRef.current = new URLSearchParams(window.location.search).get('portal') || '';
    const tokens = extractTokens(window.location.href);
    if (tokens) {
      void supabase.auth.setSession(tokens).then(({ error }) => {
        if (error) setFatal(t('fix.rp.linkExpired'));
        else { setReady(true); window.history.replaceState({}, '', window.location.pathname); }
      }).catch(() => setFatal(t('fix.rp.linkExpired')));
    } else {
      void supabase.auth.getSession().then(({ data }) => {
        if (data.session) setReady(true);
        else setFatal(t('fix.rp.linkInvalid'));
      });
    }
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    if (pw.length < 8) { setErr(t('fix.rp.errMinLength')); return; }
    if (pw !== pw2) { setErr(t('fix.rp.errMismatch')); return; }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    if (error) { setBusy(false); setErr(t('fix.rp.errUpdateFailed')); return; }
    // Guarda también el texto plano en la ficha para que el admin lo siga viendo
    // en tiempo real (lo exige Andreas). No bloquea el flujo si fallara.
    try { await supabase.rpc('portal_store_plain_password', { p_new: pw }); } catch { /* noop */ }
    setBusy(false);
    setDone(true);
    const valid: Portal[] = ['cliente', 'empleados', 'agencias', 'admin'];
    const dest = (valid as string[]).includes(portalRef.current) ? portalPath(portalRef.current as Portal) : '/cliente';
    setTimeout(() => navigate(dest, { replace: true }), 2600);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-almond px-6 py-12">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-sm p-8 md:p-10">
        <div className="text-center mb-6">
          <span className="font-serif text-3xl font-bold text-primary tracking-tight">Unreal Studio</span>
          <p className="brand-lema text-primary/50 text-sm mt-1">{t('fix.rp.tagline')}</p>
        </div>

        {fatal ? (
          <div className="text-center">
            <h1 className="text-xl font-serif text-primary mb-3">{t('fix.rp.somethingWrong')}</h1>
            <p className="text-sm text-red-700 mb-5">{fatal}</p>
            <a href="/cliente" className="inline-block bg-primary text-white px-5 py-3 rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-black transition">{t('fix.rp.backToLogin')}</a>
          </div>
        ) : done ? (
          <div className="text-center">
            <span className="material-symbols-outlined text-green-600 text-5xl mb-2">check_circle</span>
            <h1 className="text-xl font-serif text-primary mb-2">{t('fix.rp.passwordUpdated')}</h1>
            <p className="text-sm text-primary/60">{t('fix.rp.redirecting')}</p>
          </div>
        ) : !ready ? (
          <p className="text-center text-sm text-primary/50 py-6">{t('fix.rp.validatingLink')}</p>
        ) : (
          <form onSubmit={submit}>
            <h1 className="text-2xl font-serif text-primary mb-1 text-center">{t('fix.rp.newPasswordTitle')}</h1>
            <p className="text-sm text-primary/50 mb-6 text-center">{t('fix.rp.newPasswordSubtitle')}</p>

            <label className="block text-[11px] font-black uppercase tracking-widest text-primary/50 mb-1">{t('fix.rp.labelPassword')}</label>
            <div className="relative mb-3">
              <input
                type={show ? 'text' : 'password'}
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                autoComplete="new-password"
                className="w-full bg-almond/40 border border-primary/10 rounded-xl px-4 py-3 text-primary outline-none focus:border-primary/40"
                placeholder={t('fix.rp.placeholderMin8')}
              />
              <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-primary/40 hover:text-primary">
                <span className="material-symbols-outlined text-lg">{show ? 'visibility_off' : 'visibility'}</span>
              </button>
            </div>

            <label className="block text-[11px] font-black uppercase tracking-widest text-primary/50 mb-1">{t('fix.rp.labelRepeatPassword')}</label>
            <input
              type={show ? 'text' : 'password'}
              value={pw2}
              onChange={(e) => setPw2(e.target.value)}
              autoComplete="new-password"
              className="w-full bg-almond/40 border border-primary/10 rounded-xl px-4 py-3 text-primary outline-none focus:border-primary/40 mb-4"
              placeholder={t('fix.rp.placeholderRepeat')}
            />

            {err && <p className="text-sm text-red-700 mb-3">{err}</p>}

            <button type="submit" disabled={busy} className="w-full bg-primary text-white py-3.5 rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-black transition disabled:opacity-50">
              {busy ? t('fix.rp.saving') : t('fix.rp.saveButton')}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default ResetPassword;
