-- Agency funnel, production (15-nov-2026). Plan P0+P1 items 1-26.
-- Phase 1: compatible with the frontend that is live today. The revokes that need the new
-- frontend live in 20261115120100_agency_funnel_phase2.sql (apply together with the web deploy).
-- Down: 20261115120000_agency_funnel_prod.down.sql

-- ───────────────────────────── 0. Config ─────────────────────────────
create table if not exists public.agency_config (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.agency_config enable row level security;
drop policy if exists agc_admin on public.agency_config;
create policy agc_admin on public.agency_config for all
  using (public.current_role() = 'admin') with check (public.current_role() = 'admin');
revoke all on public.agency_config from anon, authenticated;
grant select, insert, update, delete on public.agency_config to authenticated;
grant select, insert, update, delete on public.agency_config to service_role;
insert into public.agency_config (key, value) values
  ('auto_approve', 'false'),                       -- flipped to true only after the E2E (item 27) passes
  -- World start rate is an open question for Andreas (10-20 %): 10 until he picks.
  ('commission_defaults', '{"es":{"close":5,"referral":3},"world":{"close":10,"referral":10}}'),
  ('terms_version', '"2026-11-15"'),
  ('blacklist', '{"emails":[],"domains":[]}')
on conflict (key) do nothing;

create or replace function public.agency_cfg(p_key text)
returns jsonb language sql stable security definer set search_path = public as $$
  select value from public.agency_config where key = p_key;
$$;
revoke all on function public.agency_cfg(text) from public, anon, authenticated;
grant execute on function public.agency_cfg(text) to service_role;

-- ───────────────────────────── 1. listing_partners ─────────────────────────────
update public.listing_partners set status = 'approved' where status = 'active';
update public.listing_partners set email = lower(trim(email)) where email is distinct from lower(trim(email));

alter table public.listing_partners
  add column if not exists deleted_at              timestamptz,
  add column if not exists suspended_at            timestamptz,
  add column if not exists status_reason           text,
  add column if not exists market                  text not null default 'es',
  add column if not exists commission_close_pct    numeric(5,2),
  add column if not exists commission_referral_pct numeric(5,2),
  add column if not exists lang                    text not null default 'es',
  add column if not exists source                  text,
  add column if not exists notes                   text,
  add column if not exists monthly_volume          text,
  add column if not exists projects_interested     text[] not null default '{}',
  add column if not exists application_id          uuid,
  add column if not exists welcomed_at             timestamptz,
  add column if not exists is_demo                 boolean not null default false,
  add column if not exists login_reminders         int not null default 0;

alter table public.listing_partners drop constraint if exists listing_partners_status_check;
alter table public.listing_partners add constraint listing_partners_status_check
  check (status in ('pending','approved','suspended','rejected','deleted'));
alter table public.listing_partners drop constraint if exists listing_partners_market_check;
alter table public.listing_partners add constraint listing_partners_market_check check (market in ('es','world'));
alter table public.listing_partners drop constraint if exists listing_partners_lang_check;
alter table public.listing_partners add constraint listing_partners_lang_check check (lang in ('es','en','ro','id'));
alter table public.listing_partners drop constraint if exists listing_partners_pct_check;
alter table public.listing_partners add constraint listing_partners_pct_check
  check (coalesce(commission_close_pct, 0) between 0 and 50 and coalesce(commission_referral_pct, 0) between 0 and 50);

-- item 17: one agency per email, case-insensitive
alter table public.listing_partners drop constraint if exists listing_partners_email_key;
create unique index if not exists listing_partners_email_lower_key on public.listing_partners (lower(email));

-- item 26: internal + demo rows out of counts and commissions
update public.listing_partners set is_demo = true
 where email in ('andreas@unrealstudiobali.com', 'demo.agencia@unrealstudiobali.com');

create or replace function public.trg_lower_email()
returns trigger language plpgsql as $$
begin
  if new.email is not null then new.email := lower(trim(new.email)); end if;
  return new;
end;
$$;
drop trigger if exists trg_lp_lower_email on public.listing_partners;
create trigger trg_lp_lower_email before insert or update of email on public.listing_partners
  for each row execute function public.trg_lower_email();

-- item 17: partners may change ONLY their branding columns (allow-list; the old deny-list let them change slug/name/website)
create or replace function public.protect_partner_privileged_cols()
returns trigger language plpgsql as $$
declare
  allowed text[] := array['logo_url','phone','whatsapp','manager_name'];
begin
  if current_user = 'authenticated' and coalesce(public."current_role"(), '') <> 'admin' then
    if (to_jsonb(new) - allowed) is distinct from (to_jsonb(old) - allowed) then
      raise exception 'not_allowed: an agency can only change its logo, phone, WhatsApp and manager name' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

-- item 1: the one gate. Approved and not deleted, nothing else.
create or replace function public.my_active_partner_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.listing_partners
   where user_id = auth.uid() and status = 'approved' and deleted_at is null
   limit 1;
$$;
revoke all on function public.my_active_partner_id() from public;
-- anon too: RLS policies call it for anon queries (returns null without a session)
grant execute on function public.my_active_partner_id() to anon, authenticated, service_role;

drop policy if exists partners_self_update_branding on public.listing_partners;
create policy partners_self_update_branding on public.listing_partners for update
  using (user_id = auth.uid() and id = public.my_active_partner_id())
  with check (user_id = auth.uid());

-- item 17: linking never touches admin/team/investor accounts
create or replace function public.link_partner_user(p_partner uuid, p_user uuid, p_email text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_partner is null or p_user is null then return; end if;
  if exists (select 1 from public.profiles where user_id = p_user and role is not null and role <> 'lister') then return; end if;
  update public.listing_partners set user_id = p_user where id = p_partner and user_id is null;
  insert into public.profiles (user_id, role, partner_id, email)
  values (p_user, 'lister', p_partner, lower(p_email))
  on conflict (user_id) do update set role = 'lister', partner_id = excluded.partner_id
   where public.profiles.role is null or public.profiles.role = 'lister';
end;
$$;
revoke all on function public.link_partner_user(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.link_partner_user(uuid, uuid, text) to service_role;

-- item 26: backfill a lister profile for every linked partner (skips admin/team users)
select public.link_partner_user(lp.id, lp.user_id, lp.email)
  from public.listing_partners lp where lp.user_id is not null;

-- ───────────────────────────── 2. Applications ─────────────────────────────
update public.listing_partner_applications set email = lower(trim(email)) where email is distinct from lower(trim(email));
alter table public.listing_partner_applications
  add column if not exists ref_token         text,
  add column if not exists campaign          text,
  add column if not exists market            text,
  add column if not exists lang              text not null default 'es',
  add column if not exists utm_source        text,
  add column if not exists utm_medium        text,
  add column if not exists utm_campaign      text,
  add column if not exists accepted_terms_at timestamptz,
  add column if not exists terms_version     text,
  add column if not exists ip                text,
  add column if not exists user_agent        text,
  add column if not exists auto_check        jsonb,
  add column if not exists reject_reason     text,
  add column if not exists partner_id        uuid,
  add column if not exists notified_at       timestamptz;

alter table public.listing_partner_applications drop constraint if exists lpa_fields_check;
alter table public.listing_partner_applications add constraint lpa_fields_check check (
  length(trim(coalesce(agency_name, ''))) between 1 and 200
  and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(email) <= 254
  and coalesce(length(manager_name), 0) <= 200 and coalesce(length(phone), 0) <= 60
  and coalesce(length(whatsapp), 0) <= 60 and coalesce(length(website), 0) <= 300
  and coalesce(length(country), 0) <= 100 and coalesce(length(experience), 0) <= 2000
  and coalesce(length(monthly_volume), 0) <= 100 and coalesce(length(source), 0) <= 300
  and coalesce(length(notes), 0) <= 2000 and coalesce(length(ref_token), 0) <= 2000
  and coalesce(array_length(projects_interested, 1), 0) <= 30
  and coalesce(market, 'es') in ('es','world') and lang in ('es','en','ro','id'));
create unique index if not exists lpa_pending_email_key on public.listing_partner_applications (lower(email)) where status = 'pending';

drop trigger if exists trg_lpa_lower_email on public.listing_partner_applications;
create trigger trg_lpa_lower_email before insert or update of email on public.listing_partner_applications
  for each row execute function public.trg_lower_email();

-- item 2: anon can only create a pending row with the form columns (status kept for the live form until phase 2)
revoke insert, update, delete, truncate, trigger, references on public.listing_partner_applications from anon;
revoke insert, truncate, trigger, references on public.listing_partner_applications from authenticated;
grant insert (agency_name, manager_name, email, phone, whatsapp, website, country, projects_interested,
              experience, monthly_volume, source, notes, status)
  on public.listing_partner_applications to anon, authenticated;
drop policy if exists lpa_anon_insert on public.listing_partner_applications;
create policy lpa_anon_insert on public.listing_partner_applications for insert
  with check (status = 'pending' and reviewed_by is null and reviewed_at is null and ghl_contact_id is null);
drop policy if exists lpa_admin_delete on public.listing_partner_applications;
create policy lpa_admin_delete on public.listing_partner_applications for delete using (public.current_role() = 'admin');

-- items 2, 9, 15, 16: the signup form goes through one RPC (honeypot, time-to-submit, terms, friendly duplicates, per-IP limit)
create or replace function public.agency_apply(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(trim(coalesce(p->>'email', '')));
  v_hdr   jsonb;
  v_ip    text;
  v_id    uuid;
  v_web   text := nullif(trim(coalesce(p->>'website', '')), '');
  v_lang  text := coalesce(nullif(p->>'lang', ''), 'es');
begin
  if coalesce(p->>'company_url', '') <> '' then return jsonb_build_object('status', 'ok'); end if; -- honeypot: bots get a fake ok
  if coalesce((p->>'elapsed_ms')::bigint, 0) < 3000 then return jsonb_build_object('status', 'too_fast'); end if;
  if coalesce((p->>'accept_terms')::boolean, false) is not true then return jsonb_build_object('status', 'terms_required'); end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v_email) > 254 then return jsonb_build_object('status', 'invalid_email'); end if;
  if length(trim(coalesce(p->>'agency_name', ''))) = 0 then return jsonb_build_object('status', 'name_required'); end if;
  if v_lang not in ('es','en','ro','id') then v_lang := 'en'; end if;
  if exists (select 1 from listing_partners where lower(email) = v_email and status in ('approved','suspended') and deleted_at is null) then
    return jsonb_build_object('status', 'already_partner');
  end if;
  if exists (select 1 from listing_partner_applications where lower(email) = v_email and status = 'pending') then
    return jsonb_build_object('status', 'already_pending');
  end if;
  begin v_hdr := current_setting('request.headers', true)::jsonb; exception when others then v_hdr := null; end;
  v_ip := nullif(trim(split_part(coalesce(v_hdr->>'cf-connecting-ip', v_hdr->>'x-forwarded-for', ''), ',', 1)), '');
  if v_ip is not null and (select count(*) from listing_partner_applications
                            where ip = v_ip and created_at > now() - interval '1 hour') >= 5 then
    return jsonb_build_object('status', 'rate_limited');
  end if;
  if v_web is not null and v_web !~* '^https?://' then v_web := 'https://' || v_web; end if;

  insert into listing_partner_applications (
    agency_name, manager_name, email, phone, whatsapp, website, country, projects_interested,
    experience, monthly_volume, source, notes, status, ref_token, campaign, market, lang,
    utm_source, utm_medium, utm_campaign, accepted_terms_at, terms_version, ip, user_agent)
  values (
    trim(p->>'agency_name'), nullif(trim(coalesce(p->>'manager_name', '')), ''), v_email,
    nullif(trim(coalesce(p->>'phone', '')), ''), nullif(trim(coalesce(p->>'whatsapp', '')), ''), v_web,
    nullif(trim(coalesce(p->>'country', '')), ''),
    coalesce(array(select jsonb_array_elements_text(coalesce(p->'projects_interested', '[]'::jsonb))), '{}'),
    nullif(trim(coalesce(p->>'experience', '')), ''), nullif(trim(coalesce(p->>'monthly_volume', '')), ''),
    coalesce(nullif(trim(coalesce(p->>'source', '')), ''), nullif(p->>'utm_source', ''), 'web'),
    nullif(trim(coalesce(p->>'notes', '')), ''), 'pending',
    nullif(p->>'ref', ''), nullif(p->>'campaign', ''), nullif(p->>'market', ''), v_lang,
    nullif(p->>'utm_source', ''), nullif(p->>'utm_medium', ''), nullif(p->>'utm_campaign', ''),
    now(), agency_cfg('terms_version') #>> '{}', v_ip, left(v_hdr->>'user-agent', 500))
  returning id into v_id;
  return jsonb_build_object('status', 'ok', 'id', v_id,
                            'auto', coalesce((agency_cfg('auto_approve') #>> '{}')::boolean, false));
exception
  when unique_violation then return jsonb_build_object('status', 'already_pending');
  when check_violation  then return jsonb_build_object('status', 'invalid');
end;
$$;
revoke all on function public.agency_apply(jsonb) from public;
grant execute on function public.agency_apply(jsonb) to anon, authenticated, service_role;

-- item 8: the reply bot only learns the status (service role only: no email enumeration)
create or replace function public.agency_application_status(p_email text)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(
    (select case when lp.status = 'approved' then 'approved' else lp.status end
       from listing_partners lp where lower(lp.email) = lower(trim(p_email)) and lp.deleted_at is null limit 1),
    (select a.status from listing_partner_applications a where lower(a.email) = lower(trim(p_email))
      order by a.created_at desc limit 1),
    'none');
$$;
revoke all on function public.agency_application_status(text) from public, anon, authenticated;
grant execute on function public.agency_application_status(text) to service_role;

-- ───────────────────────────── 3. Audit (written by the RPCs) ─────────────────────────────
create table if not exists public.partner_audit (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  partner_id uuid,
  application_id uuid,
  action     text not null,
  actor      text,
  detail     jsonb
);
alter table public.partner_audit enable row level security;
drop policy if exists pa_admin_read on public.partner_audit;
create policy pa_admin_read on public.partner_audit for select using (public.current_role() = 'admin');
revoke all on public.partner_audit from anon, authenticated;
grant select on public.partner_audit to authenticated;
grant select, insert, update, delete on public.partner_audit to service_role;

-- ───────────────────────────── 4. Approval (item 4) ─────────────────────────────
create or replace function public.approve_partner_application(p_app uuid, p_opts jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  a      listing_partner_applications;
  d      jsonb := coalesce(agency_cfg('commission_defaults'), '{"es":{"close":5,"referral":3},"world":{"close":10,"referral":10}}');
  v_mkt  text;
  v_close numeric;
  v_ref  numeric;
  v_pid  uuid;
  v_uid  uuid;
  v_by   text := coalesce(nullif(p_opts->>'by', ''), 'auto');
begin
  select * into a from listing_partner_applications where id = p_app for update;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  if a.status = 'approved' and a.partner_id is not null then
    return jsonb_build_object('status', 'already_approved', 'partner_id', a.partner_id, 'email', a.email, 'lang', a.lang);
  end if;
  v_mkt := coalesce(nullif(p_opts->>'market', ''), a.market,
    case when coalesce(a.country, '') ~* '^\s*(es|españa|espana|spain|spanien|espagne|spagna)\s*$' then 'es'
         when coalesce(trim(a.country), '') = '' and a.lang = 'es' then 'es'
         else 'world' end);
  v_close := coalesce((p_opts->>'close_pct')::numeric, (d->v_mkt->>'close')::numeric);
  v_ref   := coalesce((p_opts->>'referral_pct')::numeric, (d->v_mkt->>'referral')::numeric);

  insert into listing_partners (agency_name, manager_name, email, phone, whatsapp, website, country, status,
      approved_at, approved_by, market, commission_close_pct, commission_referral_pct, lang, source, notes,
      monthly_volume, projects_interested, application_id)
  values (a.agency_name, a.manager_name, lower(a.email), a.phone, a.whatsapp, a.website, a.country, 'approved',
      now(), v_by, v_mkt, v_close, v_ref, a.lang, coalesce(a.utm_campaign, a.source), a.notes,
      a.monthly_volume, coalesce(a.projects_interested, '{}'), a.id)
  on conflict ((lower(email))) do update set
      status = 'approved', deleted_at = null, suspended_at = null, status_reason = null,
      approved_at = now(), approved_by = v_by, agency_name = excluded.agency_name,
      manager_name = coalesce(excluded.manager_name, listing_partners.manager_name),
      phone = coalesce(excluded.phone, listing_partners.phone),
      whatsapp = coalesce(excluded.whatsapp, listing_partners.whatsapp),
      website = coalesce(excluded.website, listing_partners.website),
      country = coalesce(excluded.country, listing_partners.country),
      market = excluded.market, commission_close_pct = excluded.commission_close_pct,
      commission_referral_pct = excluded.commission_referral_pct, lang = excluded.lang,
      source = excluded.source, notes = coalesce(excluded.notes, listing_partners.notes),
      monthly_volume = excluded.monthly_volume, projects_interested = excluded.projects_interested,
      application_id = excluded.application_id, login_reminders = 0
  returning id, user_id into v_pid, v_uid;

  -- reactivated after a delete: slug was cleared
  update listing_partners
     set personal_link_slug = coalesce(nullif(public.slugify(agency_name), ''), 'partner') || '-' || left(replace(id::text, '-', ''), 5)
   where id = v_pid and personal_link_slug is null;
  if v_uid is not null then
    update auth.users set banned_until = null where id = v_uid;
  end if;

  update listing_partner_applications
     set status = 'approved', reviewed_by = v_by, reviewed_at = now(), partner_id = v_pid, market = v_mkt
   where id = p_app;
  insert into partner_audit (partner_id, application_id, action, actor, detail)
  values (v_pid, p_app, 'approve', v_by, jsonb_build_object('market', v_mkt, 'close', v_close, 'referral', v_ref));
  return jsonb_build_object('status', 'approved', 'partner_id', v_pid, 'email', lower(a.email), 'lang', a.lang,
                            'market', v_mkt, 'user_id', v_uid);
end;
$$;
revoke all on function public.approve_partner_application(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.approve_partner_application(uuid, jsonb) to service_role;

-- item 22: rejection with reason (the email goes out from the status trigger below)
create or replace function public.reject_partner_application(p_app uuid, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_by text := coalesce(public.app_email(), 'admin');
begin
  if public.current_role() is distinct from 'admin' then raise exception 'not_allowed' using errcode = '42501'; end if;
  update listing_partner_applications
     set status = 'rejected', reject_reason = nullif(trim(coalesce(p_reason, '')), ''), reviewed_by = v_by, reviewed_at = now()
   where id = p_app and status <> 'approved';
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  insert into partner_audit (application_id, action, actor, detail) values (p_app, 'reject', v_by, jsonb_build_object('reason', p_reason));
  return jsonb_build_object('status', 'rejected');
end;
$$;
revoke all on function public.reject_partner_application(uuid, text) from public, anon;
grant execute on function public.reject_partner_application(uuid, text) to authenticated, service_role;

-- ───────────────────────────── 5. Admin status changes (item 10) ─────────────────────────────
create or replace function public.admin_set_partner_status(p_id uuid, p_status text, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid;
  v_by  text := coalesce(public.app_email(), 'admin');
  v_staff boolean;
begin
  if public.current_role() is distinct from 'admin' and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if p_status not in ('approved','suspended','deleted','rejected','pending') then
    return jsonb_build_object('status', 'bad_status');
  end if;
  update listing_partners set
      status = p_status, status_reason = nullif(trim(coalesce(p_reason, '')), ''),
      deleted_at   = case when p_status = 'deleted' then now() else null end,
      suspended_at = case when p_status = 'suspended' then now() else null end,
      personal_link_slug = case when p_status = 'deleted' then null else personal_link_slug end,
      approved_at = case when p_status = 'approved' then coalesce(approved_at, now()) else approved_at end
   where id = p_id
  returning user_id into v_uid;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  if p_status = 'approved' then
    update listing_partners
       set personal_link_slug = coalesce(nullif(public.slugify(agency_name), ''), 'partner') || '-' || left(replace(id::text, '-', ''), 5)
     where id = p_id and personal_link_slug is null;
  end if;
  if v_uid is not null then
    -- never lock out an admin/team account that happens to own a partner row (e.g. the internal "Unreal Studio")
    v_staff := exists (select 1 from profiles where user_id = v_uid and role is not null and role <> 'lister');
    if not v_staff then
      if p_status in ('suspended','deleted','rejected') then
        update auth.users set banned_until = now() + interval '100 years' where id = v_uid;
        delete from auth.refresh_tokens where user_id = v_uid::text;
        delete from auth.sessions where user_id = v_uid;
      elsif p_status = 'approved' then
        update auth.users set banned_until = null where id = v_uid;
      end if;
    end if;
  end if;
  insert into partner_audit (partner_id, action, actor, detail) values (p_id, 'status:' || p_status, v_by, jsonb_build_object('reason', p_reason));
  return jsonb_build_object('status', 'ok', 'partner_status', p_status);
end;
$$;
revoke all on function public.admin_set_partner_status(uuid, text, text) from public, anon;
grant execute on function public.admin_set_partner_status(uuid, text, text) to authenticated, service_role;

-- item 23: per-agency counts + last login, for the admin lists
create or replace function public.admin_partner_overview()
returns table (partner_id uuid, leads bigint, reservations bigint, sales bigint, last_sign_in_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if public.current_role() is distinct from 'admin' then raise exception 'not_allowed' using errcode = '42501'; end if;
  return query
  select lp.id,
         (select count(*) from agency_leads l where l.agency_id = lp.id),
         (select count(*) from agency_commissions c where c.partner_id = lp.id and c.kind = 'reservation' and c.status <> 'cancelled'),
         (select count(*) from agency_commissions c where c.partner_id = lp.id and c.kind = 'sale' and c.status <> 'cancelled'),
         (select u.last_sign_in_at from auth.users u where u.id = lp.user_id)
    from listing_partners lp;
end;
$$;

-- ───────────────────────────── 6. FKs: a hard delete must fail (item 11) ─────────────────────────────
alter table public.agency_leads drop constraint if exists agency_leads_agency_id_fkey;
alter table public.agency_leads add constraint agency_leads_agency_id_fkey
  foreign key (agency_id) references public.listing_partners(id) on delete restrict;
alter table public.agency_requests drop constraint if exists agency_requests_agency_id_fkey;
alter table public.agency_requests add constraint agency_requests_agency_id_fkey
  foreign key (agency_id) references public.listing_partners(id) on delete restrict;
alter table public.agency_lead_notes drop constraint if exists agency_lead_notes_agency_id_fkey;
alter table public.agency_lead_notes add constraint agency_lead_notes_agency_id_fkey
  foreign key (agency_id) references public.listing_partners(id) on delete restrict;

-- ───────────────────────────── 7. Grants hygiene (item 3, 11) ─────────────────────────────
revoke select on public.listing_partners from anon;
revoke delete, truncate, trigger, references on public.listing_partners from authenticated;
revoke update, delete, truncate, trigger, references on public.lead_attributions from authenticated;
revoke insert, update, delete, truncate, trigger, references on public.profiles from authenticated;
revoke truncate, trigger, references on public.property_units from authenticated;

-- ───────────────────────────── 8. Status gate in RLS (item 1) ─────────────────────────────
alter table public.agency_leads
  add column if not exists consent_at  timestamptz,
  add column if not exists client_phone_norm text generated always as (nullif(right(regexp_replace(coalesce(client_phone, ''), '\D', '', 'g'), 9), '')) stored;
create index if not exists agency_leads_phone_norm_idx on public.agency_leads (client_phone_norm);

drop policy if exists al_agency_insert on public.agency_leads;
create policy al_agency_insert on public.agency_leads for insert with check (
  agency_id = public.my_active_partner_id() or public.current_role() = 'admin');
drop policy if exists al_read on public.agency_leads;
create policy al_read on public.agency_leads for select using (
  public.current_role() = 'admin' or agency_id = public.my_active_partner_id());

-- item 21: "reserve unit" requests (lead + unit)
alter table public.agency_requests add column if not exists unit_id uuid references public.property_units(id) on delete set null;
alter table public.agency_requests drop constraint if exists agency_requests_type_check;
alter table public.agency_requests add constraint agency_requests_type_check
  check (type in ('call','visit','presentation','contract','reserve'));
alter table public.agency_requests drop constraint if exists agency_requests_reserve_check;
alter table public.agency_requests add constraint agency_requests_reserve_check
  check (type <> 'reserve' or (lead_id is not null and unit_id is not null));
grant insert (unit_id) on public.agency_requests to authenticated;

drop policy if exists ar_agency_insert on public.agency_requests;
create policy ar_agency_insert on public.agency_requests for insert with check (
  public.current_role() = 'admin'
  or (agency_id = public.my_active_partner_id()
      and (lead_id is null or exists (select 1 from public.agency_leads l where l.id = lead_id and l.agency_id = agency_requests.agency_id))));
drop policy if exists ar_read on public.agency_requests;
create policy ar_read on public.agency_requests for select using (
  public.current_role() = 'admin' or agency_id = public.my_active_partner_id());

drop policy if exists aln_insert on public.agency_lead_notes;
create policy aln_insert on public.agency_lead_notes for insert with check (
  exists (select 1 from public.agency_leads l where l.id = lead_id and l.agency_id = agency_lead_notes.agency_id)
  and (public.current_role() = 'admin'
       or (author = 'agency' and agency_id = public.my_active_partner_id())));
drop policy if exists aln_read on public.agency_lead_notes;
create policy aln_read on public.agency_lead_notes for select using (
  public.current_role() = 'admin' or agency_id = public.my_active_partner_id());

drop policy if exists la_partner_read on public.lead_attributions;
create policy la_partner_read on public.lead_attributions for select using (
  public.current_role() = 'admin' or partner_id = public.my_active_partner_id());

drop policy if exists units_authenticated_read on public.property_units;
create policy units_authenticated_read on public.property_units for select using (
  available = true and (
    public.current_role() = any (array['investor','admin','team'])
    or (public.current_role() = 'lister' and public.my_active_partner_id() is not null)));

-- RPCs the portal reads: active agencies only; sold-out and hidden projects filtered server-side (item 19)
create or replace function public.agency_projects_list()
returns setof projects language sql stable security definer set search_path = public as $$
  select (public.project_only_cols(p, array['id','slug','name','image','investor_price','price_currency','bedrooms','completion_date',
           'is_hidden','visibility_status','status','location','completion_percent','updated_at','construction_update_url',
           'construction_update_date','brochure_url','brochures','drive_renders_url','drive_2d_plans_url',
           'drive_brochure_folder_url','video_url','walkthrough_url','tenure','years_contract','sort_order',
           'completion_date_en','completion_date_id','description','description_en','description_ro','description_id'])).*
    from projects p
   where public.is_admin_or_team()
      or (public.my_active_partner_id() is not null
          and coalesce(p.is_hidden, false) = false
          and coalesce(p.visibility_status, '') <> 'sold_out');
$$;

do $$
declare src text;
begin
  select pg_get_functiondef('public.agency_pack_get(text)'::regprocedure) into src;
  src := replace(src,
    'or exists (select 1 from listing_partners lp where lp.user_id = auth.uid())
           or exists (select 1 from profiles pr where pr.user_id = auth.uid() and pr.role = ''lister'') );',
    'or public.my_active_partner_id() is not null );');
  if position('my_active_partner_id' in src) = 0 then raise exception 'agency_pack_get: gate not replaced'; end if;
  execute src;
end $$;

-- item 7 + 19: units with status, never prices, and only MY commission (resolution: unit override → my rate → unit default → market default)
create or replace function public.agency_unit_pct(p_unit public.property_units, p_partner public.listing_partners)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(
    (p_unit.commission_per_partner ->> p_partner.id::text)::numeric,
    p_partner.commission_close_pct,
    p_unit.commission_default_pct,
    (agency_cfg('commission_defaults') -> coalesce(p_partner.market, 'es') ->> 'close')::numeric,
    5);
$$;
revoke all on function public.agency_unit_pct(public.property_units, public.listing_partners) from public, anon, authenticated;

create or replace function public.agency_units_list()
returns table (id uuid, property_id uuid, unit_name text, bedrooms int, available boolean, reserved boolean, sold boolean, pct numeric)
language sql stable security definer set search_path = public as $$
  select u.id, u.property_id, u.unit_name, u.bedrooms::int, u.available, u.reserved, u.sold, public.agency_unit_pct(u, lp)
    from property_units u
    join listing_partners lp on lp.id = public.my_active_partner_id()
   order by u.unit_name;
$$;
revoke all on function public.agency_units_list() from public, anon;
grant execute on function public.agency_units_list() to authenticated;

create or replace function public.my_unit_commission(p_unit uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select public.agency_unit_pct(u, lp) from property_units u
    join listing_partners lp on lp.id = public.my_active_partner_id()
   where u.id = p_unit;
$$;
revoke all on function public.my_unit_commission(uuid) from public, anon;
grant execute on function public.my_unit_commission(uuid) to authenticated;

-- ───────────────────────────── 9. Lead registration: first one wins (item 12, 15) ─────────────────────────────
create table if not exists public.agency_lead_collisions (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  partner_id   uuid not null references public.listing_partners(id) on delete restrict,
  client_name  text,
  client_email text,
  client_phone text,
  matched      text,   -- 'agency_lead' | 'client' (never shown to agencies)
  notified_at  timestamptz
);
alter table public.agency_lead_collisions enable row level security;
drop policy if exists alc_admin on public.agency_lead_collisions;
create policy alc_admin on public.agency_lead_collisions for select using (public.current_role() = 'admin');
revoke all on public.agency_lead_collisions from anon, authenticated;
grant select on public.agency_lead_collisions to authenticated;
grant select, insert, update, delete on public.agency_lead_collisions to service_role;

create or replace function public.agency_register_lead(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_pid   uuid := public.my_active_partner_id();
  v_email text := nullif(lower(trim(coalesce(p->>'client_email', ''))), '');
  v_phone text := nullif(right(regexp_replace(coalesce(p->>'client_phone', ''), '\D', '', 'g'), 9), '');
  v_hit   text;
  v_id    uuid;
  v_at    timestamptz;
  v_prop  uuid := nullif(p->>'property_id', '')::uuid;
begin
  if v_pid is null then return jsonb_build_object('status', 'not_active'); end if;
  if coalesce((p->>'consent')::boolean, false) is not true then return jsonb_build_object('status', 'consent_required'); end if;
  if length(trim(coalesce(p->>'client_name', ''))) = 0 then return jsonb_build_object('status', 'name_required'); end if;
  if v_email is null and v_phone is null then return jsonb_build_object('status', 'contact_required'); end if;
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then return jsonb_build_object('status', 'invalid_email'); end if;
  if length(coalesce(v_phone, '')) between 1 and 6 then v_phone := null; end if;
  if v_prop is not null and not exists (select 1 from properties where id = v_prop) then v_prop := null; end if;

  perform pg_advisory_xact_lock(hashtext('agency_lead:' || coalesce(v_email, v_phone)));
  select case
    when exists (select 1 from agency_leads l
                  where (v_email is not null and lower(l.client_email) = v_email)
                     or (v_phone is not null and l.client_phone_norm = v_phone)) then 'agency_lead'
    when exists (select 1 from clients c
                  where (v_email is not null and lower(c.email) = v_email)
                     or (v_phone is not null and right(regexp_replace(coalesce(c.phone, ''), '\D', '', 'g'), 9) = v_phone)) then 'client'
  end into v_hit;
  if v_hit is not null then
    insert into agency_lead_collisions (partner_id, client_name, client_email, client_phone, matched)
    values (v_pid, left(p->>'client_name', 200), v_email, left(p->>'client_phone', 60), v_hit);
    return jsonb_build_object('status', 'already_registered');
  end if;

  insert into agency_leads (agency_id, client_name, client_email, client_phone, country, property_id, budget, notes, consent_at)
  values (v_pid, left(trim(p->>'client_name'), 200), v_email, nullif(left(trim(coalesce(p->>'client_phone', '')), 60), ''),
          nullif(left(trim(coalesce(p->>'country', '')), 100), ''), v_prop,
          nullif(left(trim(coalesce(p->>'budget', '')), 100), ''), nullif(left(trim(coalesce(p->>'notes', '')), 2000), ''), now())
  returning id, created_at into v_id, v_at;
  return jsonb_build_object('status', 'ok', 'id', v_id, 'created_at', v_at);
end;
$$;
revoke all on function public.agency_register_lead(jsonb) from public, anon;
grant execute on function public.agency_register_lead(jsonb) to authenticated;

-- ───────────────────────────── 10. Commission ledger (item 14) ─────────────────────────────
create table if not exists public.agency_commissions (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  lead_id     uuid not null references public.agency_leads(id) on delete restrict,
  partner_id  uuid not null references public.listing_partners(id) on delete restrict,
  unit_id     uuid references public.property_units(id) on delete set null,
  property_id uuid references public.properties(id) on delete set null,
  kind        text not null check (kind in ('reservation','sale')),
  mode        text not null default 'close' check (mode in ('close','referral')),
  sale_price  numeric(14,2) not null check (sale_price > 0),
  currency    text not null default 'EUR',
  pct         numeric(5,2) not null check (pct between 0 and 50),
  amount      numeric(14,2) not null,
  status      text not null default 'reserved' check (status in ('reserved','due','paid','cancelled')),
  paid_at     timestamptz,
  doc_url     text,
  notes       text,
  created_by  text
);
create index if not exists agency_commissions_partner_idx on public.agency_commissions (partner_id, created_at desc);
create unique index if not exists agency_commissions_dedupe
  on public.agency_commissions (lead_id, coalesce(unit_id, '00000000-0000-0000-0000-000000000000'::uuid), kind)
  where status <> 'cancelled';
alter table public.agency_commissions enable row level security;
drop policy if exists ac_read on public.agency_commissions;
create policy ac_read on public.agency_commissions for select using (
  public.current_role() = 'admin' or partner_id = public.my_active_partner_id());
drop policy if exists ac_admin_update on public.agency_commissions;
create policy ac_admin_update on public.agency_commissions for update using (public.current_role() = 'admin');
revoke all on public.agency_commissions from anon, authenticated;
grant select on public.agency_commissions to authenticated;
grant update (status, paid_at, doc_url, notes) on public.agency_commissions to authenticated;
grant select, insert, update, delete on public.agency_commissions to service_role;

create or replace function public.agency_lead_event(p_lead uuid, p_unit uuid, p_kind text, p_price numeric,
                                                    p_mode text default 'close', p_currency text default 'EUR')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  l    agency_leads;
  lp   listing_partners;
  u    property_units;
  v_pct numeric;
  v_id uuid;
  v_by text := coalesce(public.app_email(), 'admin');
  v_slug text;
begin
  if public.current_role() is distinct from 'admin' then raise exception 'not_allowed' using errcode = '42501'; end if;
  if p_kind not in ('reservation','sale') or coalesce(p_price, 0) <= 0 or p_mode not in ('close','referral') then
    return jsonb_build_object('status', 'invalid');
  end if;
  select * into l from agency_leads where id = p_lead for update;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  select * into lp from listing_partners where id = l.agency_id;
  if lp.is_demo then return jsonb_build_object('status', 'demo_partner'); end if;
  if p_unit is not null then
    select * into u from property_units where id = p_unit for update;
    if not found then return jsonb_build_object('status', 'unit_not_found'); end if;
    if u.sold then return jsonb_build_object('status', 'unit_sold'); end if;
  end if;
  if exists (select 1 from agency_commissions c where c.lead_id = p_lead and c.kind = p_kind and c.status <> 'cancelled'
              and c.unit_id is not distinct from p_unit) then
    return jsonb_build_object('status', 'duplicate');
  end if;
  v_pct := case when p_mode = 'referral'
                then coalesce(lp.commission_referral_pct, (agency_cfg('commission_defaults') -> lp.market ->> 'referral')::numeric, 3)
                when p_unit is not null then public.agency_unit_pct(u, lp)
                else coalesce(lp.commission_close_pct, (agency_cfg('commission_defaults') -> lp.market ->> 'close')::numeric, 5) end;

  perform set_config('agency.suppress_lead_notify', '1', true); -- the commission email covers "won"
  update agency_leads set status = 'won' where id = p_lead and status <> 'won';
  if p_unit is not null then
    if p_kind = 'sale' then update property_units set sold = true, reserved = false, available = false where id = p_unit;
    else update property_units set reserved = true where id = p_unit; end if;
  end if;
  if p_kind = 'sale' then -- a sale supersedes the reservation of the same lead/unit
    update agency_commissions set status = 'cancelled', notes = coalesce(notes || ' · ', '') || 'superseded by sale'
     where lead_id = p_lead and kind = 'reservation' and status = 'reserved' and unit_id is not distinct from p_unit;
  end if;
  insert into agency_commissions (lead_id, partner_id, unit_id, property_id, kind, mode, sale_price, currency, pct, amount, status, created_by)
  values (p_lead, lp.id, p_unit, coalesce(u.property_id, l.property_id), p_kind, p_mode, p_price, upper(coalesce(p_currency, 'EUR')),
          v_pct, round(p_price * v_pct / 100, 2), case when p_kind = 'sale' then 'due' else 'reserved' end, v_by)
  returning id into v_id;
  select slug into v_slug from properties where id = coalesce(u.property_id, l.property_id);
  insert into lead_attributions (utm_source, partner_id, event_type, property_slug, contact_email, contact_name, contact_phone)
  values ('lister', lp.id, p_kind, v_slug, l.client_email, l.client_name, l.client_phone);
  insert into partner_audit (partner_id, action, actor, detail)
  values (lp.id, 'lead_event:' || p_kind, v_by, jsonb_build_object('lead', p_lead, 'unit', p_unit, 'price', p_price, 'pct', v_pct));
  return jsonb_build_object('status', 'ok', 'id', v_id, 'pct', v_pct, 'amount', round(p_price * v_pct / 100, 2));
exception when unique_violation then return jsonb_build_object('status', 'duplicate');
end;
$$;
revoke all on function public.agency_lead_event(uuid, uuid, text, numeric, text, text) from public, anon;
grant execute on function public.agency_lead_event(uuid, uuid, text, numeric, text, text) to authenticated;

-- ───────────────────────────── 11. Hooks → edge function agency-hub (items 6, 13, 22) ─────────────────────────────
-- Secret in Vault 'agency_hook_secret' (= edge env AGENCY_HOOK_SECRET). Fire-and-forget, never blocks the insert.
create or replace function public.agency_hub_post(p_body jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare secret text;
begin
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'agency_hook_secret';
  if secret is null then raise warning 'agency_hub_post: no vault secret agency_hook_secret'; return; end if;
  perform net.http_post(
    url := 'https://rnielxgackkshnatvagj.supabase.co/functions/v1/agency-hub',
    body := p_body,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-agency-hook', secret),
    timeout_milliseconds := 15000);
exception when others then raise warning 'agency_hub_post: %', sqlerrm;
end;
$$;
revoke all on function public.agency_hub_post(jsonb) from public, anon, authenticated;

create or replace function public.trg_lpa_hooks()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'pending' and coalesce((agency_cfg('auto_approve') #>> '{}')::boolean, false) then
      perform agency_hub_post(jsonb_build_object('action', 'approve', 'mode', 'auto', 'application_id', new.id));
    end if;
  elsif new.status = 'rejected' and old.status is distinct from 'rejected' then
    perform agency_hub_post(jsonb_build_object('action', 'event', 'table', 'listing_partner_applications', 'event', 'rejected', 'id', new.id));
  end if;
  return new;
end;
$$;
drop trigger if exists trg_lpa_hooks on public.listing_partner_applications;
create trigger trg_lpa_hooks after insert or update of status on public.listing_partner_applications
  for each row execute function public.trg_lpa_hooks();

create or replace function public.trg_agency_event()
returns trigger language plpgsql security definer set search_path = public as $$
declare ev text;
begin
  if tg_op = 'INSERT' then ev := 'created';
  elsif new.status is distinct from old.status then ev := new.status;
  else return new; end if;
  if tg_table_name = 'agency_leads' and tg_op = 'UPDATE' then
    if ev not in ('won','lost') or current_setting('agency.suppress_lead_notify', true) = '1' then return new; end if;
  end if;
  if tg_table_name = 'agency_requests' and tg_op = 'UPDATE' and ev not in ('scheduled','done') then return new; end if;
  if tg_table_name = 'agency_commissions' and tg_op = 'UPDATE' and ev not in ('due','paid') then return new; end if;
  perform agency_hub_post(jsonb_build_object('action', 'event', 'table', tg_table_name, 'event', ev, 'id', new.id));
  return new;
end;
$$;
drop trigger if exists trg_agency_leads_event on public.agency_leads;
create trigger trg_agency_leads_event after insert or update of status on public.agency_leads
  for each row execute function public.trg_agency_event();
drop trigger if exists trg_agency_requests_event on public.agency_requests;
create trigger trg_agency_requests_event after insert or update of status on public.agency_requests
  for each row execute function public.trg_agency_event();
drop trigger if exists trg_agency_commissions_event on public.agency_commissions;
create trigger trg_agency_commissions_event after insert or update of status on public.agency_commissions
  for each row execute function public.trg_agency_event();

-- ───────────────────────────── 12. GHL hygiene (item 25) ─────────────────────────────
-- No GHL contact for raw signups; push only approved partners (insert or status change).
drop trigger if exists trg_lpa_to_ghl on public.listing_partner_applications;
drop trigger if exists trg_lp_to_ghl on public.listing_partners;
create trigger trg_lp_to_ghl after update on public.listing_partners
  for each row when (old.status is distinct from new.status and new.status = 'approved')
  execute function public.notify_ghl_sync();
drop trigger if exists trg_lp_to_ghl_ins on public.listing_partners;
create trigger trg_lp_to_ghl_ins after insert on public.listing_partners
  for each row when (new.status = 'approved')
  execute function public.notify_ghl_sync();

-- ───────────────────────────── 13. Login nudges (item 24) ─────────────────────────────
create or replace function public.agency_login_nudge_candidates()
returns table (partner_id uuid, email text, agency_name text, lang text, welcomed_at timestamptz, login_reminders int, days int)
language sql stable security definer set search_path = public as $$
  select lp.id, lp.email, lp.agency_name, lp.lang, lp.welcomed_at, lp.login_reminders,
         extract(day from now() - lp.welcomed_at)::int
    from listing_partners lp
    left join auth.users u on u.id = lp.user_id
   where lp.status = 'approved' and lp.deleted_at is null and not lp.is_demo
     and lp.welcomed_at is not null and u.last_sign_in_at is null and lp.login_reminders < 3
     and now() - lp.welcomed_at >= interval '3 days';
$$;
revoke all on function public.agency_login_nudge_candidates() from public, anon, authenticated;
grant execute on function public.agency_login_nudge_candidates() to service_role;

revoke all on function public.admin_partner_overview() from public, anon;
grant execute on function public.admin_partner_overview() to authenticated;

-- ───────────────────────────── 14. Attribution through an RPC (item 3) ─────────────────────────────
-- partner_id is resolved server-side from the slug; the direct INSERT is revoked in phase 2.
alter table public.lead_attributions add column if not exists ip text;
create index if not exists lead_attributions_ip_idx on public.lead_attributions (ip, created_at) where ip is not null;
create or replace function public.record_attribution(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_hdr   jsonb;
  v_ip    text;
  v_type  text := coalesce(nullif(p->>'event_type', ''), 'visit');
  v_ref   text := nullif(trim(coalesce(p->>'partner', '')), '');
  v_pid   uuid;
  v_email text := nullif(lower(trim(coalesce(p->>'email', ''))), '');
begin
  if v_type not in ('visit','form_submit') then return jsonb_build_object('status', 'invalid'); end if;
  begin v_hdr := current_setting('request.headers', true)::jsonb; exception when others then v_hdr := null; end;
  v_ip := nullif(trim(split_part(coalesce(v_hdr->>'cf-connecting-ip', v_hdr->>'x-forwarded-for', ''), ',', 1)), '');
  if v_ref is not null then
    select id into v_pid from listing_partners
     where (personal_link_slug = v_ref or id::text = v_ref) and status = 'approved' and deleted_at is null limit 1;
  end if;
  if v_email is not null and (select count(*) from lead_attributions where contact_email = v_email
                               and created_at > now() - interval '1 hour') >= 5 then
    return jsonb_build_object('status', 'rate_limited');
  end if;
  if v_ip is not null and (select count(*) from lead_attributions where ip = v_ip
                            and created_at > now() - interval '10 minutes') >= 30 then
    return jsonb_build_object('status', 'rate_limited');
  end if;
  insert into lead_attributions (utm_source, partner_id, property_slug, utm_campaign, utm_medium, event_type,
                                 contact_email, contact_phone, contact_name, user_agent, referrer, ip)
  values (left(coalesce(nullif(p->>'utm_source', ''), 'web_form'), 100), v_pid, left(p->>'property_slug', 200),
          left(p->>'utm_campaign', 200), left(p->>'utm_medium', 200), v_type, v_email,
          left(p->>'phone', 60), left(p->>'name', 200), left(v_hdr->>'user-agent', 500), left(p->>'referrer', 500), v_ip);
  return jsonb_build_object('status', 'ok');
end;
$$;
revoke all on function public.record_attribution(jsonb) from public;
grant execute on function public.record_attribution(jsonb) to anon, authenticated, service_role;
