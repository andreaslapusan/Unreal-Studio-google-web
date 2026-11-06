-- notify_ghl_sync() reads the X-Webhook-Secret from Supabase Vault (name 'ghl_sync_webhook_secret') instead of a
-- literal in the function body. The Vault secret itself is created out-of-band, never in git:
--   ~/jobs/fixes/security-2026-11-06/ghl-vault/apply-and-test.sh (copies the live value server-side).
-- Supersedes the literal-secret version of 20260430000001_db_webhooks_to_ghl_sync.sql (that secret is dead: 401).
create or replace function public.notify_ghl_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  payload jsonb;
  url text := 'https://rnielxgackkshnatvagj.supabase.co/functions/v1/ghl-sync';
  secret text;
begin
  begin
    select decrypted_secret into secret
      from vault.decrypted_secrets where name = 'ghl_sync_webhook_secret';
  exception when others then
    raise warning 'notify_ghl_sync: vault read failed: %', sqlerrm;
  end;

  if secret is null then
    -- never block the visitor's insert (leads, agency sign-ups) over a secret problem
    raise warning 'notify_ghl_sync: no vault secret ghl_sync_webhook_secret; % on % not synced to GHL', tg_op, tg_table_name;
    return coalesce(new, old);
  end if;

  payload := jsonb_build_object(
    'type', tg_op,
    'table', tg_table_name,
    'schema', tg_table_schema,
    'record', case when tg_op = 'DELETE' then null else to_jsonb(new) end,
    'old_record', case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end
  );

  -- fire-and-forget; responses land in net._http_response (kept 6 h)
  perform net.http_post(
    url := url,
    body := payload,
    headers := jsonb_build_object('Content-Type', 'application/json', 'X-Webhook-Secret', secret),
    timeout_milliseconds := 5000
  );

  return coalesce(new, old);
end;
$function$;
