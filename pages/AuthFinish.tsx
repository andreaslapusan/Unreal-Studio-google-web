/**
 * /auth/finish — completes magic-link sign in (Supabase).
 * Supabase auto-handles the URL hash exchange via onAuthStateChange.
 * We just wait for `user` to populate and redirect by role.
 */
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth-context";

export default function AuthFinish() {
  const { user, role, loading } = useAuth();
  const navigate = useNavigate();
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      // Give Supabase 2s to process the hash; otherwise show error
      const timer = setTimeout(() => setErrored(true), 2500);
      return () => clearTimeout(timer);
    }
    // user logged in → route by role
    setTimeout(() => {
      if (role === "lister") navigate("/agencias/dashboard", { replace: true });
      else if (role === "investor") navigate("/inversores/dashboard", { replace: true });
      else if (role === "admin" || role === "team") navigate("/admin", { replace: true });
      else navigate("/", { replace: true });
    }, 800);
  }, [user, role, loading, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-almond px-6 text-center">
      <div className="max-w-md">
        {!errored && (
          <>
            <h1 className="text-3xl font-serif text-primary mb-4">Iniciando sesión…</h1>
            <p>Validando tu enlace mágico.</p>
          </>
        )}
        {errored && (
          <>
            <h1 className="text-3xl font-serif text-primary mb-4">Algo no va bien</h1>
            <p className="text-red-700">El enlace ha expirado o ya se usó.</p>
            <a href="/#/agencias" className="inline-block mt-4 underline text-primary">
              Volver al login
            </a>
          </>
        )}
      </div>
    </div>
  );
}
