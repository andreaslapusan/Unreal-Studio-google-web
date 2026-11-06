-- PART 1 (apply BEFORE deploying the web change). Additive: today's web keeps working.
-- extension_years = the years of projects.extensions WITHOUT the price, so the public page can keep showing
-- "+5 / +10 years" once anon loses `extensions` (Andreas 29-oct: never the extension price on the web).
begin;
set local lock_timeout = '5s';  -- never queue behind a long lock and stall the public site
-- Price guard (trg_block_mgmt_api_project_edits): identical to the live function except 'extension_years'
-- in `allowed`. In a BEFORE trigger NEW.extension_years is still NULL, so without this every mgmt-api edit
-- of an allowed column (brochures, floor_plans...) would be logged as a BLOCKED price attempt and alert
-- Andreas. `extensions` itself stays protected, so the guard protects exactly the same data as before.
create or replace function public.block_mgmt_api_project_edits()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  allowed text[] := array['brochures','brochure_url','floor_plans','updated_at','extension_years'];
  o jsonb := to_jsonb(old) - allowed; n jsonb := to_jsonb(new) - allowed;
begin
  if current_setting('application_name', true) = 'mgmt-api'
     and coalesce(current_setting('app.allow_mgmt_edit', true),'') <> 'on'
     and o is distinct from n then
    insert into project_price_audit(project_id,old_market,new_market,old_investor,new_investor,db_role,jwt,app,query,client_addr,blocked)
    values (new.id, old.market_price, new.market_price, old.investor_price, new.investor_price, current_user, null,
            'mgmt-api', left(current_query(), 4000), inet_client_addr()::text, true);
    new := jsonb_populate_record(new, o);  -- restore every protected column from OLD
  end if;
  return new;
end $function$;
alter table public.projects
  add column if not exists extension_years jsonb
  generated always as (jsonb_path_query_array(extensions, 'lax $[*].years')) stored;
comment on column public.projects.extension_years is
  'Generated: extensions[*].years without prices. Only way anon sees leasehold extensions. Do not write.';
grant select (extension_years) on public.projects to anon;
commit;
notify pgrst, 'reload schema';
