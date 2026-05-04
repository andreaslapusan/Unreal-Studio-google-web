/**
 * /admin/marketing — Dashboard de marketing y leads.
 *
 * Llama a la Edge Function `ghl-dashboard` (Supabase) que devuelve un snapshot
 * combinado de los pipelines de GHL: embudo por etapas, leads recientes,
 * últimas conversaciones. Solo accesible para usuarios con rol `admin`.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../lib/auth-context";
import { supabase, SUPABASE_URL } from "../lib/supabase";

interface StageBucket {
  pipelineId: string;
  pipelineName: string;
  stageId: string;
  stageName: string;
  count: number;
  totalValue: number;
}

interface LeadRow {
  id: string;
  name: string;
  contactId: string;
  email?: string;
  phone?: string;
  pipelineName: string;
  stageName: string;
  monetaryValue: number;
  status: string;
  source?: string;
  updatedAt: string;
  createdAt: string;
}

interface ConversationRow {
  id: string;
  contactId: string;
  contactName: string;
  type?: string;
  unreadCount: number;
  lastMessageBody: string;
  lastMessageDirection?: string;
  lastMessageDate?: number | string;
}

interface DashboardResponse {
  generatedAt: string;
  pipelines: Array<{ id: string; name: string }>;
  stageBuckets: StageBucket[];
  leads: LeadRow[];
  conversations: ConversationRow[];
  counts: { leadsTotal: number; conversationsReturned: number };
}

const REFRESH_INTERVAL_MS = 60_000;

function formatDate(value?: string | number) {
  if (!value) return "—";
  const d = typeof value === "number" ? new Date(value) : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatMoney(value: number) {
  if (!value) return "—";
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

export default function AdminMarketing() {
  const { user, role, loading: authLoading } = useAuth();
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [activePipeline, setActivePipeline] = useState<string>("all");
  // Defensive: if auth context never resolves we still try to render.
  const [authTimedOut, setAuthTimedOut] = useState(false);
  useEffect(() => {
    if (!authLoading) return;
    const id = window.setTimeout(() => setAuthTimedOut(true), 5000);
    return () => window.clearTimeout(id);
  }, [authLoading]);

  const load = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      // Read the access token straight from localStorage. supabase.auth.getSession()
      // has been observed to hang here in production; reading the persisted JSON
      // ourselves avoids the hang and gets the exact same token Supabase uses.
      let token: string | undefined;
      try {
        const raw = localStorage.getItem('sb-rnielxgackkshnatvagj-auth-token');
        if (raw) token = JSON.parse(raw).access_token;
      } catch {
        // fall through; we'll still try supabase.auth as a backup
      }
      if (!token) {
        const { data: sess } = await supabase.auth.getSession();
        token = sess.session?.access_token;
      }
      if (!token) throw new Error("Sesión expirada. Inicia sesión de nuevo.");

      const url = `${SUPABASE_URL}/functions/v1/ghl-dashboard`;
      const res = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
      }
      const body = (await res.json()) as DashboardResponse;
      setData(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  // Trust the edge function as the source of truth for role: it verifies the
  // Supabase session + admin role server-side. The useAuth role flag can be
  // out of sync (it relies on a profiles-table RLS read that occasionally
  // hangs), so we don't gate load() on it. If the user isn't admin, the edge
  // function returns 401/403 and we surface the error.
  useEffect(() => {
    if (authLoading && !authTimedOut) return;
    void load();
  }, [authLoading, authTimedOut, load]);

  useEffect(() => {
    if (!autoRefresh) return;
    if (authLoading && !authTimedOut) return;
    const id = window.setInterval(() => {
      void load();
    }, REFRESH_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [autoRefresh, authLoading, authTimedOut, load]);

  const filteredBuckets = useMemo(() => {
    if (!data) return [];
    if (activePipeline === "all") return data.stageBuckets;
    return data.stageBuckets.filter((b) => b.pipelineId === activePipeline);
  }, [data, activePipeline]);

  const filteredLeads = useMemo(() => {
    if (!data) return [];
    if (activePipeline === "all") return data.leads;
    const pipeName = data.pipelines.find((p) => p.id === activePipeline)?.name;
    return data.leads.filter((l) => l.pipelineName === pipeName);
  }, [data, activePipeline]);

  const totals = useMemo(() => {
    if (!data) return { count: 0, value: 0 };
    return filteredBuckets.reduce(
      (acc, b) => ({
        count: acc.count + b.count,
        value: acc.value + b.totalValue,
      }),
      { count: 0, value: 0 },
    );
  }, [data, filteredBuckets]);

  if (authLoading && !authTimedOut) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500">
        Cargando…
      </div>
    );
  }
  // No session at all → bounce to login. Once authLoading has settled (or
  // timed out) we can trust this check; we don't gate on role here because
  // the edge function is the source of truth for the admin check.
  if (!authLoading && !user && !localStorage.getItem('sb-rnielxgackkshnatvagj-auth-token')) {
    return <Navigate to="/admin/login" replace />;
  }
  // Edge function returned 403 → not admin.
  if (error && /403|forbidden|admin role required/i.test(error)) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-semibold mb-2">Acceso restringido</h1>
          <p className="text-gray-600 mb-6">
            Esta sección solo está disponible para usuarios con rol{" "}
            <span className="font-semibold">admin</span>.
          </p>
          <Link
            to="/"
            className="inline-block px-5 py-2 bg-gray-900 text-white rounded"
          >
            Volver al inicio
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wider text-gray-500">
              Admin · Marketing
            </p>
            <h1 className="text-2xl font-semibold mt-1">Embudo y leads</h1>
            {data && (
              <p className="text-xs text-gray-500 mt-1">
                Última actualización: {formatDate(data.generatedAt)}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-sm text-gray-600 flex items-center gap-2">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
              />
              Auto-refresh 60 s
            </label>
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="px-4 py-2 rounded bg-gray-900 text-white disabled:opacity-50"
            >
              {loading ? "Refrescando…" : "Refresh"}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-10">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded p-4">
            {error}
          </div>
        )}

        {data && (
          <>
            {/* Pipeline tabs */}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setActivePipeline("all")}
                className={`px-4 py-2 rounded text-sm ${
                  activePipeline === "all"
                    ? "bg-gray-900 text-white"
                    : "bg-white border border-gray-300 text-gray-700"
                }`}
              >
                Todos los pipelines
              </button>
              {data.pipelines.map((p) => (
                <button
                  type="button"
                  key={p.id}
                  onClick={() => setActivePipeline(p.id)}
                  className={`px-4 py-2 rounded text-sm ${
                    activePipeline === p.id
                      ? "bg-gray-900 text-white"
                      : "bg-white border border-gray-300 text-gray-700"
                  }`}
                >
                  {p.name}
                </button>
              ))}
            </div>

            {/* Headline metrics */}
            <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white rounded-lg border border-gray-200 p-5">
                <p className="text-xs uppercase text-gray-500">
                  Total leads en embudo
                </p>
                <p className="text-3xl font-semibold mt-2">{totals.count}</p>
              </div>
              <div className="bg-white rounded-lg border border-gray-200 p-5">
                <p className="text-xs uppercase text-gray-500">
                  Valor potencial
                </p>
                <p className="text-3xl font-semibold mt-2">
                  {formatMoney(totals.value)}
                </p>
              </div>
              <div className="bg-white rounded-lg border border-gray-200 p-5">
                <p className="text-xs uppercase text-gray-500">
                  Conversaciones recientes
                </p>
                <p className="text-3xl font-semibold mt-2">
                  {data.counts.conversationsReturned}
                </p>
              </div>
            </section>

            {/* Pipeline stages */}
            <section>
              <h2 className="text-lg font-semibold mb-3">Embudo por etapas</h2>
              <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                    <tr>
                      <th className="px-4 py-3">Pipeline</th>
                      <th className="px-4 py-3">Etapa</th>
                      <th className="px-4 py-3 text-right">Leads</th>
                      <th className="px-4 py-3 text-right">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredBuckets.map((b) => (
                      <tr
                        key={`${b.pipelineId}-${b.stageId}`}
                        className="border-t border-gray-100"
                      >
                        <td className="px-4 py-2 text-gray-600">
                          {b.pipelineName}
                        </td>
                        <td className="px-4 py-2 font-medium">{b.stageName}</td>
                        <td className="px-4 py-2 text-right">{b.count}</td>
                        <td className="px-4 py-2 text-right text-gray-600">
                          {formatMoney(b.totalValue)}
                        </td>
                      </tr>
                    ))}
                    {filteredBuckets.length === 0 && (
                      <tr>
                        <td
                          colSpan={4}
                          className="px-4 py-6 text-center text-gray-500"
                        >
                          Sin datos.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Leads list */}
            <section>
              <h2 className="text-lg font-semibold mb-3">
                Leads recientes ({filteredLeads.length})
              </h2>
              <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                    <tr>
                      <th className="px-4 py-3">Nombre</th>
                      <th className="px-4 py-3">Pipeline</th>
                      <th className="px-4 py-3">Etapa</th>
                      <th className="px-4 py-3">Origen</th>
                      <th className="px-4 py-3 text-right">Valor</th>
                      <th className="px-4 py-3">Última actividad</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLeads.map((l) => (
                      <tr key={l.id} className="border-t border-gray-100">
                        <td className="px-4 py-2 font-medium">
                          {l.name || "(sin nombre)"}
                        </td>
                        <td className="px-4 py-2 text-gray-600">
                          {l.pipelineName}
                        </td>
                        <td className="px-4 py-2">{l.stageName}</td>
                        <td className="px-4 py-2 text-gray-600">
                          {l.source ?? "—"}
                        </td>
                        <td className="px-4 py-2 text-right text-gray-600">
                          {formatMoney(l.monetaryValue)}
                        </td>
                        <td className="px-4 py-2 text-gray-600">
                          {formatDate(l.updatedAt)}
                        </td>
                      </tr>
                    ))}
                    {filteredLeads.length === 0 && (
                      <tr>
                        <td
                          colSpan={6}
                          className="px-4 py-6 text-center text-gray-500"
                        >
                          Sin leads.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Conversations */}
            <section>
              <h2 className="text-lg font-semibold mb-3">
                Conversaciones recientes
              </h2>
              <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-100">
                {data.conversations.map((c) => (
                  <article
                    key={c.id}
                    className="px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <p className="font-medium truncate">
                        {c.contactName}
                        {c.unreadCount > 0 && (
                          <span className="ml-2 inline-block px-2 py-0.5 text-xs rounded-full bg-red-100 text-red-700">
                            {c.unreadCount} sin leer
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {c.type ?? "—"} · {c.lastMessageDirection ?? "—"} ·{" "}
                        {formatDate(c.lastMessageDate)}
                      </p>
                      <p className="text-sm text-gray-700 mt-1 line-clamp-2">
                        {c.lastMessageBody || "(sin contenido)"}
                      </p>
                    </div>
                  </article>
                ))}
                {data.conversations.length === 0 && (
                  <p className="px-4 py-6 text-center text-gray-500">
                    Sin conversaciones recientes.
                  </p>
                )}
              </div>
            </section>
          </>
        )}

        {!data && !error && loading && (
          <p className="text-gray-500">Cargando snapshot inicial…</p>
        )}
      </main>
    </div>
  );
}
