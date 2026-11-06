-- Agency lead registration: an agency registers a client so its commission is
-- protected. created_at (server default, not client-writable) = proof of who
-- registered first.
create table if not exists public.agency_leads (
  id            uuid primary key default gen_random_uuid(),
  agency_id     uuid not null references public.listing_partners(id) on delete cascade,
  created_at    timestamptz not null default now(),
  client_name   text not null check (length(trim(client_name)) > 0),
  client_email  text,
  client_phone  text,
  country       text,
  property_id   uuid references public.properties(id) on delete set null,
  budget        text,
  notes         text,
  status        text not null default 'new' check (status in ('new','contacted','won','lost')),
  notified_at   timestamptz  -- set by ~/jobs/intake-notify.sh after the team is pinged
);
create index if not exists agency_leads_agency_idx on public.agency_leads (agency_id, created_at desc);
create index if not exists agency_leads_email_idx on public.agency_leads (lower(client_email));

alter table public.agency_leads enable row level security;

-- Agency: insert/select only its own rows. Admin: everything.
drop policy if exists al_agency_insert on public.agency_leads;
create policy al_agency_insert on public.agency_leads
  for insert with check (
    agency_id in (select id from public.listing_partners where user_id = auth.uid())
    or public.current_role() = 'admin'
  );

drop policy if exists al_read on public.agency_leads;
create policy al_read on public.agency_leads
  for select using (
    public.current_role() = 'admin'
    or agency_id in (select id from public.listing_partners where user_id = auth.uid())
  );

drop policy if exists al_admin_update on public.agency_leads;
create policy al_admin_update on public.agency_leads
  for update using (public.current_role() = 'admin');

drop policy if exists al_admin_delete on public.agency_leads;
create policy al_admin_delete on public.agency_leads
  for delete using (public.current_role() = 'admin');

-- Grants (new tables get none by default since 2026-10-30). Column-level
-- insert/update so clients can't forge created_at/status/notified_at.
revoke all on public.agency_leads from anon, authenticated;
grant select, delete on public.agency_leads to authenticated;
grant insert (agency_id, client_name, client_email, client_phone, country, property_id, budget, notes)
  on public.agency_leads to authenticated;
grant update (status) on public.agency_leads to authenticated;
grant select, insert, update, delete on public.agency_leads to service_role;
