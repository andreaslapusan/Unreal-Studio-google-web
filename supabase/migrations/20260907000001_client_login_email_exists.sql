create or replace function public.client_login_email_exists(p_email text)
returns boolean language sql stable security definer set search_path=public as $$
  select exists (
    select 1 from clients c
    where lower(trim(c.email)) = lower(trim(p_email))
       or exists (select 1 from unnest(coalesce(c.extra_emails,'{}'::text[])) e
                  where lower(trim(e)) = lower(trim(p_email)))
       or exists (select 1 from jsonb_array_elements(coalesce(c.holders,'[]'::jsonb)) h
                  where lower(trim(h->>'email')) = lower(trim(p_email)))
  );
$$;
grant execute on function public.client_login_email_exists(text) to service_role, authenticated, anon;
