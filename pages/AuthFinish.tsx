/**
 * /auth/finish — completes magic-link sign in flow.
 * Redirects to the role-specific dashboard.
 */
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth-context";

export default function AuthFinish() {
  const { completeSignIn, role } = useAuth();
  const [status, setStatus] = useState<"working" | "ok" | "error">("working");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    const run = async () => {
      try {
        const u = await completeSignIn();
        if (!u) {
          setStatus("error");
          setError("No se pudo completar el login. Pide otro enlace mágico.");
          return;
        }
        setStatus("ok");
        // Wait for auth state propagation, then redirect
        setTimeout(() => {
          if (role === "lister") navigate("/agencias/dashboard", { replace: true });
          else if (role === "investor") navigate("/inversores/dashboard", { replace: true });
          else if (role === "admin" || role === "team") navigate("/admin", { replace: true });
          else navigate("/", { replace: true });
        }, 1500);
      } catch (err) {
        setStatus("error");
        setError(err instanceof Error ? err.message : String(err));
      }
    };
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-almond px-6 text-center">
      <div className="max-w-md">
        {status === "working" && (
          <>
            <h1 className="text-3xl font-serif text-primary mb-4">Iniciando sesión…</h1>
            <p>Validando tu enlace mágico.</p>
          </>
        )}
        {status === "ok" && (
          <>
            <h1 className="text-3xl font-serif text-primary mb-4">¡Bienvenido!</h1>
            <p>Redirigiendo a tu panel…</p>
          </>
        )}
        {status === "error" && (
          <>
            <h1 className="text-3xl font-serif text-primary mb-4">Algo no va bien</h1>
            <p className="text-red-700">{error}</p>
            <a
              href="/#/agencias"
              className="inline-block mt-4 underline text-primary"
            >
              Volver al login
            </a>
          </>
        )}
      </div>
    </div>
  );
}
