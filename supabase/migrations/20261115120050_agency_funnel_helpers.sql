-- Helpers for the agency-hub edge function (service role only) + collision alert hook.
create or replace function public.auth_user_id_by_email(p_email text)
returns uuid language sql stable security definer set search_path = public as $$
  select id from auth.users where lower(email) = lower(trim(p_email)) limit 1;
$$;
revoke all on function public.auth_user_id_by_email(text) from public, anon, authenticated;
grant execute on function public.auth_user_id_by_email(text) to service_role;

create or replace function public.auth_user_last_sign_in(p_user uuid)
returns timestamptz language sql stable security definer set search_path = public as $$
  select last_sign_in_at from auth.users where id = p_user;
$$;
revoke all on function public.auth_user_last_sign_in(uuid) from public, anon, authenticated;
grant execute on function public.auth_user_last_sign_in(uuid) to service_role;

drop trigger if exists trg_agency_collisions_event on public.agency_lead_collisions;
create trigger trg_agency_collisions_event after insert on public.agency_lead_collisions
  for each row execute function public.trg_agency_event();

-- Bot status: a deleted/suspended partner reports its own status (not the old application's 'approved').
create or replace function public.agency_application_status(p_email text)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(
    (select lp.status from listing_partners lp where lower(lp.email) = lower(trim(p_email)) limit 1),
    (select a.status from listing_partner_applications a where lower(a.email) = lower(trim(p_email))
      order by a.created_at desc limit 1),
    'none');
$$;
