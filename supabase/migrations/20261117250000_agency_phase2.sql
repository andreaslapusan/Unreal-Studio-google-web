-- 17-nov-2026 fase 2 agencias: perfil editable, link corto de referido, contratos de proyecto por solicitud,
-- auditoría de comisiones, asistente de Ayuda (Groq), y renders por tipo en la web pública.

-- (6) public project page: per-type render folders (Deseo Type A/B/C). RULE: PUBLIC_PROJECT_COLS == grant.
grant select (drive_renders_links) on public.projects to anon, authenticated;

-- (1) agency edits its own data (email goes through agency-hub with confirmation link)
alter table public.listing_partners
  add column if not exists pending_email text,
  add column if not exists pending_email_token_hash text,
  add column if not exists pending_email_expires_at timestamptz;
CREATE OR REPLACE FUNCTION public.protect_partner_privileged_cols()
 RETURNS trigger LANGUAGE plpgsql
AS $function$
declare
  allowed text[] := array['logo_url','phone','whatsapp','manager_name','agency_name','website','country'];
begin
  if current_user = 'authenticated' and coalesce(public."current_role"(), '') <> 'admin' then
    if (to_jsonb(new) - allowed) is distinct from (to_jsonb(old) - allowed) then
      raise exception 'not_allowed: an agency can only change its name, manager, phone, WhatsApp, website, country and logo' using errcode = '42501';
    end if;
    if coalesce(trim(new.agency_name), '') = '' then raise exception 'agency_name_required' using errcode = '22023'; end if;
  end if;
  return new;
end;
$function$;

-- (4) audit of commission / market / status edits (any path: admin modal, RPC, SQL)
create or replace function public.trg_partner_terms_audit()
returns trigger language plpgsql security definer set search_path = public as $$
declare d jsonb := '{}'::jsonb;
begin
  if new.commission_close_pct is distinct from old.commission_close_pct then d := d || jsonb_build_object('commission_close_pct', jsonb_build_array(old.commission_close_pct, new.commission_close_pct)); end if;
  if new.commission_referral_pct is distinct from old.commission_referral_pct then d := d || jsonb_build_object('commission_referral_pct', jsonb_build_array(old.commission_referral_pct, new.commission_referral_pct)); end if;
  if new.market is distinct from old.market then d := d || jsonb_build_object('market', jsonb_build_array(old.market, new.market)); end if;
  if d <> '{}'::jsonb then
    insert into partner_audit (partner_id, action, actor, detail) values (new.id, 'terms_change', coalesce(public.app_email(), current_user), d);
  end if;
  return new;
end $$;
drop trigger if exists trg_partner_terms_audit on public.listing_partners;
create trigger trg_partner_terms_audit after update of commission_close_pct, commission_referral_pct, market on public.listing_partners
  for each row execute function public.trg_partner_terms_audit();

-- (2) short referral link per agency: /a/<code> → its long utm URL (reuses short_links)
create or replace function public.agency_short_link(p_target text)
returns text language plpgsql security definer set search_path = public as $$
declare v_pid uuid := public.my_active_partner_id(); v_slug text; v_code text; i int;
begin
  if v_pid is null then raise exception 'not_partner' using errcode = '42501'; end if;
  select coalesce(personal_link_slug, id::text) into v_slug from listing_partners where id = v_pid;
  if p_target is null or p_target not like 'https://unrealstudiobali.com/%' or position('utm_partner=' || v_slug in p_target) = 0 then
    raise exception 'bad_target' using errcode = '22023';
  end if;
  select code into v_code from short_links where target = p_target limit 1;
  if v_code is not null then return v_code; end if;
  for i in 1..5 loop
    v_code := substr(translate(encode(extensions.gen_random_bytes(8), 'base64'), '+/=lIO0', ''), 1, 7);
    begin
      insert into short_links (code, target) values (v_code, p_target);
      return v_code;
    exception when unique_violation or check_violation then null;
    end;
  end loop;
  raise exception 'no_code';
end $$;
revoke all on function public.agency_short_link(text) from public;
grant execute on function public.agency_short_link(text) to authenticated, service_role;

-- (3) project agreement per request: agency picks the project (+client) → admin uploads the template PDF →
-- agency downloads it and uploads the client-signed copy. Files: agency-contracts/<partner_id>/requests/<request_id>/…
alter table public.agency_requests drop constraint if exists agency_requests_type_check;
alter table public.agency_requests add constraint agency_requests_type_check
  check (type = any (array['call','visit','presentation','contract','reserve','project_contract']));
alter table public.agency_requests
  add column if not exists project_id uuid references public.projects(id) on delete set null,
  add column if not exists client_name text check (client_name is null or length(client_name) <= 200),
  add column if not exists template_path text,
  add column if not exists template_uploaded_at timestamptz,
  add column if not exists client_signed_path text,
  add column if not exists client_signed_uploaded_at timestamptz;

create or replace function public.trg_agency_request_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_name text; v_proj text;
begin
  if new.type = 'project_contract' then
    select agency_name into v_name from listing_partners where id = new.agency_id;
    select name into v_proj from projects where id = new.project_id;
    perform notify('agency_project_contract_request', v_name, coalesce(v_proj, '') || coalesce(' · ' || new.client_name, ''), 'info',
                   'agency_request', new.id::text, v_name, public.app_email(), jsonb_build_object('project', v_proj, 'client', new.client_name));
  end if;
  return new;
end $$;
drop trigger if exists trg_agency_request_notify on public.agency_requests;
create trigger trg_agency_request_notify after insert on public.agency_requests for each row execute function public.trg_agency_request_notify();

create or replace function public.agency_set_request_client_signed(p_request uuid, p_path text)
returns json language plpgsql security definer set search_path = public as $$
declare v_pid uuid := public.my_active_partner_id(); r agency_requests; v_name text; v_proj text;
begin
  select * into r from agency_requests where id = p_request and agency_id = v_pid and type = 'project_contract';
  if r.id is null then return json_build_object('success', false, 'error', 'not_found'); end if;
  if p_path not like v_pid::text || '/requests/' || r.id::text || '/agency-%' then return json_build_object('success', false, 'error', 'bad_path'); end if;
  if not exists (select 1 from storage.objects where bucket_id = 'agency-contracts' and name = p_path) then return json_build_object('success', false, 'error', 'not_uploaded'); end if;
  update agency_requests set client_signed_path = p_path, client_signed_uploaded_at = now() where id = r.id;
  select agency_name into v_name from listing_partners where id = v_pid;
  select name into v_proj from projects where id = r.project_id;
  perform notify('agency_client_signed_upload', v_name, coalesce(v_proj, '') || coalesce(' · ' || r.client_name, ''), 'info',
                 'agency_request', r.id::text, v_name, public.app_email(), jsonb_build_object('project', v_proj, 'client', r.client_name));
  return json_build_object('success', true);
end $$;
revoke all on function public.agency_set_request_client_signed(uuid, text) from public;
grant execute on function public.agency_set_request_client_signed(uuid, text) to authenticated, service_role;

-- (5) Help assistant log (admin reads; agencies only through the edge function)
create table if not exists public.agency_assistant_messages (
  id bigint generated always as identity primary key,
  partner_id uuid not null references public.listing_partners(id) on delete cascade,
  created_at timestamptz not null default now(),
  lang text,
  question text not null check (length(question) <= 1000),
  answer text,
  handoff boolean not null default false,
  error text
);
create index if not exists agency_assistant_messages_partner_idx on public.agency_assistant_messages (partner_id, created_at desc);
alter table public.agency_assistant_messages enable row level security;
drop policy if exists aam_admin_read on public.agency_assistant_messages;
create policy aam_admin_read on public.agency_assistant_messages for select to authenticated using (public.is_admin());
grant select on public.agency_assistant_messages to authenticated;
grant select, insert, update, delete on public.agency_assistant_messages to service_role;

-- badge: + project agreements waiting for our template
CREATE OR REPLACE FUNCTION public.admin_unread_count()
 RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  select case when is_admin_or_team() then (
    (select count(*) from client_payments cp
       join client_projects cpj on cpj.id=cp.client_project_id
       join clients c on c.id=cpj.client_id
      where not coalesce(cp.received,false) and cp.paid_at is null
        and cp.due_date is not null and cp.due_date < current_date
        and coalesce(c.status,'') <> 'draft')
  + (select count(*) from projects p
      where coalesce(p.is_hidden,false)=false and coalesce(p.completion_percent,0) < 100
        and exists(select 1 from client_projects cpj where cpj.project_id::text=p.id::text)
        and (nullif(p.construction_update_date,'') is null or nullif(p.construction_update_date,'')::date < current_date-14))
  + (select count(*) from admin_notifications where is_read=false and type = 'payment_claim')
  + (case when is_admin() then
       (select count(*) from listing_partner_applications where status = 'pending')
     + (select count(*) from listing_partners where deleted_at is null and agency_signed_path is not null
          and (signed_contract_uploaded_at is null or signed_contract_uploaded_at < agency_signed_uploaded_at))
     + (select count(*) from agency_requests where type = 'project_contract' and template_path is null and status <> 'cancelled')
     else 0 end)
  )::int else 0 end;
$function$;

-- column grants (agency_requests uses column-level privileges): agency inserts project + client; admin (RLS) sets the template
grant insert (project_id, client_name) on public.agency_requests to authenticated;
grant update (template_path, template_uploaded_at) on public.agency_requests to authenticated;
