/**
 * Top-level error boundary — diseñado para que un error NUNCA atrape al usuario.
 *
 * - Si una página cruja, muestra un fallback con "Ir al inicio" (ruta segura) +
 *   "Reintentar". Recargar la MISMA ruta rota provoca bucle, así que la acción
 *   principal SIEMPRE saca al usuario a "/".
 * - Anti-bucle: si la misma ruta cruja varias veces seguidas en segundos, redirige
 *   solo a "/" (rompe el bucle sin que el usuario tenga que cerrar la app).
 * - Telemetría: reporta el error (con traza) a public.client_errors y a GA4, para
 *   verlo y arreglarlo (idealmente antes de que llegue a clientes).
 *
 * Class component porque componentDidCatch no tiene equivalente en hooks.
 */
import React from "react";
import { supabase } from "../lib/supabase";

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

const LOOP_KEY = "_ust_crashloop";

export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    const href = typeof window !== "undefined" ? window.location.href : "";
    const path = typeof window !== "undefined" ? window.location.pathname : "";

    // GA4 (conteo agregado)
    try {
      const w = window as unknown as { gtag?: (...args: unknown[]) => void };
      if (typeof w.gtag === "function") {
        w.gtag("event", "exception", {
          description: `${error.name}: ${error.message}`.slice(0, 250),
          fatal: true,
          stack: (error.stack ?? "").slice(0, 600),
        });
      }
    } catch {
      /* ignore */
    }

    // Telemetría con traza completa para diagnóstico (best-effort, no debe romper).
    try {
      void supabase.from("client_errors").insert({
        message: `${error.name}: ${error.message}`.slice(0, 500),
        stack: (error.stack ?? "").slice(0, 4000),
        component_stack: (info.componentStack ?? "").slice(0, 4000),
        url: href,
        user_agent: typeof navigator !== "undefined" ? navigator.userAgent : "",
      });
    } catch {
      /* ignore */
    }

    console.error("[ErrorBoundary]", error, info);

    // Anti-bucle: cuenta crashes consecutivos en la MISMA ruta en una ventana corta.
    try {
      const now = Date.now();
      const raw = sessionStorage.getItem(LOOP_KEY);
      const prev = raw ? JSON.parse(raw) : { path: "", n: 0, t: 0 };
      const recent = prev.path === path && now - (prev.t || 0) < 15000;
      const n = recent ? (prev.n || 0) + 1 : 1;
      sessionStorage.setItem(LOOP_KEY, JSON.stringify({ path, n, t: now }));
      if (n >= 3 && path !== "/") {
        // Bucle de fallos en esta ruta → salir a una página segura automáticamente.
        sessionStorage.removeItem(LOOP_KEY);
        window.location.replace("/");
      }
    } catch {
      /* ignore */
    }
  }

  componentDidUpdate(_prevProps: Props, prevState: State): void {
    // Si nos recuperamos (retry con éxito), limpiamos el contador de bucle.
    if (prevState.error && !this.state.error) {
      try {
        sessionStorage.removeItem(LOOP_KEY);
      } catch {
        /* ignore */
      }
    }
  }

  goHome = () => {
    try {
      sessionStorage.removeItem(LOOP_KEY);
    } catch {
      /* ignore */
    }
    if (typeof window !== "undefined") window.location.href = "/";
  };

  retry = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-almond flex flex-col items-center justify-center px-6 text-center">
          <div className="max-w-md">
            <div className="text-6xl mb-4">😕</div>
            <h1 className="font-serif text-3xl text-primary mb-4">
              Algo no fue como esperábamos.
            </h1>
            <p className="text-primary/70 mb-8">
              Esta página tuvo un error. Puedes volver al inicio y seguir usando la web.
              Si vuelve a pasar, escríbenos a{" "}
              <a href="mailto:hello@unrealstudiobali.com" className="underline">
                hello@unrealstudiobali.com
              </a>
              .
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={this.goHome}
                className="bg-primary text-white px-8 py-4 rounded-full font-bold hover:translate-y-[-2px] transition shadow-lg"
              >
                Ir al inicio
              </button>
              <button
                onClick={this.retry}
                className="bg-white text-primary border border-primary/20 px-8 py-4 rounded-full font-bold hover:translate-y-[-2px] transition"
              >
                Reintentar
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
