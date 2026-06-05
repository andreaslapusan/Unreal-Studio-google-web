/**
 * Auth context backed by Supabase Auth.
 * Uses magic link (signInWithOtp / passwordless email) and exposes
 * the current user + role from a `profiles` table joined with auth.users.
 */
import React, { createContext, useContext, useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "./supabase";

export type UserRole = "admin" | "team" | "lister" | "investor" | null;

interface AuthCtx {
  user: User | null;
  session: Session | null;
  role: UserRole;
  loading: boolean;
  /**
   * Send a magic-link email. Pass createIfMissing=true only when the
   * caller is admin-side and has validated the email (e.g. application
   * approval flow). Public login pages should leave it false.
   */
  sendMagicLink: (email: string, createIfMissing?: boolean) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthCtx | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<UserRole>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    // Aplica una sesión y resuelve el rol. CRÍTICO: el `loadRole` (que llama a
    // supabase.from('profiles')) se DIFIERE con setTimeout(0) para salir del
    // contexto del lock de auth de supabase-js v2. Llamar a métodos de supabase
    // de forma síncrona dentro del callback de onAuthStateChange (o durante
    // getSession) provoca un DEADLOCK: la query espera el lock que retiene el
    // propio callback → nunca resuelve → `loading` se queda en true para siempre
    // → ProtectedRoute devuelve null → pantalla en blanco al RECARGAR /admin.
    const applySession = (sess: Session | null) => {
      if (!active) return;
      setSession(sess);
      setUser(sess?.user ?? null);
      if (sess?.user) {
        setLoading(true);
        const uid = sess.user.id;
        setTimeout(() => {
          if (!active) return;
          void loadRole(uid).finally(() => {
            if (active) setLoading(false);
          });
        }, 0);
      } else {
        setRole(null);
        setLoading(false);
      }
    };

    const sub = supabase.auth.onAuthStateChange((_event, sess) => {
      applySession(sess);
    });

    // Fallback en el montaje por si no llega el evento INITIAL_SESSION.
    supabase.auth
      .getSession()
      .then(({ data }) => applySession(data.session))
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.error('[auth-context] getSession failed', err);
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      sub.data.subscription.unsubscribe();
    };
  }, []);

  const loadRole = async (userId: string) => {
    try {
      const { data } = await supabase
        .from("profiles")
        .select("role")
        .eq("user_id", userId)
        .maybeSingle();
      setRole((data?.role as UserRole) ?? null);
    } catch {
      setRole(null);
    }
  };

  /**
   * Send a magic link.
   *
   * @param email   destination email
   * @param createIfMissing
   *   when true, Supabase creates a user if the email is not registered.
   *   Default is FALSE for public-facing logins (lister/investor) so anon
   *   visitors cannot create accounts by enumerating emails.
   *   AdminPortalManager passes `true` when explicitly approving an
   *   application — there the email has been validated by an admin first.
   */
  const sendMagicLink = async (email: string, createIfMissing = false) => {
    const redirect =
      typeof window !== "undefined"
        ? `${window.location.origin}/auth/finish`
        : undefined;
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirect, shouldCreateUser: createIfMissing },
    });
    if (error) throw error;
  };

  const signInWithGoogle = async () => {
    const redirect =
      typeof window !== "undefined"
        ? `${window.location.origin}/auth/finish`
        : undefined;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: redirect },
    });
    if (error) throw error;
  };

  const signOut = async () => {
    try { await supabase.auth.signOut(); } catch { /* ignore */ }
    // Limpiar estado local de inmediato (no esperar al listener) para que el logout sea fiable.
    setSession(null);
    setUser(null);
    setRole(null);
  };

  return (
    <AuthContext.Provider
      value={{ user, session, role, loading, sendMagicLink, signInWithGoogle, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthCtx {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
