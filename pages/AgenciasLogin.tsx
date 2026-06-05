/**
 * /agencias — Login con magic link para agencias colaboradoras (Supabase Auth).
 */
import React, { useState } from "react";
import { Navigate } from "react-router-dom";
import { useTranslation, Trans } from "react-i18next";
import { useAuth } from "../lib/auth-context";
import PortalShell from '../components/PortalShell';

export default function AgenciasLogin() {
  const { t } = useTranslation();
  const { sendMagicLink, signInWithGoogle, user } = useAuth();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string>("");

  if (user) return <Navigate to="/agencias/dashboard" replace />;

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
    <PortalShell>
      <div className="w-full max-w-md glass-card rounded-2xl p-8 shadow-xl">
        <h1 className="text-3xl font-serif text-primary mb-2">{t("agenciasLogin.title")}</h1>
        <p className="text-primary/70 mb-8 text-sm">{t("agenciasLogin.subtitle")}</p>

        {status === "sent" ? (
          <div className="bg-green-50 border-l-4 border-green-500 text-green-900 p-4 rounded">
            <p className="font-medium">{t("agenciasLogin.sentTitle")}</p>
            <p className="text-sm mt-1">
              <Trans i18nKey="agenciasLogin.sentBody" values={{ email }} components={{ strong: <strong /> }} />
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
                placeholder="agencia@ejemplo.com"
                className="mt-1 block w-full rounded-lg border border-primary/20 px-4 py-3 focus:ring-2 focus:ring-primary/40 focus:border-primary outline-none"
              />
            </label>

            <button
              type="submit"
              disabled={status === "sending"}
              className="w-full bg-primary text-white py-3 rounded-lg font-bold hover:translate-y-[-2px] transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {status === "sending" ? t("common.sending") : t("agenciasLogin.btn")}
            </button>

            {errorMsg && <p className="text-red-600 text-sm">{errorMsg}</p>}
          </form>
        )}

        <p className="text-xs text-primary/50 mt-6 text-center">
          {t("agenciasLogin.noPartner")}{" "}
          <a href="/contacto" className="underline">
            {t("agenciasLogin.contact")}
          </a>
        </p>
      </div>
    </PortalShell>
  );
}
