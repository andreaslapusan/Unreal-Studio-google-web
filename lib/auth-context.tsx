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
    let unsub: (() => void) | undefined;

    const init = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        setSession(data.session);
        setUser(data.session?.user ?? null);
        if (data.session?.user) {
          await loadRole(data.session.user.id);
        }
      } catch (err) {
        // Defensive: never let an auth error keep the UI stuck on "Cargando".
        // We surface it via console so it's still discoverable in DevTools.
        // eslint-disable-next-line no-console
        console.error('[auth-context] init failed', err);
      } finally {
        setLoading(false);
      }
    };
    void init();

    const sub = supabase.auth.onAuthStateChange(async (_event, sess) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      if (sess?.user) {
        // Mantener loading=true mientras se resuelve el rol, para que los guards
        // (ProtectedRoute) no rebote antes de que `role` esté cargado tras login.
        setLoading(true);
        await loadRole(sess.user.id);
        setLoading(false);
      } else {
        setRole(null);
      }
    });
    unsub = () => sub.data.subscription.unsubscribe();

    return () => {
      if (unsub) unsub();
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
