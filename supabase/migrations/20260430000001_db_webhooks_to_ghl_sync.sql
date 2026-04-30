-- Database webhooks → ghl-sync edge function.
--
-- The Supabase dashboard "Database Webhooks" UI is a pretty wrapper around
-- pg_net + AFTER triggers on tables that POST to a function URL with
-- configurable headers. The same mechanism is reachable from SQL, which lets
-- us version-control the wiring instead of clicking through a dashboard.
--
-- Wires:
--   listing_partner_applications INSERT
--   listing_partners             UPDATE
--   investors                    INSERT
--   lead_attributions            INSERT
--   property_updates             INSERT  (handler is a placeholder right now,
--                                         but trigger lands so future work
--                                         doesn't need a dashboard step)
--
-- Each trigger emits a payload matching what Supabase Realtime / DB Hooks
-- send so the existing TypeScript handlers in supabase/functions/ghl-sync
-- don't need any change.

create extension if not exists pg_net with schema extensions;

-- URL + secret are inlined in the trigger function. ALTER DATABASE SET would
-- need superuser which the Supabase service role doesn't have. If the secret
-- ever rotates, we redeploy this migration with the new value.
create or replace function public.notify_ghl_sync()
returns trigger
language plpgsql
security definer
as $$
declare
  payload jsonb;
  url text := 'https://rnielxgackkshnatvagj.supabase.co/functions/v1/ghl-sync';
  secret text := 'd2ccf9bc804f900de05c16c0f8f6d901602fee8c8d7d0ec242a554159db76001';
begin
  payload := jsonb_build_object(
    'type', tg_op,
    'table', tg_table_name,
    'schema', tg_table_schema,
    'record', case when tg_op = 'DELETE' then null else to_jsonb(new) end,
    'old_record', case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end
  );

  -- Fire-and-forget — the trigger doesn't wait for the HTTP response.
  -- pg_net queues the request; responses can be inspected in net._http_response.
  perform net.http_post(
    url      := url,
    body     := payload,
    headers  := jsonb_build_object(
                  'Content-Type', 'application/json',
                  'X-Webhook-Secret', secret
                ),
    timeout_milliseconds := 5000
  );

  return coalesce(new, old);
end;
$$;

-- listing_partner_applications: every new application should be pushed to GHL
drop trigger if exists trg_lpa_to_ghl on public.listing_partner_applications;
create trigger trg_lpa_to_ghl
  after insert on public.listing_partner_applications
  for each row execute function public.notify_ghl_sync();

-- listing_partners: status transitions (pending → active) trigger the
-- handler, which short-circuits unless status='active'
drop trigger if exists trg_lp_to_ghl on public.listing_partners;
create trigger trg_lp_to_ghl
  after update on public.listing_partners
  for each row
  when (old.status is distinct from new.status)
  execute function public.notify_ghl_sync();

-- investors: brand new investor → contact + opp in FUNNEL PRINCIPAL
drop trigger if exists trg_investors_to_ghl on public.investors;
create trigger trg_investors_to_ghl
  after insert on public.investors
  for each row execute function public.notify_ghl_sync();

-- lead_attributions: form_submit events → GHL contact tagging
drop trigger if exists trg_la_to_ghl on public.lead_attributions;
create trigger trg_la_to_ghl
  after insert on public.lead_attributions
  for each row execute function public.notify_ghl_sync();

-- property_updates: placeholder; handler logs only for now
drop trigger if exists trg_pu_to_ghl on public.property_updates;
create trigger trg_pu_to_ghl
  after insert on public.property_updates
  for each row execute function public.notify_ghl_sync();
