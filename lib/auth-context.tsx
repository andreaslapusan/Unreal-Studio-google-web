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
  sendMagicLink: (email: string) => Promise<void>;
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
      const { data } = await supabase.auth.getSession();
      setSession(data.session);
      setUser(data.session?.user ?? null);
      if (data.session?.user) {
        await loadRole(data.session.user.id);
      }
      setLoading(false);
    };
    void init();

    const sub = supabase.auth.onAuthStateChange(async (_event, sess) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      if (sess?.user) {
        await loadRole(sess.user.id);
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

  const sendMagicLink = async (email: string) => {
    const redirect =
      typeof window !== "undefined"
        ? `${window.location.origin}/#/auth/finish`
        : undefined;
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirect, shouldCreateUser: true },
    });
    if (error) throw error;
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, role, loading, sendMagicLink, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthCtx {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
