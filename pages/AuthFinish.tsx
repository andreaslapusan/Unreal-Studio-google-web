/**
 * /auth/finish — completes the auth handshake for both flows:
 *   1. Magic-link (Supabase appends ?code= to the redirect URL)
 *   2. Google OAuth (Supabase appends #access_token=...&refresh_token=... after
 *      the path, so the URL ends up like `/auth/finish#access_token=...`).
 *
 * Supabase's auto-detect-session normally handles the hash fragment, but we
 * parse it explicitly to be defensive and to strip the fragment after use so
 * a refresh doesn't re-process a consumed token.
 */
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth-context";
import { supabase } from "../lib/supabase";

function extractOAuthTokens(href: string): { access_token: string; refresh_token: string } | null {
  const hashIdx = href.indexOf("#");
  if (hashIdx < 0) return null;
  const fragment = href.slice(hashIdx + 1);
  const params = new URLSearchParams(fragment);
  const access_token = params.get("access_token");
  const refresh_token = params.get("refresh_token");
  if (!access_token || !refresh_token) return null;
  return { access_token, refresh_token };
}

export default function AuthFinish() {
  const { user, role, loading } = useAuth();
  const navigate = useNavigate();
  const [errored, setErrored] = useState(false);

  // Manual OAuth-fragment exchange. Runs once on mount.
  useEffect(() => {
    const tokens = extractOAuthTokens(window.location.href);
    if (!tokens) return;
    void supabase.auth
      .setSession(tokens)
      .then(({ error }) => {
        if (error) {
          console.error("[auth-finish] setSession failed:", error);
          setErrored(true);
        } else {
          // Strip the OAuth fragment from the URL so a refresh doesn't
          // re-process an already-consumed token.
          const cleaned = window.location.href.replace(/#access_token=[^]*$/, "");
          window.history.replaceState({}, "", cleaned);
        }
      })
      .catch(() => setErrored(true));
  }, []);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      // Give Supabase 4s (longer for OAuth round-trip) before bailing.
      const timer = setTimeout(() => setErrored(true), 4000);
      return () => clearTimeout(timer);
    }
    // user logged in → route by role. Employees (team_members table) take
    // precedence: a team member who is also a profile.admin still wants
    // their /equipo/dashboard so they can manage their own time off.
    setTimeout(async () => {
      try {
        const { data: m } = await supabase
          .from("team_members")
          .select("id,role")
          .eq("email", user.email)
          .maybeSingle();
        if (m) {
          navigate("/equipo/dashboard", { replace: true });
          return;
        }
      } catch {
        // fall through to legacy role routing
      }
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
            <a href="/agencias" className="inline-block mt-4 underline text-primary">
              Volver al login
            </a>
          </>
        )}
      </div>
    </div>
  );
}
