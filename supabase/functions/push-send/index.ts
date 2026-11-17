/**
 * push-send — avisos push de las apps iOS (APNs, token .p8). Lo llaman los triggers de admin_notifications
 * (public.push_send) con la cabecera x-push-secret (= secret PUSH_SEND_SECRET = vault push_send_secret).
 *
 *  { kind: 'admin_new', ids: [uuid…] }  → aviso con título/cuerpo + número del icono a los admin/equipo
 *  { kind: 'admin_badge' }              → push silencioso solo con el número (al marcar leídas / borrar)
 *  { kind: 'test', user_id, title, body } → prueba manual a un usuario
 *
 * Sin APNS_KEY_P8 / APNS_KEY_ID / APNS_TEAM_ID no envía nada (responde skipped): así queda listo a falta de la clave.
 * verify_jwt = false (la protege el secret). Tokens que Apple da por muertos (410 / BadDeviceToken) se borran.
 */
// @ts-nocheck — Deno runtime types not in the Vite tsconfig
import { createClient } from 'npm:@supabase/supabase-js@2';

const env = (k: string) => Deno.env.get(k) ?? '';
const ADMIN_APPS = ['com.unrealstudio.admin', 'com.unrealstudio.admin.beta'];
const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });

let jwtCache: { token: string; at: number } | null = null;
async function apnsJwt(): Promise<string> {
  if (jwtCache && Date.now() - jwtCache.at < 50 * 60_000) return jwtCache.token; // Apple: renovar cada 20-60 min
  const pem = env('APNS_KEY_P8').replace(/-----[^-]+-----|\s/g, '');
  const key = await crypto.subtle.importKey('pkcs8', Uint8Array.from(atob(pem), (c) => c.charCodeAt(0)),
    { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const b64 = (b: Uint8Array | string) => btoa(typeof b === 'string' ? b : String.fromCharCode(...b))
    .replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  const head = b64(JSON.stringify({ alg: 'ES256', kid: env('APNS_KEY_ID') }));
  const claims = b64(JSON.stringify({ iss: env('APNS_TEAM_ID'), iat: Math.floor(Date.now() / 1000) }));
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(`${head}.${claims}`)));
  jwtCache = { token: `${head}.${claims}.${b64(sig)}`, at: Date.now() };
  return jwtCache.token;
}

async function send(tokens: { token: string; app: string }[], aps: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  const silent = !aps.alert; // solo número: Apple lo trata como 'alert' sin texto (no 'background')
  const results = await Promise.all(tokens.map(async ({ token, app }) => {
    const r = await fetch(`https://api.push.apple.com/3/device/${token}`, {
      method: 'POST',
      headers: {
        authorization: `bearer ${await apnsJwt()}`, 'apns-topic': app,
        'apns-push-type': 'alert', 'apns-priority': silent ? '5' : '10',
      },
      body: JSON.stringify({ aps, ...extra }),
    });
    const reason = r.ok ? '' : ((await r.json().catch(() => ({}))).reason ?? '');
    if (r.status === 410 || reason === 'BadDeviceToken' || reason === 'DeviceTokenNotForTopic') {
      await db.from('device_tokens').delete().eq('token', token);
    }
    return { status: r.status, reason };
  }));
  return { sent: results.filter((x) => x.status === 200).length, failed: results.filter((x) => x.status !== 200) };
}

async function adminTokens() {
  const { data: staff } = await db.from('profiles').select('user_id').in('role', ['admin', 'team']);
  const ids = (staff ?? []).map((p) => p.user_id);
  if (!ids.length) return [];
  const { data } = await db.from('device_tokens').select('token, app').in('app', ADMIN_APPS).in('user_id', ids);
  return data ?? [];
}

async function unread() {
  const { count } = await db.from('admin_notifications').select('id', { count: 'exact', head: true }).eq('is_read', false);
  return count ?? 0;
}

Deno.serve(async (req) => {
  if (!env('PUSH_SEND_SECRET') || req.headers.get('x-push-secret') !== env('PUSH_SEND_SECRET')) {
    return new Response('forbidden', { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  if (!env('APNS_KEY_P8') || !env('APNS_KEY_ID') || !env('APNS_TEAM_ID')) {
    return Response.json({ skipped: 'APNs key not configured', kind: body.kind });
  }
  try {
    if (body.kind === 'admin_new') {
      const ids: string[] = (body.ids ?? []).slice(0, 50);
      const { data: rows } = await db.from('admin_notifications').select('title, body').in('id', ids);
      if (!rows?.length) return Response.json({ sent: 0 });
      const alert = rows.length === 1 ? { title: rows[0].title, body: rows[0].body ?? '' }
        : { title: `${rows.length} avisos nuevos`, body: rows.map((r) => r.title).slice(0, 3).join(' · ') };
      return Response.json(await send(await adminTokens(), { alert, badge: await unread(), sound: 'default' },
        { url: '/admin?view=notifications' }));
    }
    if (body.kind === 'admin_badge') {
      return Response.json(await send(await adminTokens(), { badge: await unread() }));
    }
    if (body.kind === 'test' && body.user_id) {
      const { data } = await db.from('device_tokens').select('token, app').eq('user_id', body.user_id);
      return Response.json(await send(data ?? [], { alert: { title: body.title ?? 'Unreal', body: body.body ?? 'Prueba' }, sound: 'default' },
        body.url ? { url: body.url } : {}));
    }
    return Response.json({ error: 'unknown kind' }, { status: 400 });
  } catch (e) {
    console.error('push-send', e);
    return Response.json({ error: String(e) }, { status: 500 });
  }
});
