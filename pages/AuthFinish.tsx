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

  // Auth handshake — covers both flows:
  //   1) Implicit/OAuth: Supabase appends #access_token=... in the fragment
  //   2) PKCE (default for v2 magic links + Google with PKCE): ?code=xxx in the
  //      query string. exchangeCodeForSession swaps that for an actual session.
  useEffect(() => {
    const url = window.location.href;

    // Path 1: fragment tokens (OAuth implicit flow)
    const tokens = extractOAuthTokens(url);
    if (tokens) {
      void supabase.auth
        .setSession(tokens)
        .then(({ error }) => {
          if (error) {
            console.error("[auth-finish] setSession failed:", error);
            setErrored(true);
          } else {
            const cleaned = url.replace(/#access_token=[^]*$/, "");
            window.history.replaceState({}, "", cleaned);
          }
        })
        .catch(() => setErrored(true));
      return;
    }

    // Path 2: PKCE code exchange
    const search = new URLSearchParams(window.location.search);
    const code = search.get("code");
    if (code) {
      void supabase.auth
        .exchangeCodeForSession(code)
        .then(({ error }) => {
          if (error) {
            console.error("[auth-finish] exchangeCodeForSession failed:", error);
            setErrored(true);
          } else {
            // Drop the ?code so a refresh doesn't replay it.
            const cleaned = window.location.pathname;
            window.history.replaceState({}, "", cleaned);
          }
        })
        .catch(() => setErrored(true));
      return;
    }
    // No tokens, no code → AuthProvider's auto-detect-session may already
    // have a valid session in storage from a previous handshake. We just
    // wait for `user` to populate via onAuthStateChange.
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
    // their /manager/dashboard so they can manage their own time off.
    setTimeout(async () => {
      // Enrutado UNIFICADO multi-rol: get_my_portals() devuelve los portales del usuario.
      const DASH: Record<string, string> = {
        cliente: "/cliente/dashboard",
        agencias: "/agencias/dashboard",
        empleados: "/empleados/dashboard",
        inversores: "/cliente/dashboard", // Inversores = Cliente (portal unificado)
        admin: "/admin",
      };
      try {
        const { data } = await supabase.rpc("get_my_portals");
        const list = ((data as string[]) || []).filter(Boolean);
        if (list.length > 0) {
          navigate(DASH[list[0]] ?? "/", { replace: true });
          return;
        }
      } catch {
        // fall through to legacy routing
      }
      // Fallback legacy si la función no resuelve.
      if (role === "lister") navigate("/agencias/dashboard", { replace: true });
      else if (role === "investor") navigate("/cliente/dashboard", { replace: true });
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
