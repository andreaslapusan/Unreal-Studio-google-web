/**
 * /inversores — Login con magic link para inversores (Supabase Auth).
 */
import React, { useState } from "react";
import { Navigate } from "react-router-dom";
import { useTranslation, Trans } from "react-i18next";
import { useAuth } from "../lib/auth-context";

export default function InversoresLogin() {
  const { t } = useTranslation();
  const { sendMagicLink, signInWithGoogle, user } = useAuth();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  if (user) return <Navigate to="/inversores/dashboard" replace />;

  const handleGoogle = async () => {
    setErrorMsg("");
    try {
      await signInWithGoogle();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.includes("@")) return;
    setStatus("sending");
    setErrorMsg("");
    try {
      await sendMagicLink(email);
      setStatus("sent");
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-almond px-6 py-16">
      <div className="w-full max-w-md glass-card rounded-2xl p-8 shadow-xl">
        <h1 className="text-3xl font-serif text-primary mb-2">{t("inversoresLogin.title")}</h1>
        <p className="text-primary/70 mb-8 text-sm">{t("inversoresLogin.subtitle")}</p>

        {status === "sent" ? (
          <div className="bg-green-50 border-l-4 border-green-500 text-green-900 p-4 rounded">
            <p className="font-medium">{t("inversoresLogin.sentTitle")}</p>
            <p className="text-sm mt-1">
              <Trans i18nKey="inversoresLogin.sentBody" values={{ email }} components={{ strong: <strong /> }} />
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block">
              <span className="text-sm text-primary font-medium">{t("common.email")}</span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@email.com"
                className="mt-1 block w-full rounded-lg border border-primary/20 px-4 py-3 focus:ring-2 focus:ring-primary/40 focus:border-primary outline-none"
              />
            </label>

            <button
              type="submit"
              disabled={status === "sending"}
              className="w-full bg-primary text-white py-3 rounded-lg font-bold hover:translate-y-[-2px] transition disabled:opacity-50"
            >
              {status === "sending" ? t("common.sending") : t("inversoresLogin.btn")}
            </button>

            <div className="flex items-center gap-3 my-4">
              <span className="flex-1 h-px bg-primary/15" />
              <span className="text-xs text-primary/50">o</span>
              <span className="flex-1 h-px bg-primary/15" />
            </div>

            <button
              type="button"
              onClick={handleGoogle}
              className="w-full flex items-center justify-center gap-3 bg-white border border-primary/20 text-primary py-3 rounded-lg font-medium hover:bg-primary/5 transition"
            >
              <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
                <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.616z" fill="#4285F4"/>
                <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.331C2.438 15.983 5.482 18 9 18z" fill="#34A853"/>
                <path d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.962H.957A8.997 8.997 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.331z" fill="#FBBC05"/>
                <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.962L3.964 7.293C4.672 5.166 6.656 3.58 9 3.58z" fill="#EA4335"/>
              </svg>
              {t("inversoresLogin.btnGoogle")}
            </button>

            {errorMsg && <p className="text-red-600 text-sm">{errorMsg}</p>}
          </form>
        )}
      </div>
    </div>
  );
}
