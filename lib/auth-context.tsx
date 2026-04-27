/**
 * Auth context for Firebase Authentication.
 * Exposes current user, role (from custom claims), and helper functions.
 */
import React, { createContext, useContext, useEffect, useState } from "react";
import {
  onAuthStateChanged,
  sendSignInLinkToEmail,
  signInWithEmailLink,
  isSignInWithEmailLink,
  signOut as fbSignOut,
  type User,
} from "firebase/auth";
import { auth, isFirebaseConfigured } from "./firebase";

export type UserRole = "admin" | "team" | "lister" | "investor" | null;

interface AuthCtx {
  user: User | null;
  role: UserRole;
  loading: boolean;
  configured: boolean;
  sendMagicLink: (email: string) => Promise<void>;
  completeSignIn: () => Promise<User | null>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthCtx | undefined>(undefined);

const ACTION_CODE_SETTINGS = {
  url: typeof window !== "undefined" ? `${window.location.origin}/#/auth/finish` : "",
  handleCodeInApp: true,
};

const STORAGE_EMAIL_KEY = "_unrealauth_email";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<UserRole>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setLoading(false);
      return;
    }
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        try {
          const tokenResult = await u.getIdTokenResult();
          setRole((tokenResult.claims.role as UserRole) ?? null);
        } catch {
          setRole(null);
        }
      } else {
        setRole(null);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  const sendMagicLink = async (email: string): Promise<void> => {
    if (!isFirebaseConfigured) {
      throw new Error("Firebase no está configurado todavía");
    }
    await sendSignInLinkToEmail(auth, email, ACTION_CODE_SETTINGS);
    window.localStorage.setItem(STORAGE_EMAIL_KEY, email);
  };

  const completeSignIn = async (): Promise<User | null> => {
    if (!isFirebaseConfigured) return null;
    if (!isSignInWithEmailLink(auth, window.location.href)) return null;
    let email = window.localStorage.getItem(STORAGE_EMAIL_KEY);
    if (!email) {
      email = window.prompt("Confirma tu email para completar el login") ?? "";
    }
    if (!email) return null;
    const result = await signInWithEmailLink(auth, email, window.location.href);
    window.localStorage.removeItem(STORAGE_EMAIL_KEY);
    return result.user;
  };

  const signOut = async (): Promise<void> => {
    await fbSignOut(auth);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        role,
        loading,
        configured: isFirebaseConfigured,
        sendMagicLink,
        completeSignIn,
        signOut,
      }}
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
