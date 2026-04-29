/**
 * Top-level error boundary.
 *
 * React errors thrown during render unwind the whole tree by default — the
 * user sees a blank `<div id="root">`. With this wrapper around <Routes>,
 * any uncaught render error shows a polite fallback with a "Reload" CTA
 * instead of a white screen, and logs to GA4 so we can see real-user
 * crash rates without setting up Sentry.
 *
 * Class component because React's hooks API doesn't expose the equivalent
 * of componentDidCatch yet (as of React 19).
 */
import React from "react";

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // Forward to GA4 if available so we get aggregate crash counts in the
    // same dashboard as engagement metrics. Stack is truncated to keep the
    // event payload small.
    try {
      const w = window as unknown as { gtag?: (...args: unknown[]) => void };
      if (typeof w.gtag === "function") {
        w.gtag("event", "exception", {
          description: `${error.name}: ${error.message}`.slice(0, 250),
          fatal: true,
          stack: (error.stack ?? "").slice(0, 600),
          component_stack: (info.componentStack ?? "").slice(0, 600),
        });
      }
    } catch {
      // ignore
    }
    // Console log for dev visibility
    console.error("[ErrorBoundary]", error, info);
  }

  reset = () => {
    this.setState({ error: null });
    if (typeof window !== "undefined") window.location.reload();
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
              La página tuvo un error inesperado. Si vuelve a pasar, escríbenos a{" "}
              <a href="mailto:hello@unrealstudiobali.com" className="underline">
                hello@unrealstudiobali.com
              </a>
              .
            </p>
            <button
              onClick={this.reset}
              className="bg-primary text-white px-8 py-4 rounded-full font-bold hover:translate-y-[-2px] transition shadow-lg"
            >
              Recargar
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
