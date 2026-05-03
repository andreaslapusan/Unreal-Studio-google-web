// Supabase Edge Function — `ghl-dashboard`
//
// Read-only snapshot of the GHL CRM for the admin marketing dashboard.
// Returns: pipelines + stages with counts, recent leads, recent conversations.
//
// Auth: requires a Supabase user session whose `profiles.role` = 'admin'.
// Token: GHL_API_TOKEN lives in Supabase secrets — never exposed to browser.
//
// Deploy: `supabase functions deploy ghl-dashboard`
//
// Required env (already set on the project; add only if missing):
//   - GHL_API_TOKEN
//   - GHL_LOCATION_ID
//   - SUPABASE_URL              (auto-injected)
//   - SUPABASE_SERVICE_ROLE_KEY (auto-injected)
//
// Optional env:
//   - GHL_PIPELINE_PRINCIPAL_ID (default: X5mByoeHMbsYrFJbM4GP)
//   - GHL_PIPELINE_LISTING_ID   (default: YNiATL5JmkQ5ZtpRuWLr)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GHL_TOKEN = Deno.env.get("GHL_API_TOKEN") ?? "";
const GHL_LOC = Deno.env.get("GHL_LOCATION_ID") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const PIPE_PRINCIPAL =
  Deno.env.get("GHL_PIPELINE_PRINCIPAL_ID") ?? "X5mByoeHMbsYrFJbM4GP";
const PIPE_LISTING =
  Deno.env.get("GHL_PIPELINE_LISTING_ID") ?? "YNiATL5JmkQ5ZtpRuWLr";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

const ghl = (path: string, init?: RequestInit) =>
  fetch(`https://services.leadconnectorhq.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${GHL_TOKEN}`,
      Version: "2021-07-28",
      "Content-Type": "application/json",
      "User-Agent": "Mozilla/5.0",
      ...(init?.headers ?? {}),
    },
  });

interface Stage {
  id: string;
  name: string;
}
interface PipelineDefinition {
  id: string;
  name: string;
  stages: Stage[];
}
interface OpportunityRow {
  id: string;
  name: string;
  contactId: string;
  pipelineId: string;
  pipelineStageId: string;
  monetaryValue?: number;
  status: string;
  source?: string;
  updatedAt: string;
  createdAt: string;
  contact?: {
    id: string;
    name?: string;
    email?: string;
    phone?: string;
  };
}
interface ConversationRow {
  id: string;
  contactId: string;
  contactName?: string;
  fullName?: string;
  type?: string;
  unreadCount?: number;
  lastMessageBody?: string;
  lastMessageDirection?: string;
  lastMessageDate?: number | string;
}

interface StageBucket {
  pipelineId: string;
  pipelineName: string;
  stageId: string;
  stageName: string;
  count: number;
  totalValue: number;
}

async function getPipelines(): Promise<PipelineDefinition[]> {
  const r = await ghl(`/opportunities/pipelines?locationId=${GHL_LOC}`, {
    headers: { Version: "2021-04-15" },
  });
  if (!r.ok) {
    throw new Error(`GHL pipelines ${r.status}: ${await r.text()}`);
  }
  const d = await r.json();
  return (d?.pipelines ?? []) as PipelineDefinition[];
}

async function searchOpportunities(
  pipelineId: string,
  limit = 100,
): Promise<OpportunityRow[]> {
  const url =
    `/opportunities/search?location_id=${GHL_LOC}` +
    `&pipeline_id=${pipelineId}` +
    `&limit=${limit}`;
  const r = await ghl(url, { headers: { Version: "2021-04-15" } });
  if (!r.ok) {
    throw new Error(`GHL opp search ${r.status}: ${await r.text()}`);
  }
  const d = await r.json();
  return (d?.opportunities ?? []) as OpportunityRow[];
}

async function searchConversations(
  limit = 30,
): Promise<ConversationRow[]> {
  const url =
    `/conversations/search?locationId=${GHL_LOC}` +
    `&limit=${limit}` +
    `&sortBy=last_message_date`;
  const r = await ghl(url, { headers: { Version: "2021-04-15" } });
  if (!r.ok) {
    throw new Error(`GHL conv search ${r.status}: ${await r.text()}`);
  }
  const d = await r.json();
  return (d?.conversations ?? []) as ConversationRow[];
}

async function loadAdminUserId(authHeader: string): Promise<string> {
  const m = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!m) throw new Error("missing Authorization header");
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  const { data, error } = await supabase.auth.getUser(m[1]);
  if (error || !data?.user) throw new Error("invalid session");
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", data.user.id)
    .maybeSingle();
  if (profile?.role !== "admin") throw new Error("forbidden: admin role required");
  return data.user.id;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS });
  }
  if (req.method !== "GET" && req.method !== "POST") {
    return json(405, { error: "method not allowed" });
  }
  if (!GHL_TOKEN || !GHL_LOC) {
    return json(500, { error: "GHL credentials not configured on server" });
  }

  try {
    await loadAdminUserId(req.headers.get("Authorization") ?? "");
  } catch (err) {
    return json(401, { error: (err as Error).message });
  }

  try {
    const pipelines = await getPipelines();
    const targetIds = new Set([PIPE_PRINCIPAL, PIPE_LISTING]);
    const usePipelines = pipelines.filter((p) => targetIds.has(p.id));

    const oppsByPipeline = await Promise.all(
      usePipelines.map((p) => searchOpportunities(p.id, 100)),
    );

    const buckets: StageBucket[] = [];
    const allLeads: Array<OpportunityRow & {
      pipelineName: string;
      stageName: string;
    }> = [];

    usePipelines.forEach((pipe, idx) => {
      const opps = oppsByPipeline[idx];
      const stageMap = new Map(pipe.stages.map((s) => [s.id, s.name]));
      const counts = new Map<string, { count: number; total: number }>();

      for (const opp of opps) {
        const key = opp.pipelineStageId;
        const cur = counts.get(key) ?? { count: 0, total: 0 };
        cur.count += 1;
        cur.total += Number(opp.monetaryValue ?? 0);
        counts.set(key, cur);
        allLeads.push({
          ...opp,
          pipelineName: pipe.name,
          stageName: stageMap.get(opp.pipelineStageId) ?? "(sin etapa)",
        });
      }

      for (const stage of pipe.stages) {
        const c = counts.get(stage.id) ?? { count: 0, total: 0 };
        buckets.push({
          pipelineId: pipe.id,
          pipelineName: pipe.name,
          stageId: stage.id,
          stageName: stage.name,
          count: c.count,
          totalValue: c.total,
        });
      }
    });

    allLeads.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
    const topLeads = allLeads.slice(0, 50).map((l) => ({
      id: l.id,
      name: l.contact?.name || l.name,
      contactId: l.contactId,
      email: l.contact?.email,
      phone: l.contact?.phone,
      pipelineName: l.pipelineName,
      stageName: l.stageName,
      monetaryValue: l.monetaryValue ?? 0,
      status: l.status,
      source: l.source,
      updatedAt: l.updatedAt,
      createdAt: l.createdAt,
    }));

    const conversations = (await searchConversations(30)).map((c) => ({
      id: c.id,
      contactId: c.contactId,
      contactName: c.contactName || c.fullName || "?",
      type: c.type,
      unreadCount: c.unreadCount ?? 0,
      lastMessageBody: (c.lastMessageBody ?? "").slice(0, 200),
      lastMessageDirection: c.lastMessageDirection,
      lastMessageDate: c.lastMessageDate,
    }));

    return json(200, {
      generatedAt: new Date().toISOString(),
      pipelines: usePipelines.map((p) => ({ id: p.id, name: p.name })),
      stageBuckets: buckets,
      leads: topLeads,
      conversations,
      counts: {
        leadsTotal: allLeads.length,
        conversationsReturned: conversations.length,
      },
    });
  } catch (err) {
    return json(500, { error: (err as Error).message });
  }
});
