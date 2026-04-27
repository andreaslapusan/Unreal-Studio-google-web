/**
 * /inversores — Login con magic link para inversores.
 */
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth-context";

export default function InversoresLogin() {
  const { sendMagicLink, configured, user } = useAuth();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const navigate = useNavigate();

  if (user) {
    navigate("/inversores/dashboard", { replace: true });
    return null;
  }

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
        <h1 className="text-3xl font-serif text-primary mb-2">Portal Inversores</h1>
        <p className="text-primary/70 mb-8 text-sm">
          Acceso privado para inversores de Unreal Studio Bali. Sigue el progreso
          de tu propiedad, recibe reportes de obra y accede a tu documentación.
        </p>

        {!configured && (
          <div className="bg-amber-50 border-l-4 border-amber-500 text-amber-900 p-4 rounded text-sm mb-6">
            ⚠️ Firebase aún no está configurado.
          </div>
        )}

        {status === "sent" ? (
          <div className="bg-green-50 border-l-4 border-green-500 text-green-900 p-4 rounded">
            <p className="font-medium">📧 Email enviado</p>
            <p className="text-sm mt-1">
              Revisa <strong>{email}</strong> para acceder.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block">
              <span className="text-sm text-primary font-medium">Email</span>
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
              disabled={status === "sending" || !configured}
              className="w-full bg-primary text-white py-3 rounded-lg font-bold hover:translate-y-[-2px] transition disabled:opacity-50"
            >
              {status === "sending" ? "Enviando…" : "Enviar enlace mágico"}
            </button>

            {errorMsg && <p className="text-red-600 text-sm">{errorMsg}</p>}
          </form>
        )}
      </div>
    </div>
  );
}
